'use server'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import prisma from '../../lib/prisma'

const switchSchema = z.object({
  familyName: z.string().min(1),
  inviteCode: z.string().min(1),
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

  await prisma.user.update({
    where: { clerkId: userId },
    data: { familyId: family.id, role: 'member' },
  })

  redirect('/cards')
}
