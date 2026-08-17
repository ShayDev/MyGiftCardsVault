import { auth } from '@clerk/nextjs/server'
import prisma from '../../../lib/prisma'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response(null, { status: 401 })
  const { os } = await req.json().catch(() => ({ os: null }))

  await prisma.userLoginStat.upsert({
    where:  { clerkId: userId },
    create: { clerkId: userId, visitCount: 1, lastVisitAt: new Date(), os },
    // `os` only overwritten when the client actually sent one — never blanks a known value.
    update: { visitCount: { increment: 1 }, lastVisitAt: new Date(), ...(os ? { os } : {}) },
  })

  return new Response(null, { status: 200 })
}
