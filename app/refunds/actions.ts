'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../../lib/prisma'
import { encrypt } from '../../lib/encrypt'

async function getAuth(): Promise<{ familyId: string; userId: string }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  return { familyId: user.familyId, userId }
}

const CreateRefundSchema = z.object({
  provider:    z.string().min(1, 'Provider is required'),
  amount:      z.string().min(1).transform((v) => parseFloat(v)),
  currency:    z.string().length(3).transform((v) => v.toUpperCase()),
  status:      z.enum(['pending', 'received']).default('received'),
  referenceId: z.string().optional(),
  notes:       z.string().optional(),
  expiresAt:   z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/).optional(),
  code:        z.string().optional(),
  link:        z.string().optional(),
  imageUrl:    z.string().optional(),
})

export async function createRefund(formData: FormData) {
  const { familyId, userId } = await getAuth()

  const raw = {
    provider:    formData.get('provider') as string,
    amount:      formData.get('amount') as string,
    currency:    formData.get('currency') as string,
    status:      (formData.get('status') as string) || 'received',
    referenceId: (formData.get('referenceId') as string) || undefined,
    notes:       (formData.get('notes') as string) || undefined,
    expiresAt:   (formData.get('expiresAt') as string) || undefined,
    code:        (formData.get('code') as string) || undefined,
    link:        (formData.get('link') as string) || undefined,
    imageUrl:    (formData.get('imageUrl') as string) || undefined,
  }

  const data = CreateRefundSchema.parse(raw)

  await prisma.refund.create({
    data: {
      familyId,
      provider:    data.provider,
      amount:      data.amount,
      currency:    data.currency,
      status:      data.status,
      receivedAt:  data.status === 'received' ? new Date() : null,
      referenceId: data.referenceId ?? null,
      notes:       data.notes ?? null,
      expiresAt:   data.expiresAt ?? null,
      code:        data.code ? encrypt(data.code) : null,
      link:        data.link ? encrypt(data.link) : null,
      imageUrl:    data.imageUrl ? encrypt(data.imageUrl) : null,
      createdBy:   userId,
    },
  })

  revalidatePath('/refunds')
}

export async function markRefundReceived(refundId: string, received: boolean) {
  await getAuth()

  await prisma.refund.update({
    where: { id: refundId },
    data: {
      status:     received ? 'received' : 'pending',
      receivedAt: received ? new Date() : null,
    },
  })

  revalidatePath('/refunds')
}

export async function markRefundUsed(refundId: string, used: boolean) {
  await getAuth()

  await prisma.refund.update({
    where: { id: refundId },
    data: {
      isUsed:     used,
      usedAt:     used ? new Date() : null,
      usedAmount: used ? await prisma.refund.findUnique({ where: { id: refundId }, select: { amount: true } }).then(r => r?.amount ?? 0) : 0,
    },
  })

  revalidatePath('/refunds')
}

export async function useRefundAmount(refundId: string, amount: number) {
  await getAuth()

  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    select: { amount: true, usedAmount: true },
  })
  if (!refund) throw new Error('Refund not found')

  const newUsed = Number(refund.usedAmount) + amount
  const fullyUsed = newUsed >= Number(refund.amount)

  await prisma.refund.update({
    where: { id: refundId },
    data: {
      usedAmount: newUsed,
      isUsed:     fullyUsed,
      usedAt:     fullyUsed ? new Date() : null,
    },
  })

  revalidatePath('/refunds')
}

export async function deleteRefund(refundId: string) {
  await getAuth()

  await prisma.refund.update({
    where: { id: refundId },
    data: { isActive: false },
  })

  revalidatePath('/refunds')
}

export type RefundItem = {
  id: string
  seq: number
  provider: string
  amount: number
  currency: string
  status: 'pending' | 'received'
  isUsed: boolean
  usedAmount: number
  usedAt?: string
  referenceId?: string
  notes?: string
  expiresAt?: string
  receivedAt?: string
  code?: string
  link?: string
  imageUrl?: string
  createdAt: string
}
