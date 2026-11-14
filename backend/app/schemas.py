from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class MatchStatus(str, Enum):
    FULL_MATCH = "full_match"
    PARTIAL_MATCH = "partial_match"
    NO_MATCH = "no_match"
    NOT_SPECIFIED = "not_specified"


class RequirementPriority(str, Enum):
    MANDATORY = "mandatory"
    OPTIONAL = "optional"


class RequirementCategory(str, Enum):
    EXPERIENCE = "experience"
    SKILLS = "skills"
    EDUCATION = "education"
    SOFT_SKILLS = "soft_skills"
    CONDITIONS = "conditions"
    OTHER = "other"


class FitVerdict(str, Enum):
    STRONG_FIT = "strong_fit"
    MODERATE_FIT = "moderate_fit"
    WEAK_FIT = "weak_fit"


class ParsedDocument(BaseModel):
    filename: str
    text: str = ""
    char_count: int = 0
    warnings: list[str] = Field(default_factory=list)
    error: Optional[str] = None

    @property
    def is_valid(self) -> bool:
        return self.error is None and bool(self.text.strip())


class MaskedEntity(BaseModel):
    entity_type: str
    placeholder: str
    count: int


class PiiRedactionReport(BaseModel):
    enabled: bool = True
    original_char_count: int
    redacted_char_count: int
    total_masked: int = 0
    entities: list[MaskedEntity] = Field(default_factory=list)
    redacted_text: str


class VacancyRequirement(BaseModel):
    id: str
    text: str
    priority: RequirementPriority = RequirementPriority.MANDATORY
    category: RequirementCategory = RequirementCategory.OTHER
    source_quote: str = ""


class VacancyProfile(BaseModel):
    filename: str
    title: str
    summary: str = ""
    work_format: str = ""
    location: str = ""
    requirements: list[VacancyRequirement] = Field(default_factory=list)


class ResumeExperience(BaseModel):
    role: str
    organization: str = ""
    period: str = ""
    duration_months: Optional[int] = None
    responsibilities: list[str] = Field(default_factory=list)
    tools_and_skills: list[str] = Field(default_factory=list)
    source_quote: str = ""


class ResumeEducation(BaseModel):
    level: str = ""
    institution: str = ""
    field: str = ""
    year: str = ""
    source_quote: str = ""


class ResumeProfile(BaseModel):
    filename: str
    target_role: str = ""
    total_experience_months: Optional[int] = None
    summary: str = ""
    experiences: list[ResumeExperience] = Field(default_factory=list)
    education: list[ResumeEducation] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)
    logistics_and_format: str = ""
    cover_letter_notes: str = ""


class RequirementEvaluation(BaseModel):
    requirement_id: str
    requirement_text: str
    priority: RequirementPriority
    category: RequirementCategory = RequirementCategory.OTHER
    vacancy_quote: str = ""
    resume_evidence: str = "Информация в резюме не указана"
    status: MatchStatus
    comment: str


class StrengthItem(BaseModel):
    title: str
    description: str
    evidence_quote: str = ""
    requirement_ids: list[str] = Field(default_factory=list)


class RiskOrGapItem(BaseModel):
    title: str
    kind: str = "uncertainty"  # "confirmed_gap" | "uncertainty"
    description: str
    requirement_ids: list[str] = Field(default_factory=list)


class InterviewQuestion(BaseModel):
    question: str
    target_requirement: str = ""
    reason: str = ""


class ScoreBreakdown(BaseModel):
    overall_score: float
    mandatory_score: float
    optional_score: float
    full_count: int
    partial_count: int
    no_match_count: int
    not_specified_count: int
    total_requirements: int
    uncertainty_ratio: float
    fit_verdict: FitVerdict
    explanation: str


class VacancyAnalysisResult(BaseModel):
    rank: int = 0
    vacancy: VacancyProfile
    score: ScoreBreakdown
    evaluations: list[RequirementEvaluation] = Field(default_factory=list)
    strengths: list[StrengthItem] = Field(default_factory=list)
    gaps_and_risks: list[RiskOrGapItem] = Field(default_factory=list)
    recruiter_recommendations: list[str] = Field(default_factory=list)
    interview_questions: list[InterviewQuestion] = Field(default_factory=list)
    outreach_draft: str = ""


class DocumentErrorInfo(BaseModel):
    filename: str
    error: str
    warnings: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    analysis_id: str
    provider_used: str
    model_used: str
    resume_filename: str
    resume_profile: ResumeProfile
    pii_report: PiiRedactionReport
    best_vacancy_filename: Optional[str] = None
    overall_recommendation: str
    vacancies: list[VacancyAnalysisResult] = Field(default_factory=list)
    document_warnings: list[str] = Field(default_factory=list)
    failed_vacancies: list[DocumentErrorInfo] = Field(default_factory=list)
    markdown_report: str = ""


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class PublicVacancyInfo(BaseModel):
    id: str
    title: str
    filename: str


class PublicApplyResponse(BaseModel):
    submission_id: str
    vacancy_id: str
    vacancy_title: str
    status: str
    message: str


class VacancyRecord(BaseModel):
    id: str
    filename: str
    title: str
    is_active: bool
    created_at: str


class VacancySummaryItem(BaseModel):
    id: str
    filename: str
    title: str
    is_active: bool
    created_at: str
    total_count: int
    suitable_count: int
    top_count: int
    rejected_count: int
    failed_count: int


class VacancyToggleRequest(BaseModel):
    is_active: bool


class BucketOverrideRequest(BaseModel):
    bucket: str  # "suitable" | "rejected"


class VacancyCandidateItem(BaseModel):
    id: str
    vacancy_id: str
    vacancy_title: str
    candidate_label: str
    contact_info: str
    comment: str
    resume_filename: str
    status: str
    error_message: str
    match_score: Optional[float] = None
    mandatory_score: float = 0.0
    fit_verdict: Optional[FitVerdict] = None
    screening_bucket: str
    is_top_resume: bool
    manual_override: bool
    system_recommended: bool
    target_role: str = ""
    summary: str = ""
    total_experience_months: Optional[int] = None
    skills_preview: list[str] = Field(default_factory=list)
    full_count: int = 0
    partial_count: int = 0
    not_specified_count: int = 0
    no_match_count: int = 0
    total_requirements: int = 0
    created_at: str
    processed_at: Optional[str] = None


class HrVacancyCandidatesResponse(BaseModel):
    vacancy: VacancySummaryItem
    candidates: list[VacancyCandidateItem]


class SubmissionDetailResponse(BaseModel):
    id: str
    vacancy_id: Optional[str] = None
    vacancy_title: str = ""
    candidate_label: str
    contact_info: str
    comment: str
    resume_filename: str
    status: str
    error_message: str
    match_score: Optional[float] = None
    fit_verdict: Optional[FitVerdict] = None
    screening_bucket: str = "suitable"
    is_top_resume: bool = False
    manual_override: bool = False
    system_recommended: bool = False
    created_at: str
    processed_at: Optional[str] = None
    analysis: Optional[AnalysisResponse] = None
