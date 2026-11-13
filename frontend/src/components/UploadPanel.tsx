import { FileText, Shield, Upload, Check, Trash2, AlertCircle } from 'lucide-react'
import type { HealthResponse, SamplesResponse } from '../types'

interface UploadPanelProps {
  health: HealthResponse | null
  samples: SamplesResponse | null
  resumeFile: File | null
  sampleResume: string | null
  vacancyFiles: File[]
  sampleVacancies: string[]
  loading: boolean
  previewLoading: boolean
  error: string | null
  onSelectResumeFile: (file: File | null) => void
  onSelectSampleResume: (name: string | null) => void
  onAddVacancyFiles: (files: File[]) => void
  onRemoveVacancyFile: (index: number) => void
  onToggleSampleVacancy: (name: string) => void
  onSelectAllSampleVacancies: () => void
  onClearVacancies: () => void
  onPreviewPii: () => void
  onRunAnalysis: () => void
}

export function UploadPanel({
  health,
  samples,
  resumeFile,
  sampleResume,
  vacancyFiles,
  sampleVacancies,
  loading,
  previewLoading,
  error,
  onSelectResumeFile,
  onSelectSampleResume,
  onAddVacancyFiles,
  onRemoveVacancyFile,
  onToggleSampleVacancy,
  onSelectAllSampleVacancies,
  onClearVacancies,
  onPreviewPii,
  onRunAnalysis,
}: UploadPanelProps) {
  const hasResume = Boolean(resumeFile || sampleResume)
  const totalVacancies = vacancyFiles.length + sampleVacancies.length
  const canAnalyze = hasResume && totalVacancies > 0 && !loading

  return (
    <section id="upload-section" className="py-12 md:py-16">
      <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left column: Hero statement + CTA stack */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="inline-flex items-center gap-2 text-[13px] font-editorial text-[#816729]">
            <span className="w-2 h-2 rounded-full bg-[#ff682c]" />
            <span>Объективный подбор по фактам резюме и вакансий</span>
          </div>

          <h1 className="text-[44px] md:text-[56px] leading-[0.95] tracking-[-0.03em] text-[#202020]">
            Сравнительный анализ резюме и вакансий
          </h1>

          <p className="text-[18px] leading-[1.35] text-[#4d4d4d]">
            Система извлекает обязательные и желательные требования, проверяет их по фактам
            резюме с точными цитатами и детерминированно ранжирует вакансии без домысливания.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={!canAnalyze}
              className="btn-primary"
            >
              {loading ? 'Выполняется анализ...' : 'Запустить анализ'}
            </button>

            <button
              type="button"
              onClick={onPreviewPii}
              disabled={!hasResume || previewLoading || loading}
              className="btn-ghost inline-flex items-center gap-2"
            >
              <Shield className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
              {previewLoading ? 'Проверка...' : 'Проверить защиту ПДн'}
            </button>
          </div>

          {health && !health.llm_configured && (
            <div className="bg-[#ebe6dd] card-asymmetric p-5 text-[14px] text-[#202020] flex gap-3 items-start">
              <AlertCircle className="w-4 h-4 text-[#ff682c] shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <div className="font-medium mb-1">API-ключ GigaChat не задан</div>
                <p className="text-[#4d4d4d] leading-[1.45]">
                  Добавьте <code className="px-1.5 py-0.5 bg-[#ffffff] text-[12px]">GIGACHAT_AUTH_KEY</code>{' '}
                  в файл <code className="px-1.5 py-0.5 bg-[#ffffff] text-[12px]">.env</code> или
                  включите <code className="px-1.5 py-0.5 bg-[#ffffff] text-[12px]">LLM_PROVIDER=mock</code>{' '}
                  для тестового прогона интерфейса.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-[#ebe6dd] card-asymmetric p-5 border-l-2 border-[#ff682c] text-[14px] text-[#202020]">
              <div className="font-medium text-[#ff682c] mb-1">Ошибка выполнения</div>
              <p className="text-[#4d4d4d]">{error}</p>
            </div>
          )}
        </div>

        {/* Right column: Data workspace cards */}
        <div className="lg:col-span-7 grid grid-cols-1 gap-5">
          {/* Card 1: Resume selection */}
          <div className="bg-[#efefef] card-asymmetric p-7 md:p-8 flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Шаг 01 · Входной документ
                </span>
                <h2 className="text-[24px] leading-[1.15] text-[#202020] mt-1">
                  Резюме кандидата
                </h2>
              </div>
              {hasResume && (
                <span className="px-3 py-1 rounded-[20px] bg-[#ffffff] text-[13px] text-[#202020] inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#ff682c]" />
                  Выбрано
                </span>
              )}
            </div>

            <label className="bg-[#ffffff] card-data p-5 border border-dashed border-[#828282]/50 hover:border-[#202020] transition-colors cursor-pointer flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Upload className="w-5 h-5 text-[#202020] shrink-0" strokeWidth={1.5} />
                <div className="min-w-0">
                  <div className="text-[15px] text-[#202020] truncate">
                    {resumeFile
                      ? resumeFile.name
                      : sampleResume
                      ? `Образец кейса: ${sampleResume}`
                      : 'Загрузить файл резюме (.docx, .pdf, .txt, .md)'}
                  </div>
                  <div className="text-[13px] text-[#828282]">
                    {resumeFile
                      ? `${(resumeFile.size / 1024).toFixed(1)} КБ`
                      : 'Нажмите для выбора файла или выберите образец кейса ниже'}
                  </div>
                </div>
              </div>
              <input
                type="file"
                accept=".docx,.pdf,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null
                  if (f) {
                    onSelectResumeFile(f)
                  }
                  e.target.value = ''
                }}
              />
              {hasResume && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    onSelectResumeFile(null)
                    onSelectSampleResume(null)
                  }}
                  className="text-[#828282] hover:text-[#202020] p-1"
                  title="Сбросить резюме"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
              )}
            </label>

            {samples && samples.resumes.length > 0 && (
              <div>
                <div className="text-[13px] text-[#4d4d4d] mb-2">
                  Или выберите резюме из материалов кейса:
                </div>
                <div className="flex flex-wrap gap-2">
                  {samples.resumes.map((sr) => {
                    const active = !resumeFile && sampleResume === sr.filename
                    return (
                      <button
                        key={sr.filename}
                        type="button"
                        onClick={() => onSelectSampleResume(active ? null : sr.filename)}
                        className={`px-3.5 py-1.5 rounded-[20px] text-[13px] transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                          active
                            ? 'bg-[#202020] text-[#ffffff]'
                            : 'bg-[#ffffff] text-[#202020] hover:bg-[#ebe6dd]'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                        {sr.filename.replace(/\.docx$/i, '')}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Vacancies selection */}
          <div className="bg-[#efefef] card-asymmetric p-7 md:p-8 flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Шаг 02 · Набор позиций
                </span>
                <h2 className="text-[24px] leading-[1.15] text-[#202020] mt-1">
                  Вакансии для сравнения ({totalVacancies})
                </h2>
              </div>

              <div className="flex items-center gap-3">
                {samples && samples.vacancies.length > 0 && (
                  <button
                    type="button"
                    onClick={onSelectAllSampleVacancies}
                    className="text-[14px] text-[#202020] ember-underline cursor-pointer"
                  >
                    Выбрать все вакансии кейса
                  </button>
                )}
                {totalVacancies > 0 && (
                  <button
                    type="button"
                    onClick={onClearVacancies}
                    className="text-[13px] text-[#828282] hover:text-[#202020] cursor-pointer"
                  >
                    Очистить
                  </button>
                )}
              </div>
            </div>

            <label className="bg-[#ffffff] card-data p-5 border border-dashed border-[#828282]/50 hover:border-[#202020] transition-colors cursor-pointer flex items-center gap-3">
              <Upload className="w-5 h-5 text-[#202020] shrink-0" strokeWidth={1.5} />
              <div>
                <div className="text-[15px] text-[#202020]">
                  Добавить файлы вакансий (.docx, .pdf, .txt, .md)
                </div>
                <div className="text-[13px] text-[#828282]">
                  Можно выбрать сразу несколько документов (поддерживается проверка поврежденных файлов)
                </div>
              </div>
              <input
                type="file"
                multiple
                accept=".docx,.pdf,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length > 0) onAddVacancyFiles(files)
                  e.target.value = ''
                }}
              />
            </label>

            {vacancyFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {vacancyFiles.map((vf, idx) => (
                  <span
                    key={`${vf.name}-${idx}`}
                    className="px-3.5 py-1.5 rounded-[20px] bg-[#202020] text-[#ffffff] text-[13px] inline-flex items-center gap-2"
                  >
                    {vf.name}
                    <button
                      type="button"
                      onClick={() => onRemoveVacancyFile(idx)}
                      className="text-[#efefef] hover:text-[#ff682c] cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {samples && samples.vacancies.length > 0 && (
              <div>
                <div className="text-[13px] text-[#4d4d4d] mb-2">Вакансии из папки кейса:</div>
                <div className="flex flex-wrap gap-2">
                  {samples.vacancies.map((sv) => {
                    const selected = sampleVacancies.includes(sv.filename)
                    return (
                      <button
                        key={sv.filename}
                        type="button"
                        onClick={() => onToggleSampleVacancy(sv.filename)}
                        className={`px-3.5 py-1.5 rounded-[20px] text-[13px] transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                          selected
                            ? 'bg-[#202020] text-[#ffffff]'
                            : 'bg-[#ffffff] text-[#202020] hover:bg-[#ebe6dd]'
                        }`}
                      >
                        {selected ? (
                          <Check className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={2} />
                        ) : (
                          <FileText className="w-3.5 h-3.5" strokeWidth={1.5} />
                        )}
                        {sv.filename}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
