# Global Search — HLD

## Overview

A single search entry point in the app header that filters whichever tab (Gift Cards / Vouchers / Refunds / Clubs) is currently open. Per explicit decisions:

- **Entry point:** a search icon in the header that expands in place into a full-width input (replacing the rest of the header row), with a back arrow to collapse and an `X` to clear the query. While empty, shows recent searches as tappable chips.
- **Scope:** search runs **against the current tab only**, entirely **client-side**, over data the page has already fetched and decrypted — not a cross-entity server query.

This is a pivot from an earlier draft of this doc that queried all four tables server-side via `ILIKE`. That version had to exclude every encrypted-at-rest field (`fullNumber`, `cvv`, card `link`, voucher/refund `code`/`link`, `memberId`) because GCM ciphertext can't be pattern-matched in SQL. Scoping to "current tab, client-side" sidesteps that limitation entirely — see below.

---

## Why client-side, per-tab search actually searches *more*, not less

Every existing `page.tsx` (`app/cards`, `app/vouchers`, `app/refunds`, `app/clubs`) already decrypts every encrypted field for every row **eagerly**, before the array is ever sent to its `*Client.tsx` — this isn't new plumbing, it's the existing pattern each page already uses to let the Detail Modal's "reveal" button show a full card number instantly with no round trip:

```ts
// app/cards/page.tsx (existing code)
fullNumber: dec(c.fullNumber ?? null),
cvv:        dec(c.cvv ?? null),
link:       dec(c.link ?? null),
```
```ts
// app/vouchers/page.tsx, app/refunds/page.tsx, app/clubs/page.tsx — same pattern
code: dec(v.code ?? null),  link: dec(v.link ?? null),  memberId: dec(c.memberId ?? null),
```

So by the time `GiftCardsClient`/`VouchersClient`/`RefundsClient`/`ClubsClient` renders, every field is already plaintext in the browser's memory. A client-side filter can safely match against `fullNumber`, voucher/refund `code`, and `memberId` — the exact fields the original cross-table design had to exclude. The only thing this approach can't do is search *across* tabs in one query, which was traded away deliberately per your direction.

**Deliberate exclusion despite being technically available:** `cvv` is left out of the search predicate on principle. It's a secret verification code, not an identifier — there's no legitimate "find my card by CVV" use case, and treating it as a searchable/matchable value (even silently, with no display change) is the wrong instinct to build into a lookup feature. Everything else decrypted is fair game.

**No new exposure risk:** search only filters which already-rendered rows are visible — it doesn't change what each row displays. A Card row still shows masked `last4` today; matching on the decrypted `fullNumber` behind the scenes doesn't put the full number on screen anywhere it doesn't already appear (the existing "reveal" tap-to-show in the Detail Modal is unchanged).

---

## Shared search state — `hooks/useSearchQueryStore.ts` (new)

The header (where the input lives) and each tab's `*Client.tsx` (where the filtering happens) are siblings in the component tree, not parent/child — `app/layout.tsx` renders the header once, `{children}` (the current page) separately. They need a shared client store to bridge that gap:

```ts
import { create } from 'zustand'

type SearchQueryState = {
  query: string
  setQuery: (query: string) => void
}

export const useSearchQueryStore = create<SearchQueryState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}))
```

Plain, **not** `persist`-backed — the query itself is transient (unlike recent searches, below). Deliberately **not** cleared on route change: navigating from `/cards` to `/vouchers` while "Amazon" is active keeps filtering Vouchers by "Amazon" too, which reads as a feature ("stay filtered while I browse") rather than a bug, given search is explicitly per-tab-applied. It only clears via the header's own `X`/back-arrow actions.

---

## Client — `components/GlobalSearchHeader.tsx` (new)

Same expand/collapse header UX as originally planned — this part didn't change:

```tsx
'use client'
// Renders EITHER:
//  - collapsed: <brand row> ...existing... <search icon button> <HeaderNav /> <LanguageToggle />
//  - expanded:  <back arrow> <input full-width, autoFocus, live onChange -> setQuery> <X clear (only if query non-empty)>
```

`app/layout.tsx` changes: the current inline `.header-brand` / `.header-actions` JSX moves into this one new component (mirroring how `HeaderNav`/`BottomNav` already self-manage visibility via `usePathname`/`isSignedIn`), so it can swap between collapsed and expanded without fighting server-rendered layout markup around it.

**No debounce.** The original draft debounced 300ms to avoid hammering a server query on every keystroke — that constraint doesn't exist anymore, since `setQuery` just updates a client store and each tab's `.filter()` runs synchronously in memory over an already-small (family-scale) array. Filtering live, per keystroke, is simpler code and matches the project's "Instant Feel" guideline better than adding artificial delay back in.

**Recent searches** — logged once, when the user collapses the search (taps the back arrow) while the query is non-empty, rather than on every keystroke or on some artificial "commit" moment that no longer exists now that there's no distinct results-loading step:

```ts
// hooks/useRecentSearchesStore.ts (new) — persist-backed, unlike useSearchQueryStore above.
// First `persist` store in the app: every existing store (attribution, nav badges,
// the search query itself) deliberately avoids `persist` because it caches *server
// data* or *transient UI state* — recent search terms are genuine user history,
// exactly what `persist` is for.
type RecentSearchesState = {
  recent: string[] // most-recent-first, max 6, de-duped case-insensitively
  addRecent: (query: string) => void
}
```

Tapping a recent chip fills the input and sets `query` immediately (no need to wait on anything, since there's no debounce anymore).

---

## Per-tab filtering — one small addition to each `*Client.tsx`

Each of `GiftCardsClient` / `VouchersClient` / `RefundsClient` / `ClubsClient` reads the shared query and filters its own already-loaded array *before* the existing active/used split, so both sections stay searchable with zero other changes to the render logic below that point:

```ts
// GiftCardsClient.tsx
const query = useSearchQueryStore((s) => s.query).trim().toLowerCase()
const visibleCards = query
  ? cards.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      c.provider.toLowerCase().includes(query) ||
      c.notes?.toLowerCase().includes(query) ||
      c.last4?.includes(query) ||
      c.fullNumber?.includes(query)
    )
  : cards
// ...existing `active`/`used` derivation now reads from `visibleCards` instead of `cards`
```

Same shape in the other three, matching fields to what's actually meaningful per entity:

| Entity | Filter fields |
|---|---|
| GiftCard | `name`, `provider`, `notes`, `last4`, `fullNumber` (not `cvv`) |
| Voucher | `name`, `provider`, `notes`, `code` |
| Refund | `provider`, `notes`, `referenceId`, `code` |
| ClubMember | `name`, `provider`, `notes`, `ownerName`, `memberId` |

Tapping a filtered row does exactly what tapping any row does today — opens that tab's existing Detail Modal. There's no separate "search results" view, no read-only preview component, and no "open in {tab}" link to design, because search never leaves the tab it's scoped to. That whole part of the previous draft is gone — it existed to solve a "results reference items on other tabs" problem that no longer exists once search stopped being cross-entity.

**Empty state:** if `query` is non-empty and `visibleCards`/`visibleVouchers`/etc. comes back empty, each tab shows its own plain "No results" message (reusing whatever empty-state pattern that page already has for "no cards yet," adapted with a query-aware message).

---

## Highlighting matches — `components/HighlightMatch.tsx` (new)

Since filtering only decides which rows survive, the matched text itself needs calling out in the rows that remain — otherwise a match on `notes` (a field the row barely glances at) leaves the user unsure why that row is even showing up. A small, generic component wraps the matching substring:

```tsx
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase()
          ? <mark key={i} className="bg-amber-200 text-slate-900 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  )
}
```

- Case-insensitive, all occurrences within the string (not just the first).
- Regex-escapes the query so a literal `.`/`(`/`+` typed by the user (e.g. searching a phone number or reference id with punctuation) doesn't throw or misbehave.
- Amber highlight (`bg-amber-200`) rather than emerald/rose, so it reads as "this is why it matched" and doesn't collide with the app's existing emerald=recharge/rose=spend-or-expiring color meanings.

### Wiring into each row

Each `*Client.tsx` already passes its filtered items down to row components (`VoucherRow`, `RefundRow`, etc.) or renders rows inline (Cards' table/mobile-list). The parent passes `query` down alongside the item so `HighlightMatch` can be used at each spot a filterable field is actually rendered:

```tsx
// e.g. inside VoucherRow, given a `query` prop from VouchersClient
<span className="text-sm font-medium text-slate-800 truncate">
  <HighlightMatch text={voucher.name} query={query} />
</span>
{voucher.provider && (
  <span className="...provider badge...">
    <HighlightMatch text={voucher.provider} query={query} />
  </span>
)}
```

**Only wraps fields that are already rendered in that row.** `GiftCard.fullNumber` is a filter field (per the table above) but is never shown in the list — only revealed on tap inside the Detail Modal, behind its existing show/hide toggle. A row can match via `fullNumber` and still show no visible highlight, because there's nothing on that row to highlight; the match is still correct (the row appears), it just doesn't have an in-row visual explanation for that particular case. Same applies to Voucher/Refund `code` and ClubMember `memberId` wherever those aren't part of the compact row's own display. `notes`, where shown inline in a row (some rows show a notes preview line), gets the same treatment.

---

## i18n (new keys)

| key | en | he |
|---|---|---|
| `searchLabel` | Search | חיפוש |
| `searchPlaceholder` | Search this list… | חיפוש ברשימה… |
| `searchRecent` | Recent | אחרונים |
| `searchNoResults` | No results for "{query}" | אין תוצאות עבור "{query}" |

Substantially fewer keys than the cross-entity draft needed — no per-type group headers, no "open in" link text.

---

## Implementation Order

1. `hooks/useSearchQueryStore.ts` — shared query state.
2. `hooks/useRecentSearchesStore.ts` — `persist`-backed recent list.
3. `components/GlobalSearchHeader.tsx` — collapsed state only first (icon + existing brand/actions unchanged), verify it's a visual no-op.
4. Expanded state: input, back arrow, `X`, live `setQuery` wiring (no debounce).
5. Recent searches: log on collapse-with-query, render chips in the empty state, tapping one re-populates + re-filters.
6. `app/layout.tsx` — swap in `<GlobalSearchHeader />`.
7. `components/HighlightMatch.tsx` — the match-highlighting helper.
8. Add the filter predicate + `visible*` derivation to `GiftCardsClient.tsx`, wire `HighlightMatch` into its row/table rendering (start with one tab, confirm the pattern end-to-end).
9. Repeat step 8 for `VouchersClient.tsx`, `RefundsClient.tsx`, `ClubsClient.tsx` — same shape, different field lists.
10. Empty-state messaging per tab.
11. i18n keys.

---

## Out of Scope

- Cross-tab / cross-entity search in one query — deliberately traded away for this simpler, client-only, per-tab design.
- Fuzzy/typo-tolerant matching — plain case-insensitive substring match only.
- Matching on `cvv` — excluded on principle, not a technical limitation.
- Any new server action or Prisma query — this feature adds zero backend surface.
