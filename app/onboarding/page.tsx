import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from '../../lib/prisma'
import OnboardingClient from './OnboardingClient'

export default async function OnboardingPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Already has a family → skip onboarding
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true },
  })
  if (user?.familyId) redirect('/cards')

  return <OnboardingClient />
}
