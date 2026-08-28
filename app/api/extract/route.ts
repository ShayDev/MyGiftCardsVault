import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import prisma from '../../../lib/prisma'
import { parseFamilySettings } from '../../../lib/familySettings'
import { isEntityType, callEngine } from '../../../lib/extractEngines'

// Raised from 30 to fit 2 full attempts (20s each + backoff) — Gemini's
// gemini-flash-latest was confirmed live via direct testing to sometimes hang
// to a full timeout AND separately return "high demand" 503s, so a retry
// needs real headroom, not just a single longer attempt. Also comfortably
// covers the Claude path, which has its own 2-attempt/20s-each retry.
export const maxDuration = 60

async function getAiEngine(userId: string): Promise<'gemini' | 'claude'> {
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

  if (!isEntityType(entityType) || (!file && !pastedText?.trim())) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const engine = await getAiEngine(userId)
    const fields = await callEngine(engine, file, pastedText, entityType)
    return NextResponse.json({ fields })
  } catch (err) {
    console.error('Extraction failed:', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 502 })
  }
}
