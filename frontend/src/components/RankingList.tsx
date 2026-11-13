import { ArrowUpRight, AlertTriangle } from 'lucide-react'
import type { AnalysisResponse, FitVerdict, VacancyAnalysisResult } from '../types'

interface RankingListProps {
  analysis: AnalysisResponse
  selectedFilename: string | null
  onSelectVacancy: (filename: string) => void
  onOpenPiiModal: () => void
}

const VERDICT_LABELS: Record<FitVerdict, string> = {
  strong_fit: 'Высокое соответствие',
  moderate_fit: 'Умеренное соответствие',
  weak_fit: 'Низкое соответствие',
}

function ScoreRing({ score, isBest }: { score: number; isBest: boolean }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const offset = circumference - (clamped / 100) * circumference

  return (
    <div className="relative w-[84px] h-[84px] shrink-0 flex items-center justify-center">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 84 84">
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke="#e8e8e8"
          strokeWidth="5"
        />
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={isBest ? '#ff682c' : '#816729'}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="butt"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-editorial text-[20px] leading-none text-[#202020]">
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  )
}

function StatusDistributionBar({ item }: { item: VacancyAnalysisResult }) {
  const total = Math.max(1, item.score.total_requirements)
  const fullPct = (item.score.full_count / total) * 100
  const partialPct = (item.score.partial_count / total) * 100
  const unkPct = (item.score.not_specified_count / total) * 100
  const noPct = (item.score.no_match_count / total) * 100

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full h-2.5 bg-[#f5f5f5] flex overflow-hidden">
        {fullPct > 0 && <div style={{ width: `${fullPct}%` }} className="bg-[#202020]" />}
        {partialPct > 0 && <div style={{ width: `${partialPct}%` }} className="bg-[#ff682c]" />}
        {unkPct > 0 && <div style={{ width: `${unkPct}%` }} className="bg-[#816729]" />}
        {noPct > 0 && <div style={{ width: `${noPct}%` }} className="bg-[#e8e8e8]" />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#4d4d4d]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#202020]" /> Полное: {item.score.full_count}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#ff682c]" /> Частичное: {item.score.partial_count}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#816729]" /> Не указано: {item.score.not_specified_count}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 bg-[#e8e8e8] border border-[#828282]/40" /> Нет:{' '}
          {item.score.no_match_count}
        </span>
      </div>
    </div>
  )
}

export function RankingList({
  analysis,
  selectedFilename,
  onSelectVacancy,
  onOpenPiiModal,
}: RankingListProps) {
  return (
    <section id="ranking-section" className="bg-[#efefef] py-16 md:py-20">
      <div className="max-w-[1200px] mx-auto px-6 flex flex-col gap-10">
        {/* Section header + Executive recommendation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-5 flex flex-col gap-3">
            <span className="text-[13px] font-editorial text-[#816729]">
              Резюме: {analysis.resume_filename} · {analysis.provider_used}/{analysis.model_used}
            </span>
            <h2 className="text-[36px] md:text-[40px] leading-[1.1] text-[#202020]">
              Рейтинг подходящих вакансий
            </h2>
            <p className="text-[15px] text-[#4d4d4d] leading-[1.5]">
              Все вакансии оценены по единой взвешенной формуле: обязательные требования имеют
              вес ×2, желательные ×1; статус «Не указано» не приравнивается к отсутствию навыка.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenPiiModal}
                className="text-[14px] text-[#202020] ember-underline cursor-pointer"
              >
                Показать обезличенный текст (замаскировано ПДн: {analysis.pii_report.total_masked})
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#ebe6dd] card-asymmetric p-8 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                Рекомендация системы
              </span>
              {analysis.resume_profile.total_experience_months !== null && (
                <span className="px-3 py-1 rounded-[20px] bg-[#ffffff] text-[13px] text-[#202020]">
                  Опыт по резюме: ~{analysis.resume_profile.total_experience_months} мес.
                </span>
              )}
            </div>
            <p className="text-[18px] leading-[1.38] text-[#202020]">
              {analysis.overall_recommendation}
            </p>
            {analysis.resume_profile.summary && (
              <p className="text-[14px] leading-[1.5] text-[#4d4d4d] border-t border-[#202020]/10 pt-3">
                {analysis.resume_profile.summary}
              </p>
            )}
          </div>
        </div>

        {/* Warnings / Failed documents notice */}
        {(analysis.failed_vacancies.length > 0 || analysis.document_warnings.length > 0) && (
          <div className="bg-[#ffffff] card-data p-6 border border-[#e8e8e8] flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[#ff682c] text-[14px] font-medium">
              <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
              <span>Предупреждения обработки документов</span>
            </div>
            {analysis.failed_vacancies.map((fv) => (
              <div key={fv.filename} className="text-[14px] text-[#4d4d4d]">
                <strong className="font-medium text-[#202020]">{fv.filename}:</strong> {fv.error}
              </div>
            ))}
            {analysis.document_warnings.map((w, i) => (
              <div key={i} className="text-[14px] text-[#4d4d4d]">
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Ranked Data Dashboard Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {analysis.vacancies.map((item) => {
            const isSelected = selectedFilename === item.vacancy.filename
            const isBest = item.rank === 1
            return (
              <div
                key={item.vacancy.filename}
                onClick={() => onSelectVacancy(item.vacancy.filename)}
                className={`bg-[#ffffff] card-data p-7 flex flex-col justify-between gap-6 cursor-pointer transition-colors border ${
                  isSelected ? 'border-[#202020]' : 'border-[#e8e8e8] hover:border-[#828282]'
                }`}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-3 py-1 rounded-[20px] bg-[#efefef] text-[12px] text-[#202020] font-editorial">
                      Позиция #{item.rank}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-[20px] text-[12px] ${
                        isBest
                          ? 'bg-[#ebe6dd] text-[#ff682c]'
                          : 'bg-[#f5f5f5] text-[#4d4d4d]'
                      }`}
                    >
                      {VERDICT_LABELS[item.score.fit_verdict]}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-[22px] leading-[1.18] text-[#202020]">
                        {item.vacancy.title}
                      </h3>
                      <div className="text-[13px] text-[#828282] mt-1 truncate">
                        {item.vacancy.filename}
                      </div>
                    </div>
                    <ScoreRing score={item.score.overall_score} isBest={isBest} />
                  </div>

                  <p className="text-[14px] leading-[1.45] text-[#4d4d4d]">
                    {item.score.explanation}
                  </p>
                </div>

                <div className="flex flex-col gap-4 pt-2 border-t border-[#e8e8e8]">
                  <StatusDistributionBar item={item} />

                  <div className="flex items-center justify-between text-[13px] text-[#202020]">
                    <span>Обязательные: {item.score.mandatory_score}%</span>
                    <span className="inline-flex items-center gap-1 ember-underline">
                      Разбор требований
                      <ArrowUpRight className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={1.5} />
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
