'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../lib/prisma'

async function getAuthenticatedFamilyId(): Promise<{ familyId: string; userId: string }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  return { familyId: user.familyId, userId }
}

const CreateCardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().min(1, 'Provider is required'),
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').optional(),
  fullNumber: z.string().min(1).optional(),
  cvv: z.string().regex(/^\d{3,4}$/, 'Must be 3 or 4 digits').optional(),
  link: z.string().url('Must be a valid URL').optional(),
  expiresAt: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/, 'Must be MMYY format').optional(),
  defaultBalance: z.number().positive('Default balance must be positive'),
  notes: z.string().optional(),
  isReloadable: z.boolean(),
}).refine((d) => d.last4 || d.link, { message: 'Last 4 digits or a link is required' })

export async function createCard(formData: FormData) {
  const { familyId, userId } = await getAuthenticatedFamilyId()

  const rawBalance = parseFloat(formData.get('defaultBalance') as string)
  const raw = {
    name: formData.get('name') as string,
    provider: formData.get('provider') as string,
    last4: formData.get('last4') as string,
    fullNumber: (formData.get('fullNumber') as string) || undefined,
    cvv: (formData.get('cvv') as string) || undefined,
    link: (formData.get('link') as string) || undefined,
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
      last4: data.last4 ?? null,
      fullNumber: data.fullNumber ?? null,
      cvv: data.cvv ?? null,
      link: data.link ?? null,
      expiresAt: data.expiresAt ?? null,
      notes: data.notes ?? null,
      isReloadable: data.isReloadable,
      createdBy: userId,
    },
  })

  await prisma.transaction.create({
    data: {
      giftCardId: card.id,
      type: 'RECHARGE',
      amount: data.defaultBalance,
      notes: 'Initial balance',
      createdBy: userId,
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
  const { userId } = await getAuthenticatedFamilyId()

  const data = CreateTransactionSchema.parse(input)

  await prisma.transaction.create({
    data: {
      giftCardId: data.cardId,
      type: data.type,
      amount: data.amount,
      notes: data.notes ?? null,
      createdBy: userId,
    },
  })

  revalidatePath('/cards')
}

export type TransactionItem = {
  id: string
  type: 'SPEND' | 'RECHARGE'
  amount: number
  notes: string | null
  createdAt: string
}

export async function getCardTransactions(cardId: string): Promise<TransactionItem[]> {
  await getAuthenticatedFamilyId()

  const transactions = await prisma.transaction.findMany({
    where: { giftCardId: cardId },
    orderBy: { createdAt: 'desc' },
  })

  return transactions.map((tx: { id: string; type: 'SPEND' | 'RECHARGE'; amount: { toString(): string }; notes: string | null; createdAt: Date }) => ({
    id: tx.id,
    type: tx.type,
    amount: parseFloat(tx.amount.toString()),
    notes: tx.notes,
    createdAt: tx.createdAt.toISOString(),
  }))
}
