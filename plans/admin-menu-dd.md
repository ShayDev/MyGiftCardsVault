# Admin Menu — Detailed Design

**Status:** Phase 1 implemented (`lib/superadmin.ts`, `lib/adminStats.ts`, `components/admin/charts.tsx`, `components/AdminClient.tsx`, `app/admin/page.tsx`, `/settings` link). Builds on [admin-menu-hld.md](./admin-menu-hld.md).

Phase 1 is a **read-only** superadmin dashboard — **no schema change, no mutations**. App-wide settings (the Scan AI engine switch) are deferred; §7 keeps the design notes for when they're picked up.

## Decisions locked

| Question | Decision |
|---|---|
| Access (Phase 1) | Superadmin only — hardcoded email allowlist in `lib/superadmin.ts`, optionally extended by a `SUPERADMIN_EMAILS` env var (comma-separated). Checked against `User.email`. No `User.role` change. |
| Entry point | Superadmin-only link on `/settings`. Direct `/admin` navigation works, gated server-side. Not a `BottomNav` tab. |
| Phase 1 panels | (2) records created over time — last 12 months, stacked by entity; (3) content totals now; Families table. No settings, no writes. |
| Engine switch | **Deferred** — see §7. Not built in Phase 1. |
| Panel 5 / `ExtractLog` | **Out of Phase 1** — deferred decision. `AdminClient` leaves a placeholder slot. |
| Charts | Hand-rolled under `components/admin/charts.tsx` — flexbox + Tailwind, not SVG (simpler, responsive for free, no viewBox/text math for a handful of bars). No dependency. |
| i18n | English-only. No keys added to `lib/i18n.ts`. |
| Families table counts | `isActive`-only counts (no per-row balance computation). Panel 3's card count *does* use the balance rule (one app-wide pass). |

---

## 1. Data model

**No changes.** Phase 1 only reads existing tables (`GiftCard`, `Voucher`, `Refund`, `ClubMember`, `Warranty`, `FamilyGroup`, `User`, `UserLoginStat`).

---

## 2. `lib/superadmin.ts` (new)

```ts
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import prisma from './prisma'

// Hardcoded operator allowlist. A comma-separated SUPERADMIN_EMAILS env var is
// merged in if present (lets prod add one without a code change), but the
// hardcoded entry is the baseline so a missing env var never locks everyone out.
const HARDCODED = ['shaynadav@gmail.com']

function allowlist(): string[] {
  const fromEnv = (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set([...HARDCODED, ...fromEnv])]
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  return !!email && allowlist().includes(email.toLowerCase())
}

/** For server components / actions. Returns the db user; redirects if not a superadmin. */
export async function requireSuperadmin() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, clerkId: true, email: true, name: true },
  })
  if (!user || !isSuperadminEmail(user.email)) redirect('/cards')
  return user
}
```

`redirect('/cards')` (not a 403) so a non-superadmin hitting the URL just lands on the app, no information leak that `/admin` exists.

---

## 3. `lib/adminStats.ts` (new) — the aggregation queries

All functions take an optional `familyId?: string` (unused in Phase 1 callers; there for the later family-owner view) — when passed, every query gets a `WHERE "familyId" = $1`.

### `getRecordsCreatedByMonth()` → panel 2

Last 12 calendar months, one row per (month, entityType). Single raw query, `UNION ALL` across tables:

```ts
type MonthlyRow = { month: string; entity: string; count: number }

export async function getRecordsCreatedByMonth(familyId?: string): Promise<MonthlyRow[]> {
  const since = new Date()
  since.setMonth(since.getMonth() - 11, 1)
  since.setHours(0, 0, 0, 0)

  const f = familyId ? Prisma.sql`AND "familyId" = ${familyId}` : Prisma.empty
  const rows = await prisma.$queryRaw<MonthlyRow[]>`
    SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, entity, COUNT(*)::int AS count
    FROM (
      SELECT "createdAt", 'cards'      AS entity FROM "GiftCard"   WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'vouchers'   FROM "Voucher"    WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'refunds'    FROM "Refund"     WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'clubs'      FROM "ClubMember" WHERE "createdAt" >= ${since} ${f}
      UNION ALL SELECT "createdAt", 'warranties' FROM "Warranty"   WHERE "createdAt" >= ${since} ${f}
    ) t
    GROUP BY 1, 2
    ORDER BY 1, 2
  `
  return rows
}
```

The client fills gaps (months with no rows → 0) so the x-axis always shows 12 buckets.

### `getContentTotals()` → panel 3

```ts
type ContentTotals = {
  cards: number       // isActive && balance > 0  (NavBadge rule)
  vouchers: number    // isActive && !isUsed
  refunds: number     // isActive && !isUsed
  clubs: number       // isActive
  warranties: number  // isActive && (expiresAt null || future)
  families: number
  users: number
}
```

Reuses the exact "active" predicates from `getNavBadgeCounts()` in `app/actions.ts` (extract them into a shared `lib/activeFilters.ts` if it reduces duplication — optional). The card count needs balances: `getBalancesForCards()` over all active card ids, then filter `> 0`. At current scale (single-digit families) this is fine; if the app grows, this is the first query to revisit — noted.

### `getFamiliesTable()` → Families table

```ts
type FamilyRow = {
  id: string
  name: string
  members: number
  cards: number; vouchers: number; refunds: number; clubs: number; warranties: number
  createdAt: string
  lastActivityAt: string | null // max(UserLoginStat.lastVisitAt) among members
}
```

Implementation: one `familyGroup.findMany` with `_count` on each relation + `users: { select: { clerkId: true } }`, then one `userLoginStat.findMany` for those clerkIds, joined in memory for `lastActivityAt`. Entity counts here are **`isActive`-only** (via `where` on the `_count`) — no balance pass per row.

---

## 4. Pages & components

### `app/admin/page.tsx` (Server Component)

```tsx
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requireSuperadmin()
  const [recordsByMonth, totals, families] = await Promise.all([
    getRecordsCreatedByMonth(),
    getContentTotals(),
    getFamiliesTable(),
  ])
  return <AdminClient recordsByMonth={recordsByMonth} totals={totals} families={families} />
}
```

No `app/admin/actions.ts` in Phase 1 — nothing mutates.

### `components/AdminClient.tsx` (Client Component)

Layout, top to bottom:

1. **Header** — "Admin" + back-to-app link. No language toggle (English-only).
2. **Content totals** — `StatTile` grid (cards / vouchers / refunds / clubs / warranties / families / users), then one `BarChart` of the five entity counts.
3. **Records created over time** — `StackedBarChart`, 12 monthly buckets, one colour per entity type (reuse the app's entity accent colours where they exist; otherwise a fixed 5-colour palette defined once in the component).
4. **Families table** — horizontally scrollable (`overflow-x-auto`) on mobile. Columns per §3. Sort client-side by clicking a header (created desc default).
5. `{/* Scan health — Phase 1.5, see admin-menu-dd.md §8. Slot intentionally left. */}` — leaning omit until the decision lands.

Client component only for the sortable table + any chart hover; the data all arrives as props from the server component.

### `components/admin/charts.tsx` — chart primitives (one file, hand-rolled, flexbox + Tailwind)

- `StatTile` — label + big number, the app's card styling (`rounded-2xl border ...`).
- `BarChart` — `{ label; value; colorClass? }[]`, **horizontal** bars (label / track / fill-width-% / value). No SVG.
- `StackedBarChart` — `{ buckets: { label; segments: Record<string, number> }[]; series: { key; label; colorClass }[] }`. Flex row of columns; each column a `flex-col-reverse` of coloured segments sized by `flexGrow`; legend below; wrapped in `overflow-x-auto` with a `min-w` so it scrolls on tiny screens.

All theme-aware via Tailwind `dark:` classes. Pure presentational, no hooks — importable from a server component too.

### Settings link — `app/settings/page.tsx` + `SettingsClient.tsx`

`page.tsx` already loads the `User`; add `isSuperadmin: isSuperadminEmail(user.email)` to the props. In `SettingsClient`, when true, render one `<Link href="/admin">` styled like the other setting cards, above the Account card. English literal string, no `t.` key.

---

## 5. Implementation order

1. `lib/superadmin.ts`.
2. `lib/adminStats.ts` (`getRecordsCreatedByMonth`, `getContentTotals`, `getFamiliesTable`).
3. `components/admin/` — `StatTile`, `BarChart`, `StackedBarChart`.
4. `app/admin/page.tsx` + `components/AdminClient.tsx`.
5. Superadmin link on `/settings`.
6. `tsc --noEmit` after each group.

---

## 6. Out of scope (Phase 1)

- **AI engine switch / any app-wide setting** — deferred (see §7).
- Panel 1 (growth over time), Panel 4 (engagement snapshot), Users table.
- Panel 5 / `ExtractLog` — deferred decision (see §8).
- Family-owner (`role === 'owner'`) family-scoped access — the `familyId?` params in `lib/adminStats.ts` are the only concession to it now.
- Any money aggregate (blocked by multi-currency — see HLD).
- Header nav link + fetch-once superadmin store.
- i18n of the admin UI.
- Charting library.

---

## 7. Deferred: the AI engine switch (design notes for later)

Not built in Phase 1. When picked up:

- **`AppSetting` model** — `{ key @id, value, updatedBy?, updatedAt @updatedAt }`, app-global (no `familyId`). Migrate via a `scripts/migrate-app-settings.ts` raw-SQL script (dev + prod), same pattern as `migrate-warranty.ts`; add to `schema.prisma` for fresh installs.
- **`lib/appSettings.ts`** — owns resolution `DB row → AI_ENGINE_* env → 'groq'`. `readAll` wrapped in `unstable_cache(['app-settings'], { tags: ['app-settings'] })` with **no `revalidate`** — read once per warm instance, re-read only when `setAiEngine()` fires `revalidateTag('app-settings')`. Never a per-`/api/extract` DB hit.
- **`/api/extract/route.ts`** — one line: `const engine = await resolveAiEngine(file ? 'image' : 'text')` instead of `getAiEngine(...)`. `lib/extractEngines.ts` stays DB-free (imported by `scripts/diagnose-extract.ts`); its `getAiEngine()` remains the env-only fallback that `resolveAiEngine` calls.
- **`app/admin/actions.ts`** — `updateAiEngineSetting(formData)`: `requireSuperadmin()`, Zod `enum(['gemini','claude','groq'])` + `enum(['text','image'])`, `setAiEngine(...)`, `revalidatePath('/admin')`.
- **`AdminClient` section** — two rows (Text / Image), 3-button segmented control each, `form action`, optimistic highlight (pattern in the `2fd2323` diff), shows "(env default)" vs "(overridden)".
- Same table later absorbs `ENABLE_NAV_BADGES` / `ENABLE_ADDED_BY_ATTRIBUTION`.

---

## 8. Open Questions

1. **Panel 5 / `ExtractLog`** — still deferred. If yes later: `model ExtractLog { id, engine, entityType, modality, ok Boolean, ms Int, createdAt }`, one insert (fire-and-forget, never blocking the response) at the end of `/api/extract`, plus a retention trim (keep 90 days). Powers success-rate + p50/p95-latency-by-engine and the "recent extracts" table.
2. **`SUPERADMIN_EMAILS` env var** — DD ships the env merge (cheap, no downside).
3. **Scan-health card placeholder** — render an empty "coming soon" card, or omit the section entirely until the decision lands? Leaning omit.

---

## 9. Verification

1. `tsc --noEmit` after each implementation-order group.
2. Sign in as the allowlisted email → `/admin` renders. Sign in as any other user → `/admin` redirects to `/cards`, and the Settings page shows no admin link.
3. `getRecordsCreatedByMonth` returns ≤ 12 months × ≤ 5 entities; a month with zero records still renders as a 0 bucket in the chart.
4. `getContentTotals().cards` matches the sum of `getNavBadgeCounts().cards.count` across all families (same "balance > 0" rule).
5. Families table: create a record in a family, confirm its count increments and `lastActivityAt` reflects the most recent member visit; soft-delete it (`isActive=false`) and confirm the count drops.
6. Narrow viewport (~360px): Families table scrolls horizontally within its own container, page body does not; charts stay legible.
7. Light + dark theme both render the charts with adequate contrast.
