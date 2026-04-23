import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import RefundsClient from '../../components/RefundsClient'
import type { RefundItem } from './actions'
import { decrypt, isEncrypted } from '../../lib/encrypt'

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  const refunds = await prisma.refund.findMany({
    where: { familyId: user.familyId, isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  function dec(val: string | null): string | undefined {
    if (!val) return undefined
    return isEncrypted(val) ? decrypt(val) : val
  }

  const payload: RefundItem[] = refunds.map((r) => ({
    id:          r.id,
    seq:         r.seq,
    provider:    r.provider,
    amount:      Number(r.amount),
    currency:    r.currency,
    status:      r.status as 'pending' | 'received',
    referenceId: r.referenceId ?? undefined,
    notes:       r.notes ?? undefined,
    expectedBy:  r.expectedBy?.toISOString() ?? undefined,
    receivedAt:  r.receivedAt?.toISOString() ?? undefined,
    code:        dec(r.code ?? null),
    link:        dec(r.link ?? null),
    imageUrl:    dec(r.imageUrl ?? null),
    createdAt:   r.createdAt.toISOString(),
  }))

  return <RefundsClient refunds={payload} />
}
