'use server'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../../lib/prisma'
import { generateInviteCode } from '../../lib/inviteCode'

const switchSchema = z.object({
  familyName: z.string().min(1),
  inviteCode: z.string().min(1),
})

const createSchema = z.object({
  familyName: z.string().min(1).max(50),
})

export async function switchFamily(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const parsed = switchSchema.safeParse({
    familyName: formData.get('familyName'),
    inviteCode: formData.get('inviteCode'),
  })
  if (!parsed.success) return { error: 'Please fill in all fields.' }

  const family = await prisma.familyGroup.findFirst({
    where: { name: parsed.data.familyName.toUpperCase(), inviteCode: parsed.data.inviteCode },
  })
  if (!family) return { error: 'Family not found. Check the name and code.' }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
  if (!dbUser) redirect('/sign-in')

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { familyId: family.id, role: family.ownerId === dbUser.id ? 'owner' : 'member' },
  })

  redirect('/cards')
}

export async function createNewFamily(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
  if (!dbUser) redirect('/sign-in')

  const alreadyOwned = await prisma.familyGroup.findFirst({ where: { ownerId: dbUser.id } })
  if (alreadyOwned) return { error: 'You already have a family — switch back to it instead.' }

  const parsed = createSchema.safeParse({
    familyName: formData.get('familyName'),
  })
  if (!parsed.success) return { error: 'Invalid family name.' }

  await prisma.$transaction(async (tx) => {
    const family = await tx.familyGroup.create({
      data: {
        name: parsed.data.familyName.toUpperCase(),
        inviteCode: generateInviteCode(),
        ownerId: dbUser.id,
      },
    })
    await tx.user.update({
      where: { id: dbUser.id },
      data: { familyId: family.id, role: 'owner' },
    })
  })

  redirect('/cards')
}

export async function switchToOwnFamily() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
  if (!dbUser) redirect('/sign-in')

  const family = await prisma.familyGroup.findFirst({ where: { ownerId: dbUser.id } })
  if (!family) return { error: 'You have not created a family yet.' }

  await prisma.user.update({
    where: { id: dbUser.id },
    data: { familyId: family.id, role: 'owner' },
  })

  redirect('/cards')
}
