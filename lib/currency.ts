import type { Locale } from './i18n'

export type CurrencyCode = 'USD' | 'ILS' | 'EUR' | 'GBP'

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; symbol: string }[] = [
  { code: 'USD', symbol: '$' },
  { code: 'ILS', symbol: '₪' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
]

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code)
}

// `null`/unrecognized means "no family override saved yet" — falls back to the
// language's traditional currency (en → USD, he → ILS), matching pre-feature behavior.
export function resolveCurrency(settingsCurrency: string | null, locale: Locale): CurrencyCode {
  if (settingsCurrency && isSupportedCurrency(settingsCurrency)) return settingsCurrency
  return locale === 'he' ? 'ILS' : 'USD'
}

export function currencySymbol(code: CurrencyCode): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol ?? '$'
}
