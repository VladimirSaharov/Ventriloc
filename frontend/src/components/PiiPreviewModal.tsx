import { ShieldCheck, X } from 'lucide-react'
import type { PiiRedactionReport } from '../types'

interface PiiPreviewModalProps {
  report: PiiRedactionReport | null
  open: boolean
  onClose: () => void
}

const ENTITY_LABELS: Record<string, string> = {
  candidate_name: 'ФИО кандидата',
  phone: 'Телефоны',
  email: 'Электронная почта',
  messenger_handle: 'Никнеймы мессенджеров',
  personal_url: 'Личные ссылки / профили',
  birth_date: 'Дата рождения',
  demographics: 'Пол / возраст',
  street_address: 'Улица / дом / квартира',
  document_id: 'Паспорт / СНИЛС / ИНН',
}

export function PiiPreviewModal({ report, open, onClose }: PiiPreviewModalProps) {
  if (!open || !report) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#202020]/45 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#ffffff] border border-[#e8e8e8] card-data p-8 max-h-[88vh] flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e8e8e8] pb-4">
          <div>
            <div className="flex items-center gap-2 text-[#816729] text-[13px] font-editorial mb-1">
              <ShieldCheck className="w-4 h-4 text-[#ff682c]" strokeWidth={1.5} />
              <span>Контроль конфиденциальности перед отправкой в GigaChat API</span>
            </div>
            <h3 className="text-[28px] leading-[1.15] text-[#202020]">
              Обезличенный текст резюме
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-3 py-2 flex items-center gap-1 text-[14px]"
            aria-label="Закрыть окно"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
            Закрыть
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 rounded-[20px] bg-[#efefef] text-[13px] text-[#202020]">
            Статус:{' '}
            <strong className="font-medium text-[#ff682c]">
              {report.enabled ? 'ПДн скрыты' : 'Отключено'}
            </strong>
          </span>
          <span className="px-3 py-1.5 rounded-[20px] bg-[#efefef] text-[13px] text-[#202020]">
            Замаскировано элементов: {report.total_masked}
          </span>
          {report.entities.map((ent) => (
            <span
              key={ent.entity_type}
              className="px-3 py-1.5 rounded-[20px] bg-[#ebe6dd] text-[13px] text-[#202020]"
            >
              {ENTITY_LABELS[ent.entity_type] || ent.entity_type}: {ent.count}{' '}
              <span className="text-[#816729]">({ent.placeholder})</span>
            </span>
          ))}
        </div>

        <div className="bg-[#f5f5f5] p-5 card-asymmetric overflow-y-auto flex-1 border border-[#e8e8e8]">
          <pre className="whitespace-pre-wrap font-sans text-[14px] leading-[1.55] text-[#4d4d4d]">
            {report.redacted_text}
          </pre>
        </div>

        <p className="text-[13px] text-[#828282]">
          Именно этот обезличенный текст передается во внешний API. Персональные идентификаторы
          (ФИО, контакты, ссылки, возраст, адреса) остаются только в локальном контуре.
        </p>
      </div>
    </div>
  )
}
