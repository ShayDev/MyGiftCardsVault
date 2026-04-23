import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import ClubsClient from '../../components/ClubsClient'
import type { ClubItem } from './actions'
import { decrypt, isEncrypted } from '../../lib/encrypt'

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  const clubs = await prisma.clubMember.findMany({
    where: { familyId: user.familyId, isActive: true },
    orderBy: { seq: 'asc' },
  })

  function dec(val: string | null): string | undefined {
    if (!val) return undefined
    return isEncrypted(val) ? decrypt(val) : val
  }

  const payload: ClubItem[] = clubs.map((c) => ({
    id: c.id,
    seq: c.seq,
    name: c.name,
    provider: c.provider,
    memberId:  dec(c.memberId ?? null),
    ownerName: c.ownerName ?? undefined,
    idType:    (c.idType ?? undefined) as ClubItem['idType'],
    expiresAt: c.expiresAt ?? undefined,
    notes:     c.notes ?? undefined,
    createdAt: c.createdAt.toISOString(),
  }))

  return <ClubsClient clubs={payload} />
}
