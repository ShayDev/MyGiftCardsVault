'use client'

import { useTransition } from 'react'
import { useCurrency } from '../hooks/useCurrency'
import { currencySymbol } from '../lib/currency'
import { updateCurrency } from '../app/settings/actions'

// Quick USD/ILS-only toggle, mirroring LanguageToggle's shape — shows the currency
// you'll switch TO, like the language button. The full currency list still lives in
// the dropdown further down the Settings page; this is a fast path for the two most
// common cases, family-wide just like that dropdown (same updateCurrency action).
export default function CurrencyToggle({ currency }: { currency: string | null }) {
  const { code } = useCurrency(currency)
  const [isPending, startTransition] = useTransition()
  const next = code === 'ILS' ? 'USD' : 'ILS'

  function handleClick() {
    const fd = new FormData()
    fd.set('currency', next)
    startTransition(async () => {
      await updateCurrency(fd)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="h-9 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-slate-300 dark:hover:border-neutral-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
      title="Switch currency"
    >
      <span className="font-semibold">{currencySymbol(next)}</span>
      {next}
    </button>
  )
}
