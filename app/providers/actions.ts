import prisma from '../../lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import type { ProviderType, ProviderOption } from '../../lib/providerTypes'

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

// Hardcoded until FamilyGroup has a real country field — the whole app is
// Israel-only today, so this isn't a simplification that loses anything yet.
const DEFAULT_COUNTRY = 'IL'

// Sentinel familyId meaning "shared / global" — not a real FamilyGroup.id.
const SHARED_FAMILY_ID = '0'

// Checks "is it English", not "is it Hebrew" — anything that isn't plain
// ASCII (Hebrew, mixed input, any other script) falls into the localized
// bucket by default rather than being miscategorized as canonical/English.
function isEnglishText(value: string): boolean {
  return [...value].every((ch) => (ch.codePointAt(0) ?? 0) <= 0x7f)
}

// Keeps custom English entries visually consistent with the seeded list
// (Amazon, Target, …) rather than however the user happened to type it.
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export async function getProviderOptions(type: ProviderType): Promise<ProviderOption[]> {
  const { familyId } = await getAuthenticatedFamilyId()
  const rows = await prisma.provider.findMany({
    where: { type, country: DEFAULT_COUNTRY, familyId: { in: [SHARED_FAMILY_ID, familyId] } },
    select: { name: true, nameByCountry: true },
  })
  // Sort by the displayed value, not raw `name` — `name` can be null for
  // non-English custom entries, and Prisma can't orderBy a COALESCE expression.
  return rows
    .map((r) => ({ display: r.nameByCountry ?? r.name!, name: r.name, nameByCountry: r.nameByCountry }))
    .sort((a, b) => a.display.localeCompare(b.display))
}

// Called from within card/voucher/club/refund server actions after a
// successful create/update — never directly from the client.
export async function ensureProviderExists(
  type: ProviderType,
  displayName: string,
  familyId: string,
  userId: string,
) {
  const trimmed = displayName.trim()
  if (!trimmed) return

  const existing = await prisma.provider.findFirst({
    where: {
      type,
      country: DEFAULT_COUNTRY,
      familyId: { in: [SHARED_FAMILY_ID, familyId] },
      OR: [
        { name: { equals: trimmed, mode: 'insensitive' } },
        { nameByCountry: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  })
  if (existing) return

  // No translation available for a custom entry — store the typed value in
  // whichever column matches its script, leave the other null.
  const isEnglish = isEnglishText(trimmed)
  await prisma.provider.create({
    data: {
      type,
      name: isEnglish ? capitalizeFirst(trimmed) : null,
      nameByCountry: isEnglish ? null : trimmed,
      country: DEFAULT_COUNTRY,
      familyId,
      createdBy: userId,
    },
  })
}
