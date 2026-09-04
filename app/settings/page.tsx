import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import SettingsClient from './SettingsClient'
import { parseFamilySettings, getExpiringSoonDays } from '../../lib/familySettings'
import { isSuperadminEmail } from '../../lib/superadmin'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { family: true },
  })

  if (!user?.familyId || !user.family) redirect('/onboarding')

  const ownedFamily = await prisma.familyGroup.findFirst({
    where: { ownerId: user.id },
    select: { id: true, name: true },
  })

  const familySettings = parseFamilySettings(user.family.settings)
  const expiringSoonDays = getExpiringSoonDays(familySettings)

  return (
    <SettingsClient
      familyName={user.family.name}
      inviteCode={user.family.inviteCode}
      userName={user.name}
      email={user.email}
      ownedFamilyName={ownedFamily?.name ?? null}
      ownsCurrentFamily={ownedFamily?.id === user.familyId}
      expiringSoonDays={expiringSoonDays}
      currency={familySettings.currency}
      isSuperadmin={isSuperadminEmail(user.email)}
    />
  )
}
