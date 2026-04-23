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
  currency:    z.string().length(3),
  referenceId: z.string().optional(),
  notes:       z.string().optional(),
  expectedBy:  z.string().optional(),
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
    referenceId: (formData.get('referenceId') as string) || undefined,
    notes:       (formData.get('notes') as string) || undefined,
    expectedBy:  (formData.get('expectedBy') as string) || undefined,
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
      referenceId: data.referenceId ?? null,
      notes:       data.notes ?? null,
      expectedBy:  data.expectedBy ? new Date(data.expectedBy) : null,
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
  referenceId?: string
  notes?: string
  expectedBy?: string
  receivedAt?: string
  code?: string
  link?: string
  imageUrl?: string
  createdAt: string
}
