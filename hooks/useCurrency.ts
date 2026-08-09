'use client'

import { useLanguageStore } from './useLanguageStore'
import { resolveCurrency, currencySymbol, type CurrencyCode } from '../lib/currency'

// `currency` is the raw family-setting value (string | null) passed down from the
// server — resolution against the current UI language happens here, client-side,
// since locale itself only lives in useLanguageStore.
export function useCurrency(currency: string | null): { code: CurrencyCode; symbol: string } {
  const locale = useLanguageStore((s) => s.locale)
  const code = resolveCurrency(currency, locale)
  return { code, symbol: currencySymbol(code) }
}
