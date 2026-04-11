'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'

const HIDDEN_PATHS = ['/sign-in', '/onboarding']

export default function BottomNav() {
  const { isSignedIn } = useAuth()
  const pathname = usePathname()
  const t = getT(useLanguageStore((s) => s.locale))

  if (!isSignedIn || HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null

  const tabs = [
    {
      href: '/cards',
      label: t.cardsTab,
      active: pathname.startsWith('/cards'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      href: '/vouchers',
      label: t.vouchersTab,
      active: pathname.startsWith('/vouchers'),
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      ),
    },
  ]

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 safe-area-inset-bottom">
      <div className="bottom-nav-tabs max-w-6xl mx-auto flex">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors min-h-[56px] justify-center ${
              tab.active ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className={tab.active ? 'text-emerald-600' : 'text-slate-400'}>{tab.icon}</span>
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
