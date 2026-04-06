import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import prisma from '../../lib/prisma'
import CopyButton from './CopyButton'

export default async function SettingsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { family: true },
  })

  if (!user?.familyId || !user.family) redirect('/onboarding')

  const { family } = user

  return (
    <div className="max-w-md mx-auto py-8 px-4">
      <h1 className="text-xl font-bold text-slate-900 mb-6">Settings</h1>

      {/* Family info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Your Family</h2>
        <div className="mb-4">
          <p className="text-xs text-slate-400 mb-1">Family name</p>
          <p className="font-mono font-semibold text-slate-900 text-lg">{family.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Invite code</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 text-lg tracking-widest">{family.inviteCode}</p>
            <CopyButton text={family.inviteCode} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Share your family name + code with family members so they can join.
          </p>
        </div>
      </div>

      {/* Account */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Account</h2>
        <div className="flex items-center gap-3">
          <UserButton />
          <div>
            <p className="text-sm font-medium text-slate-900">{user.name ?? user.email}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
