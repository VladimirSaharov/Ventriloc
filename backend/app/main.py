from __future__ import annotations

import logging
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.schemas import AnalysisResponse, PiiRedactionReport
from app.services.llm_client import LLMClientError
from app.services.parser import SUPPORTED_EXTENSIONS, parse_document_bytes
from app.services.pii_redactor import redact_pii
from app.services.pipeline import run_analysis_pipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Ventriloc HR — Анализ резюме и вакансий",
    description="Система сравнительного анализа резюме и вакансий с защитой ПДн и объяснимым ранжированием.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _discover_sample_files() -> dict[str, list[Path]]:
    root = settings.resolve_samples_root()
    resumes: list[Path] = []
    vacancies: list[Path] = []

    # Resumes folder
    for candidate_dir in (root / "samples" / "resumes", root / "resumes", root / "4 резюме кондидатов"):
        if candidate_dir.is_dir():
            for p in sorted(candidate_dir.iterdir()):
                if p.is_file() and not p.name.startswith("~$") and p.suffix.lower() in SUPPORTED_EXTENSIONS:
                    resumes.append(p)
            if resumes:
                break

    # Vacancies folder or root
    for vac_dir in (root / "samples" / "vacancies", root / "vacancies"):
        if vac_dir.is_dir():
            for p in sorted(vac_dir.iterdir()):
                if p.is_file() and not p.name.startswith("~$") and p.suffix.lower() in SUPPORTED_EXTENSIONS:
                    vacancies.append(p)
            if vacancies:
                break

    if not vacancies and root.is_dir():
        for p in sorted(root.iterdir()):
            if (
                p.is_file()
                and not p.name.startswith("~$")
                and p.suffix.lower() in SUPPORTED_EXTENSIONS
                and "ваканс" in p.name.lower()
            ):
                vacancies.append(p)

    return {"resumes": resumes, "vacancies": vacancies}


def _resolve_sample_by_name(kind: str, filename: str) -> Path:
    samples = _discover_sample_files()[kind]
    for p in samples:
        if p.name == filename:
            return p
    raise HTTPException(status_code=404, detail=f"Образец '{filename}' не найден в категории {kind}.")


def _is_llm_configured() -> bool:
    if settings.llm_provider == "mock":
        return True
    if settings.llm_provider == "gigachat":
        return bool(settings.gigachat_auth_key.strip())
    if settings.llm_provider == "openai":
        return bool(settings.llm_api_key.strip())
    return False


def _active_model() -> str:
    if settings.llm_provider == "gigachat":
        return settings.gigachat_model
    if settings.llm_provider == "openai":
        return settings.llm_model
    return "mock-deterministic-v1"


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "model": _active_model(),
        "llm_configured": _is_llm_configured(),
        "pii_redaction_enabled": settings.pii_redaction_enabled,
    }


@app.get("/api/samples")
async def list_samples():
    discovered = _discover_sample_files()
    return {
        "resumes": [{"filename": p.name, "size_bytes": p.stat().st_size} for p in discovered["resumes"]],
        "vacancies": [{"filename": p.name, "size_bytes": p.stat().st_size} for p in discovered["vacancies"]],
    }


@app.post("/api/preview-pii", response_model=PiiRedactionReport)
async def preview_pii(
    resume: UploadFile | None = File(default=None),
    sample_resume: str | None = Form(default=None),
):
    if resume is not None:
        raw_bytes = await resume.read()
        filename = resume.filename or "resume"
    elif sample_resume:
        path = _resolve_sample_by_name("resumes", sample_resume)
        raw_bytes = path.read_bytes()
        filename = path.name
    else:
        raise HTTPException(status_code=400, detail="Передайте файл резюме или имя образца (sample_resume).")

    parsed = parse_document_bytes(filename, raw_bytes)
    if not parsed.is_valid:
        raise HTTPException(status_code=400, detail=parsed.error or "Ошибка чтения резюме.")

    return redact_pii(parsed.text, filename=parsed.filename, enabled=settings.pii_redaction_enabled)


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze_resume(
    resume: UploadFile | None = File(default=None),
    vacancies: list[UploadFile] | None = File(default=None),
    sample_resume: Annotated[str | None, Form()] = None,
    sample_vacancies: Annotated[list[str] | None, Form()] = None,
):
    # Resolve resume input
    if resume is not None and (resume.filename or ""):
        resume_tuple = (resume.filename or "resume", await resume.read())
    elif sample_resume:
        path = _resolve_sample_by_name("resumes", sample_resume)
        resume_tuple = (path.name, path.read_bytes())
    else:
        raise HTTPException(status_code=400, detail="Необходимо загрузить резюме или выбрать образец.")

    # Resolve vacancy inputs (uploaded files + optional selected sample names)
    vacancy_tuples: list[tuple[str, bytes]] = []
    if vacancies:
        for vf in vacancies:
            if vf.filename:
                vacancy_tuples.append((vf.filename, await vf.read()))

    if sample_vacancies:
        for sv in sample_vacancies:
            for item in [x.strip() for x in sv.split(",") if x.strip()]:
                path = _resolve_sample_by_name("vacancies", item)
                vacancy_tuples.append((path.name, path.read_bytes()))

    if not vacancy_tuples:
        raise HTTPException(status_code=400, detail="Необходимо загрузить хотя бы одну вакансию.")

    try:
        return await run_analysis_pipeline(resume_tuple, vacancy_tuples)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMClientError as exc:
        logger.exception("LLM error during analysis")
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error during analysis")
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервиса: {exc}") from exc
