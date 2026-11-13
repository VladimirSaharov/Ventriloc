from __future__ import annotations

import hashlib
from typing import Any

from app.prompts.templates import (
    RESUME_EXTRACTION_SYSTEM,
    RESUME_EXTRACTION_USER,
    VACANCY_EXTRACTION_SYSTEM,
    VACANCY_EXTRACTION_USER,
)
from app.schemas import (
    RequirementCategory,
    RequirementPriority,
    ResumeEducation,
    ResumeExperience,
    ResumeProfile,
    VacancyProfile,
    VacancyRequirement,
)
from app.services.llm_client import BaseLLMClient

# In-memory cache of extracted vacancy profiles keyed by (provider, model, sha256(text))
_VACANCY_CACHE: dict[str, VacancyProfile] = {}


def _safe_priority(val: Any) -> RequirementPriority:
    raw = str(val or "").strip().lower()
    if raw in ("optional", "желательное", "плюс", "nice_to_have"):
        return RequirementPriority.OPTIONAL
    return RequirementPriority.MANDATORY


def _safe_category(val: Any) -> RequirementCategory:
    raw = str(val or "").strip().lower()
    for cat in RequirementCategory:
        if raw == cat.value:
            return cat
    return RequirementCategory.OTHER


def _safe_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    try:
        num = int(float(val))
        return max(0, num)
    except (TypeError, ValueError):
        return None


async def extract_vacancy(
    filename: str,
    text: str,
    llm: BaseLLMClient,
) -> VacancyProfile:
    content_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
    cache_key = f"{llm.provider_name}:{llm.model_name}:{content_hash}"
    if cache_key in _VACANCY_CACHE:
        cached = _VACANCY_CACHE[cache_key]
        return cached.model_copy(update={"filename": filename})

    raw = await llm.complete_json(
        system_prompt=VACANCY_EXTRACTION_SYSTEM,
        user_prompt=VACANCY_EXTRACTION_USER.format(filename=filename, text=text),
        task_name=f"vacancy:{filename}",
    )

    reqs_raw = raw.get("requirements") or []
    requirements: list[VacancyRequirement] = []
    seen_ids: set[str] = set()

    for idx, item in enumerate(reqs_raw, start=1):
        if not isinstance(item, dict):
            continue
        req_text = str(item.get("text") or "").strip()
        if not req_text:
            continue
        req_id = str(item.get("id") or f"req_{idx}").strip() or f"req_{idx}"
        while req_id in seen_ids:
            req_id = f"{req_id}_{idx}"
        seen_ids.add(req_id)

        requirements.append(
            VacancyRequirement(
                id=req_id,
                text=req_text,
                priority=_safe_priority(item.get("priority")),
                category=_safe_category(item.get("category")),
                source_quote=str(item.get("source_quote") or "").strip(),
            )
        )

    if not requirements:
        # Fallback single requirement if LLM returned an empty list on an unusual vacancy
        requirements.append(
            VacancyRequirement(
                id="req_1",
                text="Соответствие описанию и задачам вакансии",
                priority=RequirementPriority.MANDATORY,
                category=RequirementCategory.OTHER,
                source_quote=text[:200],
            )
        )

    profile = VacancyProfile(
        filename=filename,
        title=str(raw.get("title") or filename).strip(),
        summary=str(raw.get("summary") or "").strip(),
        work_format=str(raw.get("work_format") or "Не указан").strip(),
        location=str(raw.get("location") or "Не указана").strip(),
        requirements=requirements,
    )
    _VACANCY_CACHE[cache_key] = profile
    return profile


async def extract_resume(
    filename: str,
    redacted_text: str,
    llm: BaseLLMClient,
) -> ResumeProfile:
    raw = await llm.complete_json(
        system_prompt=RESUME_EXTRACTION_SYSTEM,
        user_prompt=RESUME_EXTRACTION_USER.format(text=redacted_text),
        task_name="resume",
    )

    experiences: list[ResumeExperience] = []
    for item in raw.get("experiences") or []:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if not role:
            continue
        experiences.append(
            ResumeExperience(
                role=role,
                organization=str(item.get("organization") or "").strip(),
                period=str(item.get("period") or "").strip(),
                duration_months=_safe_int(item.get("duration_months")),
                responsibilities=[str(x).strip() for x in (item.get("responsibilities") or []) if str(x).strip()],
                tools_and_skills=[str(x).strip() for x in (item.get("tools_and_skills") or []) if str(x).strip()],
                source_quote=str(item.get("source_quote") or "").strip(),
            )
        )

    education: list[ResumeEducation] = []
    for item in raw.get("education") or []:
        if not isinstance(item, dict):
            continue
        education.append(
            ResumeEducation(
                level=str(item.get("level") or "").strip(),
                institution=str(item.get("institution") or "").strip(),
                field=str(item.get("field") or "").strip(),
                year=str(item.get("year") or "").strip(),
                source_quote=str(item.get("source_quote") or "").strip(),
            )
        )

    return ResumeProfile(
        filename=filename,
        target_role=str(raw.get("target_role") or "").strip(),
        total_experience_months=_safe_int(raw.get("total_experience_months")),
        summary=str(raw.get("summary") or "").strip(),
        experiences=experiences,
        education=education,
        skills=[str(x).strip() for x in (raw.get("skills") or []) if str(x).strip()],
        languages=[str(x).strip() for x in (raw.get("languages") or []) if str(x).strip()],
        logistics_and_format=str(raw.get("logistics_and_format") or "").strip(),
        cover_letter_notes=str(raw.get("cover_letter_notes") or "").strip(),
    )
