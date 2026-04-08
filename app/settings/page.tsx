import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import SettingsClient from './SettingsClient'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { family: true },
  })

  if (!user?.familyId || !user.family) redirect('/onboarding')

  return (
    <SettingsClient
      familyName={user.family.name}
      inviteCode={user.family.inviteCode}
      userName={user.name}
      email={user.email}
    />
  )
}
