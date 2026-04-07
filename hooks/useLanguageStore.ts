'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale } from '../lib/i18n'

type LanguageStore = {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      locale: 'he',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'gcv-language' }
  )
)
