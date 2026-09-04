import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from './prisma'

// Phase 1 access model for /admin — a hardcoded operator allowlist, checked
// against User.email. Deliberately not tied to User.role (which is owner/member
// for the family-ownership feature — superadmin is orthogonal). A comma-separated
// SUPERADMIN_EMAILS env var is merged in if present, so prod can add an admin
// without a code change, but the hardcoded entry is the baseline so a missing/
// mistyped env var can never lock everyone out. See plans/admin-menu-hld.md.
const HARDCODED_SUPERADMINS = ['shaynadav@gmail.com']

function allowlist(): string[] {
  const fromEnv = (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...HARDCODED_SUPERADMINS, ...fromEnv])]
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  return !!email && allowlist().includes(email.toLowerCase())
}

/**
 * For admin server components / actions. Returns the db user row, or redirects
 * away if the caller isn't a superadmin. Redirects to /cards (not a 403) so a
 * non-admin hitting the URL just lands back in the app with no signal that
 * /admin exists.
 */
export async function requireSuperadmin() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, clerkId: true, email: true, name: true },
  })

  if (!user || !isSuperadminEmail(user.email)) redirect('/cards')
  return user
}
