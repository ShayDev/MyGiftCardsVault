'use client'

import { useLanguageStore } from '../hooks/useLanguageStore'
import { localeLabel } from '../lib/i18n'

export default function LanguageToggle() {
  const { locale, setLocale } = useLanguageStore()

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'he' : 'en')}
      className="h-9 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 hover:border-slate-300 dark:hover:border-neutral-600 transition-colors"
      title="Switch language"
    >
      {localeLabel[locale === 'en' ? 'he' : 'en']}
    </button>
  )
}
