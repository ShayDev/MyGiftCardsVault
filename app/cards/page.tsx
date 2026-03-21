import prisma from '../../lib/prisma'
import { getBalancesForCards } from '../../lib/balance'
import GiftCardsClient, { type CardWithBalance } from '../../components/GiftCardsClient'

export default async function Page() {
  const familyId = process.env.DEV_FAMILY_ID ?? null

  if (!familyId) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="font-semibold text-slate-800">No family selected</h2>
        <p className="text-sm text-slate-500 mt-1">Set DEV_FAMILY_ID in your .env.local for local dev.</p>
      </div>
    )
  }

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
    expiresAt: c.expiresAt ?? undefined,
    notes: c.notes ?? undefined,
    isReloadable: c.isReloadable,
    createdAt: c.createdAt.toISOString(),
    balance: parseFloat(balances.get(c.id)?.toString() ?? '0'),
  }))

  return <GiftCardsClient cards={payload} />
}
