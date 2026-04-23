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

const CreateVoucherSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  provider: z.string().min(1, 'Provider is required'),
  code: z.string().optional(),
  link: z.string().url('Must be a valid URL').optional(),
  value: z.number().positive().optional(),
  expiresAt: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/, 'Must be MMYY format').optional(),
  notes: z.string().optional(),
}).refine((d) => d.code || d.link, { message: 'A code or link is required' })

export async function createVoucher(formData: FormData) {
  const { familyId, userId } = await getAuth()

  const rawValue = formData.get('value') as string
  const parsedValue = rawValue ? parseFloat(rawValue) : undefined

  const raw = {
    name: formData.get('name') as string,
    provider: formData.get('provider') as string,
    code: (formData.get('code') as string) || undefined,
    link: (formData.get('link') as string) || undefined,
    value: parsedValue && !isNaN(parsedValue) ? parsedValue : undefined,
    expiresAt: (formData.get('expiresAt') as string) || undefined,
    notes: (formData.get('notes') as string) || undefined,
  }

  const data = CreateVoucherSchema.parse(raw)

  await prisma.voucher.create({
    data: {
      familyId,
      name: data.name,
      provider: data.provider,
      code: data.code ? encrypt(data.code) : null,
      link: data.link ? encrypt(data.link) : null,
      value: data.value ?? null,
      expiresAt: data.expiresAt ?? null,
      notes: data.notes ?? null,
      createdBy: userId,
    },
  })

  revalidatePath('/vouchers')
}

export async function markVoucherUsed(voucherId: string, isUsed: boolean) {
  const { userId } = await getAuth()

  await prisma.voucher.update({
    where: { id: voucherId },
    data: {
      isUsed,
      usedAt: isUsed ? new Date() : null,
      usedBy: isUsed ? userId : null,
    },
  })

  revalidatePath('/vouchers')
}

export async function deleteVoucher(voucherId: string) {
  await getAuth()

  await prisma.voucher.update({
    where: { id: voucherId },
    data: { isActive: false },
  })

  revalidatePath('/vouchers')
}

export type VoucherItem = {
  id: string
  seq: number
  name: string
  provider: string
  code?: string
  link?: string
  value?: number
  expiresAt?: string
  notes?: string
  isUsed: boolean
  usedAt?: string
  usedBy?: string
  createdAt: string
  createdBy?: string
}
