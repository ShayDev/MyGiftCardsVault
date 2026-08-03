# Customizable "Expiring Soon" Window — HLD

## Overview

Let a family customize the number of days used by the "expiring soon" highlight/badges (currently a hardcoded `60` in `lib/date.ts`'s `isExpiringSoon()` and duplicated as `EXPIRING_SOON_DAYS = 60` in `app/actions.ts`'s nav-badge calc). Editable from the Settings page.

**Scope decision — per-family, not per-user:** the highlight applies to shared data (the same cards/vouchers/refunds/clubs every family member sees), so two people seeing different urgency windows on the identical card would be a confusing inconsistency, not a feature.

**Phase 1 vs Phase 2:** Phase 1 ships a single family-wide default (the only thing built now). Phase 2 (not built yet, but designed for) lets a family override that default per category — e.g. Vouchers get a shorter window than Cards. Rather than a typed `expiringSoonDays Int` column that a Phase 2 category feature would need a second migration to replace, the column is a JSON-encoded text blob from day one, so Phase 2 is a pure application-layer change — no schema migration when it lands.

---

## Data Model

### `FamilyGroup.settings` (new column — generic, not single-purpose)

```prisma
model FamilyGroup {
  id          String        @id @default(uuid())
  name        String
  inviteCode  String        @unique
  ownerId     String        @unique
  owner       User          @relation("FamilyOwner", fields: [ownerId], references: [id])
  users       User[]        @relation("FamilyMembers")
  giftCards   GiftCard[]
  vouchers    Voucher[]
  clubMembers ClubMember[]
  refunds     Refund[]
  settings    String?       // JSON-encoded family preferences — see lib/familySettings.ts
  createdAt   DateTime      @default(now())
}
```

Deliberately `String?` (Postgres `TEXT`), not Prisma's `Json` type (`jsonb`) — matches what was asked for: plain text holding a JSON string, parsed/stringified in application code rather than queried at the SQL level. Nullable, no default: `null` means "no custom settings saved yet," and the parsing helper (below) fills in all defaults for that case. Named generically (`settings`, not `expiringSoonDays`) since it's a natural place for any future family-wide preference, not just this one.

### Migration (raw SQL, same convention as `Provider.balanceCheckUrl`)

```sql
ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "settings" TEXT;
```

### JSON shape

```json
{
  "expiringSoonDays": {
    "default": 60,
    "cards": null,
    "vouchers": null,
    "refunds": null,
    "clubs": null
  }
}
```

Phase 1 only ever reads/writes `.expiringSoonDays.default`. The per-category keys exist in the shape from the start (always present, `null` until Phase 2's UI sets one) so a Phase 2 read never has to guess whether the key is merely absent vs. intentionally unset — both parse to "fall back to default."

### `lib/familySettings.ts` (new)

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
  // Other future family-wide preferences (theme, defaultCurrency, ...) may also
  // live as sibling top-level keys — untyped here, but never dropped by the parser.
  [key: string]: unknown
}

const DEFAULT_SETTINGS: FamilySettings = {
  expiringSoonDays: { default: 60, cards: null, vouchers: null, refunds: null, clubs: null },
}

// Defensive by necessity — this is raw TEXT, not a DB-validated shape. Malformed
// or partial JSON (including data saved by an older/newer version of this app)
// falls back field-by-field rather than discarding the whole blob. Also preserves
// any unrecognized top-level key untouched (`...parsed`), so a save from this
// feature can never clobber a sibling setting some other feature added later.
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

// Phase 1 call sites pass no category and always get `.default`. Phase 2 will
// pass a category and get its override when set — this function doesn't change
// when that happens, only its callers do.
export function getExpiringSoonDays(settings: FamilySettings, category?: EntityCategory): number {
  const override = category ? settings.expiringSoonDays[category] : null
  return override ?? settings.expiringSoonDays.default
}
```

---

## Why this still costs zero additional DB queries

Every page (`app/cards/page.tsx`, `app/vouchers/page.tsx`, `app/refunds/page.tsx`, `app/clubs/page.tsx`) and the private `getAuthenticatedFamilyId()` helper (duplicated in `app/actions.ts`, `app/vouchers/actions.ts`, `app/refunds/actions.ts`, `app/clubs/actions.ts`) already run this lookup on every load/action, purely to resolve `familyId`:

```ts
const user = await prisma.user.findUnique({
  where: { clerkId: userId },
  select: { familyId: true },
})
```

Extending the `select` to also pull the raw `settings` text through the relation still rides on that same single query (a JOIN, not a second round-trip):

```ts
const user = await prisma.user.findUnique({
  where: { clerkId: userId },
  select: { familyId: true, family: { select: { settings: true } } },
})
const familySettings = parseFamilySettings(user?.family?.settings ?? null)
const expiringSoonDays = getExpiringSoonDays(familySettings)
```

---

## Wiring it through

### 1. The 4 page.tsx files

Each adds the extended select + parse (as above) and passes the resolved number down as a prop — this part is unaffected by the JSON-vs-column change, since `getExpiringSoonDays()` still ultimately hands back a plain `number`:

```tsx
return <GiftCardsClient cards={payload} providerOptions={providerOptions} expiringSoonDays={expiringSoonDays} />
```

### 2. The 4 `*Client.tsx` files

Unchanged from the original plan — each defines one local wrapper from its new prop:

```tsx
export default function GiftCardsClient({ cards, providerOptions, expiringSoonDays }: { ...; expiringSoonDays: number }) {
  const soon = (expiresAt: string | undefined) => isExpiringSoon(expiresAt, expiringSoonDays)
  // every isExpiringSoon(x) call site becomes soon(x)
```

(When Phase 2 lands, this is the one place that changes per file: `getExpiringSoonDays(familySettings, 'cards')` instead of no-category, threaded down as a per-entity prop instead of one shared number. Out of scope for now — noted here only to show the shape holds up.)

### 3. `getNavBadgeCounts()` in `app/actions.ts`

Same as before, just sourced from the parsed settings instead of a flat column:

```ts
const { familyId, expiringSoonDays } = await getAuthenticatedFamilyId()
const soonThreshold = new Date(now)
soonThreshold.setDate(soonThreshold.getDate() + expiringSoonDays)
```

`getAuthenticatedFamilyId()`'s return type still grows from `{ familyId, userId }` to `{ familyId, userId, expiringSoonDays }` — the JSON parsing happens inside the helper, callers don't see it.

---

## Settings UI

### `app/settings/page.tsx`

Extend the existing `prisma.user.findUnique({ include: { family: true } })` call to select `settings`, parse it with `parseFamilySettings()`, pass `expiringSoonDays: familySettings.expiringSoonDays.default` to `SettingsClient`. Still no new query.

### `app/settings/actions.ts` — new `updateExpiringSoonDays`

Unlike a typed column, writing back requires a read-merge-write — a blind `update()` would silently wipe any other keys the JSON blob holds (including Phase 2's per-category values, once those exist):

```ts
const expiringSoonDaysSchema = z.object({
  expiringSoonDays: z.coerce.number().int().min(0).max(365),
})

export async function updateExpiringSoonDays(formData: FormData) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const parsed = expiringSoonDaysSchema.safeParse({ expiringSoonDays: formData.get('expiringSoonDays') })
  if (!parsed.success) return { error: 'Enter a number between 0 and 365.' }

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId }, select: { familyId: true } })
  if (!dbUser?.familyId) redirect('/onboarding')

  const family = await prisma.familyGroup.findUnique({ where: { id: dbUser.familyId }, select: { settings: true } })
  const current = parseFamilySettings(family?.settings ?? null)
  const updated: FamilySettings = {
    ...current,
    expiringSoonDays: { ...current.expiringSoonDays, default: parsed.data.expiringSoonDays },
  }

  await prisma.familyGroup.update({
    where: { id: dbUser.familyId },
    data: { settings: JSON.stringify(updated) },
  })

  revalidatePath('/settings')
}
```

This is the one real cost of the JSON-blob approach vs. a typed column: one extra read before the write, every time. Accepted tradeoff for Phase 2 flexibility — Settings saves aren't a hot path.

**Who can edit it:** any signed-in family member, not owner-only — matches every other family-scoped write in the app.

### `SettingsClient.tsx`

Same as before: one number input (0–365) in its own section, save button calling `updateExpiringSoonDays`. No per-category inputs yet — those are Phase 2.

### i18n (new keys)

| key | en | he |
|---|---|---|
| `expiringSoonDaysLabel` | "Expiring soon" window (days) | חלון "פג תוקף בקרוב" (בימים) |
| `expiringSoonDaysHelp` | Cards, vouchers, refunds, and clubs are highlighted this many days before they expire. | כרטיסים, שוברים, זיכויים ומועדונים מודגשים כל כך הרבה ימים לפני שפג תוקפם. |
| `expiringSoonDaysSaved` | Saved | נשמר |

---

## Implementation Order

1. Add `settings` to `FamilyGroup` in `schema.prisma`; run the `ALTER TABLE` migration (dev, then prod).
2. `lib/familySettings.ts` — `FamilySettings` type, `parseFamilySettings()`, `getExpiringSoonDays()`.
3. Extend `getAuthenticatedFamilyId()` (and its 3 duplicates) to select `family.settings`, parse it, and also return `expiringSoonDays`.
4. Update `getNavBadgeCounts()` to use it instead of the hardcoded `EXPIRING_SOON_DAYS`.
5. Extend the 4 `page.tsx` familyId lookups the same way; pass `expiringSoonDays` down as a prop.
6. Add the local `soon()` wrapper to each `*Client.tsx` and swap every `isExpiringSoon(x)` call site to `soon(x)` — one file at a time, verify with `tsc --noEmit` after each.
7. `app/settings/actions.ts` — `updateExpiringSoonDays` (read-merge-write).
8. `app/settings/page.tsx` — parse and pass the current default through.
9. `SettingsClient.tsx` — the input + save UI.
10. i18n keys.
11. Manual check: change the value in Settings, confirm the highlight window on `/cards` (etc.) and the nav badge colors both reflect it after a reload; confirm a family with `settings = NULL` (every existing family, pre-migration) still behaves exactly like today (60-day default).

---

## Out of Scope (Phase 1)

- Per-user override — deliberately rejected; see Scope decision above.
- Per-category windows (Cards vs Vouchers vs Refunds vs Clubs) — this is exactly Phase 2. The JSON shape and `getExpiringSoonDays(settings, category)` already support it; only the Settings UI (per-category inputs) and each `*Client.tsx`'s prop (per-entity instead of shared) remain to be built.
- Live update without a page reload — Settings changes take effect on next navigation/reload, consistent with how nav badge data is already only session-fresh.
