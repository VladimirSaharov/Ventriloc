import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { clearHrToken, fetchHealth, fetchHrMe, getHrToken } from './api/client'
import { CandidateApplyPage } from './components/CandidateApplyPage'
import { HrDashboardPage } from './components/HrDashboardPage'
import { HrLoginForm } from './components/HrLoginForm'
import type { HealthResponse } from './types'

type RoutePath = '/' | '/hr'

function normalizeRoute(pathname: string): RoutePath {
  return pathname.startsWith('/hr') ? '/hr' : '/'
}

export function App() {
  const [route, setRoute] = useState<RoutePath>(() =>
    normalizeRoute(window.location.pathname)
  )
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [hrUsername, setHrUsername] = useState<string | null>(null)
  const [authChecking, setAuthChecking] = useState<boolean>(true)

  useEffect(() => {
    const onPop = () => setRoute(normalizeRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {})
    const token = getHrToken()
    if (!token) {
      setAuthChecking(false)
      return
    }
    fetchHrMe()
      .then((me) => setHrUsername(me.username))
      .catch(() => {
        clearHrToken()
        setHrUsername(null)
      })
      .finally(() => setAuthChecking(false))
  }, [])

  const navigate = (target: RoutePath) => {
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target)
    }
    setRoute(target)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#ffffff] text-[#202020]">
      {/* Editorial Header with 2 role tabs */}
      <header className="sticky top-0 z-40 bg-[#ffffff]/95 backdrop-blur-sm border-b border-[#e8e8e8]">
        <div className="max-w-[1200px] mx-auto px-6 h-20 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="font-editorial text-[20px] text-[#202020] cursor-pointer"
          >
            Ventriloc<span className="text-[#ff682c]">.</span>HR
          </button>

          <nav className="nav-pill px-2 py-1.5 flex items-center gap-1 font-editorial text-[15px] text-[#202020]">
            <button
              type="button"
              onClick={() => navigate('/')}
              className={`px-4 py-1.5 rounded-[200px] cursor-pointer transition-colors ${
                route === '/'
                  ? 'bg-[#202020] text-[#ffffff]'
                  : 'text-[#202020] hover:text-[#ff682c]'
              }`}
            >
              Подать резюме
            </button>
            <button
              type="button"
              onClick={() => navigate('/hr')}
              className={`px-4 py-1.5 rounded-[200px] cursor-pointer transition-colors ${
                route === '/hr'
                  ? 'bg-[#202020] text-[#ffffff]'
                  : 'text-[#202020] hover:text-[#ff682c]'
              }`}
            >
              Кабинет HR
            </button>
          </nav>

          <div className="flex items-center gap-4">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[13px] text-[#4d4d4d]">
              <ShieldCheck className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
              PII Shield
            </span>
            <span className="hidden md:inline text-[13px] text-[#828282] font-editorial">
              {health ? `${health.llm_provider.toUpperCase()} · ${health.model}` : 'Подключение...'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {route === '/' && <CandidateApplyPage />}

        {route === '/hr' && (
          <>
            {authChecking ? (
              <div className="max-w-[1200px] mx-auto px-6 py-20 text-center text-[#828282]">
                Проверка сессии HR...
              </div>
            ) : hrUsername ? (
              <HrDashboardPage
                username={hrUsername}
                health={health}
                onLogout={() => setHrUsername(null)}
              />
            ) : (
              <HrLoginForm onSuccess={(u) => setHrUsername(u)} />
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
    </div>
  )
}

export default App
