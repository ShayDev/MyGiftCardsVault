import { daysUntil } from '../lib/date'

export function ExpiryDaysBadge({ expiresAt }: { expiresAt: string }) {
  const days = daysUntil(expiresAt)
  const overdue = days < 0

  return (
    <span
      className={`inline-flex items-center px-1.5 h-4 rounded-full text-[10px] font-semibold leading-4 flex-shrink-0 text-white ${
        overdue ? 'bg-rose-500' : 'bg-amber-500'
      }`}
    >
      {days}
    </span>
  )
}
