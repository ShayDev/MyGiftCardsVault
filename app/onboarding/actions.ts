'use server'

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import prisma from '../../lib/prisma'

const createSchema = z.object({
  familyName: z.string().min(1).max(50),
})

const joinSchema = z.object({
  familyName: z.string().min(1),
  inviteCode: z.string().min(1),
})

export async function createFamily(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const existing = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })
  if (existing?.familyId) redirect('/cards')

  const parsed = createSchema.safeParse({
    familyName: formData.get('familyName'),
  })
  if (!parsed.success) return { error: 'Invalid family name.' }

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ''
  const name = clerkUser?.fullName ?? null

  await prisma.$transaction(async (tx) => {
    const family = await tx.familyGroup.create({
      data: {
        name: parsed.data.familyName.toUpperCase(),
        inviteCode: nanoid(12),
      },
    })
    await tx.user.upsert({
      where: { clerkId: userId },
      update: { familyId: family.id },
      create: { clerkId: userId, email, name, familyId: family.id, role: 'owner' },
    })
  })

  redirect('/cards')
}

export async function joinFamily(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const existing = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })
  if (existing?.familyId) redirect('/cards')

  const parsed = joinSchema.safeParse({
    familyName: formData.get('familyName'),
    inviteCode: formData.get('inviteCode'),
  })
  if (!parsed.success) return { error: 'Please fill in all fields.' }

  const family = await prisma.familyGroup.findFirst({
    where: { name: parsed.data.familyName.toUpperCase(), inviteCode: parsed.data.inviteCode },
  })

  if (!family) return { error: 'Family not found. Check the name and code.' }

  const clerkUser = await currentUser()
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? ''
  const name = clerkUser?.fullName ?? null

  await prisma.user.upsert({
    where: { clerkId: userId },
    update: { familyId: family.id },
    create: { clerkId: userId, email, name, familyId: family.id, role: 'member' },
  })

  redirect('/cards')
}
