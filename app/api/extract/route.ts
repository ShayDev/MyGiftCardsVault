import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import prisma from '../../../lib/prisma'
import { parseFamilySettings } from '../../../lib/familySettings'
import { isEntityType, callEngine, type Engine } from '../../../lib/extractEngines'

// Raised from 30 to fit 2 full attempts (20s each + backoff) — Gemini's
// gemini-flash-latest was confirmed live via direct testing to sometimes hang
// to a full timeout AND separately return "high demand" 503s, so a retry
// needs real headroom, not just a single longer attempt. Also comfortably
// covers the Claude path, which has its own 2-attempt/20s-each retry.
export const maxDuration = 60

// Briefly pinned photos to Gemini unconditionally (better Hebrew OCR than
// Groq's qwen/qwen3.8-27b, which was confirmed via diagnose-extract.ts to
// hallucinate wrong numbers/a wrong domain/stray Chinese characters on a
// Hebrew receipt) — reverted back to one engine for both modalities once
// Gemini's own outage made that trade-off worse than the OCR gap. If Gemini
// stabilizes or Claude's workspace billing gets sorted, an explicit
// per-modality override here is the way back to better Hebrew OCR — see the
// git history around this comment for that version.
async function getAiEngine(userId: string): Promise<Engine> {
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { family: { select: { settings: true } } },
  })
  return parseFamilySettings(user?.family?.settings ?? null).aiEngine
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const entityType = form.get('entityType')
  const file = form.get('file') as File | null
  const pastedText = form.get('text') as string | null
  const localeField = form.get('locale')
  const locale = localeField === 'he' ? 'he' : 'en'

  if (!isEntityType(entityType) || (!file && !pastedText?.trim())) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const engine = await getAiEngine(userId)
    const fields = await callEngine(engine, file, pastedText, entityType, undefined, undefined, locale)
    return NextResponse.json({ fields })
  } catch (err) {
    console.error('Extraction failed:', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 502 })
  }
}
