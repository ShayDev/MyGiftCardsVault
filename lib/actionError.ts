import { ZodError } from 'zod'

// Server Actions forward a thrown error's `.message` straight to the client —
// unlike Server Component render errors, Next.js does NOT redact it in
// production. So a raw ZodError (a stringified-issues JSON blob, e.g. the
// `last4` regex failure that first surfaced this) or an ad-hoc
// `throw new Error('English sentence')` used to land directly in the UI,
// always in English, regardless of the app's locale. Actions should throw an
// ActionError with one of these stable codes instead — parseAction() below
// does this automatically for schema validation, and a call site with its own
// guard (e.g. an ownership check) should `throw new ActionError('UNAUTHORIZED')`
// directly. components read the code via lib/actionErrorMessage.ts (client-safe)
// to show a localized, friendly message. Anything unexpected is logged here
// with full detail and converted to the generic SERVER_ERROR code, so nothing
// internal (a Prisma error, a real bug's message) ever reaches the browser.
export class ActionError extends Error {
  constructor(code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'SERVER_ERROR') {
    super(code)
    this.name = 'ActionError'
  }
}

export function toActionError(err: unknown): ActionError {
  if (err instanceof ActionError) return err
  if (err instanceof ZodError) return new ActionError('VALIDATION_ERROR')
  console.error('Server action failed:', err)
  return new ActionError('SERVER_ERROR')
}

/** Parses `raw` against `schema`, converting any ZodError into a safe ActionError instead of letting it reach the client raw. */
export function parseAction<T>(schema: { parse: (raw: unknown) => T }, raw: unknown): T {
  try {
    return schema.parse(raw)
  } catch (err) {
    throw toActionError(err)
  }
}
