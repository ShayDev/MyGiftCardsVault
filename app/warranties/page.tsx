import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import WarrantiesClient from '../../components/WarrantiesClient'
import type { WarrantyItem, WarrantyProviderOption } from './actions'
import { getWarrantyProviderOptions } from './actions'
import { decrypt, isEncrypted } from '../../lib/encrypt'
import { parseFamilySettings, getExpiringSoonDays } from '../../lib/familySettings'

export default async function Page() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true, family: { select: { settings: true } } },
  })

  if (!user?.familyId) redirect('/onboarding')

  const familySettings = parseFamilySettings(user.family?.settings ?? null)
  const expiringSoonDays = getExpiringSoonDays(familySettings)

  const warranties = await prisma.warranty.findMany({
    where: { familyId: user.familyId, isActive: true },
    include: {
      purchasedFrom: { select: { id: true, name: true, nameByCountry: true, phone: true, url: true } },
      warrantyCompany: { select: { id: true, name: true, nameByCountry: true, phone: true, url: true } },
    },
    orderBy: { expiresAt: { sort: 'asc', nulls: 'last' } },
  })

  function dec(val: string | null): string | undefined {
    if (!val) return undefined
    return isEncrypted(val) ? decrypt(val) : val
  }

  function toOption(row: { id: string; name: string | null; nameByCountry: string | null; phone: string | null; url: string | null }): WarrantyProviderOption {
    return {
      id: row.id,
      display: row.nameByCountry ?? row.name!,
      name: row.name,
      nameByCountry: row.nameByCountry,
      phone: row.phone ?? undefined,
      url: row.url ?? undefined,
    }
  }

  const payload: WarrantyItem[] = warranties.map((w) => ({
    id:              w.id,
    seq:             w.seq,
    productName:     w.productName,
    purchasedFrom:   toOption(w.purchasedFrom),
    branch:          w.branch ?? undefined,
    warrantyCompany: w.warrantyCompany ? toOption(w.warrantyCompany) : undefined,
    purchaseDate:    w.purchaseDate?.toISOString() ?? undefined,
    durationMonths:  w.durationMonths ?? undefined,
    expiresAt:       w.expiresAt?.toISOString() ?? undefined,
    purchasePrice:   w.purchasePrice ? Number(w.purchasePrice) : undefined,
    currency:        w.currency ?? undefined,
    referenceId:     w.referenceId ?? undefined,
    notes:           w.notes ?? undefined,
    link:            dec(w.link ?? null),
    imageUrl:        w.imageUrl ?? undefined,
    createdAt:       w.createdAt.toISOString(),
    createdBy:       w.createdBy,
  }))

  const providerOptions = await getWarrantyProviderOptions()

  return (
    <WarrantiesClient
      warranties={payload}
      providerOptions={providerOptions}
      expiringSoonDays={expiringSoonDays}
      currency={familySettings.currency}
    />
  )
}
