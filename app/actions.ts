'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import prisma from '../lib/prisma'

const CreateCardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().min(1, 'Provider is required'),
  last4: z.string().length(4).optional(),
  isReloadable: z.boolean(),
})

export async function createCard(formData: FormData) {
  const familyId = process.env.DEV_FAMILY_ID
  if (!familyId) throw new Error('No family ID configured')

  const raw = {
    name: formData.get('name') as string,
    provider: formData.get('provider') as string,
    last4: (formData.get('last4') as string) || undefined,
    isReloadable: formData.get('isReloadable') === 'true',
  }

  const data = CreateCardSchema.parse(raw)

  await prisma.giftCard.create({
    data: {
      familyId,
      name: data.name,
      provider: data.provider,
      last4: data.last4 ?? null,
      isReloadable: data.isReloadable,
    },
  })

  revalidatePath('/cards')
}

export async function deactivateCard(cardId: string) {
  await prisma.giftCard.update({
    where: { id: cardId },
    data: { isActive: false },
  })
  revalidatePath('/cards')
}

const CreateTransactionSchema = z.object({
  cardId: z.string().uuid(),
  type: z.enum(['SPEND', 'RECHARGE']),
  amount: z.number().positive('Amount must be positive'),
  notes: z.string().optional(),
})

export async function createTransaction(input: {
  cardId: string
  type: 'SPEND' | 'RECHARGE'
  amount: number
  notes?: string
}) {
  const data = CreateTransactionSchema.parse(input)

  await prisma.transaction.create({
    data: {
      giftCardId: data.cardId,
      type: data.type,
      amount: data.amount,
      notes: data.notes ?? null,
    },
  })

  revalidatePath('/cards')
}
