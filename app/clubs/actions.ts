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

const CreateClubSchema = z.object({
  name:      z.string().min(1, 'Name is required'),
  provider:  z.string().optional(),
  memberId:  z.string().min(1, 'Member ID is required'),
  ownerName: z.string().optional(),
  idType:    z.enum(['id_number', 'phone', 'member_number', 'email', 'barcode']),
  expiresAt: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/, 'Must be MMYY format').optional(),
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

  const data = CreateClubSchema.parse(raw)

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
}
