from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from app.auth import create_access_token, require_hr_admin
from app.config import settings
from app.db import (
    SUITABLE_SCORE_THRESHOLD,
    authenticate_admin,
    create_submission_record,
    create_vacancy,
    delete_submission,
    delete_vacancy,
    get_submission_raw,
    get_vacancy_by_id,
    init_db,
    list_vacancies,
    list_vacancies_with_counts,
    list_vacancy_submissions,
    set_submission_bucket,
    set_vacancy_active,
)
from app.schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    AnalysisResponse,
    BucketOverrideRequest,
    HrVacancyCandidatesResponse,
    PiiRedactionReport,
    PublicApplyResponse,
    PublicVacancyInfo,
    SubmissionDetailResponse,
    VacancyRecord,
    VacancySummaryItem,
    VacancyToggleRequest,
)
from app.services.llm_client import LLMClientError
from app.services.parser import SUPPORTED_EXTENSIONS, parse_document_bytes
from app.services.pii_redactor import redact_pii
from app.services.pipeline import run_analysis_pipeline
from app.services.worker import analyze_submission_sync

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Ventriloc HR — Анализ резюме и вакансий",
    description="Система приёма откликов без регистрации и кабинет HR со списками вакансий, отбором подходящих и отсеянных кандидатов.",
    version="3.0.0",
    lifespan=lifespan,
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

    for candidate_dir in (root / "samples" / "resumes", root / "resumes", root / "4 резюме кондидатов"):
        if candidate_dir.is_dir():
            for p in sorted(candidate_dir.iterdir()):
                if p.is_file() and not p.name.startswith("~$") and p.suffix.lower() in SUPPORTED_EXTENSIONS:
                    resumes.append(p)
            if resumes:
                break

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


# ==============================================================================
# Public Endpoints (Candidate Portal & Health)
# ==============================================================================


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "llm_provider": settings.llm_provider,
        "model": _active_model(),
        "llm_configured": _is_llm_configured(),
        "pii_redaction_enabled": settings.pii_redaction_enabled,
    }


@app.get("/api/public/open-vacancies", response_model=list[PublicVacancyInfo])
async def get_public_open_vacancies():
    rows = list_vacancies(active_only=True)
    return [
        PublicVacancyInfo(id=r["id"], title=r["title"], filename=r["filename"])
        for r in rows
    ]


@app.post("/api/public/apply", response_model=PublicApplyResponse)
async def submit_candidate_resume(
    vacancy_id: str = Form(...),
    resume: UploadFile = File(...),
    contact: str = Form(default=""),
    comment: str = Form(default=""),
):
    vacancy = get_vacancy_by_id(vacancy_id)
    if not vacancy or not vacancy["is_active"]:
        raise HTTPException(status_code=404, detail="Выбранная вакансия не найдена или уже закрыта.")

    filename = resume.filename or "resume"
    raw_bytes = await resume.read()

    parsed = parse_document_bytes(filename, raw_bytes)
    if not parsed.is_valid:
        raise HTTPException(status_code=400, detail=parsed.error or "Не удалось прочитать файл резюме.")

    sub_id = create_submission_record(
        vacancy_id=vacancy["id"],
        vacancy_filename=vacancy["filename"],
        vacancy_title=vacancy["title"],
        resume_filename=parsed.filename,
        resume_bytes=raw_bytes,
        contact_info=contact,
        comment=comment,
    )

    try:
        await analyze_submission_sync(sub_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LLMClientError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Сервис анализа временно недоступен: {exc}. Попробуйте отправить резюме чуть позже.",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось обработать отклик: {exc}",
        ) from exc

    return PublicApplyResponse(
        submission_id=sub_id,
        vacancy_id=vacancy["id"],
        vacancy_title=vacancy["title"],
        status="completed",
        message="Резюме отправлено и принято в работу. HR-специалист рассмотрит ваш отклик.",
    )


# ==============================================================================
# HR Admin Authentication
# ==============================================================================


@app.post("/api/auth/login", response_model=AdminLoginResponse)
async def admin_login(body: AdminLoginRequest):
    user = authenticate_admin(body.username, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль администратора.",
        )
    token = create_access_token(user["username"])
    return AdminLoginResponse(access_token=token, username=user["username"])


@app.get("/api/auth/me")
async def admin_me(username: str = Depends(require_hr_admin)):
    return {"username": username}


# ==============================================================================
# Protected HR Admin Endpoints
# ==============================================================================


@app.get("/api/hr/vacancies", response_model=list[VacancySummaryItem])
async def get_hr_vacancies(_: str = Depends(require_hr_admin)):
    return list_vacancies_with_counts(active_only=False)


@app.get("/api/hr/vacancies/{vacancy_id}/submissions", response_model=HrVacancyCandidatesResponse)
async def get_hr_vacancy_submissions(vacancy_id: str, _: str = Depends(require_hr_admin)):
    all_vacs = list_vacancies_with_counts(active_only=False)
    vac = next((v for v in all_vacs if v["id"] == vacancy_id), None)
    if not vac:
        raise HTTPException(status_code=404, detail="Вакансия не найдена.")
    candidates = list_vacancy_submissions(vacancy_id)
    return HrVacancyCandidatesResponse(vacancy=vac, candidates=candidates)


@app.get("/api/hr/submissions/{submission_id}", response_model=SubmissionDetailResponse)
async def get_hr_submission_detail(submission_id: str, _: str = Depends(require_hr_admin)):
    row = get_submission_raw(submission_id)
    if not row:
        raise HTTPException(status_code=404, detail="Отклик не найден.")

    analysis_obj: AnalysisResponse | None = None
    if row["analysis_json"]:
        analysis_obj = AnalysisResponse.model_validate(json.loads(row["analysis_json"]))

    score = row.get("match_score")
    system_recommended = score is not None and float(score) >= SUITABLE_SCORE_THRESHOLD

    return SubmissionDetailResponse(
        id=row["id"],
        vacancy_id=row.get("vacancy_id"),
        vacancy_title=row.get("vacancy_title") or "",
        candidate_label=row["candidate_label"],
        contact_info=row["contact_info"],
        comment=row["comment"],
        resume_filename=row["resume_filename"],
        status=row["status"],
        error_message=row["error_message"],
        match_score=score,
        fit_verdict=row.get("fit_verdict"),
        screening_bucket=row.get("screening_bucket") or "suitable",
        is_top_resume=bool(row.get("is_top_resume")),
        manual_override=bool(row.get("manual_override")),
        system_recommended=system_recommended,
        created_at=row["created_at"],
        processed_at=row["processed_at"],
        analysis=analysis_obj,
    )


@app.patch("/api/hr/submissions/{submission_id}/bucket")
async def override_submission_bucket(
    submission_id: str,
    body: BucketOverrideRequest,
    _: str = Depends(require_hr_admin),
):
    if body.bucket not in ("suitable", "rejected"):
        raise HTTPException(status_code=400, detail="Допустимые значения bucket: 'suitable' или 'rejected'.")
    target: Literal["suitable", "rejected"] = "suitable" if body.bucket == "suitable" else "rejected"
    updated = set_submission_bucket(submission_id, target)
    if not updated:
        raise HTTPException(status_code=404, detail="Отклик не найден.")
    return updated


@app.post("/api/hr/submissions/{submission_id}/reanalyze")
async def reanalyze_submission(submission_id: str, _: str = Depends(require_hr_admin)):
    row = get_submission_raw(submission_id)
    if not row:
        raise HTTPException(status_code=404, detail="Отклик не найден.")
    try:
        await analyze_submission_sync(submission_id)
    except LLMClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "completed", "submission_id": submission_id}


@app.delete("/api/hr/submissions/{submission_id}")
async def remove_submission(submission_id: str, _: str = Depends(require_hr_admin)):
    if not delete_submission(submission_id):
        raise HTTPException(status_code=404, detail="Отклик не найден.")
    return {"deleted": True, "submission_id": submission_id}


@app.post("/api/hr/vacancies", response_model=VacancyRecord)
async def upload_hr_vacancy(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    _: str = Depends(require_hr_admin),
):
    filename = file.filename or "vacancy"
    raw_bytes = await file.read()
    parsed = parse_document_bytes(filename, raw_bytes)
    if not parsed.is_valid:
        raise HTTPException(status_code=400, detail=parsed.error or "Ошибка чтения файла вакансии.")

    resolved_title = title.strip()
    if not resolved_title:
        for line in parsed.text.splitlines():
            if len(line.strip()) >= 4:
                resolved_title = line.strip()[:120]
                break
        if not resolved_title:
            resolved_title = parsed.filename

    return create_vacancy(filename=parsed.filename, title=resolved_title, content_bytes=raw_bytes)


@app.patch("/api/hr/vacancies/{vacancy_id}", response_model=VacancyRecord)
async def toggle_hr_vacancy(
    vacancy_id: str,
    body: VacancyToggleRequest,
    _: str = Depends(require_hr_admin),
):
    updated = set_vacancy_active(vacancy_id, body.is_active)
    if not updated:
        raise HTTPException(status_code=404, detail="Вакансия не найдена.")
    return updated


@app.delete("/api/hr/vacancies/{vacancy_id}")
async def remove_hr_vacancy(vacancy_id: str, _: str = Depends(require_hr_admin)):
    if not delete_vacancy(vacancy_id):
        raise HTTPException(status_code=404, detail="Вакансия не найдена.")
    return {"deleted": True, "vacancy_id": vacancy_id}


@app.get("/api/samples")
async def list_samples(_: str = Depends(require_hr_admin)):
    discovered = _discover_sample_files()
    return {
        "resumes": [{"filename": p.name, "size_bytes": p.stat().st_size} for p in discovered["resumes"]],
        "vacancies": [{"filename": p.name, "size_bytes": p.stat().st_size} for p in discovered["vacancies"]],
    }


@app.post("/api/preview-pii", response_model=PiiRedactionReport)
async def preview_pii(
    resume: UploadFile | None = File(default=None),
    sample_resume: str | None = Form(default=None),
    _: str = Depends(require_hr_admin),
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
    _: str = Depends(require_hr_admin),
):
    if resume is not None and (resume.filename or ""):
        resume_tuple = (resume.filename or "resume", await resume.read())
    elif sample_resume:
        path = _resolve_sample_by_name("resumes", sample_resume)
        resume_tuple = (path.name, path.read_bytes())
    else:
        raise HTTPException(status_code=400, detail="Необходимо загрузить резюме или выбрать образец.")

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


# Serve built frontend assets when bundled in a single container
_static_candidates = (
    Path("/app/static"),
    Path(__file__).resolve().parent.parent.parent / "frontend" / "dist",
)
for _static_dir in _static_candidates:
    if _static_dir.is_dir():
        from fastapi.responses import FileResponse
        from fastapi.staticfiles import StaticFiles

        assets_dir = _static_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            target = _static_dir / full_path
            if full_path and target.is_file():
                return FileResponse(target)
            return FileResponse(_static_dir / "index.html")

        break
