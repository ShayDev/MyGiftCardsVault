import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import { getBalancesForCards } from '../../lib/balance'
import GiftCardsClient, { type CardWithBalance } from '../../components/GiftCardsClient'

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  const { familyId } = user

  const cards = await prisma.giftCard.findMany({
    where: { familyId, isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  const balances = await getBalancesForCards(cards.map((c) => c.id))

  const payload: CardWithBalance[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    last4: c.last4,
    fullNumber: c.fullNumber ?? undefined,
    cvv: c.cvv ?? undefined,
    expiresAt: c.expiresAt ?? undefined,
    notes: c.notes ?? undefined,
    isReloadable: c.isReloadable,
    createdAt: c.createdAt.toISOString(),
    balance: parseFloat(balances.get(c.id)?.toString() ?? '0'),
  }))

  return <GiftCardsClient cards={payload} />
}
