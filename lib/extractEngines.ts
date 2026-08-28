// Shared by app/api/extract/route.ts (production) and scripts/diagnose-extract.ts
// (local diagnostic tester) — moved here specifically so the tester runs the
// exact same engine code the app does, not a hand-copied approximation. See
// plans/ai-image-extract-dd.md for the original design; this file is the
// result of a mid-session extraction once Gemini started failing intermittently
// and a reusable local repro tool became worth having.
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'

export type EntityType = 'CARD' | 'VOUCHER' | 'REFUND' | 'WARRANTY'
export type Engine = 'gemini' | 'claude'

export const SCHEMAS: Record<EntityType, object> = {
  WARRANTY: {
    type: 'OBJECT',
    properties: {
      productName:    { type: 'STRING' },
      purchasedFrom:  { type: 'STRING', description: 'the store or seller name printed on the receipt' },
      branch:         { type: 'STRING', description: 'the specific branch/location printed on the receipt (e.g. a city or address), if shown — omit if there is none' },
      purchaseDate:   { type: 'STRING', description: 'YYYY-MM-DD, otherwise omit this field if no purchase date is mentioned at all. If a date is ambiguous between day-first and month-first (e.g. two 2-digit groups), interpret it as DD/MM (day before month), not MM/DD.' },
      durationMonths: { type: 'NUMBER', description: 'warranty length in months if stated, e.g. "2 years" = 24 — omit if not mentioned' },
      expiresAt:      { type: 'STRING', description: 'YYYY-MM-DD explicit expiry date, only if printed directly (this overrides duration math) — omit if there is none' },
      purchasePrice:  { type: 'NUMBER', description: 'the price paid for the product, if shown — omit if there is none' },
      currency:       { type: 'STRING', description: '3-letter ISO currency code for purchasePrice — omit if purchasePrice is omitted' },
      referenceId:    { type: 'STRING', description: 'receipt, order, or serial number — omit if there is none' },
    },
  },
  CARD: {
    type: 'OBJECT',
    properties: {
      provider:   { type: 'STRING' },
      name:       { type: 'STRING', description: 'a distinct product name/title for this card, if different from the provider/brand name — omit if there is none' },
      fullNumber: { type: 'STRING', description: 'digits only, no spaces or dashes — omit if there is none (e.g. a link-redeemed card)' },
      cvv:        { type: 'STRING', description: '3 or 4 digits, usually printed on the back' },
      expiresAt:  { type: 'STRING', description: 'YYYY-MM-DD, otherwise omit this field if no expiration is mentioned at all. If only a month and year are given (e.g. "MM/YY" printed on a card), use day 01 of that month. If a date is ambiguous between day-first and month-first (e.g. two 2-digit groups), interpret it as DD/MM (day before month), not MM/DD.' },
      value:      { type: 'NUMBER', description: 'the balance/denomination printed on the card, if shown, e.g. 50' },
      link:       { type: 'STRING', description: 'a redemption URL, if the card is redeemed via a link instead of (or in addition to) a card number — omit if there is none' },
      notes:      { type: 'STRING', description: 'who this is from, the occasion, or any other context mentioned (e.g. "Birthday gift from Mom") — omit if none is mentioned' },
    },
  },
  VOUCHER: {
    type: 'OBJECT',
    properties: {
      provider:  { type: 'STRING' },
      name:      { type: 'STRING', description: 'a distinct title/name for this voucher, if different from the provider/brand name — omit if there is none' },
      code:      { type: 'STRING', description: 'the redemption code, if there is one — omit if the voucher is redeemed via a link instead' },
      value:     { type: 'NUMBER' },
      expiresAt: { type: 'STRING', description: 'YYYY-MM-DD, otherwise omit this field if no expiration is mentioned at all. If only a month and year are given (e.g. "MM/YY" printed on a card), use day 01 of that month. If a date is ambiguous between day-first and month-first (e.g. two 2-digit groups), interpret it as DD/MM (day before month), not MM/DD.' },
      link:      { type: 'STRING', description: 'a redemption URL, if the voucher is redeemed via a link instead of (or in addition to) a code — omit if there is none' },
      notes:     { type: 'STRING', description: 'who this is from, the occasion, or any other context mentioned (e.g. "Birthday gift from Mom") — omit if none is mentioned' },
    },
  },
  REFUND: {
    type: 'OBJECT',
    properties: {
      provider:    { type: 'STRING' },
      amount:      { type: 'NUMBER' },
      currency:    { type: 'STRING', description: '3-letter ISO currency code' },
      referenceId: { type: 'STRING' },
      code:        { type: 'STRING', description: 'the redemption/credit code for this refund/store-credit, if there is one — omit if there is none' },
      expiresAt:   { type: 'STRING', description: 'YYYY-MM-DD, otherwise omit this field if no expiration is mentioned at all. If only a month and year are given (e.g. "MM/YY" printed on a card), use day 01 of that month. If a date is ambiguous between day-first and month-first (e.g. two 2-digit groups), interpret it as DD/MM (day before month), not MM/DD.' },
      link:        { type: 'STRING', description: 'a redemption/view URL for the credit, if there is one — omit if there is none' },
      notes:       { type: 'STRING', description: 'any relevant context about the refund/order mentioned in the text (e.g. what was returned/why) — omit if none is mentioned' },
    },
  },
}

// Same fields as SCHEMAS above, as Zod objects for Claude's structured-output
// path (client.messages.parse + zodOutputFormat) — kept as a parallel literal
// rather than generated from SCHEMAS, since the two providers' schema formats
// don't share a common representation worth abstracting over for just four
// small, rarely-changed shapes.
export const ZOD_SCHEMAS: Record<EntityType, z.ZodTypeAny> = {
  WARRANTY: z.object({
    productName: z.string().optional(),
    purchasedFrom: z.string().optional(),
    branch: z.string().optional(),
    purchaseDate: z.string().optional(),
    durationMonths: z.number().optional(),
    expiresAt: z.string().optional(),
    purchasePrice: z.number().optional(),
    currency: z.string().optional(),
    referenceId: z.string().optional(),
  }),
  CARD: z.object({
    provider: z.string().optional(),
    name: z.string().optional(),
    fullNumber: z.string().optional(),
    cvv: z.string().optional(),
    expiresAt: z.string().optional(),
    value: z.number().optional(),
    link: z.string().optional(),
    notes: z.string().optional(),
  }),
  VOUCHER: z.object({
    provider: z.string().optional(),
    name: z.string().optional(),
    code: z.string().optional(),
    value: z.number().optional(),
    expiresAt: z.string().optional(),
    link: z.string().optional(),
    notes: z.string().optional(),
  }),
  REFUND: z.object({
    provider: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    referenceId: z.string().optional(),
    code: z.string().optional(),
    expiresAt: z.string().optional(),
    link: z.string().optional(),
    notes: z.string().optional(),
  }),
}

export const IMAGE_PROMPTS: Record<EntityType, string> = {
  WARRANTY: 'Read this receipt or warranty card. Return the product name, the store or seller name printed on it, the specific branch/location if one is shown (e.g. a city or address), the purchase date if visible, the warranty length in months if stated (convert years to months), an explicit expiry date only if one is printed directly, the price paid and its 3-letter currency code if shown, and any receipt/order/serial number. Do not guess a separate warranty service company — only extract who sold the item.',
  CARD: 'Read this gift card photo (front and back if both are shown). Return the provider/brand name as printed, a distinct product name/title if there is one separate from the brand, the full card number, the CVV if visible on the back, the expiration date if visible, the balance/denomination amount if printed on the card, a redemption URL if the card is redeemed via a link instead of a number, and any note about who it is from or the occasion if visible.',
  VOUCHER: 'Read this voucher or promo code image. Return the provider/brand name, a distinct title/name if there is one separate from the brand, the code, a redemption URL if it is redeemed via a link instead of a code, the value/amount if printed, the expiration date if visible, and any note about who it is from or the occasion if visible.',
  REFUND: 'Read this receipt or refund confirmation. Return the store/provider name, the amount, the 3-letter currency code, any order/reference number, a redemption/credit code if present, a redemption/view URL if present, a store-credit expiration date if shown, and any other relevant context about the order/return.',
}

export const TEXT_PROMPTS: Record<EntityType, string> = {
  WARRANTY: 'Extract warranty/purchase details from this pasted text (e.g. an order confirmation email). Return the product name, the store or seller name, the specific branch/location if one is mentioned, the purchase date if mentioned, the warranty length in months if stated (convert years to months), an explicit expiry date only if one is mentioned directly, the price paid and its 3-letter currency code if mentioned, and any receipt/order/serial number. Do not guess a separate warranty service company — only extract who sold the item.',
  CARD: 'Extract gift card details from this pasted text (e.g. a digital gift card email). Return the provider/brand name, a distinct product name/title if there is one separate from the brand, the full card number, the CVV if mentioned, the expiration date if mentioned, the balance/denomination amount if mentioned, a redemption URL if the card is redeemed via a link instead of a number, and any note about who it is from or the occasion if mentioned.',
  VOUCHER: 'Extract voucher/promo details from this pasted text (e.g. an email or SMS). Return the provider/brand name, a distinct title/name if there is one separate from the brand, the code, a redemption URL if it is redeemed via a link instead of a code, the value/amount if mentioned, the expiration date if mentioned, and any note about who it is from or the occasion if mentioned.',
  REFUND: 'Extract refund/store-credit details from this pasted text (e.g. a confirmation email). Return the store/provider name, the amount, the 3-letter currency code, any order/reference number, a redemption/credit code if mentioned, a redemption/view URL if present, a store-credit expiration date if mentioned, and any other relevant context about the order/return.',
}

export function isEntityType(value: unknown): value is EntityType {
  return value === 'CARD' || value === 'VOUCHER' || value === 'REFUND' || value === 'WARRANTY'
}

/** Reported to the caller on every attempt so a diagnostic tool can log what actually happened, not just the final result. */
export type AttemptLog = {
  attempt: number
  ms: number
  outcome: 'success' | 'retryable-error' | 'fatal-error'
  detail: string
}

// A rolling alias — Google can silently repoint this to a newer model version
// at any time. Confirmed via diagnose-extract.ts's Gemini attempt logging
// (which reports `modelVersion` on success) that this currently resolves to
// gemini-3.7-flash, the newest release — plausibly the most capacity-contended
// one during a demand spike, hence the model param below for easy comparison
// against an older, more established pinned version (e.g. gemini-2.5-flash).
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest'

export async function callGemini(
  file: File | null,
  pastedText: string | null,
  entityType: EntityType,
  onAttempt?: (log: AttemptLog) => void,
  model: string = DEFAULT_GEMINI_MODEL,
): Promise<Record<string, string | number>> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const parts = file
    ? [
        { text: IMAGE_PROMPTS[entityType] },
        { inlineData: { mimeType: file.type, data: Buffer.from(await file.arrayBuffer()).toString('base64') } },
      ]
    : [{ text: `${TEXT_PROMPTS[entityType]}\n\n"""${pastedText}"""` }]

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SCHEMAS[entityType],
      // gemini-flash-latest "thinks" by default, which is pure overhead for a
      // mechanical extract-into-schema task. Confirmed via direct live testing
      // with this route's exact request shape: disabling it took the same
      // request from 9-25s (and sometimes an incomplete result — fields
      // present in the text were omitted) down to ~4s with every field
      // correctly filled. Also reduces how often the 20s AbortSignal below
      // or a Gemini-side "high demand" 503 gets hit at all.
      thinkingConfig: { thinkingBudget: 0 },
    },
  })

  // One retry — for a transient Gemini-side overload, confirmed via direct
  // testing against the live API with this exact route's request shape:
  // gemini-flash-latest is currently sometimes (a) slow enough to hang past
  // a 20s timeout, or (b) returning an explicit 503 "high demand" after
  // 10-11s. Both are retried once; a 4xx or a parse failure is not, since a
  // second attempt wouldn't help those.
  for (let attempt = 0; ; attempt++) {
    const started = Date.now()
    let res: Response
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          // 20s per attempt — two attempts plus backoff fits comfortably
          // under maxDuration=60 above.
          signal: AbortSignal.timeout(20_000),
        }
      )
    } catch (err) {
      const ms = Date.now() - started
      if (attempt === 0) {
        onAttempt?.({ attempt, ms, outcome: 'retryable-error', detail: err instanceof Error ? err.message : String(err) })
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }
      onAttempt?.({ attempt, ms, outcome: 'fatal-error', detail: err instanceof Error ? err.message : String(err) })
      throw err
    }

    const ms = Date.now() - started
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      if (res.status >= 500 && attempt === 0) {
        onAttempt?.({ attempt, ms, outcome: 'retryable-error', detail: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` })
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }
      onAttempt?.({ attempt, ms, outcome: 'fatal-error', detail: `HTTP ${res.status}: ${bodyText.slice(0, 300)}` })
      throw new Error(`Gemini request failed: ${res.status}`)
    }

    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) {
      onAttempt?.({ attempt, ms, outcome: 'fatal-error', detail: 'Gemini returned no content' })
      throw new Error('Gemini returned no content')
    }

    onAttempt?.({ attempt, ms, outcome: 'success', detail: `modelVersion=${data.modelVersion ?? 'unknown'}` })
    return JSON.parse(text)
  }
}

// resizeImage() on the client always re-encodes to this format before upload —
// see lib/resizeImage.ts. Defaults to it for any unrecognized/unexpected
// incoming mime type rather than failing the whole request.
function toClaudeImageMediaType(mime: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' || mime === 'image/webp') return mime
  return 'image/jpeg'
}

export async function callClaude(
  file: File | null,
  pastedText: string | null,
  entityType: EntityType,
  onAttempt?: (log: AttemptLog) => void,
): Promise<Record<string, string | number>> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const client = new Anthropic({ apiKey })

  const content: Anthropic.MessageParam['content'] = file
    ? [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: toClaudeImageMediaType(file.type),
            data: Buffer.from(await file.arrayBuffer()).toString('base64'),
          },
        },
        { type: 'text', text: IMAGE_PROMPTS[entityType] },
      ]
    : [{ type: 'text', text: `${TEXT_PROMPTS[entityType]}\n\n"""${pastedText}"""` }]

  // Same retry shape as callGemini above — one retry on a transient/server-side
  // failure or timeout, none on a 4xx (a second attempt wouldn't help those).
  for (let attempt = 0; ; attempt++) {
    const started = Date.now()
    try {
      const response = await client.messages.parse(
        {
          model: 'claude-opus-5',
          max_tokens: 4096,
          // Mechanical extraction doesn't need deep reasoning — low effort
          // keeps latency/cost down, same spirit as Gemini's thinkingBudget:0
          // above, but via the documented Opus-5-safe path (explicitly
          // disabling thinking on Opus 5 has known failure modes — effort is
          // the supported way to cut reasoning overhead on this model).
          output_config: { format: zodOutputFormat(ZOD_SCHEMAS[entityType]), effort: 'low' },
          messages: [{ role: 'user', content }],
        },
        { timeout: 20_000 }
      )

      const ms = Date.now() - started
      if (!response.parsed_output) {
        onAttempt?.({ attempt, ms, outcome: 'fatal-error', detail: 'Claude returned no parsed output' })
        throw new Error('Claude returned no parsed output')
      }
      onAttempt?.({ attempt, ms, outcome: 'success', detail: `stop_reason=${response.stop_reason}` })
      return response.parsed_output as Record<string, string | number>
    } catch (err) {
      const ms = Date.now() - started
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.APIConnectionError ||
        err instanceof Anthropic.InternalServerError
      const detail = err instanceof Error ? err.message : String(err)
      if (retryable && attempt === 0) {
        onAttempt?.({ attempt, ms, outcome: 'retryable-error', detail })
        await new Promise((r) => setTimeout(r, 1000))
        continue
      }
      onAttempt?.({ attempt, ms, outcome: 'fatal-error', detail })
      throw err
    }
  }
}

export async function callEngine(
  engine: Engine,
  file: File | null,
  pastedText: string | null,
  entityType: EntityType,
  onAttempt?: (log: AttemptLog) => void,
  geminiModel?: string,
): Promise<Record<string, string | number>> {
  return engine === 'claude'
    ? callClaude(file, pastedText, entityType, onAttempt)
    : callGemini(file, pastedText, entityType, onAttempt, geminiModel)
}
