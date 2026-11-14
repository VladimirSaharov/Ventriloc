from __future__ import annotations

import asyncio
import logging

from app.db import (
    complete_submission_analysis,
    fail_submission_analysis,
    get_submission_raw,
    get_vacancy_by_id,
    list_pending_submission_ids,
    mark_submission_processing,
)
from app.services.pipeline import run_analysis_pipeline

logger = logging.getLogger(__name__)


class SubmissionWorker:
    """Sequential background worker checking submitted resumes against their chosen vacancy."""

    def __init__(self) -> None:
        self._queue: asyncio.Queue[str] | None = None
        self._task: asyncio.Task[None] | None = None
        self._enqueued_ids: set[str] = set()

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._queue = asyncio.Queue()
        self._enqueued_ids.clear()
        for pending_id in list_pending_submission_ids():
            self._queue.put_nowait(pending_id)
            self._enqueued_ids.add(pending_id)
        self._task = asyncio.create_task(self._run_loop(), name="submission-worker")
        logger.info("SubmissionWorker started with %d pending items.", self._queue.qsize())

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self._queue = None
        self._enqueued_ids.clear()

    def enqueue(self, submission_id: str) -> None:
        if self._queue is None:
            self.start()
        assert self._queue is not None
        if submission_id not in self._enqueued_ids:
            self._enqueued_ids.add(submission_id)
            self._queue.put_nowait(submission_id)

    async def _run_loop(self) -> None:
        assert self._queue is not None
        while True:
            sub_id = await self._queue.get()
            try:
                await self._process_one(sub_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("Unhandled error processing submission %s", sub_id)
                fail_submission_analysis(sub_id, str(exc))
            finally:
                self._enqueued_ids.discard(sub_id)
                self._queue.task_done()

    async def _process_one(self, submission_id: str) -> None:
        row = get_submission_raw(submission_id)
        if not row:
            return

        vacancy_id = row.get("vacancy_id")
        vacancy = get_vacancy_by_id(vacancy_id, include_bytes=True) if vacancy_id else None
        if not vacancy:
            fail_submission_analysis(submission_id, "Выбранная вакансия не найдена или удалена.")
            return

        mark_submission_processing(submission_id)
        try:
            result = await run_analysis_pipeline(
                resume_file=(row["resume_filename"], bytes(row["resume_bytes"])),
                vacancy_files=[(vacancy["filename"], bytes(vacancy["content_bytes"]))],
            )
            complete_submission_analysis(submission_id, result.model_dump())
            logger.info("Submission %s processed asynchronously for vacancy %s.", submission_id, vacancy_id)
        except Exception as exc:
            logger.warning("Submission %s analysis failed: %s", submission_id, exc)
            fail_submission_analysis(submission_id, str(exc))


submission_worker = SubmissionWorker()
