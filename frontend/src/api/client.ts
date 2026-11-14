import type {
  AdminLoginResponse,
  HealthResponse,
  HrVacancyCandidatesResponse,
  PublicApplyResponse,
  PublicVacancyInfo,
  ScreeningBucket,
  SubmissionDetailResponse,
  VacancyRecord,
  VacancySummaryItem,
} from '../types'

const TOKEN_STORAGE_KEY = 'ventriloc_hr_token'

export function getHrToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setHrToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch {
    // Ignore storage quota errors
  }
}

export function clearHrToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getHrToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  }
}

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

export async function fetchPublicOpenVacancies(): Promise<PublicVacancyInfo[]> {
  const res = await fetch('/api/public/open-vacancies')
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function submitPublicApplication(params: {
  vacancyId: string
  resumeFile: File
  contact: string
  comment: string
}): Promise<PublicApplyResponse> {
  const form = new FormData()
  form.append('vacancy_id', params.vacancyId)
  form.append('resume', params.resumeFile)
  form.append('contact', params.contact)
  form.append('comment', params.comment)

  const res = await fetch('/api/public/apply', { method: 'POST', body: form })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function loginHrAdmin(username: string, password: string): Promise<AdminLoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  const data: AdminLoginResponse = await res.json()
  setHrToken(data.access_token)
  return data
}

export async function fetchHrMe(): Promise<{ username: string }> {
  const res = await fetch('/api/auth/me', { headers: authHeaders() })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function fetchHrVacancies(): Promise<VacancySummaryItem[]> {
  const res = await fetch('/api/hr/vacancies', { headers: authHeaders() })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function fetchHrVacancyCandidates(
  vacancyId: string
): Promise<HrVacancyCandidatesResponse> {
  const res = await fetch(`/api/hr/vacancies/${encodeURIComponent(vacancyId)}/submissions`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function fetchHrSubmissionDetail(
  submissionId: string
): Promise<SubmissionDetailResponse> {
  const res = await fetch(`/api/hr/submissions/${encodeURIComponent(submissionId)}`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function overrideSubmissionBucket(
  submissionId: string,
  bucket: ScreeningBucket
): Promise<{
  submission_id: string
  screening_bucket: ScreeningBucket
  is_top_resume: boolean
  manual_override: boolean
}> {
  const res = await fetch(`/api/hr/submissions/${encodeURIComponent(submissionId)}/bucket`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ bucket }),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function reanalyzeSubmission(submissionId: string): Promise<void> {
  const res = await fetch(`/api/hr/submissions/${encodeURIComponent(submissionId)}/reanalyze`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  const res = await fetch(`/api/hr/submissions/${encodeURIComponent(submissionId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
}

export async function uploadHrVacancy(file: File, title: string): Promise<VacancyRecord> {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title)
  const res = await fetch('/api/hr/vacancies', {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function toggleHrVacancy(vacancyId: string, isActive: boolean): Promise<VacancyRecord> {
  const res = await fetch(`/api/hr/vacancies/${encodeURIComponent(vacancyId)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ is_active: isActive }),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
  return res.json()
}

export async function deleteHrVacancy(vacancyId: string): Promise<void> {
  const res = await fetch(`/api/hr/vacancies/${encodeURIComponent(vacancyId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await parseErrorMessage(res))
}
