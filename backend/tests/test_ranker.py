from app.schemas import (
    MatchStatus,
    RequirementEvaluation,
    RequirementPriority,
    VacancyAnalysisResult,
    VacancyProfile,
    VacancyRequirement,
)
from app.services.ranker import compute_score_breakdown, rank_vacancies


def _make_eval(rid: str, status: MatchStatus, priority: RequirementPriority = RequirementPriority.MANDATORY):
    return RequirementEvaluation(
        requirement_id=rid,
        requirement_text=f"Requirement {rid}",
        priority=priority,
        status=status,
        comment="test",
    )


def test_not_specified_scores_higher_than_no_match():
    unk_score = compute_score_breakdown(
        [_make_eval("1", MatchStatus.FULL_MATCH), _make_eval("2", MatchStatus.NOT_SPECIFIED)]
    )
    no_score = compute_score_breakdown(
        [_make_eval("1", MatchStatus.FULL_MATCH), _make_eval("2", MatchStatus.NO_MATCH)]
    )
    assert unk_score.overall_score > no_score.overall_score
    assert unk_score.not_specified_count == 1
    assert no_score.no_match_count == 1


def test_ranking_order_and_explanation():
    v1 = VacancyProfile(filename="v1.docx", title="Frontend", requirements=[VacancyRequirement(id="1", text="Vue")])
    v2 = VacancyProfile(filename="v2.docx", title="Accountant", requirements=[VacancyRequirement(id="1", text="1C")])

    r1 = VacancyAnalysisResult(
        vacancy=v1,
        score=compute_score_breakdown([_make_eval("1", MatchStatus.FULL_MATCH)]),
        evaluations=[_make_eval("1", MatchStatus.FULL_MATCH)],
    )
    r2 = VacancyAnalysisResult(
        vacancy=v2,
        score=compute_score_breakdown([_make_eval("1", MatchStatus.NO_MATCH)]),
        evaluations=[_make_eval("1", MatchStatus.NO_MATCH)],
    )

    ranked = rank_vacancies([r2, r1])
    assert ranked[0].rank == 1
    assert ranked[0].vacancy.filename == "v1.docx"
    assert ranked[1].rank == 2
    assert ranked[1].vacancy.filename == "v2.docx"
    assert "100.0%" in ranked[0].score.explanation
