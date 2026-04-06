'use client'

import { useEffect } from 'react'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { localeDir } from '../lib/i18n'

export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useLanguageStore((s) => s.locale)

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = localeDir[locale]
  }, [locale])

  return <>{children}</>
}
