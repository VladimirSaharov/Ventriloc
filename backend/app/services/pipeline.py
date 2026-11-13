from __future__ import annotations

import asyncio
import uuid

from app.config import settings
from app.schemas import (
    AnalysisResponse,
    DocumentErrorInfo,
    MatchStatus,
    ParsedDocument,
    RequirementPriority,
    VacancyAnalysisResult,
)
from app.services.extractor import extract_resume, extract_vacancy
from app.services.llm_client import get_llm_client
from app.services.matcher import match_resume_to_vacancy
from app.services.parser import parse_document_bytes
from app.services.pii_redactor import redact_pii
from app.services.ranker import (
    build_overall_recommendation,
    compute_score_breakdown,
    rank_vacancies,
)

STATUS_LABELS = {
    MatchStatus.FULL_MATCH: "Полное соответствие",
    MatchStatus.PARTIAL_MATCH: "Частичное соответствие",
    MatchStatus.NO_MATCH: "Отсутствие соответствия",
    MatchStatus.NOT_SPECIFIED: "Не указано в резюме",
}


def render_markdown_report(response: AnalysisResponse) -> str:
    lines: list[str] = [
        f"# Отчет по сравнительному анализу резюме: {response.resume_filename}",
        "",
        f"- **Провайдер / модель:** `{response.provider_used}` / `{response.model_used}`",
        f"- **Обезличивание ПДн:** {'включено' if response.pii_report.enabled else 'выключено'} "
        f"(замаскировано фрагментов: {response.pii_report.total_masked})",
        f"- **Итоговая рекомендация:** {response.overall_recommendation}",
        "",
        "## Рейтинг вакансий",
        "",
        "| Место | Вакансия | Файл | Итоговый индекс | Обязательные | Полное / Частичное / Не указано / Нет |",
        "|---:|---|---|---:|---:|---|",
    ]
    for v in response.vacancies:
        s = v.score
        lines.append(
            f"| {v.rank} | {v.vacancy.title} | {v.vacancy.filename} | {s.overall_score}% | "
            f"{s.mandatory_score}% | {s.full_count} / {s.partial_count} / {s.not_specified_count} / {s.no_match_count} |"
        )

    for v in response.vacancies:
        lines.extend(
            [
                "",
                f"---",
                f"## #{v.rank}. {v.vacancy.title} ({v.vacancy.filename})",
                "",
                f"**Обоснование рейтинга:** {v.score.explanation}",
                "",
                "### Таблица соответствия требованиям",
                "",
                "| Важность | Требование | Подтверждение в резюме | Статус | Комментарий |",
                "|---|---|---|---|---|",
            ]
        )
        for ev in v.evaluations:
            prio = "Обязательное" if ev.priority == RequirementPriority.MANDATORY else "Желательное"
            st = STATUS_LABELS[ev.status]
            req_clean = ev.requirement_text.replace("|", "\\|").replace("\n", " ")
            ev_clean = ev.resume_evidence.replace("|", "\\|").replace("\n", " ")
            com_clean = ev.comment.replace("|", "\\|").replace("\n", " ")
            lines.append(f"| {prio} | {req_clean} | {ev_clean} | {st} | {com_clean} |")

        if v.strengths:
            lines.extend(["", "### Сильные стороны", ""])
            for st in v.strengths:
                quote = f" *(Цитата: «{st.evidence_quote}»)*" if st.evidence_quote else ""
                lines.append(f"- **{st.title}:** {st.description}{quote}")

        if v.gaps_and_risks:
            lines.extend(["", "### Пробелы и риски", ""])
            for risk in v.gaps_and_risks:
                kind_label = "Подтвержденный пробел" if risk.kind == "confirmed_gap" else "Требует уточнения"
                lines.append(f"- **[{kind_label}] {risk.title}:** {risk.description}")

        if v.recruiter_recommendations:
            lines.extend(["", "### Рекомендации для рекрутера", ""])
            for rec in v.recruiter_recommendations:
                lines.append(f"- {rec}")

        if v.interview_questions:
            lines.extend(["", "### Вопросы кандидату", ""])
            for q in v.interview_questions:
                lines.append(f"- **{q.question}** *(Проверка: {q.target_requirement} — {q.reason})*")

    return "\n".join(lines)


async def run_analysis_pipeline(
    resume_file: tuple[str, bytes],
    vacancy_files: list[tuple[str, bytes]],
) -> AnalysisResponse:
    resume_name, resume_bytes = resume_file
    parsed_resume: ParsedDocument = parse_document_bytes(resume_name, resume_bytes)
    if not parsed_resume.is_valid:
        raise ValueError(f"Не удалось обработать резюме '{parsed_resume.filename}': {parsed_resume.error}")

    document_warnings = list(parsed_resume.warnings)

    parsed_vacancies: list[ParsedDocument] = []
    failed_vacancies: list[DocumentErrorInfo] = []
    for v_name, v_bytes in vacancy_files:
        pv = parse_document_bytes(v_name, v_bytes)
        if pv.is_valid:
            parsed_vacancies.append(pv)
            for w in pv.warnings:
                document_warnings.append(f"{pv.filename}: {w}")
        else:
            failed_vacancies.append(
                DocumentErrorInfo(
                    filename=pv.filename,
                    error=pv.error or "Неизвестная ошибка чтения файла.",
                    warnings=pv.warnings,
                )
            )

    if not parsed_vacancies:
        raise ValueError(
            "Ни одна из загруженных вакансий не содержит читаемого текста. "
            "Проверьте формат и целостность файлов."
        )

    pii_report = redact_pii(
        parsed_resume.text,
        filename=parsed_resume.filename,
        enabled=settings.pii_redaction_enabled,
    )

    llm = get_llm_client()
    semaphore = asyncio.Semaphore(max(1, settings.llm_concurrency))

    async def _extract_vac(pv: ParsedDocument):
        async with semaphore:
            return await extract_vacancy(pv.filename, pv.text, llm)

    # Extract resume and all vacancies concurrently
    resume_task = extract_resume(parsed_resume.filename, pii_report.redacted_text, llm)
    vac_tasks = [_extract_vac(pv) for pv in parsed_vacancies]
    results_extracted = await asyncio.gather(resume_task, *vac_tasks)
    resume_profile = results_extracted[0]
    vacancy_profiles = list(results_extracted[1:])

    async def _match_one(vp):
        async with semaphore:
            matched = await match_resume_to_vacancy(
                resume_profile=resume_profile,
                redacted_resume_text=pii_report.redacted_text,
                vacancy=vp,
                llm=llm,
            )
            score = compute_score_breakdown(matched["evaluations"])
            return VacancyAnalysisResult(
                vacancy=vp,
                score=score,
                evaluations=matched["evaluations"],
                strengths=matched["strengths"],
                gaps_and_risks=matched["gaps_and_risks"],
                recruiter_recommendations=matched["recruiter_recommendations"],
                interview_questions=matched["interview_questions"],
                outreach_draft=matched["outreach_draft"],
            )

    matched_results = await asyncio.gather(*[_match_one(vp) for vp in vacancy_profiles])
    ranked_vacancies = rank_vacancies(list(matched_results))
    best_filename, overall_rec = build_overall_recommendation(ranked_vacancies)

    response = AnalysisResponse(
        analysis_id=str(uuid.uuid4()),
        provider_used=llm.provider_name,
        model_used=llm.model_name,
        resume_filename=parsed_resume.filename,
        resume_profile=resume_profile,
        pii_report=pii_report,
        best_vacancy_filename=best_filename,
        overall_recommendation=overall_rec,
        vacancies=ranked_vacancies,
        document_warnings=document_warnings,
        failed_vacancies=failed_vacancies,
    )
    response.markdown_report = render_markdown_report(response)
    return response
