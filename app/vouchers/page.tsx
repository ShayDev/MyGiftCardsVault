import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import VouchersClient from '../../components/VouchersClient'
import type { VoucherItem } from './actions'

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

  const payload: VoucherItem[] = vouchers.map((v) => ({
    id: v.id,
    seq: v.seq,
    name: v.name,
    provider: v.provider,
    code: v.code ?? undefined,
    link: v.link ?? undefined,
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
