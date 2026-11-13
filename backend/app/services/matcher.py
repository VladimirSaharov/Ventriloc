from __future__ import annotations

import json
from typing import Any

from app.prompts.templates import MATCHING_SYSTEM, MATCHING_USER
from app.schemas import (
    InterviewQuestion,
    MatchStatus,
    RequirementEvaluation,
    ResumeProfile,
    RiskOrGapItem,
    StrengthItem,
    VacancyProfile,
)
from app.services.llm_client import BaseLLMClient

NOT_SPECIFIED_EVIDENCE = "Информация в резюме не указана"


def _normalize_status(val: Any) -> MatchStatus:
    raw = str(val or "").strip().lower()
    mapping = {
        "full_match": MatchStatus.FULL_MATCH,
        "full": MatchStatus.FULL_MATCH,
        "полное соответствие": MatchStatus.FULL_MATCH,
        "partial_match": MatchStatus.PARTIAL_MATCH,
        "partial": MatchStatus.PARTIAL_MATCH,
        "частичное соответствие": MatchStatus.PARTIAL_MATCH,
        "no_match": MatchStatus.NO_MATCH,
        "none": MatchStatus.NO_MATCH,
        "отсутствие соответствия": MatchStatus.NO_MATCH,
        "not_specified": MatchStatus.NOT_SPECIFIED,
        "unknown": MatchStatus.NOT_SPECIFIED,
        "не указано": MatchStatus.NOT_SPECIFIED,
    }
    return mapping.get(raw, MatchStatus.NOT_SPECIFIED)


async def match_resume_to_vacancy(
    resume_profile: ResumeProfile,
    redacted_resume_text: str,
    vacancy: VacancyProfile,
    llm: BaseLLMClient,
) -> dict[str, Any]:
    vacancy_meta = {
        "filename": vacancy.filename,
        "title": vacancy.title,
        "summary": vacancy.summary,
        "work_format": vacancy.work_format,
        "location": vacancy.location,
    }
    requirements_payload = [req.model_dump() for req in vacancy.requirements]

    raw = await llm.complete_json(
        system_prompt=MATCHING_SYSTEM,
        user_prompt=MATCHING_USER.format(
            vacancy_json=json.dumps(vacancy_meta, ensure_ascii=False, indent=2),
            requirements_json=json.dumps(requirements_payload, ensure_ascii=False, indent=2),
            resume_profile_json=resume_profile.model_dump_json(indent=2),
            resume_text=redacted_resume_text,
        ),
        task_name=f"match:{vacancy.filename}",
    )

    raw_evals = {
        str(item.get("requirement_id") or "").strip(): item
        for item in (raw.get("evaluations") or [])
        if isinstance(item, dict)
    }

    evaluations: list[RequirementEvaluation] = []
    for req in vacancy.requirements:
        matched = raw_evals.get(req.id)
        if not matched:
            # Guardrail: never drop a requirement silently; treat missing LLM output as not_specified
            evaluations.append(
                RequirementEvaluation(
                    requirement_id=req.id,
                    requirement_text=req.text,
                    priority=req.priority,
                    category=req.category,
                    vacancy_quote=req.source_quote,
                    resume_evidence=NOT_SPECIFIED_EVIDENCE,
                    status=MatchStatus.NOT_SPECIFIED,
                    comment="Сведения по данному требованию не были сопоставлены; требуется ручное уточнение.",
                )
            )
            continue

        status = _normalize_status(matched.get("status"))
        evidence = str(matched.get("resume_evidence") or "").strip()
        comment = str(matched.get("comment") or "").strip()

        # Guardrail: enforce strict separation between NOT_SPECIFIED and NO_MATCH
        if status == MatchStatus.NOT_SPECIFIED:
            evidence = NOT_SPECIFIED_EVIDENCE
            if not comment:
                comment = "В резюме отсутствуют сведения по этому требованию (не подтверждено и не опровергнуто)."
        elif not evidence:
            evidence = "Фрагмент резюме не процитирован"

        if not comment:
            comment = "Оценка сформирована на основе сопоставления фактов резюме и требований вакансии."

        evaluations.append(
            RequirementEvaluation(
                requirement_id=req.id,
                requirement_text=req.text,
                priority=req.priority,
                category=req.category,
                vacancy_quote=req.source_quote,
                resume_evidence=evidence,
                status=status,
                comment=comment,
            )
        )

    strengths: list[StrengthItem] = []
    for item in raw.get("strengths") or []:
        if not isinstance(item, dict) or not str(item.get("title") or "").strip():
            continue
        strengths.append(
            StrengthItem(
                title=str(item.get("title")).strip(),
                description=str(item.get("description") or "").strip(),
                evidence_quote=str(item.get("evidence_quote") or "").strip(),
                requirement_ids=[str(x) for x in (item.get("requirement_ids") or [])],
            )
        )

    gaps_and_risks: list[RiskOrGapItem] = []
    for item in raw.get("gaps_and_risks") or []:
        if not isinstance(item, dict) or not str(item.get("title") or "").strip():
            continue
        kind = str(item.get("kind") or "uncertainty").strip().lower()
        if kind not in ("confirmed_gap", "uncertainty"):
            kind = "uncertainty"
        gaps_and_risks.append(
            RiskOrGapItem(
                title=str(item.get("title")).strip(),
                kind=kind,
                description=str(item.get("description") or "").strip(),
                requirement_ids=[str(x) for x in (item.get("requirement_ids") or [])],
            )
        )

    recruiter_recommendations = [
        str(x).strip() for x in (raw.get("recruiter_recommendations") or []) if str(x).strip()
    ]

    interview_questions: list[InterviewQuestion] = []
    for item in raw.get("interview_questions") or []:
        if not isinstance(item, dict) or not str(item.get("question") or "").strip():
            continue
        interview_questions.append(
            InterviewQuestion(
                question=str(item.get("question")).strip(),
                target_requirement=str(item.get("target_requirement") or "").strip(),
                reason=str(item.get("reason") or "").strip(),
            )
        )

    outreach_draft = str(raw.get("outreach_draft") or "").strip()

    return {
        "evaluations": evaluations,
        "strengths": strengths,
        "gaps_and_risks": gaps_and_risks,
        "recruiter_recommendations": recruiter_recommendations,
        "interview_questions": interview_questions,
        "outreach_draft": outreach_draft,
    }
