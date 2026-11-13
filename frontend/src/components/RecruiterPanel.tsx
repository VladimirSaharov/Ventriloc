import { useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import type { AnalysisResponse, VacancyAnalysisResult } from '../types'

interface RecruiterPanelProps {
  analysis: AnalysisResponse
  activeVacancy: VacancyAnalysisResult
}

export function RecruiterPanel({ analysis, activeVacancy }: RecruiterPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1800)
    } catch {
      // Clipboard fallback ignored
    }
  }

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const questionsText = activeVacancy.interview_questions
    .map((q, idx) => `${idx + 1}. ${q.question} (${q.target_requirement})`)
    .join('\n')

  return (
    <section id="recruiter-section" className="bg-[#efefef] py-16 md:py-20">
      <div className="max-w-[1200px] mx-auto px-6 flex flex-col gap-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="text-[13px] font-editorial text-[#816729]">
              Выводы для этапа скрининга · {activeVacancy.vacancy.title}
            </span>
            <h2 className="text-[32px] md:text-[38px] leading-[1.12] text-[#202020] mt-1">
              Сильные стороны, риски и вопросы кандидату
            </h2>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `report-${analysis.resume_filename.replace(/\.[^.]+$/, '')}.md`,
                  analysis.markdown_report,
                  'text/markdown;charset=utf-8'
                )
              }
              className="btn-primary inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
              Скачать Markdown-отчет
            </button>

            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `report-${analysis.resume_filename.replace(/\.[^.]+$/, '')}.json`,
                  JSON.stringify(analysis, null, 2),
                  'application/json;charset=utf-8'
                )
              }
              className="btn-ghost inline-flex items-center gap-2 bg-[#ffffff]"
            >
              <Download className="w-4 h-4" strokeWidth={1.5} />
              Экспорт JSON
            </button>
          </div>
        </div>

        {/* Strengths & Gaps */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#ffffff] card-asymmetric p-8 flex flex-col gap-5">
            <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
              Сильные стороны кандидата
            </div>
            {activeVacancy.strengths.length === 0 ? (
              <p className="text-[14px] text-[#828282]">
                Явно подтвержденных сильных сторон по данной вакансии не выявлено.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {activeVacancy.strengths.map((st, idx) => (
                  <li key={idx} className="border-l-2 border-[#202020] pl-4">
                    <div className="text-[16px] font-medium text-[#202020]">{st.title}</div>
                    <p className="text-[14px] text-[#4d4d4d] leading-[1.45] mt-1">
                      {st.description}
                    </p>
                    {st.evidence_quote && (
                      <div className="text-[12px] text-[#828282] mt-1 italic">
                        Подтверждение: «{st.evidence_quote}»
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-[#ffffff] card-asymmetric p-8 flex flex-col gap-5">
            <div className="text-[12px] uppercase tracking-wider text-[#ff682c] font-editorial">
              Пробелы и зоны риска
            </div>
            {activeVacancy.gaps_and_risks.length === 0 ? (
              <p className="text-[14px] text-[#828282]">Критических рисков не зафиксировано.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {activeVacancy.gaps_and_risks.map((risk, idx) => (
                  <li
                    key={idx}
                    className={`border-l-2 pl-4 ${
                      risk.kind === 'confirmed_gap' ? 'border-[#ff682c]' : 'border-[#816729]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] font-medium text-[#202020]">{risk.title}</span>
                      <span className="px-2.5 py-0.5 rounded-[20px] bg-[#f5f5f5] text-[11px] text-[#4d4d4d]">
                        {risk.kind === 'confirmed_gap'
                          ? 'Подтвержденный пробел'
                          : 'Не указано / уточнить'}
                      </span>
                    </div>
                    <p className="text-[14px] text-[#4d4d4d] leading-[1.45] mt-1">
                      {risk.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recommendations + Interview Questions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-[#ebe6dd] card-asymmetric p-8 flex flex-col gap-5">
            <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
              Рекомендации для рекрутера
            </div>
            <ul className="flex flex-col gap-3 text-[15px] leading-[1.5] text-[#202020]">
              {activeVacancy.recruiter_recommendations.map((rec, idx) => (
                <li key={idx} className="flex gap-2.5">
                  <span className="text-[#ff682c] font-editorial">0{idx + 1}.</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>

            {activeVacancy.outreach_draft && (
              <div className="mt-2 pt-4 border-t border-[#202020]/10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                    Черновик сообщения кандидату
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('outreach', activeVacancy.outreach_draft)}
                    className="text-[12px] text-[#202020] inline-flex items-center gap-1 cursor-pointer"
                  >
                    {copiedId === 'outreach' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#ff682c]" /> Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Копировать
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[14px] leading-[1.5] text-[#4d4d4d] bg-[#ffffff] p-4">
                  {activeVacancy.outreach_draft}
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-[#ffffff] card-data p-8 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                Вопросы кандидату для проверки спорных и неуказанных данных
              </div>
              {activeVacancy.interview_questions.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleCopy('questions', questionsText)}
                  className="text-[13px] text-[#202020] inline-flex items-center gap-1.5 cursor-pointer ember-underline"
                >
                  {copiedId === 'questions' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#ff682c]" /> Скопировано
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Копировать список
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-4">
              {activeVacancy.interview_questions.map((q, idx) => (
                <div key={idx} className="bg-[#f5f5f5] p-5 flex flex-col gap-1.5">
                  <div className="text-[16px] text-[#202020] font-medium leading-[1.4]">
                    {idx + 1}. {q.question}
                  </div>
                  <div className="text-[13px] text-[#4d4d4d]">
                    <span className="text-[#816729]">Цель проверки:</span> {q.target_requirement}{' '}
                    {q.reason ? `— ${q.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
