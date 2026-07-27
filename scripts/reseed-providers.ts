import prisma from '../lib/prisma'

const DATA: Record<string, { english: string; hebrew: string }[]> = {
  CARD: [
    { english: 'BuyMe', hebrew: 'ביי מי' },
    { english: 'HitechZone', hebrew: 'הייטק זון' },
    { english: 'Max', hebrew: 'מקס' },
    { english: 'Isracard', hebrew: 'ישראכרט' },
    { english: 'Cal', hebrew: 'כאל' },
    { english: 'Dream Card', hebrew: 'דרים כארד' },
    { english: 'Pais', hebrew: 'פיס' },
    { english: 'Hever', hebrew: 'חבר' },
    { english: 'Xtra', hebrew: 'אקסטרה' },
    { english: 'Raayonit', hebrew: 'רעיונית' },
    { english: 'Shufersal', hebrew: 'שופרסל' },
  ],
  VOUCHER: [
    { english: 'HitechZone', hebrew: 'הייטק זון' },
    { english: 'Pais', hebrew: 'פיס' },
    { english: 'Hever', hebrew: 'חבר' },
  ],
  REFUND: [
    { english: 'Zara', hebrew: 'זארה' },
    { english: 'IKEA', hebrew: 'איקאה' },
    { english: 'Fox', hebrew: 'פוקס' },
    { english: 'Castro', hebrew: 'קסטרו' },
  ],
  CLUB: [
    { english: 'Fox', hebrew: 'פוקס' },
    { english: 'Castro', hebrew: 'קסטרו' },
    { english: 'Zara', hebrew: 'זארה' },
    { english: 'Tzomet Sfarim', hebrew: 'צומת ספרים' },
    { english: 'Steimatzky', hebrew: 'סטימצקי' },
  ],
}

async function main() {
  // Replace the previous default (global) list — family-added custom rows
  // (familyId != '0') are left untouched.
  const deleted = await prisma.provider.deleteMany({ where: { familyId: '0' } })
  console.log('removed old global rows:', deleted.count)

  const data = Object.entries(DATA).flatMap(([type, items]) =>
    items.map(({ english, hebrew }) => ({
      type,
      name: english,
      nameByCountry: hebrew,
      country: 'IL',
      familyId: '0',
    })),
  )

  await prisma.provider.createMany({ data })

  const rows = await prisma.provider.findMany({ where: { familyId: '0' }, select: { type: true } })
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1
    return acc
  }, {})
  console.log('done — global providers by type:', counts)
}

main().catch(console.error)
