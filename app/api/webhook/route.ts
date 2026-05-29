import prisma from '../../../lib/prisma'
import { headers } from 'next/headers'
import { Webhook } from 'svix'

export const dynamic = 'force-dynamic'

export function GET() {
  return new Response('webhook ok', { status: 200 })
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) return new Response('Webhook secret not configured', { status: 500 })

  const payload = await req.text()
  const headersList = await headers()
  const svixHeaders = {
    'svix-id':        headersList.get('svix-id') ?? '',
    'svix-timestamp': headersList.get('svix-timestamp') ?? '',
    'svix-signature': headersList.get('svix-signature') ?? '',
  }

  let evt: { type: string; data: { user_id: string } }
  try {
    evt = new Webhook(secret).verify(payload, svixHeaders) as typeof evt
  } catch {
    return new Response('Invalid webhook signature', { status: 400 })
  }

  if (evt.type === 'session.created' && process.env.VERCEL_ENV === 'production') {
    const clerkId = evt.data.user_id
    await prisma.userLoginStat.upsert({
      where:  { clerkId },
      create: { clerkId, loginCount: 1, lastLoginAt: new Date() },
      update: { loginCount: { increment: 1 }, lastLoginAt: new Date() },
    })
  }

  return new Response(null, { status: 200 })
}
