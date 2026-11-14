import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronDown, FileText, Loader2, Upload } from 'lucide-react'
import { fetchPublicOpenVacancies, submitPublicApplication } from '../api/client'
import type { PublicApplyResponse, PublicVacancyInfo } from '../types'

export function CandidateApplyPage() {
  const [openVacancies, setOpenVacancies] = useState<PublicVacancyInfo[]>([])
  const [selectedVacancyId, setSelectedVacancyId] = useState<string>('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [contact, setContact] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<PublicApplyResponse | null>(null)

  useEffect(() => {
    fetchPublicOpenVacancies()
      .then((list) => {
        setOpenVacancies(list)
        if (list.length > 0) {
          setSelectedVacancyId((prev) => prev || list[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resumeFile || !selectedVacancyId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await submitPublicApplication({
        vacancyId: selectedVacancyId,
        resumeFile,
        contact,
        comment,
      })
      setSubmitted(res)
      setResumeFile(null)
      setContact('')
      setComment('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить резюме')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="py-12 md:py-20 bg-[#ffffff]">
      <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left column: open positions selector */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="inline-flex items-center gap-2 text-[13px] font-editorial text-[#816729]">
            <span className="w-2 h-2 rounded-full bg-[#ff682c]" />
            <span>Отклик без регистрации</span>
          </div>

          <h1 className="text-[44px] md:text-[58px] leading-[0.98] text-[#202020]">
            Выберите вакансию и подайте резюме
          </h1>


        </div>

        {/* Right column: upload form or confirmation */}
        <div className="lg:col-span-7">
          {submitted ? (
            <div className="bg-[#ebe6dd] card-asymmetric p-8 md:p-10 flex flex-col gap-5">
              <div className="flex items-center gap-2.5 text-[#202020]">
                <CheckCircle2 className="w-6 h-6 text-[#ff682c]" strokeWidth={1.5} />
                <span className="font-editorial text-[26px] leading-[1.15]">
                  Резюме отправлено
                </span>
              </div>
              <p className="text-[16px] leading-[1.5] text-[#4d4d4d]">{submitted.message}</p>
              <div className="bg-[#ffffff] card-data p-5 text-[13px] text-[#4d4d4d] flex flex-wrap gap-6">
                <div>
                  <span className="text-[#828282]">Вакансия:</span>{' '}
                  <span className="text-[#202020] font-medium">{submitted.vacancy_title}</span>
                </div>
                <div>
                  <span className="text-[#828282]">Номер отклика:</span>{' '}
                  <span className="text-[#202020] font-mono">{submitted.submission_id}</span>
                </div>
                <div>
                  <span className="text-[#828282]">Статус:</span>{' '}
                  <span className="text-[#202020] font-medium">Передано HR</span>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setSubmitted(null)}
                  className="btn-primary"
                >
                  Отправить ещё одно резюме
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-[#efefef] card-asymmetric p-8 md:p-10 flex flex-col gap-6"
            >
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="vacancy-select"
                  className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial"
                >
                  1. Выберите вакансию *
                </label>
                {openVacancies.length === 0 ? (
                  <div className="bg-[#ffffff] border border-[#e8e8e8] px-4 py-3 text-[14px] text-[#828282]">
                    Сейчас нет открытых вакансий для отклика.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      id="vacancy-select"
                      value={selectedVacancyId}
                      onChange={(e) => setSelectedVacancyId(e.target.value)}
                      required
                      disabled={submitting}
                      className="w-full appearance-none bg-[#ffffff] border border-[#e8e8e8] focus:border-[#202020] outline-none px-4 py-3 pr-10 text-[15px] text-[#202020] cursor-pointer"
                    >
                      {openVacancies.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="w-4 h-4 text-[#828282] pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
                      strokeWidth={1.5}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  2. Прикрепите файл резюме *
                </label>
                <label className="bg-[#ffffff] border border-dashed border-[#828282]/60 hover:border-[#202020] transition-colors p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer">
                  <Upload className="w-6 h-6 text-[#ff682c]" strokeWidth={1.5} />
                  {resumeFile ? (
                    <div className="flex items-center gap-2 text-[15px] text-[#202020] font-medium">
                      <FileText className="w-4 h-4 text-[#816729]" strokeWidth={1.5} />
                      <span>{resumeFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-[15px] text-[#202020]">
                        Нажмите, чтобы выбрать резюме (.docx, .pdf, .txt)
                      </span>
                      <span className="text-[12px] text-[#828282]">Максимальный размер 10 МБ</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept=".docx,.pdf,.txt,.md"
                    className="hidden"
                    disabled={submitting}
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setResumeFile(file)
                    }}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="candidate-contact"
                  className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial"
                >
                  3. Контакт для связи (по желанию)
                </label>
                <input
                  id="candidate-contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  disabled={submitting}
                  placeholder="Telegram (@username), телефон или email"
                  className="bg-[#ffffff] border border-[#e8e8e8] focus:border-[#202020] outline-none px-4 py-3 text-[15px] text-[#202020]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="candidate-comment"
                  className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial"
                >
                  4. Сопроводительный комментарий (по желанию)
                </label>
                <textarea
                  id="candidate-comment"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={submitting}
                  placeholder="Кратко о готовности к формату работы, сроках выхода или зарплатных ожиданиях"
                  className="bg-[#ffffff] border border-[#e8e8e8] focus:border-[#202020] outline-none px-4 py-3 text-[15px] text-[#202020] resize-y"
                />
              </div>

              {error && (
                <div className="bg-[#ffffff] border-l-2 border-[#ff682c] px-4 py-3 text-[14px] text-[#ff682c]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 pt-2">
                <button
                  type="submit"
                  disabled={!resumeFile || !selectedVacancyId || submitting}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
                  {submitting ? 'Отправка резюме...' : 'Отправить резюме'}
                </button>
                <span className="text-[12px] text-[#828282]">
                  {submitting ? 'Загружаем файл...' : 'Мгновенная отправка без ожидания проверки'}
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
