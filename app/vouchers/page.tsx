import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import VouchersClient from '../../components/VouchersClient'
import type { VoucherItem } from './actions'
import { decrypt, isEncrypted } from '../../lib/encrypt'

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  const vouchers = await prisma.voucher.findMany({
    where: { familyId: user.familyId, isActive: true },
    orderBy: { seq: 'asc' },
  })

  function dec(val: string | null): string | undefined {
    if (!val) return undefined
    return isEncrypted(val) ? decrypt(val) : val
  }

  const payload: VoucherItem[] = vouchers.map((v) => ({
    id: v.id,
    seq: v.seq,
    name: v.name,
    provider: v.provider,
    code: dec(v.code ?? null),
    link: dec(v.link ?? null),
    value: v.value ? parseFloat(v.value.toString()) : undefined,
    expiresAt: v.expiresAt ?? undefined,
    notes: v.notes ?? undefined,
    isUsed: v.isUsed,
    usedAt: v.usedAt?.toISOString(),
    usedBy: v.usedBy ?? undefined,
    createdAt: v.createdAt.toISOString(),
    createdBy: v.createdBy ?? undefined,
  }))

  return <VouchersClient vouchers={payload} />
}
