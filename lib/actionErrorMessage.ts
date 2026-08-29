import type { Translations } from './i18n'

// Client-side counterpart to lib/actionError.ts. Maps a server ActionError's
// stable code to a localized, friendly message. Anything unrecognized (a
// plain Error, a network failure, a non-Error throw) falls back to the
// caller's own already-localized generic message — the same fallback every
// call site used before this existed, just no longer overridden by a raw,
// unlocalized server message.
export function getActionErrorMessage(err: unknown, t: Translations, fallback: string): string {
  const code = err instanceof Error ? err.message : ''
  if (code === 'VALIDATION_ERROR') return t.errorValidation
  if (code === 'UNAUTHORIZED') return t.errorUnauthorized
  return fallback
}
