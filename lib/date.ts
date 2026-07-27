export function formatExpiresAt(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

/** localeTag is the same 'en-US'/'he-IL' tag already carried on t.currencyLocale. */
export function formatDate(iso: string, localeTag: string): string {
  const d = new Date(iso)
  if (localeTag === 'he-IL') {
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${dd}.${mm}.${d.getFullYear()}`
  }
  return d.toLocaleDateString(localeTag, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function isExpiringSoon(expiresAt: string | undefined, days = 90): boolean {
  if (!expiresAt) return false
  const exp = new Date(expiresAt)
  const now = new Date()
  const threshold = new Date()
  threshold.setDate(threshold.getDate() + days)
  return exp >= now && exp <= threshold
}
