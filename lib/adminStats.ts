import { Prisma } from '@prisma/client'
import prisma from './prisma'
import { getBalancesForCards } from './balance'

// Aggregate queries behind the /admin dashboard. Every function takes an
// optional familyId — unused by the Phase 1 (superadmin, app-wide) callers, but
// there so the later family-owner view can reuse the same code path with a
// `WHERE "familyId" = ...` filter instead of a rewrite. See plans/admin-menu-dd.md.

export const ADMIN_ENTITIES = ['cards', 'vouchers', 'refunds', 'clubs', 'warranties'] as const
export type AdminEntity = (typeof ADMIN_ENTITIES)[number]

export type MonthlyRow = { month: string; entity: AdminEntity; count: number }

// Per entity: `active` follows the same rule as getNavBadgeCounts(); `inactive`
// is every other row (soft-deleted, used, zero-balance, or an expired warranty).
export type EntityTotal = { active: number; inactive: number }

export type ContentTotals = {
  cards: EntityTotal // active = isActive && balance > 0
  vouchers: EntityTotal // active = isActive && !isUsed
  refunds: EntityTotal // active = isActive && !isUsed
  clubs: EntityTotal // active = isActive
  warranties: EntityTotal // active = isActive && (expiresAt null || in the future)
  families: number
  users: number
}

export type FamilyRow = {
  id: string
  name: string
  members: number
  cards: number
  vouchers: number
  refunds: number
  clubs: number
  warranties: number
  createdAt: string
  lastActivityAt: string | null // max(UserLoginStat.lastVisitAt) across members
}

/**
 * Panel 2 — new records per calendar month for the last 12 months, one row per
 * (month, entity). One raw UNION ALL query rather than five groupBy round-trips.
 * Months with no records simply don't appear; the client pads to 12 buckets.
 */
export async function getRecordsCreatedByMonth(familyId?: string): Promise<MonthlyRow[]> {
  const since = new Date()
  since.setMonth(since.getMonth() - 11, 1)
  since.setHours(0, 0, 0, 0)

  const f = familyId ? Prisma.sql`AND "familyId" = ${familyId}` : Prisma.empty

  const rows = await prisma.$queryRaw<{ month: string; entity: string; count: bigint }[]>`
    SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, entity, COUNT(*) AS count
    FROM (
      SELECT "createdAt", 'cards'      AS entity FROM "GiftCard"   WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'vouchers'   FROM "Voucher"    WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'refunds'    FROM "Refund"     WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'clubs'      FROM "ClubMember" WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'warranties' FROM "Warranty"   WHERE "createdAt" >= ${since} ${f}
    ) t
    GROUP BY 1, 2
    ORDER BY 1, 2
  `

  return rows.map((r) => ({ month: r.month, entity: r.entity as AdminEntity, count: Number(r.count) }))
}

/** Panel 3 — current active counts per entity type, plus family/user totals. */
export async function getContentTotals(familyId?: string): Promise<ContentTotals> {
  const scope = familyId ? { familyId } : {}
  const now = new Date()

  const [
    allCards,
    activeCardRows,
    allVouchers,
    activeVouchers,
    allRefunds,
    activeRefunds,
    allClubs,
    activeClubs,
    warrantyRows,
    families,
    users,
  ] = await Promise.all([
    prisma.giftCard.count({ where: scope }),
    prisma.giftCard.findMany({ where: { ...scope, isActive: true }, select: { id: true } }),
    prisma.voucher.count({ where: scope }),
    prisma.voucher.count({ where: { ...scope, isActive: true, isUsed: false } }),
    prisma.refund.count({ where: scope }),
    prisma.refund.count({ where: { ...scope, isActive: true, isUsed: false } }),
    prisma.clubMember.count({ where: scope }),
    prisma.clubMember.count({ where: { ...scope, isActive: true } }),
    prisma.warranty.findMany({ where: scope, select: { isActive: true, expiresAt: true } }),
    familyId ? Promise.resolve(1) : prisma.familyGroup.count(),
    prisma.user.count({ where: familyId ? { familyId } : {} }),
  ])

  const balances = await getBalancesForCards(activeCardRows.map((c) => c.id))
  const activeCards = activeCardRows.filter((c) => (balances.get(c.id)?.toNumber() ?? 0) > 0).length
  const activeWarranties = warrantyRows.filter(
    (w) => w.isActive && (w.expiresAt === null || w.expiresAt >= now),
  ).length

  const split = (active: number, total: number): EntityTotal => ({
    active,
    inactive: Math.max(0, total - active),
  })

  return {
    cards: split(activeCards, allCards),
    vouchers: split(activeVouchers, allVouchers),
    refunds: split(activeRefunds, allRefunds),
    clubs: split(activeClubs, allClubs),
    warranties: split(activeWarranties, warrantyRows.length),
    families,
    users,
  }
}

/**
 * Families table — one row per family with isActive-only entity counts (no
 * per-row balance computation, unlike getContentTotals) and last-activity from
 * UserLoginStat. Counts come from groupBy passes joined in memory.
 */
export async function getFamiliesTable(): Promise<FamilyRow[]> {
  const families = await prisma.familyGroup.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, createdAt: true, users: { select: { clerkId: true } } },
  })

  const [cards, vouchers, refunds, clubs, warranties] = await Promise.all([
    prisma.giftCard.groupBy({ by: ['familyId'], where: { isActive: true }, _count: { _all: true } }),
    prisma.voucher.groupBy({ by: ['familyId'], where: { isActive: true }, _count: { _all: true } }),
    prisma.refund.groupBy({ by: ['familyId'], where: { isActive: true }, _count: { _all: true } }),
    prisma.clubMember.groupBy({ by: ['familyId'], where: { isActive: true }, _count: { _all: true } }),
    prisma.warranty.groupBy({ by: ['familyId'], where: { isActive: true }, _count: { _all: true } }),
  ])

  const toMap = (rows: { familyId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.familyId, r._count._all] as const))
  const cardMap = toMap(cards)
  const voucherMap = toMap(vouchers)
  const refundMap = toMap(refunds)
  const clubMap = toMap(clubs)
  const warrantyMap = toMap(warranties)

  const clerkIds = families.flatMap((fam) => fam.users.map((u) => u.clerkId))
  const stats = clerkIds.length
    ? await prisma.userLoginStat.findMany({
        where: { clerkId: { in: clerkIds } },
        select: { clerkId: true, lastVisitAt: true },
      })
    : []
  const lastVisitByClerk = new Map(stats.map((s) => [s.clerkId, s.lastVisitAt]))

  return families.map((fam) => {
    const visits = fam.users
      .map((u) => lastVisitByClerk.get(u.clerkId))
      .filter((d): d is Date => d instanceof Date)
    return {
      id: fam.id,
      name: fam.name,
      members: fam.users.length,
      cards: cardMap.get(fam.id) ?? 0,
      vouchers: voucherMap.get(fam.id) ?? 0,
      refunds: refundMap.get(fam.id) ?? 0,
      clubs: clubMap.get(fam.id) ?? 0,
      warranties: warrantyMap.get(fam.id) ?? 0,
      createdAt: fam.createdAt.toISOString(),
      lastActivityAt: visits.length
        ? new Date(Math.max(...visits.map((d) => d.getTime()))).toISOString()
        : null,
    }
  })
}
