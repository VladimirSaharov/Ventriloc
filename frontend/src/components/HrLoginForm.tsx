import { useState } from 'react'
import { Lock } from 'lucide-react'
import { loginHrAdmin } from '../api/client'

interface HrLoginFormProps {
  onSuccess: (username: string) => void
}

export function HrLoginForm({ onSuccess }: HrLoginFormProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await loginHrAdmin(username, password)
      onSuccess(res.username)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="py-16 md:py-24 bg-[#ffffff]">
      <div className="max-w-[520px] mx-auto px-6">
        <form
          onSubmit={handleSubmit}
          className="bg-[#efefef] card-asymmetric p-8 md:p-10 flex flex-col gap-6"
        >
          <div>
            <div className="inline-flex items-center gap-2 text-[12px] uppercase tracking-wider text-[#816729] font-editorial">
              <Lock className="w-3.5 h-3.5 text-[#ff682c]" strokeWidth={1.5} />
              <span>Закрытый раздел</span>
            </div>
            <h1 className="text-[32px] leading-[1.12] text-[#202020] mt-2">
              Вход в кабинет HR
            </h1>
            <p className="text-[14px] text-[#4d4d4d] mt-2 leading-[1.45]">
              Доступ к сводной матрице откликов, детальному разбору кандидатов и управлению
              вакансиями.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-[#4d4d4d]" htmlFor="hr-login">
              Логин
            </label>
            <input
              id="hr-login"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="bg-[#ffffff] border border-[#e8e8e8] focus:border-[#202020] outline-none px-4 py-3 text-[15px] text-[#202020]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[13px] text-[#4d4d4d]" htmlFor="hr-password">
              Пароль
            </label>
            <input
              id="hr-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-[#ffffff] border border-[#e8e8e8] focus:border-[#202020] outline-none px-4 py-3 text-[15px] text-[#202020]"
            />
          </div>

          {error && (
            <div className="bg-[#ebe6dd] p-4 border-l-2 border-[#ff682c] text-[14px] text-[#202020]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-1">
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="btn-primary"
            >
              {loading ? 'Проверка...' : 'Войти'}
            </button>
            <span className="text-[12px] text-[#828282]">
              Хешированная проверка по БД
            </span>
          </div>
        </form>
      </div>
    </section>
  )
}
