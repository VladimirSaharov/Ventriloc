import { useState } from 'react'
import type { MatchStatus, VacancyAnalysisResult } from '../types'

interface VacancyDetailProps {
  vacancies: VacancyAnalysisResult[]
  selectedFilename: string | null
  onSelectVacancy: (filename: string) => void
}

const STATUS_META: Record<
  MatchStatus,
  { label: string; pillClass: string; dotClass: string }
> = {
  full_match: {
    label: 'Полное соответствие',
    pillClass: 'bg-[#202020] text-[#ffffff]',
    dotClass: 'bg-[#ffffff]',
  },
  partial_match: {
    label: 'Частичное соответствие',
    pillClass: 'bg-[#ebe6dd] text-[#202020]',
    dotClass: 'bg-[#ff682c]',
  },
  not_specified: {
    label: 'Не указано в резюме',
    pillClass: 'bg-[#f5f5f5] text-[#816729] border border-[#816729]/35',
    dotClass: 'bg-[#816729]',
  },
  no_match: {
    label: 'Отсутствие соответствия',
    pillClass: 'bg-[#efefef] text-[#4d4d4d] border border-[#e8e8e8]',
    dotClass: 'bg-[#828282]',
  },
}

export function VacancyDetail({
  vacancies,
  selectedFilename,
  onSelectVacancy,
}: VacancyDetailProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | MatchStatus>('all')

  const active =
    vacancies.find((v) => v.vacancy.filename === selectedFilename) || vacancies[0]
  if (!active) return null

  const filtered =
    statusFilter === 'all'
      ? active.evaluations
      : active.evaluations.filter((e) => e.status === statusFilter)

  return (
    <section id="details-section" className="bg-[#ffffff] py-16 md:py-20">
      <div className="max-w-[1200px] mx-auto px-6 flex flex-col gap-8">
        {/* Vacancy switcher pill bar */}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="text-[13px] font-editorial text-[#816729]">
              Детальная матрица соответствия · Позиция #{active.rank}
            </span>
            <h2 className="text-[32px] md:text-[38px] leading-[1.12] text-[#202020] mt-1">
              {active.vacancy.title}
            </h2>
            <p className="text-[14px] text-[#828282] mt-1">
              {active.vacancy.work_format} · {active.vacancy.location}
            </p>
          </div>

          {vacancies.length > 1 && (
            <div className="nav-pill px-2 py-1.5 flex flex-wrap gap-1">
              {vacancies.map((v) => {
                const isCurr = v.vacancy.filename === active.vacancy.filename
                return (
                  <button
                    key={v.vacancy.filename}
                    type="button"
                    onClick={() => {
                      onSelectVacancy(v.vacancy.filename)
                      setStatusFilter('all')
                    }}
                    className={`px-4 py-1.5 rounded-[200px] text-[14px] font-editorial transition-colors cursor-pointer ${
                      isCurr
                        ? 'bg-[#202020] text-[#ffffff]'
                        : 'text-[#202020] hover:bg-[#ffffff]/70'
                    }`}
                  >
                    #{v.rank} {v.vacancy.filename.replace(/\.docx$/i, '')}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8e8e8] pb-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', `Все требования (${active.evaluations.length})`],
                ['full_match', `Полное (${active.score.full_count})`],
                ['partial_match', `Частичное (${active.score.partial_count})`],
                ['not_specified', `Не указано (${active.score.not_specified_count})`],
                ['no_match', `Нет соответствия (${active.score.no_match_count})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3.5 py-1.5 rounded-[20px] text-[13px] cursor-pointer transition-colors ${
                  statusFilter === key
                    ? 'bg-[#202020] text-[#ffffff]'
                    : 'bg-[#efefef] text-[#202020] hover:bg-[#ebe6dd]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="text-[13px] text-[#828282]">
            Итоговый балл: <span className="text-[#202020]">{active.score.overall_score}%</span> ·
            Обязательные: <span className="text-[#202020]">{active.score.mandatory_score}%</span>
          </div>
        </div>

        {/* Requirements matrix table */}
        <div className="overflow-x-auto border border-[#e8e8e8]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f5f5f5] border-b border-[#e8e8e8] text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                <th className="py-3.5 px-4 w-[28%]">Требование вакансии</th>
                <th className="py-3.5 px-4 w-[26%]">Подтверждение в резюме</th>
                <th className="py-3.5 px-4 w-[18%]">Статус соответствия</th>
                <th className="py-3.5 px-4 w-[28%]">Комментарий аудитора</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8e8] text-[14px]">
              {filtered.map((ev) => {
                const meta = STATUS_META[ev.status]
                return (
                  <tr key={ev.requirement_id} className="align-top hover:bg-[#f5f5f5]/50">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-[20px] ${
                            ev.priority === 'mandatory'
                              ? 'bg-[#efefef] text-[#202020]'
                              : 'bg-[#f5f5f5] text-[#828282]'
                          }`}
                        >
                          {ev.priority === 'mandatory' ? 'Обязательное' : 'Желательное'}
                        </span>
                      </div>
                      <div className="text-[#202020] font-medium leading-[1.4]">
                        {ev.requirement_text}
                      </div>
                      {ev.vacancy_quote && (
                        <div className="text-[12px] text-[#828282] mt-1.5 italic">
                          «{ev.vacancy_quote}»
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4 text-[#4d4d4d] leading-[1.45]">
                      {ev.status === 'not_specified' ? (
                        <span className="text-[#816729] italic">{ev.resume_evidence}</span>
                      ) : (
                        <span>«{ev.resume_evidence}»</span>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-[20px] text-[12px] whitespace-nowrap ${meta.pillClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dotClass}`} />
                        {meta.label}
                      </span>
                    </td>

                    <td className="py-4 px-4 text-[#4d4d4d] leading-[1.45]">{ev.comment}</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[#828282]">
                    Нет требований с выбранным статусом.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
