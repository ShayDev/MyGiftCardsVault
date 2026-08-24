import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

// Vercel's default serverless timeout is shorter than the old 15s Gemini
// AbortSignal below needed for a dense/tilted receipt photo (confirmed via
// prod logs: "TimeoutError: The operation was aborted due to timeout" — our
// own AbortSignal firing, not a platform-level 504). Raises the function's
// own ceiling so the AbortSignal bump below actually gets to use the time.
export const maxDuration = 30

type EntityType = 'CARD' | 'VOUCHER' | 'REFUND' | 'WARRANTY'

const SCHEMAS: Record<EntityType, object> = {
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

const IMAGE_PROMPTS: Record<EntityType, string> = {
  WARRANTY: 'Read this receipt or warranty card. Return the product name, the store or seller name printed on it, the specific branch/location if one is shown (e.g. a city or address), the purchase date if visible, the warranty length in months if stated (convert years to months), an explicit expiry date only if one is printed directly, the price paid and its 3-letter currency code if shown, and any receipt/order/serial number. Do not guess a separate warranty service company — only extract who sold the item.',
  CARD: 'Read this gift card photo (front and back if both are shown). Return the provider/brand name as printed, a distinct product name/title if there is one separate from the brand, the full card number, the CVV if visible on the back, the expiration date if visible, the balance/denomination amount if printed on the card, a redemption URL if the card is redeemed via a link instead of a number, and any note about who it is from or the occasion if visible.',
  VOUCHER: 'Read this voucher or promo code image. Return the provider/brand name, a distinct title/name if there is one separate from the brand, the code, a redemption URL if it is redeemed via a link instead of a code, the value/amount if printed, the expiration date if visible, and any note about who it is from or the occasion if visible.',
  REFUND: 'Read this receipt or refund confirmation. Return the store/provider name, the amount, the 3-letter currency code, any order/reference number, a redemption/credit code if present, a redemption/view URL if present, a store-credit expiration date if shown, and any other relevant context about the order/return.',
}

const TEXT_PROMPTS: Record<EntityType, string> = {
  WARRANTY: 'Extract warranty/purchase details from this pasted text (e.g. an order confirmation email). Return the product name, the store or seller name, the specific branch/location if one is mentioned, the purchase date if mentioned, the warranty length in months if stated (convert years to months), an explicit expiry date only if one is mentioned directly, the price paid and its 3-letter currency code if mentioned, and any receipt/order/serial number. Do not guess a separate warranty service company — only extract who sold the item.',
  CARD: 'Extract gift card details from this pasted text (e.g. a digital gift card email). Return the provider/brand name, a distinct product name/title if there is one separate from the brand, the full card number, the CVV if mentioned, the expiration date if mentioned, the balance/denomination amount if mentioned, a redemption URL if the card is redeemed via a link instead of a number, and any note about who it is from or the occasion if mentioned.',
  VOUCHER: 'Extract voucher/promo details from this pasted text (e.g. an email or SMS). Return the provider/brand name, a distinct title/name if there is one separate from the brand, the code, a redemption URL if it is redeemed via a link instead of a code, the value/amount if mentioned, the expiration date if mentioned, and any note about who it is from or the occasion if mentioned.',
  REFUND: 'Extract refund/store-credit details from this pasted text (e.g. a confirmation email). Return the store/provider name, the amount, the 3-letter currency code, any order/reference number, a redemption/credit code if mentioned, a redemption/view URL if present, a store-credit expiration date if mentioned, and any other relevant context about the order/return.',
}

function isEntityType(value: unknown): value is EntityType {
  return value === 'CARD' || value === 'VOUCHER' || value === 'REFUND' || value === 'WARRANTY'
}

async function callGemini(parts: object[], entityType: EntityType): Promise<Record<string, string | number>> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMAS[entityType],
        },
      }),
      // Was 15s — too tight for a dense/tilted receipt photo, confirmed via
      // prod logs firing this AbortSignal (not a platform timeout). 25s
      // leaves a few seconds of margin under maxDuration=30 above.
      signal: AbortSignal.timeout(25_000),
    }
  )

  if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`)

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content')

  return JSON.parse(text)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const entityType = form.get('entityType')
  const file = form.get('file') as File | null
  const pastedText = form.get('text') as string | null

  if (!isEntityType(entityType) || (!file && !pastedText?.trim())) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const parts = file
      ? [
          { text: IMAGE_PROMPTS[entityType] },
          { inlineData: { mimeType: file.type, data: Buffer.from(await file.arrayBuffer()).toString('base64') } },
        ]
      : [{ text: `${TEXT_PROMPTS[entityType]}\n\n"""${pastedText}"""` }]

    const fields = await callGemini(parts, entityType)
    return NextResponse.json({ fields })
  } catch (err) {
    console.error('Extraction failed:', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 502 })
  }
}
