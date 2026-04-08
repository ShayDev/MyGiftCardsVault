'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'

export default function HeaderNav() {
  const { isSignedIn } = useAuth()
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)

  if (!isSignedIn) return null

  return (
    <Link
      href="/settings"
      className="min-h-[44px] flex items-center px-3 text-sm text-slate-500 hover:text-slate-900 transition-colors"
    >
      {t.settingsLink}
    </Link>
  )
}
