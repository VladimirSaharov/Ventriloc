from __future__ import annotations

import asyncio
import logging

from app.db import (
    complete_submission_analysis,
    fail_submission_analysis,
    get_submission_raw,
    get_vacancy_by_id,
)
from app.services.pipeline import run_analysis_pipeline

logger = logging.getLogger(__name__)

# Serializes external LLM calls across simultaneous candidate submissions
# so GIGACHAT_API_PERS single-stream concurrency is respected without 429 errors.
_llm_execution_lock = asyncio.Lock()


async def analyze_submission_sync(submission_id: str) -> dict:
    """Analyze a submission synchronously against its selected vacancy and persist result."""
    row = get_submission_raw(submission_id)
    if not row:
        raise ValueError("Отклик не найден.")

    vacancy_id = row.get("vacancy_id")
    vacancy = get_vacancy_by_id(vacancy_id, include_bytes=True) if vacancy_id else None
    if not vacancy:
        msg = "Выбранная вакансия не найдена."
        fail_submission_analysis(submission_id, msg)
        raise ValueError(msg)

    async with _llm_execution_lock:
        try:
            result = await run_analysis_pipeline(
                resume_file=(row["resume_filename"], bytes(row["resume_bytes"])),
                vacancy_files=[(vacancy["filename"], bytes(vacancy["content_bytes"]))],
            )
            result_dict = result.model_dump()
            complete_submission_analysis(submission_id, result_dict)
            logger.info("Submission %s analyzed synchronously for vacancy %s.", submission_id, vacancy_id)
            return result_dict
        except Exception as exc:
            logger.warning("Submission %s analysis failed: %s", submission_id, exc)
            fail_submission_analysis(submission_id, str(exc))
            raise
