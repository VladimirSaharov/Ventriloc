import type {
  AnalysisResponse,
  HealthResponse,
  PiiRedactionReport,
  SamplesResponse,
} from '../types'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    return JSON.stringify(data)
  } catch {
    return `HTTP ${res.status}: ${res.statusText}`
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function fetchSamples(): Promise<SamplesResponse> {
  const res = await fetch('/api/samples')
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function previewPii(params: {
  resumeFile: File | null
  sampleResume: string | null
}): Promise<PiiRedactionReport> {
  const form = new FormData()
  if (params.resumeFile) {
    form.append('resume', params.resumeFile)
  } else if (params.sampleResume) {
    form.append('sample_resume', params.sampleResume)
  }
  const res = await fetch('/api/preview-pii', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function runAnalysis(params: {
  resumeFile: File | null
  sampleResume: string | null
  vacancyFiles: File[]
  sampleVacancies: string[]
}): Promise<AnalysisResponse> {
  const form = new FormData()
  if (params.resumeFile) {
    form.append('resume', params.resumeFile)
  } else if (params.sampleResume) {
    form.append('sample_resume', params.sampleResume)
  }

  for (const vf of params.vacancyFiles) {
    form.append('vacancies', vf)
  }
  for (const sv of params.sampleVacancies) {
    form.append('sample_vacancies', sv)
  }

  const res = await fetch('/api/analyze', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}
