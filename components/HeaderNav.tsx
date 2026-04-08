'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'

const HIDDEN_PATHS = ['/sign-in', '/onboarding']

export default function HeaderNav() {
  const { isSignedIn } = useAuth()
  const pathname = usePathname()
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)

  if (!isSignedIn || HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null

  return (
    <Link
      href="/settings"
      className="min-h-[44px] flex items-center px-3 text-sm text-slate-500 hover:text-slate-900 transition-colors"
    >
      {t.settingsLink}
    </Link>
  )
}
