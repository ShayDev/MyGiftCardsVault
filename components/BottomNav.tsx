'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'
import { useNavBadgeCounts } from '../hooks/useNavBadgeCountsStore'
import type { NavBadgeCounts } from '../app/actions'

const HIDDEN_PATHS = ['/sign-in', '/onboarding']
const MAX_BADGE_COUNT = 9

function badgeText(count: number): string {
  return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count)
}

export default function BottomNav() {
  const { isSignedIn } = useAuth()
  const pathname = usePathname()
  const t = getT(useLanguageStore((s) => s.locale))
  const badgeCounts = useNavBadgeCounts()

  if (!isSignedIn || HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null

  const tabs: { href: string; label: string; active: boolean; badgeKey: keyof NavBadgeCounts; icon: ReactNode }[] = [
    {
      href: '/cards',
      label: t.cardsTab,
      active: pathname.startsWith('/cards'),
      badgeKey: 'cards',
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
      badgeKey: 'vouchers',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      ),
    },
    {
      href: '/refunds',
      label: t.refundsTab,
      active: pathname.startsWith('/refunds'),
      badgeKey: 'refunds',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l-4-4m0 0l4-4m-4 4h11a4 4 0 010 8h-1" />
        </svg>
      ),
    },
    {
      href: '/clubs',
      label: t.clubsTab,
      active: pathname.startsWith('/clubs'),
      badgeKey: 'clubs',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2" />
        </svg>
      ),
    },
  ]

  return (
    <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 safe-area-inset-bottom">
      <div className="bottom-nav-tabs max-w-6xl mx-auto flex">
        {tabs.map((tab) => {
          const { count, hasExpired, hasExpiringSoon } = badgeCounts[tab.badgeKey]
          const badgeColor = hasExpired ? 'bg-rose-500' : hasExpiringSoon ? 'bg-amber-500' : 'bg-emerald-500'
          const badgeTitle = hasExpired ? t.navBadgeHasExpired : hasExpiringSoon ? t.navBadgeExpiringSoon : undefined
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors min-h-[56px] justify-center ${
                tab.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <span className={`bottom-nav-icon relative ${tab.active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                {tab.icon}
                {count > 0 && (
                  <span
                    className={`bottom-nav-badge absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] leading-4 font-semibold text-center ${badgeColor}`}
                    title={badgeTitle}
                  >
                    {badgeText(count)}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
