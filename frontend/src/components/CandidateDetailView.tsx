import { useState } from 'react'
import {
  ArrowLeft,
  ArrowUpRight,
  Award,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react'
import type { SubmissionDetailResponse } from '../types'
import { PiiPreviewModal } from './PiiPreviewModal'
import { RecruiterPanel } from './RecruiterPanel'
import { VacancyDetail } from './VacancyDetail'

interface CandidateDetailViewProps {
  detail: SubmissionDetailResponse
  blindMode: boolean
  busy: boolean
  onBack: () => void
  onOverrideBucket: (bucket: 'suitable' | 'rejected') => void
  onReanalyze: () => void
  onDelete: () => void
}

function formatExperienceDuration(months: number | null | undefined): string {
  if (!months || months <= 0) return 'Не указан'
  const years = Math.floor(months / 12)
  const rem = months % 12
  if (years > 0 && rem > 0) return `${years} г. ${rem} мес.`
  if (years > 0) return `${years} г.`
  return `${rem} мес.`
}

export function CandidateDetailView({
  detail,
  blindMode,
  busy,
  onBack,
  onOverrideBucket,
  onReanalyze,
  onDelete,
}: CandidateDetailViewProps) {
  const [piiModalOpen, setPiiModalOpen] = useState(false)

  const analysis = detail.analysis
  const activeVacancy = analysis?.vacancies?.[0] || null
  const profile = analysis?.resume_profile || null

  const displayTitle = blindMode ? `Кандидат #${detail.id.slice(0, 6)}` : detail.candidate_label

  return (
    <div className="bg-[#ffffff]">
      {/* Sticky sub-header */}
      <div className="bg-[#efefef] border-b border-[#e8e8e8] py-4">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-[14px] font-medium text-[#202020] hover:text-[#ff682c] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            К списку кандидатов
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            {detail.screening_bucket === 'rejected' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onOverrideBucket('suitable')}
                className="btn-primary text-[13px] py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                Вернуть в основной список
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onOverrideBucket('rejected')}
                className="btn-ghost bg-[#ffffff] text-[13px] py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <XCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                Перенести в отсеянные
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={onReanalyze}
              className="btn-ghost bg-[#ffffff] text-[13px] py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              Перепроверить
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="btn-ghost bg-[#ffffff] text-[13px] py-2 px-4 text-[#ff682c] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              Удалить
            </button>
          </div>
        </div>
      </div>

      {/* Hero / Rating / System Recommendation */}
      <section className="py-10 md:py-12 border-b border-[#e8e8e8]">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex flex-col gap-2 max-w-[740px]">
              <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                Вакансия: {detail.vacancy_title || 'Не указана'}
              </div>
              <h1 className="text-[36px] md:text-[46px] leading-[1.06] text-[#202020]">
                {displayTitle}
              </h1>
              {!blindMode && (
                <div className="text-[14px] text-[#4d4d4d] flex flex-wrap gap-4 pt-1">
                  <span>
                    Файл: <span className="text-[#202020]">{detail.resume_filename}</span>
                  </span>
                  {detail.contact_info && (
                    <span>
                      Контакт: <span className="text-[#202020]">{detail.contact_info}</span>
                    </span>
                  )}
                  {detail.comment && (
                    <span>
                      Комментарий: <span className="text-[#202020]">{detail.comment}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Score & Recommendation Box */}
            <div className="bg-[#ebe6dd] card-asymmetric p-6 min-w-[260px] flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Рейтинг
                </span>
                <span className="font-editorial text-[40px] leading-none text-[#202020]">
                  {detail.match_score !== null ? `${Math.round(detail.match_score)}%` : '—'}
                </span>
              </div>

              <div className="border-t border-[#202020]/10 pt-3 flex flex-col gap-2">
                <div className="text-[12px] text-[#4d4d4d]">Рекомендация системы:</div>
                {detail.system_recommended ? (
                  <div className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#202020]">
                    <CheckCircle2 className="w-4 h-4 text-[#202020]" strokeWidth={1.75} />
                    <span>Подходит (≥ 50%)</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#ff682c]">
                    <XCircle className="w-4 h-4 text-[#ff682c]" strokeWidth={1.75} />
                    <span>Не подходит (&lt; 50%)</span>
                  </div>
                )}

                {detail.is_top_resume && (
                  <div className="inline-flex items-center gap-1 text-[12px] px-2.5 py-0.5 bg-[#202020] text-[#ffffff] rounded-[200px] w-fit">
                    <Award className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={1.75} />
                    Топ резюме
                  </div>
                )}

                {detail.manual_override && (
                  <div className="text-[12px] text-[#816729]">
                    Решение HR:{' '}
                    {detail.screening_bucket === 'suitable'
                      ? 'Вручную возвращён в основной список'
                      : 'Вручную перенесён в отсеянные'}
                  </div>
                )}
              </div>

              {analysis?.pii_report && (
                <button
                  type="button"
                  onClick={() => setPiiModalOpen(true)}
                  className="text-[12px] text-[#202020] hover:text-[#ff682c] inline-flex items-center gap-1.5 pt-1 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={1.5} />
                  <span>Защита ПДн ({analysis.pii_report.total_masked})</span>
                  <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          {detail.status === 'failed' && (
            <div className="bg-[#efefef] border-l-2 border-[#ff682c] p-5 text-[14px] text-[#ff682c]">
              Ошибка анализа: {detail.error_message || 'Неизвестная ошибка'}. Попробуйте нажать
              «Перепроверить».
            </div>
          )}
        </div>
      </section>

      {/* Structured Resume Summary: Experience, Education, Skills */}
      {profile && (
        <section className="py-12 bg-[#f5f5f5] border-b border-[#e8e8e8]">
          <div className="max-w-[1200px] mx-auto px-6 flex flex-col gap-6">
            <div>
              <span className="text-[13px] font-editorial text-[#816729]">
                Профиль кандидата из резюме
              </span>
              <h2 className="text-[28px] md:text-[32px] leading-[1.15] text-[#202020] mt-1">
                Опыт работы, образование и навыки
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Experience */}
              <div className="bg-[#ffffff] card-asymmetric p-6 flex flex-col gap-4 lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                    <Briefcase className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
                    <span>Опыт работы</span>
                  </div>
                  <span className="text-[12px] text-[#828282]">
                    Общий стаж: {formatExperienceDuration(profile.total_experience_months)}
                  </span>
                </div>

                {profile.experiences.length === 0 ? (
                  <p className="text-[14px] text-[#828282]">
                    Структурированный опыт работы в резюме не выделен.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {profile.experiences.map((exp, idx) => (
                      <li key={idx} className="border-l-2 border-[#e8e8e8] pl-4">
                        <div className="text-[15px] font-medium text-[#202020]">{exp.role}</div>
                        <div className="text-[13px] text-[#828282]">
                          {[exp.organization, exp.period].filter(Boolean).join(' · ') || 'Период не указан'}
                        </div>
                        {exp.responsibilities.length > 0 && (
                          <ul className="mt-1.5 list-disc list-inside text-[13px] text-[#4d4d4d] space-y-0.5">
                            {exp.responsibilities.slice(0, 4).map((resp, rIdx) => (
                              <li key={rIdx}>{resp}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Education + Skills */}
              <div className="flex flex-col gap-5">
                <div className="bg-[#ffffff] card-asymmetric p-6 flex flex-col gap-3">
                  <div className="inline-flex items-center gap-2 text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                    <GraduationCap className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
                    <span>Образование</span>
                  </div>
                  {profile.education.length === 0 ? (
                    <p className="text-[14px] text-[#828282]">Не указано в резюме.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {profile.education.map((edu, idx) => (
                        <li key={idx} className="text-[13px]">
                          <div className="font-medium text-[#202020]">
                            {edu.institution || edu.level || 'Образование'}
                          </div>
                          <div className="text-[#4d4d4d]">
                            {[edu.level, edu.field, edu.year].filter(Boolean).join(' · ')}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-[#ffffff] card-asymmetric p-6 flex flex-col gap-3">
                  <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                    Навыки
                  </div>
                  {profile.skills.length === 0 ? (
                    <p className="text-[14px] text-[#828282]">Ключевые навыки не выделены.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="text-[12px] px-2.5 py-1 bg-[#efefef] text-[#202020] rounded-[20px]"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Strengths, Missing Requirements / Risks, Questions */}
      {analysis && activeVacancy && (
        <>
          <RecruiterPanel analysis={analysis} activeVacancy={activeVacancy} />
          <VacancyDetail
            vacancies={analysis.vacancies}
            selectedFilename={activeVacancy.vacancy.filename}
            onSelectVacancy={() => {}}
          />
        </>
      )}

      <PiiPreviewModal
        open={piiModalOpen}
        onClose={() => setPiiModalOpen(false)}
        report={analysis?.pii_report || null}
      />
    </div>
  )
}
