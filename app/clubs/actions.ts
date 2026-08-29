'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../../lib/prisma'
import { encrypt } from '../../lib/encrypt'
import { ensureProviderExists } from '../providers/actions'
import { parseFamilySettings, getExpiringSoonDays } from '../../lib/familySettings'
import { parseAction } from '../../lib/actionError'

async function getAuth(): Promise<{ familyId: string; userId: string; expiringSoonDays: number }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true, family: { select: { settings: true } } },
  })

  if (!user?.familyId) redirect('/onboarding')

  const expiringSoonDays = getExpiringSoonDays(parseFamilySettings(user.family?.settings ?? null))

  return { familyId: user.familyId, userId, expiringSoonDays }
}

const CreateClubSchema = z.object({
  name:      z.string().min(1, 'Name is required'),
  provider:  z.string().optional(),
  memberId:  z.string().min(1, 'Member ID is required'),
  ownerName: z.string().optional(),
  idType:    z.enum(['id_number', 'phone', 'member_number', 'email', 'barcode']),
  expiresAt: z.coerce.date().optional(),
  notes:     z.string().optional(),
})

export async function createClub(formData: FormData) {
  const { familyId, userId } = await getAuth()

  const raw = {
    name:      formData.get('name') as string,
    provider:  (formData.get('provider') as string) || undefined,
    memberId:  formData.get('memberId') as string,
    ownerName: (formData.get('ownerName') as string) || undefined,
    idType:    formData.get('idType') as string,
    expiresAt: (formData.get('expiresAt') as string) || undefined,
    notes:     (formData.get('notes') as string) || undefined,
  }

  const data = parseAction(CreateClubSchema, raw)

  await prisma.clubMember.create({
    data: {
      familyId,
      name:      data.name,
      provider:  data.provider ?? '',
      memberId:  data.memberId ? encrypt(data.memberId) : null,
      ownerName: data.ownerName ?? null,
      idType:    data.idType ?? null,
      expiresAt: data.expiresAt ?? null,
      notes:     data.notes ?? null,
      createdBy: userId,
    },
  })

  await ensureProviderExists('CLUB', data.provider ?? '', familyId, userId).catch(() => {})

  revalidatePath('/clubs')
}

export async function updateClub(clubId: string, formData: FormData) {
  const { familyId, userId } = await getAuth()

  const raw = {
    name:      formData.get('name') as string,
    provider:  (formData.get('provider') as string) || undefined,
    memberId:  formData.get('memberId') as string,
    ownerName: (formData.get('ownerName') as string) || undefined,
    idType:    formData.get('idType') as string,
    expiresAt: (formData.get('expiresAt') as string) || undefined,
    notes:     (formData.get('notes') as string) || undefined,
  }

  const data = parseAction(CreateClubSchema, raw)

  await prisma.clubMember.update({
    where: { id: clubId, familyId },
    data: {
      name:      data.name,
      provider:  data.provider ?? '',
      memberId:  data.memberId ? encrypt(data.memberId) : null,
      ownerName: data.ownerName ?? null,
      idType:    data.idType ?? null,
      expiresAt: data.expiresAt ?? null,
      notes:     data.notes ?? null,
    },
  })

  await ensureProviderExists('CLUB', data.provider ?? '', familyId, userId).catch(() => {})

  revalidatePath('/clubs')
}

export async function deleteClub(clubId: string) {
  const { familyId } = await getAuth()

  await prisma.clubMember.update({
    where: { id: clubId, familyId },
    data: { isActive: false },
  })

  revalidatePath('/clubs')
}

export type ClubItem = {
  id: string
  seq: number
  name: string
  provider: string
  memberId?: string
  ownerName?: string
  idType?: 'id_number' | 'phone' | 'member_number' | 'email' | 'barcode'
  expiresAt?: string
  notes?: string
  createdAt: string
  createdBy?: string | null
}
