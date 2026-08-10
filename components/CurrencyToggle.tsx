'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useCurrency } from '../hooks/useCurrency'
import { SUPPORTED_CURRENCIES, currencySymbol, type CurrencyCode } from '../lib/currency'
import { updateCurrency } from '../app/settings/actions'

const OPTIONS: CurrencyCode[] = SUPPORTED_CURRENCIES.map((c) => c.code)

// Quick currency dropdown — same shape/behavior as ProviderCombobox's panel
// (button + absolutely-positioned listbox, click-outside to close), styled as a
// small trigger + checkmarked options list. Covers all of SUPPORTED_CURRENCIES now,
// so it's superseded the (currently commented-out) full dropdown further down the
// Settings page rather than being a reduced fast path for just two of them.
export default function CurrencyToggle({ currency }: { currency: string | null }) {
  const { code } = useCurrency(currency)
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function select(next: CurrencyCode) {
    setOpen(false)
    if (next === code) return
    const fd = new FormData()
    fd.set('currency', next)
    startTransition(async () => {
      await updateCurrency(fd)
    })
  }

  return (
    <div ref={rootRef} className="currency-toggle relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="h-9 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-slate-300 dark:hover:border-neutral-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        title="Switch currency"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {code}
        <span className="font-semibold">{currencySymbol(code)}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="currency-toggle-panel absolute right-0 z-10 mt-1 w-28 overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={opt === code}
              onClick={() => select(opt)}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                opt === code
                  ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-medium'
                  : 'text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800'
              }`}
            >
              <span className="w-4 flex-shrink-0">
                {opt === code && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className="flex-1">{opt}</span>
              <span className="font-semibold">{currencySymbol(opt)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
