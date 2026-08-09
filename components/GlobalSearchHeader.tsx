'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { usePathname } from 'next/navigation'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'
import { useSearchQueryStore } from '../hooks/useSearchQueryStore'
import { useRecentSearchesStore } from '../hooks/useRecentSearchesStore'
import HeaderNav from './HeaderNav'
import LanguageToggle from './LanguageToggle'

const HIDDEN_PATHS = ['/sign-in', '/onboarding']

export default function GlobalSearchHeader() {
  const { isSignedIn } = useAuth()
  const pathname = usePathname()
  const t = getT(useLanguageStore((s) => s.locale))
  const query = useSearchQueryStore((s) => s.query)
  const setQuery = useSearchQueryStore((s) => s.setQuery)
  const recent = useRecentSearchesStore((s) => s.recent)
  const addRecent = useRecentSearchesStore((s) => s.addRecent)
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  const canSearch = isSignedIn && !HIDDEN_PATHS.some((p) => pathname.startsWith(p))

  const categoryLabel = pathname.startsWith('/cards')
    ? t.cardsTab
    : pathname.startsWith('/vouchers')
    ? t.vouchersTab
    : pathname.startsWith('/refunds')
    ? t.refundsTab
    : pathname.startsWith('/clubs')
    ? t.clubsTab
    : t.searchLabel

  function collapse() {
    if (query.trim()) addRecent(query)
    setQuery('')
    setExpanded(false)
  }

  if (expanded) {
    return (
      <div className="global-search-bar relative flex items-center gap-2 w-full">
        <button
          type="button"
          onClick={collapse}
          aria-label={t.close}
          className="global-search-back w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') collapse() }}
          placeholder={t.searchPlaceholder(categoryLabel)}
          aria-label={t.searchLabel}
          className="global-search-input flex-1 h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t.close}
            className="global-search-clear w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {!query && recent.length > 0 && (
          <div className="global-search-recent absolute top-full left-0 right-0 mt-2 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-20">
            <p className="text-xs text-slate-400 mb-2">{t.searchRecent}</p>
            <div className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setQuery(r)}
                  className="h-9 px-3 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-sm text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="global-search-collapsed flex items-center justify-between w-full">
      <div className="header-brand flex items-center gap-2.5">
        <div className="header-brand-icon w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-sm">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
        </div>
        <div className="header-brand-name">
          <span className="font-bold text-slate-900 dark:text-slate-50 tracking-tight">GiftCards</span>
          <span className="font-bold text-emerald-600 tracking-tight">Vault</span>
        </div>
      </div>
      <div className="header-actions flex items-center gap-2">
        {canSearch && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={t.searchLabel}
            className="global-search-open w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </button>
        )}
        <HeaderNav />
        <LanguageToggle />
      </div>
    </div>
  )
}
