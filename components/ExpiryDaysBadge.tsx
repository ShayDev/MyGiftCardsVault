import { daysUntil } from '../lib/date'

export function ExpiryDaysBadge({ expiresAt }: { expiresAt: string }) {
  const days = daysUntil(expiresAt)
  const overdue = days < 0

  return (
    <span
      className={`inline-flex items-center px-1.5 h-4 rounded-full text-[10px] font-semibold leading-4 flex-shrink-0 ${
        overdue ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {days}
    </span>
  )
}
