import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  Upload,
  XCircle,
} from 'lucide-react'
import {
  clearHrToken,
  deleteHrVacancy,
  deleteSubmission,
  fetchHrSubmissionDetail,
  fetchHrVacancies,
  fetchHrVacancyCandidates,
  overrideSubmissionBucket,
  reanalyzeSubmission,
  toggleHrVacancy,
  uploadHrVacancy,
} from '../api/client'
import type {
  HealthResponse,
  HrVacancyCandidatesResponse,
  SubmissionDetailResponse,
  VacancyCandidateItem,
  VacancySummaryItem,
} from '../types'
import { CandidateDetailView } from './CandidateDetailView'

interface HrDashboardPageProps {
  username: string
  health: HealthResponse | null
  onLogout: () => void
}

type VacancyStatusFilter = 'all' | 'active' | 'hidden'
type VacancySortMode = 'total_desc' | 'suitable_desc' | 'title_asc' | 'newest'
type CandidateBucketTab = 'suitable' | 'rejected'

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function HrDashboardPage({ username, health, onLogout }: HrDashboardPageProps) {
  // Level 1: Vacancies list
  const [vacancies, setVacancies] = useState<VacancySummaryItem[]>([])
  const [loadingVacancies, setLoadingVacancies] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [vacSearch, setVacSearch] = useState('')
  const [vacFilter, setVacFilter] = useState<VacancyStatusFilter>('all')
  const [vacSort, setVacSort] = useState<VacancySortMode>('total_desc')

  // Upload vacancy drawer
  const [showAddVacancy, setShowAddVacancy] = useState(false)
  const [newVacTitle, setNewVacTitle] = useState('')
  const [newVacFile, setNewVacFile] = useState<File | null>(null)
  const [vacUploading, setVacUploading] = useState(false)

  // Level 2: Selected vacancy -> Candidates (Suitable w/ Top Resumes + Rejected)
  const [selectedVacancyId, setSelectedVacancyId] = useState<string | null>(null)
  const [vacancyData, setVacancyData] = useState<HrVacancyCandidatesResponse | null>(null)
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [bucketTab, setBucketTab] = useState<CandidateBucketTab>('suitable')
  const [candSearch, setCandSearch] = useState('')
  const [blindMode, setBlindMode] = useState(false)

  // Level 3: Candidate detail view
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<SubmissionDetailResponse | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  const handleAuthError = useCallback(
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Ошибка запроса'
      if (msg.includes('авторизац') || msg.includes('Токен') || msg.includes('сессии')) {
        clearHrToken()
        onLogout()
        return
      }
      setError(msg)
    },
    [onLogout]
  )

  const loadVacancies = useCallback(async () => {
    try {
      const list = await fetchHrVacancies()
      setVacancies(list)
      setError(null)
    } catch (err) {
      handleAuthError(err)
    } finally {
      setLoadingVacancies(false)
    }
  }, [handleAuthError])

  const loadVacancyCandidates = useCallback(
    async (vacancyId: string) => {
      setLoadingCandidates(true)
      try {
        const res = await fetchHrVacancyCandidates(vacancyId)
        setVacancyData(res)
        setError(null)
      } catch (err) {
        handleAuthError(err)
      } finally {
        setLoadingCandidates(false)
      }
    },
    [handleAuthError]
  )

  useEffect(() => {
    loadVacancies()
  }, [loadVacancies])

  const openVacancy = (vacancyId: string) => {
    setSelectedVacancyId(vacancyId)
    setSelectedDetail(null)
    setBucketTab('suitable')
    setCandSearch('')
    loadVacancyCandidates(vacancyId)
  }

  const backToVacancies = () => {
    setSelectedVacancyId(null)
    setVacancyData(null)
    setSelectedDetail(null)
    loadVacancies()
  }

  const openCandidateDetail = async (submissionId: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const detail = await fetchHrSubmissionDetail(submissionId)
      setSelectedDetail(detail)
    } catch (err) {
      handleAuthError(err)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleUploadVacancy = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVacFile) return
    setVacUploading(true)
    setError(null)
    try {
      await uploadHrVacancy(newVacFile, newVacTitle)
      setNewVacTitle('')
      setNewVacFile(null)
      setShowAddVacancy(false)
      await loadVacancies()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки вакансии')
    } finally {
      setVacUploading(false)
    }
  }

  const handleToggleVacancy = async (vac: VacancySummaryItem, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await toggleHrVacancy(vac.id, !vac.is_active)
      await loadVacancies()
    } catch (err) {
      handleAuthError(err)
    }
  }

  const handleDeleteVacancy = async (vac: VacancySummaryItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Удалить вакансию «${vac.title}» и все её отклики?`)) return
    try {
      await deleteHrVacancy(vac.id)
      await loadVacancies()
    } catch (err) {
      handleAuthError(err)
    }
  }

  const handleOverrideBucket = async (submissionId: string, bucket: 'suitable' | 'rejected') => {
    setBusyAction(true)
    try {
      await overrideSubmissionBucket(submissionId, bucket)
      if (selectedVacancyId) {
        await loadVacancyCandidates(selectedVacancyId)
      }
      if (selectedDetail?.id === submissionId) {
        const refreshed = await fetchHrSubmissionDetail(submissionId)
        setSelectedDetail(refreshed)
      }
    } catch (err) {
      handleAuthError(err)
    } finally {
      setBusyAction(false)
    }
  }

  const handleReanalyze = async (submissionId: string) => {
    setBusyAction(true)
    try {
      await reanalyzeSubmission(submissionId)
      if (selectedVacancyId) {
        await loadVacancyCandidates(selectedVacancyId)
      }
      if (selectedDetail?.id === submissionId) {
        const refreshed = await fetchHrSubmissionDetail(submissionId)
        setSelectedDetail(refreshed)
      }
    } catch (err) {
      handleAuthError(err)
    } finally {
      setBusyAction(false)
    }
  }

  const handleDeleteSubmission = async (submissionId: string) => {
    if (!window.confirm('Удалить отклик кандидата из базы?')) return
    setBusyAction(true)
    try {
      await deleteSubmission(submissionId)
      if (selectedDetail?.id === submissionId) {
        setSelectedDetail(null)
      }
      if (selectedVacancyId) {
        await loadVacancyCandidates(selectedVacancyId)
      }
      await loadVacancies()
    } catch (err) {
      handleAuthError(err)
    } finally {
      setBusyAction(false)
    }
  }

  const filteredVacancies = useMemo(() => {
    const q = vacSearch.trim().toLowerCase()
    const list = vacancies.filter((v) => {
      if (vacFilter === 'active' && !v.is_active) return false
      if (vacFilter === 'hidden' && v.is_active) return false
      if (!q) return true
      return v.title.toLowerCase().includes(q) || v.filename.toLowerCase().includes(q)
    })

    return [...list].sort((a, b) => {
      if (vacSort === 'total_desc') return b.total_count - a.total_count
      if (vacSort === 'suitable_desc') return b.suitable_count - a.suitable_count
      if (vacSort === 'title_asc') return a.title.localeCompare(b.title, 'ru')
      return b.created_at.localeCompare(a.created_at)
    })
  }, [vacancies, vacSearch, vacFilter, vacSort])

  const globalTotals = useMemo(() => {
    return vacancies.reduce(
      (acc, v) => {
        acc.total += v.total_count
        acc.suitable += v.suitable_count
        acc.rejected += v.rejected_count
        if (v.is_active) acc.active += 1
        return acc
      },
      { total: 0, suitable: 0, rejected: 0, active: 0 }
    )
  }, [vacancies])

  // Split candidates for selected vacancy into Suitable (Top >= 75% & Rest) and Rejected
  const { suitableTop, suitableRest, rejectedList } = useMemo(() => {
    const all = vacancyData?.candidates || []
    const q = candSearch.trim().toLowerCase()
    const filtered = !q
      ? all
      : all.filter(
          (c) =>
            c.candidate_label.toLowerCase().includes(q) ||
            c.resume_filename.toLowerCase().includes(q) ||
            c.target_role.toLowerCase().includes(q) ||
            c.skills_preview.some((s) => s.toLowerCase().includes(q))
        )

    const suitable = filtered.filter((c) => c.screening_bucket === 'suitable')
    const rejected = filtered.filter((c) => c.screening_bucket === 'rejected')

    return {
      suitableTop: suitable.filter((c) => c.is_top_resume),
      suitableRest: suitable.filter((c) => !c.is_top_resume),
      rejectedList: rejected,
    }
  }, [vacancyData, candSearch])

  // Level 3: Candidate detail view
  if (selectedDetail) {
    return (
      <CandidateDetailView
        detail={selectedDetail}
        blindMode={blindMode}
        busy={busyAction}
        onBack={() => setSelectedDetail(null)}
        onOverrideBucket={(bucket) => handleOverrideBucket(selectedDetail.id, bucket)}
        onReanalyze={() => handleReanalyze(selectedDetail.id)}
        onDelete={() => handleDeleteSubmission(selectedDetail.id)}
      />
    )
  }

  return (
    <section className="py-10 md:py-14 bg-[#ffffff]">
      <div className="max-w-[1200px] mx-auto px-6 flex flex-col gap-8">
        {/* Cabinet header bar */}
        <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#e8e8e8] pb-6">
          <div>
            <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
              Кабинет HR · Администратор: {username}
            </div>
            <h1 className="text-[36px] md:text-[46px] leading-[1.05] text-[#202020] mt-1">
              {selectedVacancyId && vacancyData
                ? vacancyData.vacancy.title
                : 'Вакансии и отбор кандидатов'}
            </h1>
            {health && (
              <p className="text-[13px] text-[#828282] mt-1.5">
                Модель анализа: <span className="text-[#202020]">{health.model}</span> ·
                Порог отсева: <span className="text-[#202020]">&lt; 50%</span> · Топ резюме:{' '}
                <span className="text-[#202020]">≥ 75%</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                selectedVacancyId ? loadVacancyCandidates(selectedVacancyId) : loadVacancies()
              }
              className="btn-ghost inline-flex items-center gap-1.5 py-2 px-4 text-[13px]"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
              Обновить
            </button>

            <button
              type="button"
              onClick={() => {
                clearHrToken()
                onLogout()
              }}
              className="btn-ghost inline-flex items-center gap-1.5 py-2 px-4 text-[13px] text-[#828282]"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              Выйти
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-[#efefef] border-l-2 border-[#ff682c] px-4 py-3 text-[14px] text-[#ff682c]">
            {error}
          </div>
        )}

        {/* LEVEL 2: Candidates inside selected vacancy */}
        {selectedVacancyId && vacancyData ? (
          <div className="flex flex-col gap-6">
            {/* Back + Bucket Tabs + Blind mode + Search */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={backToVacancies}
                  className="btn-ghost py-2 px-4 text-[13px] inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Все вакансии
                </button>

                <div className="nav-pill px-1.5 py-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setBucketTab('suitable')}
                    className={`px-4 py-1.5 rounded-[200px] text-[13px] font-editorial transition-colors cursor-pointer ${
                      bucketTab === 'suitable'
                        ? 'bg-[#202020] text-[#ffffff]'
                        : 'text-[#202020] hover:bg-[#ffffff]/70'
                    }`}
                  >
                    Подходящие ({vacancyData.vacancy.suitable_count})
                  </button>
                  <button
                    type="button"
                    onClick={() => setBucketTab('rejected')}
                    className={`px-4 py-1.5 rounded-[200px] text-[13px] font-editorial transition-colors cursor-pointer ${
                      bucketTab === 'rejected'
                        ? 'bg-[#202020] text-[#ffffff]'
                        : 'text-[#202020] hover:bg-[#ffffff]/70'
                    }`}
                  >
                    Отсеянные ({vacancyData.vacancy.rejected_count})
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-[#828282] absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={candSearch}
                    onChange={(e) => setCandSearch(e.target.value)}
                    placeholder="Поиск по кандидату или навыку..."
                    className="bg-[#f5f5f5] border border-[#e8e8e8] focus:border-[#202020] outline-none pl-9 pr-3 py-1.5 text-[13px] text-[#202020] w-[240px]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setBlindMode((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[200px] text-[12px] border cursor-pointer transition-colors ${
                    blindMode
                      ? 'bg-[#202020] text-[#ffffff] border-[#202020]'
                      : 'bg-[#ffffff] text-[#202020] border-[#e8e8e8]'
                  }`}
                >
                  {blindMode ? (
                    <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                  )}
                  Слепой скрининг
                </button>
              </div>
            </div>

            {loadingCandidates ? (
              <div className="py-12 text-center text-[15px] text-[#828282]">
                Загружаем список кандидатов...
              </div>
            ) : bucketTab === 'suitable' ? (
              suitableTop.length === 0 && suitableRest.length === 0 ? (
                <div className="bg-[#efefef] card-asymmetric p-10 text-center flex flex-col items-center gap-2">
                  <span className="font-editorial text-[22px] text-[#202020]">
                    Подходящих кандидатов пока нет
                  </span>
                  <span className="text-[14px] text-[#828282]">
                    Кандидаты с рейтингом от 50% появляются здесь автоматически. Проверьте также
                    вкладку «Отсеянные».
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-8">
                  {/* Top Resumes section */}
                  {suitableTop.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-[#ff682c]" strokeWidth={1.75} />
                        <h2 className="text-[22px] font-editorial text-[#202020]">
                          Топ резюме ({suitableTop.length})
                        </h2>
                        <span className="text-[12px] text-[#816729] bg-[#ebe6dd] px-2.5 py-0.5 rounded-[200px]">
                          Совпадение ≥ 75%
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {suitableTop.map((cand) => (
                          <CandidateRowCard
                            key={cand.id}
                            candidate={cand}
                            blindMode={blindMode}
                            busy={busyAction || detailLoading}
                            isHighlighted
                            onOpen={() => openCandidateDetail(cand.id)}
                            onMove={() => handleOverrideBucket(cand.id, 'rejected')}
                            moveLabel="В отсеянные"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other Suitable Candidates (50–74% or manually restored) */}
                  {suitableRest.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#202020]" strokeWidth={1.5} />
                        <h2 className="text-[20px] font-editorial text-[#202020]">
                          Остальные подходящие ({suitableRest.length})
                        </h2>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {suitableRest.map((cand) => (
                          <CandidateRowCard
                            key={cand.id}
                            candidate={cand}
                            blindMode={blindMode}
                            busy={busyAction || detailLoading}
                            onOpen={() => openCandidateDetail(cand.id)}
                            onMove={() => handleOverrideBucket(cand.id, 'rejected')}
                            moveLabel="В отсеянные"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : rejectedList.length === 0 ? (
              <div className="bg-[#efefef] card-asymmetric p-10 text-center flex flex-col items-center gap-2">
                <span className="font-editorial text-[22px] text-[#202020]">
                  Отсеянных кандидатов нет
                </span>
                <span className="text-[14px] text-[#828282]">
                  Сюда автоматически попадают отклики с рейтингом соответствия ниже 50%.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-[14px] text-[#4d4d4d]">
                  <XCircle className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
                  <span>
                    Показаны кандидаты с рейтингом ниже 50% (или перенесённые вручную). Любого
                    кандидата можно вернуть в основной список.
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {rejectedList.map((cand) => (
                    <CandidateRowCard
                      key={cand.id}
                      candidate={cand}
                      blindMode={blindMode}
                      busy={busyAction || detailLoading}
                      isRejectedView
                      onOpen={() => openCandidateDetail(cand.id)}
                      onMove={() => handleOverrideBucket(cand.id, 'suitable')}
                      moveLabel="Вернуть в основной список"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* LEVEL 1: Vacancies List (Strict 1 vacancy per row) */
          <div className="flex flex-col gap-6">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#efefef] card-asymmetric p-5">
                <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Всего вакансий
                </div>
                <div className="font-editorial text-[34px] leading-none text-[#202020] mt-2">
                  {vacancies.length}
                </div>
                <div className="text-[12px] text-[#828282] mt-1">
                  Открытых: {globalTotals.active}
                </div>
              </div>

              <div className="bg-[#efefef] card-asymmetric p-5">
                <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Всего откликов
                </div>
                <div className="font-editorial text-[34px] leading-none text-[#202020] mt-2">
                  {globalTotals.total}
                </div>
                <div className="text-[12px] text-[#828282] mt-1">По всем вакансиям</div>
              </div>

              <div className="bg-[#ebe6dd] card-asymmetric p-5">
                <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Подходящие
                </div>
                <div className="font-editorial text-[34px] leading-none text-[#202020] mt-2">
                  {globalTotals.suitable}
                </div>
                <div className="text-[12px] text-[#4d4d4d] mt-1">Рейтинг ≥ 50%</div>
              </div>

              <div className="bg-[#efefef] card-asymmetric p-5">
                <div className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                  Отсеянные
                </div>
                <div className="font-editorial text-[34px] leading-none text-[#ff682c] mt-2">
                  {globalTotals.rejected}
                </div>
                <div className="text-[12px] text-[#828282] mt-1">Рейтинг &lt; 50%</div>
              </div>
            </div>

            {/* Search, Filter, Sort, Add Vacancy button */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search
                    className="w-3.5 h-3.5 text-[#828282] absolute left-3 top-1/2 -translate-y-1/2"
                    strokeWidth={1.5}
                  />
                  <input
                    type="text"
                    value={vacSearch}
                    onChange={(e) => setVacSearch(e.target.value)}
                    placeholder="Поиск по вакансиям..."
                    className="bg-[#f5f5f5] border border-[#e8e8e8] focus:border-[#202020] outline-none pl-9 pr-3 py-2 text-[13px] text-[#202020] w-[240px]"
                  />
                </div>

                <select
                  value={vacFilter}
                  onChange={(e) => setVacFilter(e.target.value as VacancyStatusFilter)}
                  className="bg-[#f5f5f5] border border-[#e8e8e8] px-3 py-2 text-[13px] text-[#202020] cursor-pointer"
                >
                  <option value="all">Все статусы</option>
                  <option value="active">Только открытые</option>
                  <option value="hidden">Только скрытые</option>
                </select>

                <select
                  value={vacSort}
                  onChange={(e) => setVacSort(e.target.value as VacancySortMode)}
                  className="bg-[#f5f5f5] border border-[#e8e8e8] px-3 py-2 text-[13px] text-[#202020] cursor-pointer"
                >
                  <option value="total_desc">Сначала больше откликов</option>
                  <option value="suitable_desc">Сначала больше подходящих</option>
                  <option value="title_asc">По названию (А–Я)</option>
                  <option value="newest">Сначала новые</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowAddVacancy((v) => !v)}
                className="btn-primary py-2 px-4 text-[13px] inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Добавить вакансию
              </button>
            </div>

            {/* Collapsible Add Vacancy Form */}
            {showAddVacancy && (
              <form
                onSubmit={handleUploadVacancy}
                className="bg-[#efefef] card-asymmetric p-6 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
              >
                <div className="md:col-span-5 flex flex-col gap-1.5">
                  <label className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                    Название вакансии
                  </label>
                  <input
                    type="text"
                    value={newVacTitle}
                    onChange={(e) => setNewVacTitle(e.target.value)}
                    placeholder="Например: Разработчик Python / Системный администратор"
                    className="bg-[#ffffff] border border-[#e8e8e8] px-3.5 py-2.5 text-[14px] text-[#202020]"
                  />
                </div>

                <div className="md:col-span-5 flex flex-col gap-1.5">
                  <label className="text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                    Файл описания (.docx, .pdf, .txt) *
                  </label>
                  <label className="bg-[#ffffff] border border-dashed border-[#828282]/60 px-3.5 py-2.5 text-[14px] text-[#202020] flex items-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
                    <span className="truncate">
                      {newVacFile ? newVacFile.name : 'Выберите файл вакансии'}
                    </span>
                    <input
                      type="file"
                      accept=".docx,.pdf,.txt,.md"
                      className="hidden"
                      onChange={(e) => setNewVacFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={!newVacFile || vacUploading}
                    className="btn-primary w-full py-2.5 text-[14px] disabled:opacity-50"
                  >
                    {vacUploading ? 'Сохранение...' : 'Создать'}
                  </button>
                </div>
              </form>
            )}

            {/* Vacancies Table: 1 vacancy per row */}
            {loadingVacancies ? (
              <div className="py-12 text-center text-[15px] text-[#828282]">
                Загружаем вакансии...
              </div>
            ) : filteredVacancies.length === 0 ? (
              <div className="bg-[#efefef] card-asymmetric p-10 text-center text-[15px] text-[#828282]">
                По заданному фильтру вакансии не найдены.
              </div>
            ) : (
              <div className="border border-[#e8e8e8] overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f5f5f5] border-b border-[#e8e8e8] text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
                      <th className="py-3.5 px-4">Вакансия</th>
                      <th className="py-3.5 px-4 text-center">Откликов</th>
                      <th className="py-3.5 px-4 text-center">Подходящие</th>
                      <th className="py-3.5 px-4 text-center">Отсеянные</th>
                      <th className="py-3.5 px-4 text-center">Статус</th>
                      <th className="py-3.5 px-4 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e8e8e8] text-[14px]">
                    {filteredVacancies.map((vac) => (
                      <tr
                        key={vac.id}
                        onClick={() => openVacancy(vac.id)}
                        className="hover:bg-[#f5f5f5] cursor-pointer transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="font-medium text-[#202020]">{vac.title}</div>
                          <div className="text-[12px] text-[#828282] mt-0.5">{vac.filename}</div>
                        </td>
                        <td className="py-4 px-4 text-center font-editorial text-[20px] text-[#202020]">
                          {vac.total_count}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-medium text-[#202020]">{vac.suitable_count}</span>
                            {vac.top_count > 0 && (
                              <span className="text-[11px] px-2 py-0.5 rounded-[200px] bg-[#ebe6dd] text-[#816729]">
                                Топ: {vac.top_count}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center text-[#828282]">
                          {vac.rejected_count}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleVacancy(vac, e)}
                            className={`text-[12px] px-3 py-1 rounded-[200px] cursor-pointer ${
                              vac.is_active
                                ? 'bg-[#202020] text-[#ffffff]'
                                : 'bg-[#efefef] text-[#828282]'
                            }`}
                          >
                            {vac.is_active ? 'Открыта' : 'Скрыта'}
                          </button>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className="inline-flex items-center gap-3">
                            <span className="text-[13px] font-medium text-[#202020] inline-flex items-center gap-1">
                              Кандидаты
                              <ArrowRight className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={1.75} />
                            </span>
                            <button
                              type="button"
                              title="Удалить вакансию"
                              onClick={(e) => handleDeleteVacancy(vac, e)}
                              className="text-[#828282] hover:text-[#ff682c] p-1 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

interface CandidateRowCardProps {
  candidate: VacancyCandidateItem
  blindMode: boolean
  busy: boolean
  isHighlighted?: boolean
  isRejectedView?: boolean
  onOpen: () => void
  onMove: () => void
  moveLabel: string
}

function CandidateRowCard({
  candidate,
  blindMode,
  busy,
  isHighlighted,
  isRejectedView,
  onOpen,
  onMove,
  moveLabel,
}: CandidateRowCardProps) {
  const score = candidate.match_score !== null ? Math.round(candidate.match_score) : null

  return (
    <div
      onClick={onOpen}
      className={`p-5 border transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-4 ${
        isHighlighted
          ? 'bg-[#ebe6dd] border-[#816729]/30 hover:border-[#202020]'
          : 'bg-[#f5f5f5] border-[#e8e8e8] hover:bg-[#efefef]'
      }`}
    >
      <div className="flex flex-col gap-1.5 max-w-[680px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-medium text-[17px] text-[#202020]">
            {blindMode ? `Кандидат #${candidate.id.slice(0, 6)}` : candidate.candidate_label}
          </span>
          {candidate.is_top_resume && (
            <span className="text-[11px] px-2.5 py-0.5 bg-[#202020] text-[#ffffff] rounded-[200px]">
              Топ резюме
            </span>
          )}
          {candidate.manual_override && (
            <span className="text-[11px] px-2.5 py-0.5 bg-[#ffffff] border border-[#816729]/40 text-[#816729] rounded-[200px]">
              Перенесён HR
            </span>
          )}
          <span className="text-[12px] text-[#828282]">{formatDateTime(candidate.created_at)}</span>
        </div>

        <div className="text-[13px] text-[#4d4d4d]">
          {candidate.target_role || (!blindMode ? candidate.resume_filename : 'Роль уточняется')}
          {!blindMode && candidate.contact_info ? ` · ${candidate.contact_info}` : ''}
        </div>

        {candidate.skills_preview.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {candidate.skills_preview.slice(0, 6).map((skill, idx) => (
              <span
                key={idx}
                className="text-[11px] px-2 py-0.5 bg-[#ffffff] text-[#4d4d4d] rounded-[20px]"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <div
            className={`font-editorial text-[30px] leading-none ${
              score !== null && score >= 75
                ? 'text-[#ff682c]'
                : score !== null && score >= 50
                  ? 'text-[#202020]'
                  : 'text-[#828282]'
            }`}
          >
            {score !== null ? `${score}%` : 'Ошибка'}
          </div>
          <div className="text-[11px] text-[#828282] mt-1">
            Совп: {candidate.full_count}/{candidate.total_requirements}
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={busy}
            onClick={onMove}
            className={`text-[12px] py-2 px-3.5 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              isRejectedView ? 'btn-primary' : 'btn-ghost bg-[#ffffff]'
            }`}
          >
            {isRejectedView && <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
            {moveLabel}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onOpen}
            className="btn-ghost bg-[#ffffff] text-[12px] py-2 px-3 inline-flex items-center gap-1"
          >
            Разбор
            <ArrowRight className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
