# Switch Display Currency — HLD

## Overview

Let a family pick which currency all monetary amounts are displayed in, independent of the UI language. Today currency is silently coupled to language in `lib/i18n.ts` — English → `USD`/`$`, Hebrew → `ILS`/`₪` (`t.currencyCode` / `t.currencySymbol` / `t.currencyLocale`). This decouples them: language keeps controlling text + number punctuation (decimal/grouping separators), a new setting controls the currency code/symbol shown everywhere.

**Scope decision — display formatting only, no conversion.** Switching currency re-renders the same stored numbers with a different symbol/code via `Intl.NumberFormat`. It does **not** convert amounts using an exchange rate. This matches the Ledger Rule (no stored `balance`, amounts are just numbers) — real conversion would require a rate source, a refresh job, and rate-at-transaction-time tracking to keep historical ledger entries meaningful, which is a materially bigger feature and out of scope here.

**Scope decision — family-wide, not per-user.** Cards/vouchers/refund totals are shared family data (the same ledger every member views) — two members seeing the same balance rendered in two different currencies would be confusing, not a feature. Stored the same way as the existing "expiring soon" setting: `FamilyGroup.settings` JSON blob (`lib/familySettings.ts`). No new migration — that column already exists and already documents `defaultCurrency` as an example of a future sibling key.

**Out of scope (this HLD):** exchange-rate conversion, per-user override, per-item currency picking for Cards/Vouchers (Refunds already have their own independent per-item `currency` field from the receipt itself — untouched by this feature, since that's real data, not a display preference).

---

## Backward compatibility

Every existing family has `FamilyGroup.settings = NULL` or a blob with no `currency` key. That must keep behaving exactly as today: English families see `$`/USD, Hebrew families see `₪`/ILS — until someone explicitly picks a currency in Settings. So the stored value is `currency: string | null`, where `null` means "follow the language default," not "USD."

```
currency resolution:
  settings.currency ?? (locale === 'he' ? 'ILS' : 'USD')
```

---

## Data model

### `lib/familySettings.ts` — extend `FamilySettings`

```ts
export type FamilySettings = {
  expiringSoonDays: { ... }        // unchanged
  currency: string | null          // ISO 4217 code, e.g. 'USD' | 'ILS' | 'EUR'; null = follow language
  [key: string]: unknown
}

const DEFAULT_SETTINGS: FamilySettings = {
  expiringSoonDays: { ... },
  currency: null,
}

export function parseFamilySettings(raw: string | null): FamilySettings {
  // ...existing expiringSoonDays parsing...
  return {
    ...parsed,
    expiringSoonDays: { ... },
    currency: typeof parsed.currency === 'string' ? parsed.currency : null,
  }
}
```

Same read-merge-write discipline as `updateExpiringSoonDays` — a blind `update()` would wipe the sibling key.

### New file: `lib/currency.ts`

Small, closed list (not free-text) — keeps the settings UI a `<select>`, keeps `Intl.NumberFormat` inputs always valid, and keeps the symbol lookup total.

```ts
export type CurrencyCode = 'USD' | 'ILS' | 'EUR' | 'GBP'

export const SUPPORTED_CURRENCIES: { code: CurrencyCode; symbol: string }[] = [
  { code: 'USD', symbol: '$' },
  { code: 'ILS', symbol: '₪' },
  { code: 'EUR', symbol: '€' },
  { code: 'GBP', symbol: '£' },
]

export function resolveCurrency(settingsCurrency: string | null, locale: Locale): CurrencyCode {
  if (settingsCurrency && SUPPORTED_CURRENCIES.some((c) => c.code === settingsCurrency)) {
    return settingsCurrency as CurrencyCode
  }
  return locale === 'he' ? 'ILS' : 'USD'
}

export function currencySymbol(code: CurrencyCode): string {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol ?? '$'
}
```

*(Open question — not blocking: is `USD/ILS/EUR/GBP` the right starter list? Trivial to extend later since it's just array entries + `Intl.NumberFormat`, which already knows how to format any ISO code.)*

---

## Wiring it through

Currency becomes a **server-resolved prop**, same shape as `expiringSoonDays` — computed once per page load from family settings, passed down. Locale (for `Intl.NumberFormat`'s punctuation) stays client-side via `useLanguageStore` as today; only the currency *code/symbol* moves server-side.

### 1. The 4 `page.tsx` files (`cards`, `vouchers`, `refunds`, `clubs`)

Already extended for `expiringSoonDays` per the prior HLD — add one more field to the same `select`:

```ts
const user = await prisma.user.findUnique({
  where: { clerkId: userId },
  select: { familyId: true, family: { select: { settings: true } } },
})
const familySettings = parseFamilySettings(user?.family?.settings ?? null)
const expiringSoonDays = getExpiringSoonDays(familySettings)
const currency = familySettings.currency // string | null — resolved to a code client-side, since locale lives in Zustand
```

Passed down as `currency={currency}` — a raw nullable string, resolved against locale inside the client component (see below), not on the server, because the server doesn't know the visitor's locale (that's a client Zustand value, same reason `dir`/`lang` are set in `LanguageProvider`, not in `layout.tsx`).

### 2. The 4 `*Client.tsx` files

Each already computes `t = getT(locale)` from `useLanguageStore`. Replace every use of `t.currencyCode` / `t.currencySymbol` with values derived from the new `currency` prop + `resolveCurrency`/`currencySymbol`:

```tsx
export default function GiftCardsClient({ cards, providerOptions, expiringSoonDays, currency }: {
  ...
  currency: string | null
}) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const currencyCode = resolveCurrency(currency, locale)
  const symbol = currencySymbol(currencyCode)

  // formatCurrency(amount, t.currencyLocale, currencyCode)   — was t.currencyCode
  // {symbol}                                                  — was {t.currencySymbol}
}
```

`t.currencyLocale` (`en-US` / `he-IL`) keeps controlling grouping/decimal punctuation via `Intl.NumberFormat`'s first argument — only the `currency` option changes source.

Call sites to update (from the earlier grep):
- `GiftCardsClient.tsx` — `formatCurrency`/`formatTransactionAmount` calls (8 sites) + 2 standalone `{t.currencySymbol}` input-prefix sites + the `defaultBalance` label (currently hardcoded "Default Balance (USD)" / "יתרה התחלתית (ILS)" — becomes `t.defaultBalance` templated with the resolved code, e.g. `` `Default Balance (${currencyCode})` ``, one new i18n function-value key replacing the static string).
- `VouchersClient.tsx` — 2 `formatCurrency` sites.
- `RefundsClient.tsx` — **not touched** for the per-item `refund.currency`/`refund.amount` values (real receipt currency, independent per refund) — only if/when this file ever shows an *aggregate* total across refunds would it need the family setting; it currently doesn't.
- `app/cards/page.tsx` etc. — pass the new prop through.

### 3. Settings — action, page, UI

**`app/settings/actions.ts` — new `updateCurrency`:**

```ts
const currencySchema = z.object({
  currency: z.enum(['USD', 'ILS', 'EUR', 'GBP', '']), // '' = "follow language" (clears override)
})

export async function updateCurrency(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const parsed = currencySchema.safeParse({ currency: formData.get('currency') })
  if (!parsed.success) return { error: 'Invalid currency.' }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { familyId: true } })
  if (!dbUser?.familyId) redirect('/onboarding')

  const family = await prisma.familyGroup.findUnique({ where: { id: dbUser.familyId }, select: { settings: true } })
  const current = parseFamilySettings(family?.settings ?? null)
  const updated = { ...current, currency: parsed.data.currency || null }

  await prisma.familyGroup.update({ where: { id: dbUser.familyId }, data: { settings: JSON.stringify(updated) } })
  revalidatePath('/settings')
}
```

**`app/settings/page.tsx`:** extend the existing family-settings parse to also pass `currency: familySettings.currency` to `SettingsClient`.

**`SettingsClient.tsx`:** new section, same pattern as the expiry-days form — a `<select>` of `SUPPORTED_CURRENCIES` (plus a "Follow language" option mapping to `''`), submit button, saved-confirmation flash.

### i18n — new keys (`lib/i18n.ts`, en + he)

| key | en | he |
|---|---|---|
| `settingsCurrencyLabel` | Display currency | מטבע תצוגה |
| `settingsCurrencyHelp` | Choose which currency amounts are shown in. This only changes how numbers are displayed — it doesn't convert balances. | בחר את המטבע להצגת סכומים. פעולה זו רק משנה את אופן הצגת המספרים — היא אינה ממירה יתרות. |
| `settingsCurrencyFollowLanguage` | Follow language ({{code}}) | בהתאם לשפה ({{code}}) |
| `settingsCurrencySaved` | Saved | נשמר |
| `defaultBalance` | *(becomes a function)* `(code: string) => \`Default Balance (${code})\`` | `(code: string) => \`יתרה התחלתית (${code})\`` |

---

## Implementation order

1. `lib/currency.ts` — supported list + `resolveCurrency`/`currencySymbol`.
2. `lib/familySettings.ts` — extend `FamilySettings`/`parseFamilySettings` with `currency`.
3. `app/settings/actions.ts` — `updateCurrency` (read-merge-write, same discipline as `updateExpiringSoonDays`).
4. `app/settings/page.tsx` + `SettingsClient.tsx` — pass current value, add the `<select>` section, i18n keys.
5. The 4 `page.tsx` files — extend the existing settings `select` (already fetched for `expiringSoonDays`) to also read `currency`; pass raw `string | null` down.
6. The 4 `*Client.tsx` files, one at a time with `tsc --noEmit` after each — swap `t.currencyCode`/`t.currencySymbol` call sites for `resolveCurrency`/`currencySymbol`, convert `defaultBalance` label to the templated form.
7. Manual check: a family with no `currency` saved renders identically to today per language; picking `EUR` in Settings changes every balance/amount across Cards/Vouchers (and the "Default Balance" label) to `€`-formatted after reload, while Refunds' own per-item currencies stay untouched; picking "Follow language" clears the override.

---

## Open questions for you

1. Starter currency list — is `USD / ILS / EUR / GBP` enough, or is there a specific set you want (e.g. add `CAD`)?
2. Should there be a visible "Follow language" option, or should picking a currency always be a hard override (no way back to the implicit default short of re-selecting the language's native currency manually)?
