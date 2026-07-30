# On-Demand Card Balance Check — HLD

## Overview

Add a "Check Balance" action to the Card Detail Modal that, on click, fetches the card's *live* balance directly from the provider (not the app's ledger) and displays it. Available only for cards whose provider has a `Provider.balanceCheckUrl` set (see `plans/provider-field-hld.md` — the column already exists, reserved, unused).

**Scope for this pass, per explicit decision:** get the live balance on screen if the provider can be queried. Reconciling a mismatch between the live balance and the app's ledger-computed balance is deliberately **not** designed here — see [Open Question](#open-question--reconciliation) below.

---

## Why this is harder than it looks

`balanceCheckUrl` was originally envisioned as just a link to a provider's own balance-check webpage — a "click to open in a new tab" affordance. What's being asked for now is different: fetch the balance *programmatically* and show it inline. That requires knowing, per provider:

- The request shape (GET vs POST, what params — card number? PIN/CVV? both?)
- Any auth/session requirements
- The response shape (JSON with a balance field? An HTML page that needs scraping? A redirect chain?)

None of this is known yet for any real provider in the seeded list (BuyMe, HitechZone, Max, Isracard, Cal, …) — none currently publish a documented public balance API. This HLD designs the **plumbing** (schema, server action, UI) as provider-agnostic as possible, plus a **per-provider adapter registry** for the actual request/response handling — but ships with zero working adapters until a real provider is identified and its contract captured. That's the concrete next step after this plan is approved (see [Implementation Order](#implementation-order)).

---

## Data Model

### `Provider.balanceCheckUrl` (existing column, reused as a template)

No schema change needed to *enable* the feature — the column already exists (`String?`, nullable). It's reinterpreted as a **URL template** rather than a plain link, supporting placeholders substituted at request time:

```
https://example-provider.com/api/balance?card={cardNumber}&pin={cvv}
```

Recognized placeholders: `{cardNumber}` (decrypted `GiftCard.fullNumber`), `{cvv}` (decrypted `GiftCard.cvv`). Both are URL-encoded before substitution. A provider whose check needs neither, either, or both just omits/includes the placeholders it needs.

**Why a template on `Provider`, not a new table:** the URL *shape* is a property of the provider, not of any individual card — every BuyMe card gets checked against the same endpoint pattern, only the card number/PIN differ per card. This keeps it a one-row-per-provider concern, consistent with how `balanceCheckUrl` was already scoped.

**Who sets it:** direct SQL only (developer-curated), same as the current seed data — **not** exposed through the `ProviderCombobox` or any family-facing form. This matters for security (see below), not just scope: a family member can create a *custom* Provider row today (via typing a new provider name in the combobox), but that path never touches `balanceCheckUrl` — it stays `null` for custom rows. Only globally-seeded rows (`familyId = '0'`) get one populated, by hand, once a real provider's contract is known.

### Per-provider adapter registry (new) — `lib/balanceCheckers/index.ts`

Because response shapes differ per provider and can't be inferred generically from a URL alone, parsing is handled by a small keyed registry rather than a generic "JSON path" config (that could be revisited later if 2+ real providers turn out to share a common shape — not assumed up front):

```ts
export type BalanceCheckResult =
  | { ok: true; balance: number }
  | { ok: false, reason: 'fetch_failed' | 'parse_failed' | 'unsupported' }

export type BalanceChecker = (rawResponseText: string) => number | null

// Keyed by Provider.name (the canonical English name, e.g. "BuyMe") — falls
// back to `unsupported` for any provider not in this map, even if it has a
// balanceCheckUrl set (lets balanceCheckUrl be populated ahead of the parser
// being written, without the button silently misbehaving).
export const BALANCE_CHECKERS: Record<string, BalanceChecker> = {
  // 'BuyMe': (text) => { ... extract balance from BuyMe's response ... },
}
```

Starts empty. Adding support for a real provider is: populate its `balanceCheckUrl`, write one small function here, done — no changes to the server action or UI.

---

## Server Action — `app/actions.ts` (or a new `app/balance-check/actions.ts`)

```ts
export type BalanceCheckResponse =
  | { ok: true; balance: number; providerName: string }
  | { ok: false; reason: 'unsupported' | 'fetch_failed' | 'parse_failed' }

export async function checkCardBalance(cardId: string): Promise<BalanceCheckResponse> {
  const { familyId } = await getAuthenticatedFamilyId()

  const card = await prisma.giftCard.findFirst({
    where: { id: cardId, familyId },
    select: { provider: true, fullNumber: true, cvv: true },
  })
  if (!card) return { ok: false, reason: 'unsupported' }

  const providerRow = await prisma.provider.findFirst({
    where: {
      type: 'CARD',
      country: 'IL',
      familyId: '0', // global rows only — balanceCheckUrl is never set on custom rows
      OR: [
        { name: { equals: card.provider, mode: 'insensitive' } },
        { nameByCountry: { equals: card.provider, mode: 'insensitive' } },
      ],
    },
    select: { name: true, balanceCheckUrl: true },
  })

  const checker = providerRow?.name ? BALANCE_CHECKERS[providerRow.name] : undefined
  if (!providerRow?.balanceCheckUrl || !checker) return { ok: false, reason: 'unsupported' }

  // Defense in depth: balanceCheckUrl is developer-curated only, but this
  // guards against a bad row (e.g. accidental http:// or a non-provider host)
  // regardless of how it got set.
  const url = new URL(providerRow.balanceCheckUrl)
  if (url.protocol !== 'https:') return { ok: false, reason: 'unsupported' }

  const cardNumber = card.fullNumber && isEncrypted(card.fullNumber) ? decrypt(card.fullNumber) : card.fullNumber
  const cvv = card.cvv && isEncrypted(card.cvv) ? decrypt(card.cvv) : card.cvv

  const finalUrl = providerRow.balanceCheckUrl
    .replace('{cardNumber}', encodeURIComponent(cardNumber ?? ''))
    .replace('{cvv}', encodeURIComponent(cvv ?? ''))

  try {
    const res = await fetch(finalUrl, { signal: AbortSignal.timeout(8000) })
    const text = await res.text()
    const balance = checker(text)
    return balance === null
      ? { ok: false, reason: 'parse_failed' }
      : { ok: true, balance, providerName: providerRow.name ?? card.provider }
  } catch {
    return { ok: false, reason: 'fetch_failed' }
  }
}
```

Notes:
- Decrypted card number/CVV never leave the server — only the resulting balance (a plain number) crosses to the client.
- No caching, no auto-refresh, no background polling — strictly fired by a user click, to avoid hammering a third-party site and to sidestep any rate-limit/ToS concerns until those are actually looked into.
- `familyId: '0'` filter on the Provider lookup enforces "only developer-curated rows can trigger a live fetch" at the query level, not just by convention.

---

## UI — `components/GiftCardsClient.tsx`

### Passing "can this card be checked" down

`app/cards/page.tsx` currently decrypts and shapes each card for the client. Add one more piece of server-computed info per card: whether its provider has a registered checker. Cheapest approach — fetch the `CARD`-type providers with `balanceCheckUrl` set once per page load (small, global list), map `card.provider` against it client-side-free (still in the RSC), and pass a plain `canCheckBalance: boolean` per card. Avoids a second round trip when the modal opens.

### Card Detail Modal

A "Check Balance" button appears in the modal only when `card.canCheckBalance`. Placed near the existing Expires/Added grid, or as its own row above them.

```tsx
{card.canCheckBalance && (
  <button
    type="button"
    onClick={() => startTransition(async () => {
      const result = await checkCardBalance(card.id)
      setBalanceCheckResult(result)
    })}
    disabled={isPending}
    className="h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700"
  >
    {isPending ? t.checkingBalance : t.checkBalance}
  </button>
)}
{balanceCheckResult?.ok && (
  <p className="text-sm text-slate-600">
    {t.liveBalance}: <span className="font-mono font-semibold">{formatCurrency(balanceCheckResult.balance, t.currencyLocale, t.currencyCode)}</span>
  </p>
)}
{balanceCheckResult && !balanceCheckResult.ok && (
  <p className="text-sm text-slate-400">{t.balanceCheckFailed}</p>
)}
```

Result is ephemeral component state (`useState`, reset when the modal closes/reopens) — nothing is persisted, per scope.

### i18n (new keys)

| key | en | he |
|---|---|---|
| `checkBalance` | Check Balance | בדוק יתרה |
| `checkingBalance` | Checking… | בודק… |
| `liveBalance` | Live balance | יתרה בפועל |
| `balanceCheckFailed` | Couldn't check balance right now | לא ניתן לבדוק יתרה כרגע |

---

## Security

- `balanceCheckUrl` is populated only via direct SQL by the developer — never through any user-facing form (`ProviderCombobox` custom-add path never sets it). This is the primary SSRF mitigation: no family member can point a "check balance" fetch at an arbitrary URL.
- The server action additionally enforces `https:` only and restricts the Provider lookup to `familyId: '0'` (global, developer-curated rows), as defense in depth against a future change accidentally widening who can set the column.
- Decrypted `fullNumber`/`cvv` are used in-memory on the server only, to build the outbound request URL — never logged, never returned to the client.
- No credentials of any kind (family login to the provider's own site, if such a thing existed) are stored or handled — out of scope entirely; this only supports providers whose balance can be checked with just the card number (+ optional PIN/CVV), same info already on the card.

---

## Open Question — Reconciliation

If/when a live-checked balance disagrees with the app's ledger-computed balance (`lib/balance.ts`), what should happen? Deferred by explicit decision — options on the table for a later pass:

1. Display only, side-by-side (live vs. ledger) — no action taken.
2. Same as (1) but visually flagged/highlighted when they differ.
3. Offer to append a reconciliation `Transaction` to bring the ledger in line with the live-checked value.

This HLD's UI (above) already does a version of (1) implicitly, since it just shows the live number next to whatever's already on screen — but no comparison/highlight logic is built yet. Revisit once the base fetch mechanism is working against at least one real provider.

---

## Implementation Order

1. Pick one real provider from the seeded list (or a new one) that the user can confirm has *some* queryable balance-check mechanism, and capture its exact request/response contract.
2. Add `lib/balanceCheckers/index.ts` with that one provider's parser.
3. Manually set that provider's `Provider.balanceCheckUrl` via SQL (dev, then prod).
4. Add `checkCardBalance` server action.
5. Compute and pass `canCheckBalance` per card from `app/cards/page.tsx`.
6. Add the "Check Balance" button + result display to the Card Detail Modal.
7. Add the four i18n keys.
8. Verify end-to-end against the one real provider; only then consider adding more.

## Out of Scope (this pass)

- Reconciliation with the ledger balance (see above).
- Any provider requiring login/session/2FA rather than a direct card-number(+PIN) lookup.
- A generic/config-driven response parser — one hand-written function per provider for now; revisit only if a common shape emerges across 2+ real providers.
- Auto-refresh, caching, or background checks — strictly on-demand/user-clicked.
- Surfacing this for Vouchers/Refunds/Clubs — Cards only, for now (their `Provider` rows share the same table/column, so extending later is a small, non-structural follow-up).
