'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../lib/prisma'
import { encrypt } from '../lib/encrypt'
import { ensureProviderExists } from './providers/actions'
import { getBalancesForCards } from '../lib/balance'

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
  provider: z.string().optional(),
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').optional(),
  fullNumber: z.string().min(1).optional(),
  cvv: z.string().regex(/^\d{3,4}$/, 'Must be 3 or 4 digits').optional(),
  link: z.url().optional(),
  expiresAt: z.coerce.date().optional(),
  defaultBalance: z.number().positive('Default balance must be positive'),
  notes: z.string().optional(),
  isReloadable: z.boolean(),
}).refine((d) => d.last4 || d.link, { message: 'Last 4 digits or a link is required' })

export async function createCard(formData: FormData) {
  const { familyId, userId } = await getAuthenticatedFamilyId()

  const rawBalance = parseFloat(formData.get('defaultBalance') as string)
  const raw = {
    name: formData.get('name') as string,
    provider: (formData.get('provider') as string) || undefined,
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
      provider: data.provider ?? '',
      last4: data.last4 ?? null,
      fullNumber: data.fullNumber ? encrypt(data.fullNumber) : null,
      cvv:        data.cvv        ? encrypt(data.cvv)        : null,
      link:       data.link       ? encrypt(data.link)       : null,
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

  await ensureProviderExists('CARD', data.provider ?? '', familyId, userId).catch(() => {})

  revalidatePath('/cards')
}

const UpdateCardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().optional(),
  last4: z.string().regex(/^\d{4}$/, 'Must be exactly 4 digits').optional(),
  fullNumber: z.string().min(1).optional(),
  cvv: z.string().regex(/^\d{3,4}$/, 'Must be 3 or 4 digits').optional(),
  link: z.url().optional(),
  expiresAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  isReloadable: z.boolean(),
}).refine((d) => d.last4 || d.link, { message: 'Last 4 digits or a link is required' })

export async function updateCard(cardId: string, formData: FormData) {
  const { familyId, userId } = await getAuthenticatedFamilyId()

  const raw = {
    name: formData.get('name') as string,
    provider: (formData.get('provider') as string) || undefined,
    last4: (formData.get('last4') as string) || undefined,
    fullNumber: (formData.get('fullNumber') as string) || undefined,
    cvv: (formData.get('cvv') as string) || undefined,
    link: (formData.get('link') as string) || undefined,
    expiresAt: (formData.get('expiresAt') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
    isReloadable: formData.get('isReloadable') === 'true',
  }

  const data = UpdateCardSchema.parse(raw)

  await prisma.giftCard.update({
    where: { id: cardId, familyId },
    data: {
      name: data.name,
      provider: data.provider ?? '',
      last4: data.last4 ?? null,
      fullNumber: data.fullNumber ? encrypt(data.fullNumber) : null,
      cvv:        data.cvv        ? encrypt(data.cvv)        : null,
      link:       data.link       ? encrypt(data.link)       : null,
      expiresAt: data.expiresAt ?? null,
      notes: data.notes ?? null,
      isReloadable: data.isReloadable,
    },
  })

  await ensureProviderExists('CARD', data.provider ?? '', familyId, userId).catch(() => {})

  revalidatePath('/cards')
}

export async function deactivateCard(cardId: string) {
  const { familyId } = await getAuthenticatedFamilyId()

  await prisma.giftCard.update({
    where: { id: cardId, familyId },
    data: { isActive: false },
  })
  revalidatePath('/cards')
}

const CreateTransactionSchema = z.object({
  cardId: z.uuid(),
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
  const { familyId, userId } = await getAuthenticatedFamilyId()

  const data = CreateTransactionSchema.parse(input)

  const card = await prisma.giftCard.findFirst({
    where: { id: data.cardId, familyId },
    select: { id: true },
  })
  if (!card) throw new Error('Unauthorized')

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
  createdBy: string | null
}

export async function getCardTransactions(cardId: string): Promise<TransactionItem[]> {
  const { familyId } = await getAuthenticatedFamilyId()

  const card = await prisma.giftCard.findFirst({
    where: { id: cardId, familyId },
    select: { id: true },
  })
  if (!card) throw new Error('Unauthorized')

  const transactions = await prisma.transaction.findMany({
    where: { giftCardId: cardId },
    orderBy: { createdAt: 'desc' },
  })

  return transactions.map((tx: { id: string; type: 'SPEND' | 'RECHARGE'; amount: { toString(): string }; notes: string | null; createdAt: Date; createdBy: string | null }) => ({
    id: tx.id,
    type: tx.type,
    amount: parseFloat(tx.amount.toString()),
    notes: tx.notes,
    createdAt: tx.createdAt.toISOString(),
    createdBy: tx.createdBy,
  }))
}

// Master switch — false means attribution never shows anywhere and the DB is never queried for it.
const ENABLE_ADDED_BY_ATTRIBUTION = true
// Only relevant when the flag above is true — attribution only shows once the family has more than this many members.
const MIN_FAMILY_SIZE_FOR_ATTRIBUTION = 1

export async function getFamilyAttribution(): Promise<{ names: Record<string, string>; showAddedBy: boolean }> {
  if (!ENABLE_ADDED_BY_ATTRIBUTION) return { names: {}, showAddedBy: false }

  const { familyId } = await getAuthenticatedFamilyId()

  const users = await prisma.user.findMany({
    where: { familyId },
    select: { clerkId: true, name: true },
  })

  const names = Object.fromEntries(
    users.filter((u: { clerkId: string; name: string | null }) => u.name).map((u: { clerkId: string; name: string | null }) => [u.clerkId, u.name as string])
  )
  const showAddedBy = users.length > MIN_FAMILY_SIZE_FOR_ATTRIBUTION

  return { names, showAddedBy }
}

export type NavBadgeCategory = { count: number; hasExpired: boolean; hasExpiringSoon: boolean }
export type NavBadgeCounts = { cards: NavBadgeCategory; vouchers: NavBadgeCategory; clubs: NavBadgeCategory; refunds: NavBadgeCategory }

const EMPTY_NAV_BADGE_CATEGORY: NavBadgeCategory = { count: 0, hasExpired: false, hasExpiringSoon: false }

// On by default; flip to false if this ever proves costly at real family sizes — when off,
// no count query runs at all and every badge stays hidden.
const ENABLE_NAV_BADGES = true

// Same window as isExpiringSoon() in lib/date.ts — kept as a separate, Date-object
// based check here (rather than importing that string-based helper) since these
// rows already carry `expiresAt` as a Date, and this runs once over the whole
// batch against a single `now`/`soonThreshold` rather than per-row `new Date()`.
const EXPIRING_SOON_DAYS = 60

function hasExpiredItem(items: { expiresAt: Date | null }[], now: Date): boolean {
  return items.some((i) => i.expiresAt !== null && i.expiresAt < now)
}

function hasExpiringSoonItem(items: { expiresAt: Date | null }[], now: Date, soonThreshold: Date): boolean {
  return items.some((i) => i.expiresAt !== null && i.expiresAt >= now && i.expiresAt <= soonThreshold)
}

export async function getNavBadgeCounts(): Promise<NavBadgeCounts> {
  if (!ENABLE_NAV_BADGES) {
    return { cards: EMPTY_NAV_BADGE_CATEGORY, vouchers: EMPTY_NAV_BADGE_CATEGORY, clubs: EMPTY_NAV_BADGE_CATEGORY, refunds: EMPTY_NAV_BADGE_CATEGORY }
  }

  const { familyId } = await getAuthenticatedFamilyId()
  const now = new Date()
  const soonThreshold = new Date(now)
  soonThreshold.setDate(soonThreshold.getDate() + EXPIRING_SOON_DAYS)

  const [activeCards, vouchers, clubs, refunds] = await Promise.all([
    prisma.giftCard.findMany({ where: { familyId, isActive: true }, select: { id: true, expiresAt: true } }),
    prisma.voucher.findMany({ where: { familyId, isActive: true, isUsed: false }, select: { id: true, expiresAt: true } }),
    prisma.clubMember.findMany({ where: { familyId, isActive: true }, select: { id: true, expiresAt: true } }),
    prisma.refund.findMany({ where: { familyId, isActive: true, isUsed: false }, select: { id: true, expiresAt: true } }),
  ])

  const balances = await getBalancesForCards(activeCards.map((c) => c.id))
  const cardsWithBalance = activeCards.filter((c) => (balances.get(c.id)?.toNumber() ?? 0) > 0)

  const category = (items: { expiresAt: Date | null }[]): NavBadgeCategory => ({
    count: items.length,
    hasExpired: hasExpiredItem(items, now),
    hasExpiringSoon: hasExpiringSoonItem(items, now, soonThreshold),
  })

  return {
    cards: category(cardsWithBalance),
    vouchers: category(vouchers),
    clubs: category(clubs),
    refunds: category(refunds),
  }
}
