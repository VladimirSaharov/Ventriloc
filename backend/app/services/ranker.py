from __future__ import annotations

from app.schemas import (
    FitVerdict,
    MatchStatus,
    RequirementEvaluation,
    RequirementPriority,
    ScoreBreakdown,
    VacancyAnalysisResult,
)

# Uniform weights and coefficients applied identically to every vacancy
PRIORITY_WEIGHTS = {
    RequirementPriority.MANDATORY: 2.0,
    RequirementPriority.OPTIONAL: 1.0,
}

STATUS_COEFFICIENTS = {
    MatchStatus.FULL_MATCH: 1.0,
    MatchStatus.PARTIAL_MATCH: 0.5,
    # NOT_SPECIFIED gets a non-zero neutral score so lack of info is NOT treated as NO_MATCH
    MatchStatus.NOT_SPECIFIED: 0.2,
    MatchStatus.NO_MATCH: 0.0,
}


def compute_score_breakdown(evaluations: list[RequirementEvaluation]) -> ScoreBreakdown:
    if not evaluations:
        return ScoreBreakdown(
            overall_score=0.0,
            mandatory_score=0.0,
            optional_score=0.0,
            full_count=0,
            partial_count=0,
            no_match_count=0,
            not_specified_count=0,
            total_requirements=0,
            uncertainty_ratio=1.0,
            fit_verdict=FitVerdict.WEAK_FIT,
            explanation="Требования не извлечены.",
        )

    total_weight = 0.0
    earned_weight = 0.0
    mand_total = 0.0
    mand_earned = 0.0
    opt_total = 0.0
    opt_earned = 0.0

    full_count = 0
    partial_count = 0
    no_match_count = 0
    not_specified_count = 0

    for ev in evaluations:
        w = PRIORITY_WEIGHTS[ev.priority]
        c = STATUS_COEFFICIENTS[ev.status]
        total_weight += w
        earned_weight += w * c

        if ev.priority == RequirementPriority.MANDATORY:
            mand_total += w
            mand_earned += w * c
        else:
            opt_total += w
            opt_earned += w * c

        if ev.status == MatchStatus.FULL_MATCH:
            full_count += 1
        elif ev.status == MatchStatus.PARTIAL_MATCH:
            partial_count += 1
        elif ev.status == MatchStatus.NO_MATCH:
            no_match_count += 1
        else:
            not_specified_count += 1

    overall_score = round((earned_weight / total_weight) * 100.0, 1) if total_weight > 0 else 0.0
    mandatory_score = round((mand_earned / mand_total) * 100.0, 1) if mand_total > 0 else overall_score
    optional_score = round((opt_earned / opt_total) * 100.0, 1) if opt_total > 0 else 100.0

    total_reqs = len(evaluations)
    uncertainty_ratio = round(not_specified_count / total_reqs, 2)

    if overall_score >= 70.0 and mandatory_score >= 65.0:
        verdict = FitVerdict.STRONG_FIT
    elif overall_score >= 45.0 and mandatory_score >= 40.0:
        verdict = FitVerdict.MODERATE_FIT
    else:
        verdict = FitVerdict.WEAK_FIT

    mand_evals = [e for e in evaluations if e.priority == RequirementPriority.MANDATORY]
    mand_full = sum(1 for e in mand_evals if e.status == MatchStatus.FULL_MATCH)
    mand_partial = sum(1 for e in mand_evals if e.status == MatchStatus.PARTIAL_MATCH)
    mand_unk = sum(1 for e in mand_evals if e.status == MatchStatus.NOT_SPECIFIED)
    mand_no = sum(1 for e in mand_evals if e.status == MatchStatus.NO_MATCH)

    explanation = (
        f"Итоговый индекс {overall_score}% (обязательные требования: {mandatory_score}%). "
        f"Из {len(mand_evals)} обязательных требований: {mand_full} подтверждены полностью, "
        f"{mand_partial} — частично, {mand_unk} — не указаны в резюме, {mand_no} — не совпадают."
    )

    return ScoreBreakdown(
        overall_score=overall_score,
        mandatory_score=mandatory_score,
        optional_score=optional_score,
        full_count=full_count,
        partial_count=partial_count,
        no_match_count=no_match_count,
        not_specified_count=not_specified_count,
        total_requirements=total_reqs,
        uncertainty_ratio=uncertainty_ratio,
        fit_verdict=verdict,
        explanation=explanation,
    )


def rank_vacancies(results: list[VacancyAnalysisResult]) -> list[VacancyAnalysisResult]:
    """Deterministically sort and assign 1-based rank using uniform criteria."""
    ordered = sorted(
        results,
        key=lambda r: (
            r.score.overall_score,
            r.score.mandatory_score,
            r.score.full_count,
            -r.score.no_match_count,
            r.vacancy.filename,
        ),
        reverse=True,
    )
    ranked: list[VacancyAnalysisResult] = []
    for idx, item in enumerate(ordered, start=1):
        ranked.append(item.model_copy(update={"rank": idx}))
    return ranked


def build_overall_recommendation(ranked: list[VacancyAnalysisResult]) -> tuple[str | None, str]:
    if not ranked:
        return None, "Не удалось оценить ни одной вакансии."

    best = ranked[0]
    if best.score.fit_verdict == FitVerdict.STRONG_FIT:
        rec = (
            f"Наиболее подходящая вакансия: «{best.vacancy.title}» ({best.vacancy.filename}) "
            f"с итоговым индексом соответствия {best.score.overall_score}% "
            f"(по обязательным требованиям: {best.score.mandatory_score}%). "
            f"Рекомендуется пригласить кандидата на следующий этап по данной позиции."
        )
    elif best.score.fit_verdict == FitVerdict.MODERATE_FIT:
        rec = (
            f"Наиболее близкая из представленных вакансий: «{best.vacancy.title}» ({best.vacancy.filename}) "
            f"({best.score.overall_score}%, по обязательным требованиям: {best.score.mandatory_score}%). "
            f"Совпадение умеренное — перед направлением к нанимающему менеджеру рекомендуется провести "
            f"уточняющий скрининг по отмеченным пробелам и неуказанным сведениям."
        )
    else:
        rec = (
            f"Ни одна из загруженных вакансий не показывает сильного совпадения с текущим резюме. "
            f"Относительно выше остальных расположена вакансия «{best.vacancy.title}» ({best.vacancy.filename}) "
            f"с индексом {best.score.overall_score}% (обязательные: {best.score.mandatory_score}%). "
            f"Рассмотрение возможно только при готовности к обучению или после уточнения неуказанных данных."
        )

    if len(ranked) > 1:
        runner_up = ranked[1]
        gap = round(best.score.overall_score - runner_up.score.overall_score, 1)
        rec += (
            f" Отрыв от второй позиции («{runner_up.vacancy.title}», {runner_up.score.overall_score}%) "
            f"составляет {gap} п.п."
        )

    return best.vacancy.filename, rec
