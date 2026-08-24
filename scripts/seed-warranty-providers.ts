import prisma from '../lib/prisma'

// Names only, deliberately — see plans/warranty-dd.md §1 "Seed data" caution.
// A wrong phone/url actively misdirects a real warranty claim, worse than
// leaving it blank, so those columns stay NULL here unless someone manually
// verifies each one against the manufacturer's real current support page.
// name/nameByCountry pairing mirrors migrate-provider.ts's seed convention.
const SEED_NAMES: [name: string, nameByCountry: string][] = [
  ['Samsung', 'סמסונג'],
  ['LG', 'אל ג׳י'],
  ['Bosch', 'בוש'],
  ['Electrolux', 'אלקטרולוקס'],
  ['Whirlpool', 'וורפול'],
  ['Miele', 'מילה'],
  ['Apple', 'אפל'],
  ['Sony', 'סוני'],
  ['Philips', 'פיליפס'],
  ['IKEA', 'איקאה'],
  ['Shufersal Electric', 'שופרסל אלקטריק'],
  ['KSP', 'קיי אס פי'],
]

async function main() {
  for (const [name, nameByCountry] of SEED_NAMES) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "WarrantyProvider" ("familyId", "name", "nameByCountry") VALUES ('0', $1, $2)
       ON CONFLICT DO NOTHING`,
      name,
      nameByCountry,
    )
  }

  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) FROM "WarrantyProvider" WHERE "familyId" = '0'`,
  )
  console.log('done — global WarrantyProvider rows:', rows[0].count.toString())
}

main().catch(console.error)
