'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../../lib/prisma'
import { encrypt } from '../../lib/encrypt'

async function getAuth(): Promise<{ familyId: string; userId: string }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })

  if (!user?.familyId) redirect('/onboarding')

  return { familyId: user.familyId, userId }
}

// Sentinel familyId meaning "shared / global", same convention as Provider.familyId.
const SHARED_FAMILY_ID = '0'

// Hardcoded until FamilyGroup has a real country field — same rationale/comment
// as DEFAULT_COUNTRY in app/providers/actions.ts, duplicated here rather than
// imported since that constant is private to that file.
const DEFAULT_COUNTRY = 'IL'

// Checks "is it English", not "is it Hebrew" — anything that isn't plain ASCII
// falls into the localized bucket by default. Duplicated from
// app/providers/actions.ts's private helper of the same name/behavior.
function isEnglishText(value: string): boolean {
  return [...value].every((ch) => (ch.codePointAt(0) ?? 0) <= 0x7f)
}

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// `display` is what's shown/searched in WarrantyProviderCombobox and what a
// newly-typed entry echoes back as — mirrors ProviderOption's shape.
export type WarrantyProviderOption = {
  id: string
  display: string
  name: string | null
  nameByCountry: string | null
  phone?: string
  url?: string
}

export async function getWarrantyProviderOptions(): Promise<WarrantyProviderOption[]> {
  const { familyId } = await getAuth()
  const rows = await prisma.warrantyProvider.findMany({
    where: { country: DEFAULT_COUNTRY, familyId: { in: [SHARED_FAMILY_ID, familyId] } },
    select: { id: true, name: true, nameByCountry: true, phone: true, url: true },
  })
  // Dedup by displayed name (case-insensitive) — a family's own entry can
  // shadow a same-named global seed row without showing both in the list.
  const seen = new Map<string, WarrantyProviderOption>()
  for (const r of rows) {
    const display = r.nameByCountry ?? r.name!
    const key = display.toLowerCase()
    if (!seen.has(key)) {
      seen.set(key, { id: r.id, display, name: r.name, nameByCountry: r.nameByCountry, phone: r.phone ?? undefined, url: r.url ?? undefined })
    }
  }
  return [...seen.values()].sort((a, b) => a.display.localeCompare(b.display))
}

// Resolves a WarrantyProviderCombobox submission (an existing id, or a typed
// name + optional phone/url) into a real WarrantyProvider id, creating a row
// when the user typed something new. Runs synchronously before the Warranty
// write — unlike Provider's ensureProviderExists (fire-and-forget, since
// Refund.provider is a plain string column), purchasedFromId/warrantyCompanyId
// are real FKs that must reference an existing row first. See
// plans/warranty-dd.md §4.
async function ensureWarrantyProviderExists(
  input: { id?: string; name?: string; phone?: string; url?: string },
  familyId: string,
  userId: string,
): Promise<string | null> {
  if (input.id) return input.id
  const trimmed = input.name?.trim()
  if (!trimmed) return null

  const existing = await prisma.warrantyProvider.findFirst({
    where: {
      country: DEFAULT_COUNTRY,
      familyId: { in: [SHARED_FAMILY_ID, familyId] },
      OR: [
        { name: { equals: trimmed, mode: 'insensitive' } },
        { nameByCountry: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  })
  if (existing) return existing.id

  // No translation available for a custom entry — store the typed value in
  // whichever column matches its script, leave the other null. Same routing
  // as Provider's ensureProviderExists.
  const isEnglish = isEnglishText(trimmed)
  const created = await prisma.warrantyProvider.create({
    data: {
      familyId,
      name: isEnglish ? capitalizeFirst(trimmed) : null,
      nameByCountry: isEnglish ? null : trimmed,
      country: DEFAULT_COUNTRY,
      phone: input.phone?.trim() || null,
      url: input.url?.trim() || null,
      createdBy: userId,
    },
  })
  return created.id
}

const WarrantyFieldsSchema = z.object({
  productName:          z.string().min(1, 'Product name is required'),
  purchasedFromId:      z.string().optional(),
  purchasedFromName:    z.string().optional(),
  purchasedFromPhone:   z.string().optional(),
  purchasedFromUrl:     z.string().url().optional(),
  branch:               z.string().optional(),
  warrantyCompanyId:    z.string().optional(),
  warrantyCompanyName:  z.string().optional(),
  warrantyCompanyPhone: z.string().optional(),
  warrantyCompanyUrl:   z.string().url().optional(),
  purchaseDate:         z.coerce.date().optional(),
  durationMonths:       z.coerce.number().int().positive().optional(),
  expiresAt:            z.coerce.date().optional(),
  referenceId:          z.string().optional(),
  notes:                z.string().optional(),
  link:                 z.string().url().optional(),
}).refine((v) => Boolean(v.purchasedFromId) || Boolean(v.purchasedFromName?.trim()), {
  message: 'Where it was purchased is required',
  path: ['purchasedFromName'],
})

function readWarrantyFormData(formData: FormData) {
  return {
    productName:          formData.get('productName') as string,
    purchasedFromId:      (formData.get('purchasedFromId') as string) || undefined,
    purchasedFromName:    (formData.get('purchasedFromName') as string) || undefined,
    purchasedFromPhone:   (formData.get('purchasedFromPhone') as string) || undefined,
    purchasedFromUrl:     (formData.get('purchasedFromUrl') as string) || undefined,
    branch:               (formData.get('branch') as string) || undefined,
    warrantyCompanyId:    (formData.get('warrantyCompanyId') as string) || undefined,
    warrantyCompanyName:  (formData.get('warrantyCompanyName') as string) || undefined,
    warrantyCompanyPhone: (formData.get('warrantyCompanyPhone') as string) || undefined,
    warrantyCompanyUrl:   (formData.get('warrantyCompanyUrl') as string) || undefined,
    purchaseDate:         (formData.get('purchaseDate') as string) || undefined,
    durationMonths:       (formData.get('durationMonths') as string) || undefined,
    expiresAt:            (formData.get('expiresAt') as string) || undefined,
    referenceId:          (formData.get('referenceId') as string) || undefined,
    notes:                (formData.get('notes') as string) || undefined,
    link:                 (formData.get('link') as string) || undefined,
  }
}

export async function createWarranty(formData: FormData) {
  const { familyId, userId } = await getAuth()

  const data = WarrantyFieldsSchema.parse(readWarrantyFormData(formData))
  const imageUrl = (formData.get('imageUrl') as string) || undefined

  const purchasedFromId = await ensureWarrantyProviderExists(
    { id: data.purchasedFromId, name: data.purchasedFromName, phone: data.purchasedFromPhone, url: data.purchasedFromUrl },
    familyId,
    userId,
  )
  if (!purchasedFromId) throw new Error('Where it was purchased is required')

  const warrantyCompanyId = await ensureWarrantyProviderExists(
    { id: data.warrantyCompanyId, name: data.warrantyCompanyName, phone: data.warrantyCompanyPhone, url: data.warrantyCompanyUrl },
    familyId,
    userId,
  )

  await prisma.warranty.create({
    data: {
      familyId,
      productName: data.productName,
      purchasedFromId,
      branch: data.branch ?? null,
      warrantyCompanyId,
      purchaseDate: data.purchaseDate ?? null,
      durationMonths: data.durationMonths ?? null,
      expiresAt: data.expiresAt ?? null,
      referenceId: data.referenceId ?? null,
      notes: data.notes ?? null,
      link: data.link ? encrypt(data.link) : null,
      imageUrl: imageUrl ?? null,
      createdBy: userId,
    },
  })

  revalidatePath('/warranties')
}

// Edit modal never touches imageUrl — same limitation as Refund's own
// EditRefundModal (no image field there either), so the image set at
// creation time is permanent.
export async function updateWarranty(warrantyId: string, formData: FormData) {
  const { familyId, userId } = await getAuth()

  const data = WarrantyFieldsSchema.parse(readWarrantyFormData(formData))

  const purchasedFromId = await ensureWarrantyProviderExists(
    { id: data.purchasedFromId, name: data.purchasedFromName, phone: data.purchasedFromPhone, url: data.purchasedFromUrl },
    familyId,
    userId,
  )
  if (!purchasedFromId) throw new Error('Where it was purchased is required')

  const warrantyCompanyId = await ensureWarrantyProviderExists(
    { id: data.warrantyCompanyId, name: data.warrantyCompanyName, phone: data.warrantyCompanyPhone, url: data.warrantyCompanyUrl },
    familyId,
    userId,
  )

  await prisma.warranty.update({
    where: { id: warrantyId, familyId },
    data: {
      productName: data.productName,
      purchasedFromId,
      branch: data.branch ?? null,
      warrantyCompanyId,
      purchaseDate: data.purchaseDate ?? null,
      durationMonths: data.durationMonths ?? null,
      expiresAt: data.expiresAt ?? null,
      referenceId: data.referenceId ?? null,
      notes: data.notes ?? null,
      link: data.link ? encrypt(data.link) : null,
    },
  })

  revalidatePath('/warranties')
}

export async function deleteWarranty(warrantyId: string) {
  const { familyId } = await getAuth()

  await prisma.warranty.update({
    where: { id: warrantyId, familyId },
    data: { isActive: false },
  })

  revalidatePath('/warranties')
}

export type WarrantyItem = {
  id: string
  seq: number
  productName: string
  purchasedFrom: WarrantyProviderOption
  branch?: string
  warrantyCompany?: WarrantyProviderOption
  purchaseDate?: string
  durationMonths?: number
  expiresAt?: string
  referenceId?: string
  notes?: string
  link?: string
  imageUrl?: string
  createdAt: string
  createdBy?: string | null
}
