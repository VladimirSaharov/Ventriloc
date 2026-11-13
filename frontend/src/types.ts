export type MatchStatus =
  | 'full_match'
  | 'partial_match'
  | 'no_match'
  | 'not_specified'

export type RequirementPriority = 'mandatory' | 'optional'

export type FitVerdict = 'strong_fit' | 'moderate_fit' | 'weak_fit'

export interface HealthResponse {
  status: string
  llm_provider: string
  model: string
  llm_configured: boolean
  pii_redaction_enabled: boolean
}

export interface SampleFile {
  filename: string
  size_bytes: number
}

export interface SamplesResponse {
  resumes: SampleFile[]
  vacancies: SampleFile[]
}

export interface MaskedEntity {
  entity_type: string
  placeholder: string
  count: number
}

export interface PiiRedactionReport {
  enabled: boolean
  original_char_count: number
  redacted_char_count: number
  total_masked: number
  entities: MaskedEntity[]
  redacted_text: string
}

export interface VacancyRequirement {
  id: string
  text: string
  priority: RequirementPriority
  category: string
  source_quote: string
}

export interface VacancyProfile {
  filename: string
  title: string
  summary: string
  work_format: string
  location: string
  requirements: VacancyRequirement[]
}

export interface ResumeExperience {
  role: string
  organization: string
  period: string
  duration_months: number | null
  responsibilities: string[]
  tools_and_skills: string[]
  source_quote: string
}

export interface ResumeEducation {
  level: string
  institution: string
  field: string
  year: string
  source_quote: string
}

export interface ResumeProfile {
  filename: string
  target_role: string
  total_experience_months: number | null
  summary: string
  experiences: ResumeExperience[]
  education: ResumeEducation[]
  skills: string[]
  languages: string[]
  logistics_and_format: string
  cover_letter_notes: string
}

export interface RequirementEvaluation {
  requirement_id: string
  requirement_text: string
  priority: RequirementPriority
  category: string
  vacancy_quote: string
  resume_evidence: string
  status: MatchStatus
  comment: string
}

export interface StrengthItem {
  title: string
  description: string
  evidence_quote: string
  requirement_ids: string[]
}

export interface RiskOrGapItem {
  title: string
  kind: 'confirmed_gap' | 'uncertainty'
  description: string
  requirement_ids: string[]
}

export interface InterviewQuestion {
  question: string
  target_requirement: string
  reason: string
}

export interface ScoreBreakdown {
  overall_score: number
  mandatory_score: number
  optional_score: number
  full_count: number
  partial_count: number
  no_match_count: number
  not_specified_count: number
  total_requirements: number
  uncertainty_ratio: number
  fit_verdict: FitVerdict
  explanation: string
}

export interface VacancyAnalysisResult {
  rank: number
  vacancy: VacancyProfile
  score: ScoreBreakdown
  evaluations: RequirementEvaluation[]
  strengths: StrengthItem[]
  gaps_and_risks: RiskOrGapItem[]
  recruiter_recommendations: string[]
  interview_questions: InterviewQuestion[]
  outreach_draft: string
}

export interface DocumentErrorInfo {
  filename: string
  error: string
  warnings: string[]
}

export interface AnalysisResponse {
  analysis_id: string
  provider_used: string
  model_used: string
  resume_filename: string
  resume_profile: ResumeProfile
  pii_report: PiiRedactionReport
  best_vacancy_filename: string | null
  overall_recommendation: string
  vacancies: VacancyAnalysisResult[]
  document_warnings: string[]
  failed_vacancies: DocumentErrorInfo[]
  markdown_report: string
}
