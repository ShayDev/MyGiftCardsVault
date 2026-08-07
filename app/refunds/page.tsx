import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import RefundsClient from '../../components/RefundsClient'
import type { RefundItem } from './actions'
import { decrypt, isEncrypted } from '../../lib/encrypt'
import { getProviderOptions } from '../providers/actions'
import { parseFamilySettings, getExpiringSoonDays } from '../../lib/familySettings'

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true, family: { select: { settings: true } } },
  })

  if (!user?.familyId) redirect('/onboarding')

  const expiringSoonDays = getExpiringSoonDays(parseFamilySettings(user.family?.settings ?? null))

  const refunds = await prisma.refund.findMany({
    where: { familyId: user.familyId, isActive: true },
    orderBy: { expiresAt: { sort: 'asc', nulls: 'last' } },
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
    isUsed:      r.isUsed,
    usedAmount:  Number(r.usedAmount),
    usedAt:      r.usedAt?.toISOString() ?? undefined,
    referenceId: r.referenceId ?? undefined,
    notes:       r.notes ?? undefined,
    expiresAt:   r.expiresAt?.toISOString() ?? undefined,
    receivedAt:  r.receivedAt?.toISOString() ?? undefined,
    code:        dec(r.code ?? null),
    link:        dec(r.link ?? null),
    imageUrl:    dec(r.imageUrl ?? null),
    createdAt:   r.createdAt.toISOString(),
    createdBy:   r.createdBy,
  }))

  const providerOptions = await getProviderOptions('REFUND')

  return <RefundsClient refunds={payload} providerOptions={providerOptions} expiringSoonDays={expiringSoonDays} />
}
