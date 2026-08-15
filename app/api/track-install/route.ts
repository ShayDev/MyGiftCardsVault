import { auth } from '@clerk/nextjs/server'
import prisma from '../../../lib/prisma'

export async function POST() {
  const { userId } = await auth()
  if (!userId) return new Response(null, { status: 401 })

  await prisma.userLoginStat.upsert({
    where:  { clerkId: userId },
    create: { clerkId: userId, pwaInstalled: true },
    update: { pwaInstalled: true },
  })

  return new Response(null, { status: 200 })
}
