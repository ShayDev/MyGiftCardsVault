import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

type EntityType = 'CARD' | 'VOUCHER' | 'REFUND'

const SCHEMAS: Record<EntityType, object> = {
  CARD: {
    type: 'OBJECT',
    properties: {
      provider:   { type: 'STRING' },
      name:       { type: 'STRING', description: 'a distinct product name/title for this card, if different from the provider/brand name — omit if there is none' },
      fullNumber: { type: 'STRING', description: 'digits only, no spaces or dashes' },
      cvv:        { type: 'STRING', description: '3 or 4 digits, usually printed on the back' },
      expiresAt:  { type: 'STRING', description: 'YYYY-MM-DD if visible, otherwise omit this field' },
      value:      { type: 'NUMBER', description: 'the balance/denomination printed on the card, if shown, e.g. 50' },
    },
  },
  VOUCHER: {
    type: 'OBJECT',
    properties: {
      provider:  { type: 'STRING' },
      name:      { type: 'STRING', description: 'a distinct title/name for this voucher, if different from the provider/brand name — omit if there is none' },
      code:      { type: 'STRING' },
      value:     { type: 'NUMBER' },
      expiresAt: { type: 'STRING', description: 'YYYY-MM-DD if visible, otherwise omit this field' },
    },
  },
  REFUND: {
    type: 'OBJECT',
    properties: {
      provider:    { type: 'STRING' },
      amount:      { type: 'NUMBER' },
      currency:    { type: 'STRING', description: '3-letter ISO currency code' },
      referenceId: { type: 'STRING' },
      expiresAt:   { type: 'STRING', description: 'YYYY-MM-DD if visible, otherwise omit this field' },
    },
  },
}

const IMAGE_PROMPTS: Record<EntityType, string> = {
  CARD: 'Read this gift card photo (front and back if both are shown). Return the provider/brand name as printed, a distinct product name/title if there is one separate from the brand, the full card number, the CVV if visible on the back, the expiration date if visible, and the balance/denomination amount if printed on the card.',
  VOUCHER: 'Read this voucher or promo code image. Return the provider/brand name, a distinct title/name if there is one separate from the brand, the code, the value/amount if printed, and the expiration date if visible.',
  REFUND: 'Read this receipt or refund confirmation. Return the store/provider name, the amount, the 3-letter currency code, any order/reference number, and a store-credit expiration date if shown.',
}

const TEXT_PROMPTS: Record<EntityType, string> = {
  CARD: 'Extract gift card details from this pasted text (e.g. a digital gift card email). Return the provider/brand name, a distinct product name/title if there is one separate from the brand, the full card number, the CVV if mentioned, the expiration date if mentioned, and the balance/denomination amount if mentioned.',
  VOUCHER: 'Extract voucher/promo details from this pasted text (e.g. an email or SMS). Return the provider/brand name, a distinct title/name if there is one separate from the brand, the code, the value/amount if mentioned, and the expiration date if mentioned.',
  REFUND: 'Extract refund/store-credit details from this pasted text (e.g. a confirmation email). Return the store/provider name, the amount, the 3-letter currency code, any order/reference number, and a store-credit expiration date if mentioned.',
}

function isEntityType(value: unknown): value is EntityType {
  return value === 'CARD' || value === 'VOUCHER' || value === 'REFUND'
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
      signal: AbortSignal.timeout(15_000),
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
