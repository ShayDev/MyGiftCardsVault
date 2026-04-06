'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../lib/prisma'

async function getAuthenticatedFamilyId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  return user.familyId
}

const CreateCardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().min(1, 'Provider is required'),
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits'),
  fullNumber: z.string().min(1).optional(),
  expiresAt: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/, 'Must be MMYY format').optional(),
  defaultBalance: z.number().positive('Default balance must be positive'),
  notes: z.string().optional(),
  isReloadable: z.boolean(),
})

export async function createCard(formData: FormData) {
  const familyId = await getAuthenticatedFamilyId()

  const rawBalance = parseFloat(formData.get('defaultBalance') as string)
  const raw = {
    name: formData.get('name') as string,
    provider: formData.get('provider') as string,
    last4: formData.get('last4') as string,
    fullNumber: (formData.get('fullNumber') as string) || undefined,
    expiresAt: (formData.get('expiresAt') as string) || undefined,
    defaultBalance: isNaN(rawBalance) ? 0 : rawBalance,
    notes: (formData.get('notes') as string) || undefined,
    isReloadable: formData.get('isReloadable') === 'true',
  }

  const data = CreateCardSchema.parse(raw)

  const card = await prisma.giftCard.create({
    data: {
      familyId,
      name: data.name,
      provider: data.provider,
      last4: data.last4,
      fullNumber: data.fullNumber ?? null,
      expiresAt: data.expiresAt ?? null,
      notes: data.notes ?? null,
      isReloadable: data.isReloadable,
    },
  })

  await prisma.transaction.create({
    data: {
      giftCardId: card.id,
      type: 'RECHARGE',
      amount: data.defaultBalance,
      notes: 'Initial balance',
    },
  })

  revalidatePath('/cards')
}

export async function deactivateCard(cardId: string) {
  await getAuthenticatedFamilyId()

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
  await getAuthenticatedFamilyId()

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
