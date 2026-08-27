export type EntityCategory = 'cards' | 'vouchers' | 'refunds' | 'clubs'

export type FamilySettings = {
  expiringSoonDays: {
    default: number
    cards: number | null
    vouchers: number | null
    refunds: number | null
    clubs: number | null
  }
  // ISO 4217 code (e.g. 'USD'), or null to keep following the UI language's
  // traditional currency (en → USD, he → ILS) — see lib/currency.ts.
  currency: string | null
  // Which LLM powers the Scan (AI image/text extract) feature — added when
  // Gemini hit a sustained outage and the user wanted a switchable fallback.
  // Defaults to 'gemini' (the original, still-cheaper default) rather than
  // silently switching existing families to Claude.
  aiEngine: 'gemini' | 'claude'
  // Other keys (e.g. a future `theme`, ...) may also be present in the underlying
  // JSON — untyped here, but never dropped. Each new family-wide preference gets
  // its own top-level key and its own typed accessor, following this same file's
  // pattern; none of them need to know about the others.
  [key: string]: unknown
}

const DEFAULT_SETTINGS: FamilySettings = {
  expiringSoonDays: { default: 60, cards: null, vouchers: null, refunds: null, clubs: null },
  currency: null,
  aiEngine: 'gemini',
}

// Defensive by necessity — this is raw TEXT, not a DB-validated shape. Malformed
// or partial JSON (including data saved by an older/newer version of this app)
// falls back field-by-field rather than discarding the whole blob. Also preserves
// any unrecognized top-level key untouched (`...parsed`), so a save from this
// feature can never clobber a sibling setting some other feature added later.
export function parseFamilySettings(raw: string | null): FamilySettings {
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }
  }
  const days = (parsed.expiringSoonDays ?? {}) as Partial<FamilySettings['expiringSoonDays']>
  return {
    ...parsed,
    expiringSoonDays: {
      default: typeof days.default === 'number' ? days.default : 60,
      cards: typeof days.cards === 'number' ? days.cards : null,
      vouchers: typeof days.vouchers === 'number' ? days.vouchers : null,
      refunds: typeof days.refunds === 'number' ? days.refunds : null,
      clubs: typeof days.clubs === 'number' ? days.clubs : null,
    },
    currency: typeof parsed.currency === 'string' ? parsed.currency : null,
    aiEngine: parsed.aiEngine === 'claude' ? 'claude' : 'gemini',
  }
}

// Phase 1 callers pass no category (always `.default`). Phase 2 will pass a
// category and get its override when set — this function's signature already
// supports that; only its callers change when Phase 2 lands.
export function getExpiringSoonDays(settings: FamilySettings, category?: EntityCategory): number {
  const override = category ? settings.expiringSoonDays[category] : null
  return override ?? settings.expiringSoonDays.default
}
