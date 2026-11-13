import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { fetchHealth, fetchSamples, previewPii, runAnalysis } from './api/client'
import { PiiPreviewModal } from './components/PiiPreviewModal'
import { RankingList } from './components/RankingList'
import { RecruiterPanel } from './components/RecruiterPanel'
import { UploadPanel } from './components/UploadPanel'
import { VacancyDetail } from './components/VacancyDetail'
import type {
  AnalysisResponse,
  HealthResponse,
  PiiRedactionReport,
  SamplesResponse,
} from './types'

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [samples, setSamples] = useState<SamplesResponse | null>(null)

  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [sampleResume, setSampleResume] = useState<string | null>(null)
  const [vacancyFiles, setVacancyFiles] = useState<File[]>([])
  const [sampleVacancies, setSampleVacancies] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [selectedVacancyFilename, setSelectedVacancyFilename] = useState<string | null>(null)

  const [piiPreview, setPiiPreview] = useState<PiiRedactionReport | null>(null)
  const [piiModalOpen, setPiiModalOpen] = useState(false)

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {})
    fetchSamples()
      .then((data) => {
        setSamples(data)
        // Preselect all 3 case vacancies by default for instant readiness
        if (data.vacancies.length > 0) {
          setSampleVacancies(data.vacancies.map((v) => v.filename))
        }
      })
      .catch(() => {})
  }, [])

  const handleSelectResumeFile = (file: File | null) => {
    setResumeFile(file)
    if (file) setSampleResume(null)
    setError(null)
  }

  const handleSelectSampleResume = (name: string | null) => {
    setSampleResume(name)
    if (name) setResumeFile(null)
    setError(null)
  }

  const handlePreviewPii = async () => {
    setPreviewLoading(true)
    setError(null)
    try {
      const report = await previewPii({ resumeFile, sampleResume })
      setPiiPreview(report)
      setPiiModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка предпросмотра ПДн')
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleRunAnalysis = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await runAnalysis({
        resumeFile,
        sampleResume,
        vacancyFiles,
        sampleVacancies,
      })
      setAnalysis(result)
      setPiiPreview(result.pii_report)
      setSelectedVacancyFilename(result.vacancies[0]?.vacancy.filename || null)
      setTimeout(() => {
        document.getElementById('ranking-section')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить анализ')
    } finally {
      setLoading(false)
    }
  }

  const activeVacancy =
    analysis?.vacancies.find((v) => v.vacancy.filename === selectedVacancyFilename) ||
    analysis?.vacancies[0] ||
    null

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#202020]">
      {/* Editorial Header */}
      <header className="sticky top-0 z-40 bg-[#ffffff]/95 backdrop-blur-sm border-b border-[#e8e8e8]">
        <div className="max-w-[1200px] mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <a href="#upload-section" className="font-editorial text-[20px] text-[#202020]">
            Ventriloc<span className="text-[#ff682c]">.</span>HR
          </a>

          <nav className="hidden md:flex nav-pill px-5 py-2 items-center gap-6 font-editorial text-[15px] text-[#202020]">
            <a href="#upload-section" className="hover:text-[#ff682c] transition-colors">
              Документы
            </a>
            {analysis && (
              <>
                <a href="#ranking-section" className="hover:text-[#ff682c] transition-colors">
                  Рейтинг
                </a>
                <a href="#details-section" className="hover:text-[#ff682c] transition-colors">
                  Таблица требований
                </a>
                <a href="#recruiter-section" className="hover:text-[#ff682c] transition-colors">
                  Рекомендации
                </a>
              </>
            )}
          </nav>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-[#4d4d4d]">
              <ShieldCheck className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
              PII Shield
            </span>
            <span className="text-[13px] text-[#828282] font-editorial">
              {health ? `${health.llm_provider.toUpperCase()} · ${health.model}` : 'Подключение...'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <UploadPanel
          health={health}
          samples={samples}
          resumeFile={resumeFile}
          sampleResume={sampleResume}
          vacancyFiles={vacancyFiles}
          sampleVacancies={sampleVacancies}
          loading={loading}
          previewLoading={previewLoading}
          error={error}
          onSelectResumeFile={handleSelectResumeFile}
          onSelectSampleResume={handleSelectSampleResume}
          onAddVacancyFiles={(files) => setVacancyFiles((prev) => [...prev, ...files])}
          onRemoveVacancyFile={(idx) =>
            setVacancyFiles((prev) => prev.filter((_, i) => i !== idx))
          }
          onToggleSampleVacancy={(name) =>
            setSampleVacancies((prev) =>
              prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]
            )
          }
          onSelectAllSampleVacancies={() =>
            setSampleVacancies(samples?.vacancies.map((v) => v.filename) || [])
          }
          onClearVacancies={() => {
            setVacancyFiles([])
            setSampleVacancies([])
          }}
          onPreviewPii={handlePreviewPii}
          onRunAnalysis={handleRunAnalysis}
        />

        {analysis && (
          <>
            <RankingList
              analysis={analysis}
              selectedFilename={selectedVacancyFilename}
              onSelectVacancy={(fn) => {
                setSelectedVacancyFilename(fn)
                document.getElementById('details-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              onOpenPiiModal={() => {
                setPiiPreview(analysis.pii_report)
                setPiiModalOpen(true)
              }}
            />

            <VacancyDetail
              vacancies={analysis.vacancies}
              selectedFilename={selectedVacancyFilename}
              onSelectVacancy={setSelectedVacancyFilename}
            />

            {activeVacancy && (
              <RecruiterPanel analysis={analysis} activeVacancy={activeVacancy} />
            )}
          </>
        )}
      </main>

      <footer className="bg-[#ffffff] border-t border-[#e8e8e8] py-8">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-[13px] text-[#828282]">
          <span className="font-editorial">
            Задача 3 · Сравнительный анализ резюме и вакансий
          </span>
          <span>
            Во внешние API передаются только обезличенные тексты без персональных данных.
          </span>
        </div>
      </footer>

      <PiiPreviewModal
        report={piiPreview}
        open={piiModalOpen}
        onClose={() => setPiiModalOpen(false)}
      />
    </div>
  )
}

export default App
