# Customizable "Expiring Soon" Window — Detailed Design

**Status:** Ready to implement. Builds on [expiring-soon-days-setting-hld.md](./expiring-soon-days-setting-hld.md); all open questions there are now decided.

## Decisions locked

| Question | Decision |
|---|---|
| Per-user or per-family? | **Per-family.** Shared highlight on shared data — see HLD's Scope decision. |
| Storage shape | **`FamilyGroup.settings String?`** — JSON-encoded text, not a typed column and not Prisma's `Json`/`jsonb` type. Chosen so Phase 2 (per-category windows) needs no second migration. |
| Default window | **60 days** (already live in `lib/date.ts`/`app/actions.ts` as a hardcoded constant — this feature makes it configurable, not new behavior). |
| Bounds | **1–365 days**, enforced via zod on the settings form. |
| Who can edit it | **Any signed-in family member** — not owner-gated, matching every other family-scoped write in the app. |
| Live update? | **No.** Takes effect on next page load/navigation, same as the existing nav-badge staleness precedent. |

---

## 1. Data model change

```sql
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "settings" TEXT;
```

```prisma
model FamilyGroup {
  // ...existing fields unchanged...
  settings String? // JSON-encoded family preferences — see lib/familySettings.ts
}
```

### What actually lands in the DB — example rows

| `FamilyGroup.id` | `settings` (raw `TEXT` column value) | Meaning |
|---|---|---|
| `5e0f18f1-...` (THE NADAVS, today) | `NULL` | Every existing family, pre-migration and pre-Settings-save. `parseFamilySettings(null)` returns the all-defaults object — behaves exactly like the current hardcoded `60`. |
| same family, after saving `30` in Settings | `{"expiringSoonDays":{"default":30,"cards":null,"vouchers":null,"refunds":null,"clubs":null}}` | Phase 1 result — one family-wide number, written by `updateExpiringSoonDays`. |
| same family, illustrative **Phase 2** state (not built by this DD) | `{"expiringSoonDays":{"default":30,"cards":45,"vouchers":null,"refunds":10,"clubs":null}}` | Cards get a longer 45-day window, Refunds a tighter 10-day window, Vouchers/Clubs still fall back to the 30-day default. Shown here only to demonstrate the shape survives Phase 2 with zero migration — no code in this DD produces this row. |
| same family, illustrative **future unrelated setting** alongside this one | `{"expiringSoonDays":{"default":30,...},"theme":"dark"}` | A hypothetical later feature (e.g. a dark-mode preference) adds its own top-level `theme` key. Because `parseFamilySettings` spreads `...parsed` before overwriting `expiringSoonDays`, saving a new `expiringSoonDays` value via this feature's Settings form leaves `theme` untouched — and vice versa. Not built by this DD; shown only to demonstrate the read-merge-write pattern actually holds up. |

A quick way to inspect it directly against Neon during/after implementation:

```sql
SELECT id, name, settings FROM "FamilyGroup" WHERE id = '5e0f18f1-87c3-45ab-a778-215c6a70f055';
```

Nullable, no SQL-level default — `NULL` means "nothing customized yet," and the application-level parser (§2) is what supplies the effective default (`60`). Every existing family starts at `NULL` post-migration and behaves identically to today until someone saves a value in Settings.

---

## 2. New file: `lib/familySettings.ts`

`settings` is a shared blob for any future family-wide preference, not a single-purpose column — `expiringSoonDays` is just the first key to live in it. `parseFamilySettings` explicitly preserves every other top-level key untouched so a save from this feature can never silently wipe out a sibling setting some other feature added later.

```ts
export type EntityCategory = 'cards' | 'vouchers' | 'refunds' | 'clubs'

export type FamilySettings = {
  expiringSoonDays: {
    default: number
    cards: number | null
    vouchers: number | null
    refunds: number | null
    clubs: number | null
  }
  // Other keys (e.g. a future `theme`, `defaultCurrency`, ...) may also be present
  // in the underlying JSON — untyped here, but never dropped. Each new family-wide
  // preference gets its own top-level key and its own typed accessor, following
  // this same file's pattern; none of them need to know about the others.
  [key: string]: unknown
}

const DEFAULT_SETTINGS: FamilySettings = {
  expiringSoonDays: { default: 60, cards: null, vouchers: null, refunds: null, clubs: null },
}

// Defensive by necessity — raw TEXT, not a DB-validated shape. Falls back
// field-by-field rather than discarding the whole blob on partial/malformed JSON.
// Preserves unrecognized top-level keys as-is (see the note above the type).
export function parseFamilySettings(raw: string | null): FamilySettings {
  let parsed: Record<string, unknown> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }
  }
  const days = (parsed.expiringSoonDays ?? {}) as Partial<FamilySettings['expiringSoonDays']>
  return {
    ...parsed,
    expiringSoonDays: {
      default: typeof days.default === 'number' ? days.default : 60,
      cards: typeof days.cards === 'number' ? days.cards : null,
      vouchers: typeof days.vouchers === 'number' ? days.vouchers : null,
      refunds: typeof days.refunds === 'number' ? days.refunds : null,
      clubs: typeof days.clubs === 'number' ? days.clubs : null,
    },
  }
}

// Phase 1 callers pass no category (always `.default`). Phase 2 will pass a
// category and get its override when set — this function's signature already
// supports that; only its callers change when Phase 2 lands.
export function getExpiringSoonDays(settings: FamilySettings, category?: EntityCategory): number {
  const override = category ? settings.expiringSoonDays[category] : null
  return override ?? settings.expiringSoonDays.default
}
```

This is also why `updateExpiringSoonDays` (§7) does a read-merge-write instead of a blind `update()`: `{ ...current, expiringSoonDays: {...} }` genuinely preserves any sibling keys a future feature has already saved, not just the one key this DD happens to know about today.

---

## 3. `getAuthenticatedFamilyId()` and its three duplicates

Files: `app/actions.ts`, `app/vouchers/actions.ts`, `app/refunds/actions.ts`, `app/clubs/actions.ts`. Each has an identical private helper today:

```ts
async function getAuthenticatedFamilyId(): Promise<{ familyId: string; userId: string }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { familyId: true } })
  if (!user?.familyId) redirect('/onboarding')
  return { familyId: user.familyId, userId }
}
```

Change (identical edit in all 4 files):

```ts
import { parseFamilySettings, getExpiringSoonDays } from '../lib/familySettings' // path relative to each file

async function getAuthenticatedFamilyId(): Promise<{ familyId: string; userId: string; expiringSoonDays: number }> {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { familyId: true, family: { select: { settings: true } } },
  })
  if (!user?.familyId) redirect('/onboarding')
  const expiringSoonDays = getExpiringSoonDays(parseFamilySettings(user.family?.settings ?? null))
  return { familyId: user.familyId, userId, expiringSoonDays }
}
```

Still one query — `select` with a nested relation compiles to a single SQL statement.

---

## 4. `getNavBadgeCounts()` in `app/actions.ts`

Delete the module-level `EXPIRING_SOON_DAYS = 60` constant. Source it from the call instead:

```ts
export async function getNavBadgeCounts(): Promise<NavBadgeCounts> {
  if (!ENABLE_NAV_BADGES) { /* unchanged */ }

  const { familyId, expiringSoonDays } = await getAuthenticatedFamilyId()
  const now = new Date()
  const soonThreshold = new Date(now)
  soonThreshold.setDate(soonThreshold.getDate() + expiringSoonDays)
  // ...rest unchanged...
}
```

---

## 5. The 4 `page.tsx` files

`app/cards/page.tsx`, `app/vouchers/page.tsx`, `app/refunds/page.tsx`, `app/clubs/page.tsx` each currently do their own inline version of the `familyId`-only lookup (not via the shared helper, since page.tsx is an RSC, not a Server Action file). Same extension:

```ts
// app/cards/page.tsx (representative — same shape in the other 3)
import { parseFamilySettings, getExpiringSoonDays } from '../../lib/familySettings'

const user = await prisma.user.findUnique({
  where: { clerkId: userId },
  select: { familyId: true, family: { select: { settings: true } } },
})
if (!user?.familyId) redirect('/onboarding')
const { familyId } = user
const expiringSoonDays = getExpiringSoonDays(parseFamilySettings(user.family?.settings ?? null))

// ...existing data fetch...

return <GiftCardsClient cards={payload} providerOptions={providerOptions} expiringSoonDays={expiringSoonDays} />
```

---

## 6. The 4 `*Client.tsx` files

Each gains one new required prop and one local wrapper; every existing `isExpiringSoon(x)` call site in that file becomes `soon(x)`.

```tsx
// components/GiftCardsClient.tsx (representative)
export default function GiftCardsClient({
  cards,
  providerOptions,
  expiringSoonDays,
}: {
  cards: CardWithBalance[]
  providerOptions: ProviderOption[]
  expiringSoonDays: number
}) {
  const soon = (expiresAt: string | undefined) => isExpiringSoon(expiresAt, expiringSoonDays)
  // ...isExpiringSoon(card.expiresAt) -> soon(card.expiresAt), everywhere in this file...
}
```

Call-site count per file (from the current codebase, for tracking during implementation):
- `GiftCardsClient.tsx`: 5 call sites (detail modal, desktop table, 2× mobile list).
- `VouchersClient.tsx`: 2 call sites (detail modal, `VoucherRow`).
- `RefundsClient.tsx`: 2 call sites (detail modal, `RefundRow`).
- `ClubsClient.tsx`: 2 call sites (detail modal, `ClubRow`).

`ExpiryDaysBadge` (the day-count pill) is unaffected — it takes `expiresAt` only and computes its own day count via `daysUntil()`, independent of the threshold used to decide *whether* to show it.

---

## 7. Settings — action, page, UI

### `app/settings/actions.ts` — new `updateExpiringSoonDays`

```ts
import { parseFamilySettings } from '../../lib/familySettings'

const expiringSoonDaysSchema = z.object({
  expiringSoonDays: z.coerce.number().int().min(1).max(365),
})

export async function updateExpiringSoonDays(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const parsed = expiringSoonDaysSchema.safeParse({ expiringSoonDays: formData.get('expiringSoonDays') })
  if (!parsed.success) return { error: 'Enter a number between 1 and 365.' }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { familyId: true } })
  if (!dbUser?.familyId) redirect('/onboarding')

  const family = await prisma.familyGroup.findUnique({ where: { id: dbUser.familyId }, select: { settings: true } })
  const current = parseFamilySettings(family?.settings ?? null)
  const updated = { ...current, expiringSoonDays: { ...current.expiringSoonDays, default: parsed.data.expiringSoonDays } }

  await prisma.familyGroup.update({
    where: { id: dbUser.familyId },
    data: { settings: JSON.stringify(updated) },
  })

  revalidatePath('/settings')
}
```

Read-merge-write (not a blind update) — required so this never clobbers other keys the blob might hold, now or once Phase 2 adds per-category keys.

### `app/settings/page.tsx`

```ts
import { parseFamilySettings, getExpiringSoonDays } from '../../lib/familySettings'

// existing prisma.user.findUnique({ include: { family: true } }) call —
// extend to also read user.family.settings (already in scope via `include: { family: true }`)
const expiringSoonDays = getExpiringSoonDays(parseFamilySettings(user.family.settings))
// pass to <SettingsClient expiringSoonDays={expiringSoonDays} ... />
```

### `SettingsClient.tsx`

New section, same form-and-server-action pattern as the existing family name / invite code sections:

```tsx
<form action={updateExpiringSoonDays} className="settings-expiry-section ...">
  <label>{t.expiringSoonDaysLabel}</label>
  <p className="text-xs text-slate-400">{t.expiringSoonDaysHelp}</p>
  <input type="number" name="expiringSoonDays" min={1} max={365} defaultValue={expiringSoonDays} className={inputClass} />
  <button type="submit">{t.saveChanges}</button>
</form>
```

### i18n — `lib/i18n.ts` (en/he)

| key | en | he |
|---|---|---|
| `expiringSoonDaysLabel` | "Expiring soon" window (days) | חלון "פג תוקף בקרוב" (בימים) |
| `expiringSoonDaysHelp` | Cards, vouchers, refunds, and clubs are highlighted this many days before they expire. | כרטיסים, שוברים, זיכויים ומועדונים מודגשים כל כך הרבה ימים לפני שפג תוקפם. |
| `expiringSoonDaysSaved` | Saved | נשמר |

---

## 8. Explicitly out of scope for this DD

- Phase 2 (per-category windows): UI for per-entity inputs, and changing each `*Client.tsx` to call `getExpiringSoonDays(settings, 'cards')` etc. instead of the shared default. The data shape and helper already support it; nothing here blocks it.
- Live update without reload.
- Any validation beyond range bounds (e.g. warning if set unusually low/high).

---

## Verification

1. `npx tsc --noEmit` after each file group (helpers → nav badges → pages → `*Client.tsx` files → settings) rather than one big change — matches how every prior feature in this session was verified incrementally.
2. Confirm a family with `settings = NULL` (every family, pre-migration) renders identically to today — 60-day window, no visual change — before touching Settings at all.
3. In Settings, save a small value (e.g. `3`) — confirm on `/cards`, `/vouchers`, `/refunds`, `/clubs` after a reload that fewer items now show the amber "expiring soon" highlight, and the nav badge colors update accordingly.
4. Save a large value (e.g. `300`) — confirm more items light up amber.
5. Try an out-of-range value (`0`, `400`, non-numeric) — confirm the form rejects it with the zod error message and the stored value doesn't change.
6. Confirm `ExpiryDaysBadge`'s day-count number is unaffected by the threshold change (it's computed independently from `expiresAt` alone).
7. Confirm the already-expired (rose) tier is still unaffected by this setting entirely — `hasExpired`/overdue detection has never depended on the "soon" window.
