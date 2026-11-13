from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from typing import Any, Protocol

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMClientError(RuntimeError):
    """Raised when the LLM provider fails or returns invalid output."""


class BaseLLMClient(Protocol):
    provider_name: str
    model_name: str

    async def complete_json(self, system_prompt: str, user_prompt: str, task_name: str = "") -> dict[str, Any]:
        ...


def extract_json_object(raw_text: str) -> dict[str, Any]:
    """Robustly parse JSON object from LLM output (handles markdown fences and leading/trailing text)."""
    text = raw_text.strip()
    # Strip markdown code fences if present
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Fallback: find outermost balanced braces
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        # Remove trailing commas before } or ]
        candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
        parsed = json.loads(candidate)
        if isinstance(parsed, dict):
            return parsed

    raise ValueError("Ответ модели не содержит валидный JSON-объект.")


class GigaChatClient:
    """Async client for Sber GigaChat REST API with OAuth token caching and 1-stream pacing."""

    def __init__(self) -> None:
        self.provider_name = "gigachat"
        self.model_name = settings.gigachat_model
        self._access_token: str | None = None
        self._expires_at_sec: float = 0.0
        self._token_lock = asyncio.Lock()
        self._request_sem = asyncio.Semaphore(max(1, settings.llm_concurrency))
        self._last_request_ts: float = 0.0

    def _ssl_verify(self) -> bool | str:
        if settings.gigachat_ca_bundle:
            return settings.gigachat_ca_bundle
        return settings.gigachat_verify_ssl

    def _auth_header_value(self) -> str:
        key = settings.gigachat_auth_key.strip()
        if not key:
            raise LLMClientError(
                "Не задан GIGACHAT_AUTH_KEY. Укажите ключ авторизации GigaChat в файле .env."
            )
        if key.lower().startswith("basic "):
            return key
        return f"Basic {key}"

    async def _get_access_token(self, force_refresh: bool = False) -> str:
        now = time.time()
        if not force_refresh and self._access_token and now < (self._expires_at_sec - 60):
            return self._access_token

        async with self._token_lock:
            now = time.time()
            if not force_refresh and self._access_token and now < (self._expires_at_sec - 60):
                return self._access_token

            headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "RqUID": str(uuid.uuid4()),
                "Authorization": self._auth_header_value(),
            }
            data = {"scope": settings.gigachat_scope}

            async with httpx.AsyncClient(
                verify=self._ssl_verify(),
                timeout=settings.llm_timeout_seconds,
            ) as client:
                resp = await client.post(settings.gigachat_oauth_url, headers=headers, data=data)

            if resp.status_code >= 400:
                raise LLMClientError(
                    f"Ошибка OAuth авторизации GigaChat ({resp.status_code}): {resp.text[:300]}"
                )

            payload = resp.json()
            token = payload.get("access_token")
            if not token:
                raise LLMClientError("GigaChat OAuth не вернул access_token.")
            expires_at_ms = payload.get("expires_at")
            if expires_at_ms:
                self._expires_at_sec = float(expires_at_ms) / 1000.0
            else:
                self._expires_at_sec = time.time() + 1500.0
            self._access_token = token
            return token

    async def complete_json(self, system_prompt: str, user_prompt: str, task_name: str = "") -> dict[str, Any]:
        last_error: Exception | None = None
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        for attempt in range(settings.llm_max_retries + 1):
            try:
                async with self._request_sem:
                    # Freemium (GIGACHAT_API_PERS) allows 1 concurrent stream; add brief pacing between calls
                    elapsed = time.monotonic() - self._last_request_ts
                    if elapsed < 0.35:
                        await asyncio.sleep(0.35 - elapsed)

                    token = await self._get_access_token(force_refresh=(attempt > 0))
                    headers = {
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Authorization": f"Bearer {token}",
                    }
                    body = {
                        "model": self.model_name,
                        "messages": messages,
                        "temperature": 0.1,
                        "max_tokens": 4096,
                        "stream": False,
                    }
                    async with httpx.AsyncClient(
                        verify=self._ssl_verify(),
                        timeout=settings.llm_timeout_seconds,
                        follow_redirects=True,
                    ) as client:
                        resp = await client.post(settings.gigachat_api_url, headers=headers, json=body)
                    self._last_request_ts = time.monotonic()

                if resp.status_code == 401 and attempt < settings.llm_max_retries:
                    logger.warning("GigaChat returned 401, refreshing token...")
                    continue
                if resp.status_code == 429 and attempt < settings.llm_max_retries:
                    wait_sec = 2.5 * (attempt + 1)
                    logger.warning("GigaChat 429 rate limit for %s, retrying in %.1fs...", task_name, wait_sec)
                    await asyncio.sleep(wait_sec)
                    continue
                if resp.status_code in (500, 502, 503, 504) and attempt < settings.llm_max_retries:
                    await asyncio.sleep(1.5 * (attempt + 1))
                    continue
                if resp.status_code >= 400:
                    raise LLMClientError(
                        f"Ошибка GigaChat API ({resp.status_code}): {resp.text[:300]}"
                    )

                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return extract_json_object(content)
            except Exception as exc:
                last_error = exc
                logger.warning("GigaChat attempt %d failed for %s: %s", attempt + 1, task_name, exc)
                if attempt < settings.llm_max_retries:
                    # Ask model to fix JSON if parse error happened
                    if isinstance(exc, (ValueError, json.JSONDecodeError)):
                        messages.append(
                            {
                                "role": "user",
                                "content": "Предыдущий ответ не удалось распарсить как JSON. Верни ТОЛЬКО валидный JSON-объект строго по схеме без пояснений.",
                            }
                        )
                    await asyncio.sleep(0.8 * (attempt + 1))

        raise LLMClientError(f"Не удалось получить корректный ответ от GigaChat ({task_name}): {last_error}")


class OpenAICompatibleClient:
    """Async client for OpenAI-compatible APIs (OpenAI, OpenRouter, Ollama, vLLM)."""

    def __init__(self) -> None:
        self.provider_name = "openai"
        self.model_name = settings.llm_model

    async def complete_json(self, system_prompt: str, user_prompt: str, task_name: str = "") -> dict[str, Any]:
        if not settings.llm_api_key:
            raise LLMClientError("Не задан LLM_API_KEY в файле .env.")

        url = settings.llm_base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.llm_api_key}",
        }
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        last_error: Exception | None = None
        for attempt in range(settings.llm_max_retries + 1):
            try:
                body = {
                    "model": self.model_name,
                    "messages": messages,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                }
                async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
                    resp = await client.post(url, headers=headers, json=body)

                if resp.status_code in (429, 500, 502, 503, 504) and attempt < settings.llm_max_retries:
                    await asyncio.sleep(1.2 * (attempt + 1))
                    continue
                if resp.status_code >= 400:
                    raise LLMClientError(f"Ошибка LLM API ({resp.status_code}): {resp.text[:300]}")

                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                return extract_json_object(content)
            except Exception as exc:
                last_error = exc
                if attempt < settings.llm_max_retries:
                    await asyncio.sleep(0.8 * (attempt + 1))

        raise LLMClientError(f"Ошибка OpenAI-compatible API ({task_name}): {last_error}")


class MockLLMClient:
    """Deterministic mock client used ONLY when LLM_PROVIDER=mock (e.g. unit/integration tests)."""

    def __init__(self) -> None:
        self.provider_name = "mock"
        self.model_name = "mock-deterministic-v1"

    async def complete_json(self, system_prompt: str, user_prompt: str, task_name: str = "") -> dict[str, Any]:
        if task_name.startswith("vacancy:"):
            lines = [ln.strip() for ln in user_prompt.splitlines() if len(ln.strip()) > 12]
            title = "Вакансия (тест)"
            for ln in lines:
                if not ln.startswith("Имя файла:") and not ln.startswith("Текст вакансии:") and ln != '"""':
                    title = ln[:90]
                    break
            return {
                "title": title,
                "summary": f"Тестовое извлечение для {title}",
                "work_format": "Гибрид / 5/2",
                "location": "Долгопрудный",
                "requirements": [
                    {
                        "id": "req_1",
                        "text": "Профильный опыт работы по направлению вакансии",
                        "priority": "mandatory",
                        "category": "experience",
                        "source_quote": title,
                    },
                    {
                        "id": "req_2",
                        "text": "Владение ключевыми инструментами и технологиями роли",
                        "priority": "mandatory",
                        "category": "skills",
                        "source_quote": title,
                    },
                    {
                        "id": "req_3",
                        "text": "Дополнительные преимущества и смежный опыт",
                        "priority": "optional",
                        "category": "other",
                        "source_quote": title,
                    },
                ],
            }

        if task_name == "resume":
            return {
                "target_role": "Кандидат (тестовый профиль)",
                "total_experience_months": 24,
                "summary": "Обезличенный профиль для тестового прогона.",
                "experiences": [
                    {
                        "role": "Специалист",
                        "organization": "Тестовая организация",
                        "period": "2023 — настоящее время",
                        "duration_months": 24,
                        "responsibilities": ["Выполнение профильных задач"],
                        "tools_and_skills": ["HTML5", "CSS3", "Vue 3", "Excel"],
                        "source_quote": "Опыт работы 2 года",
                    }
                ],
                "education": [
                    {
                        "level": "Высшее",
                        "institution": "Университет",
                        "field": "Прикладная информатика",
                        "year": "2021",
                        "source_quote": "Бакалавр, Прикладная информатика",
                    }
                ],
                "skills": ["HTML5", "CSS3", "JavaScript", "Vue 3", "Excel"],
                "languages": ["Русский — родной"],
                "logistics_and_format": "Москва / Долгопрудный",
                "cover_letter_notes": "",
            }

        # Matching task
        req_ids = re.findall(r'"id":\s*"([^"]+)"', user_prompt)
        if not req_ids:
            req_ids = ["req_1", "req_2", "req_3"]
        statuses = ["full_match", "partial_match", "not_specified", "no_match"]
        evaluations = []
        for idx, rid in enumerate(req_ids):
            st = statuses[idx % len(statuses)]
            evaluations.append(
                {
                    "requirement_id": rid,
                    "status": st,
                    "resume_evidence": (
                        "Информация в резюме не указана"
                        if st == "not_specified"
                        else "Фрагмент резюме, подтверждающий оценку"
                    ),
                    "comment": f"Автоматическая тестовая оценка ({st}) для {rid}.",
                }
            )
        return {
            "evaluations": evaluations,
            "strengths": [
                {
                    "title": "Подтверждённый релевантный опыт",
                    "description": "Совпадают ключевые навыки по требованиям вакансии.",
                    "evidence_quote": "Опыт работы 2 года",
                    "requirement_ids": [req_ids[0]],
                }
            ],
            "gaps_and_risks": [
                {
                    "title": "Недостаточно сведений по отдельным требованиям",
                    "kind": "uncertainty",
                    "description": "Часть требований не отражена в резюме и требует уточнения.",
                    "requirement_ids": req_ids[2:3],
                }
            ],
            "recruiter_recommendations": [
                "Уточнить неуказанные требования на первичном скрининге."
            ],
            "interview_questions": [
                {
                    "question": "Расскажите подробнее о вашем практическом опыте по неуказанным в резюме задачам.",
                    "target_requirement": req_ids[-1],
                    "reason": "В резюме отсутствуют явные детали.",
                }
            ],
            "outreach_draft": "Здравствуйте! Мы ознакомились с вашим резюме и хотели бы уточнить несколько деталей по опыту и формату работы.",
        }


def get_llm_client() -> BaseLLMClient:
    provider = settings.llm_provider
    if provider == "gigachat":
        return GigaChatClient()
    if provider == "openai":
        return OpenAICompatibleClient()
    return MockLLMClient()
