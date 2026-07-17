# Provider Field — Closed List with Custom Value — HLD / DD

## Overview

Replace the free-text `provider` input with a combobox backed by a DB-stored list of provider names. The list has two layers per `type`:

- **Global options** — seeded once, shared by every family (Amazon, IKEA, Starbucks, …)
- **Custom options** — added on the fly by a family when they type a provider that isn't in the list yet; saved so it appears as a normal option next time (for that family only)

The combobox supports three interaction modes in one control: browsing the full list, type-ahead filtering, and free-text entry for anything not found.

**Scope for now:** Gift Cards only (Add Card + Edit Card). The data model and component are generic over `type` so Vouchers, Clubs, and Refunds can be wired in later with no schema or component changes — only a new call site.

---

## Data Model

### `Provider` (new table)

| Field           | Type       | Notes                                                              |
|-----------------|------------|------------------------------------------------------------------------|
| `id`            | `String` (uuid) | PK                                                                 |
| `type`          | `String`   | `'CARD'` for now; `'VOUCHER'` \| `'CLUB'` \| `'REFUND'` later              |
| `name`          | `String?`  | Canonical (English) name, e.g. "Google Play". Set for seeded rows; set for a custom entry only if it was typed in English |
| `nameByCountry` | `String?`  | Localized display variant for `country`, e.g. "גוגל פליי". Set for seeded rows; set for a custom entry only if it was typed in the country's language (Hebrew, for now) |
| `country`       | `String`   | ISO 3166-1 alpha-2 code, default `'IL'`. Scopes which providers apply where; ready for other countries later |
| `familyId`      | `String`   | Default `'0'` — the sentinel meaning "shared/global", not a real `FamilyGroup.id`. Set to a real family id = custom option, visible only to that family |
| `createdBy`     | `String?`  | FK-by-convention to `User.id` (loose reference, same pattern as `GiftCard.createdBy` etc.) — `null` for seeded rows |
| `createdAt`     | `DateTime` | Default `now()`                                                         |

```prisma
model Provider {
  id            String   @id @default(uuid())
  type          String
  name          String?
  nameByCountry String?
  country       String   @default("IL")
  familyId      String   @default("0")
  createdBy     String?
  createdAt     DateTime @default(now())

  @@index([type, country, familyId])
}
```

**Why both `name` and `nameByCountry`, and why both are nullable:** `name` is the canonical (English) value; `nameByCountry` is the localized display variant for the row's `country`. Seeded rows have both, hand-curated. A custom entry a family types in has no translation available — we only know the one string they typed, in whatever language they typed it in. Rather than stuffing that single string into both columns (which would corrupt `name`'s "canonical/English" meaning with non-English text), it's routed based on whether it *is* English: English text → `name`, anything else (Hebrew, mixed, or otherwise) → `nameByCountry`. Checking "is it English" rather than "is it Hebrew" matters for the fallback direction — a string that's neither pure English nor pure Hebrew (mixed input, a different script entirely) should land in the localized bucket, not get miscategorized as canonical/English by default. Detection is a simple ASCII-only check (`isEnglishText`, see `ensureProviderExists` below). A DB `CHECK` constraint enforces at least one of the two is set; display and matching both use `nameByCountry ?? name`, so either being `null` is fine everywhere else in the design.

**Why `country` and not `locale`:** the app already ties itself to Israel (ILS default currency, Hebrew as a supported locale, Israeli brand examples throughout). A `country` scope lets the seeded list reflect what's actually relevant there (Shufersal, Rami Levy) rather than a language toggle. Stored as the ISO 3166-1 alpha-2 code (`'IL'`) rather than the full name, to save space. `familyId` and `country` are independent scopes: a row can be global-in-Israel (`familyId = '0', country = 'IL'`) or, later, global-in-another-country.

**Why `familyId` is *not* a real FK here, unlike every other table:** `GiftCard`/`Voucher`/`ClubMember`/`Refund` all have a strict `familyId` FK to `FamilyGroup`. `Provider` can't do that and still use a `'0'` sentinel for "shared" — there's no `FamilyGroup` row with id `'0'`, so a real FK constraint would reject every global row. `familyId` on `Provider` is deliberately a plain, unconstrained string column: `'0'` = shared, anything else = expected to be a real `FamilyGroup.id` but not DB-enforced as one (same loose-reference pattern the codebase already uses for `createdBy` everywhere).

### Migration (raw SQL against Neon, same convention as Clubs)

```sql
CREATE TABLE IF NOT EXISTS "Provider" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "type"          TEXT        NOT NULL,
  "name"          TEXT,
  "nameByCountry" TEXT,
  "country"       TEXT        NOT NULL DEFAULT 'IL',
  "familyId"      TEXT        NOT NULL DEFAULT '0',
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Provider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Provider_name_check" CHECK ("name" IS NOT NULL OR "nameByCountry" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "Provider_type_country_familyId_idx" ON "Provider" ("type", "country", "familyId");

-- Case-insensitive de-dupe within each scope, keyed off the *displayed* value
-- (nameByCountry when set, else name) since that's what a user could retype.
-- familyId is never NULL (sentinel '0' covers "shared"), so a single
-- functional unique index is enough — no partial-index split needed.
CREATE UNIQUE INDEX IF NOT EXISTS "Provider_scope_name_unique"
  ON "Provider" ("type", "country", "familyId", lower(COALESCE("nameByCountry", "name")));
```

### Seed data (global, `type = 'CARD'`, `country = 'IL'`)

One-off insert, editable later without a code change:

```sql
INSERT INTO "Provider" ("type", "name", "nameByCountry") VALUES
  ('CARD', 'Amazon', 'אמזון'), ('CARD', 'Target', 'טארגט'), ('CARD', 'Starbucks', 'סטארבקס'),
  ('CARD', 'Apple', 'אפל'), ('CARD', 'Google Play', 'גוגל פליי'), ('CARD', 'Steam', 'סטים'),
  ('CARD', 'Netflix', 'נטפליקס'), ('CARD', 'IKEA', 'איקאה'), ('CARD', 'Zara', 'זארה'),
  ('CARD', 'Shufersal', 'שופרסל'), ('CARD', 'Rami Levy', 'רמי לוי'), ('CARD', 'Fox', 'פוקס'),
  ('CARD', 'Castro', 'קסטרו')
ON CONFLICT DO NOTHING;
```
(`country` and `familyId` omitted — default to `'IL'` and `'0'` (shared) respectively. List is a starting point — easy to extend via SQL, no migration needed since it's just data.)

---

## Data Access

### `lib/providerTypes.ts` (new)

```ts
export type ProviderType = 'CARD' | 'VOUCHER' | 'CLUB' | 'REFUND'

// `display` is what's rendered in the combobox and what gets submitted as the
// field value. `name`/`nameByCountry` are carried along purely so the client
// can search across both languages — a seeded row typically has only one of
// them equal to `display`, the other is the "other language" match target.
export type ProviderOption = {
  display: string
  name: string | null
  nameByCountry: string | null
}
```

### `app/providers/actions.ts` (new)

```ts
// Hardcoded until FamilyGroup has a real country field — the whole app is
// Israel-only today, so this isn't a simplification that loses anything yet.
const DEFAULT_COUNTRY = 'IL'

// Sentinel familyId meaning "shared / global" — not a real FamilyGroup.id.
const SHARED_FAMILY_ID = '0'

// Checks "is it English", not "is it Hebrew" — anything that isn't plain
// ASCII (Hebrew, mixed input, any other script) falls into the localized
// bucket by default rather than being miscategorized as canonical/English.
function isEnglishText(value: string): boolean {
  return [...value].every((ch) => (ch.codePointAt(0) ?? 0) <= 0x7f)
}

// Keeps custom English entries visually consistent with the seeded list
// (Amazon, Target, …) rather than however the user happened to type it.
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export async function getProviderOptions(type: ProviderType): Promise<ProviderOption[]> {
  const { familyId } = await getAuthenticatedFamilyId()
  const rows = await prisma.provider.findMany({
    where: { type, country: DEFAULT_COUNTRY, familyId: { in: [SHARED_FAMILY_ID, familyId] } },
    select: { name: true, nameByCountry: true },
  })
  // Sort by the displayed value, not raw `name` — `name` can be null for
  // non-English custom entries, and Prisma can't orderBy a COALESCE expression.
  return rows
    .map((r) => ({ display: r.nameByCountry ?? r.name!, name: r.name, nameByCountry: r.nameByCountry }))
    .sort((a, b) => a.display.localeCompare(b.display))
}

// Called from within card/voucher/club/refund server actions after a
// successful create/update — never directly from the client.
export async function ensureProviderExists(
  type: ProviderType,
  displayName: string,
  familyId: string,
  userId: string,
) {
  const trimmed = displayName.trim()
  if (!trimmed) return

  const existing = await prisma.provider.findFirst({
    where: {
      type,
      country: DEFAULT_COUNTRY,
      familyId: { in: [SHARED_FAMILY_ID, familyId] },
      OR: [
        { name: { equals: trimmed, mode: 'insensitive' } },
        { nameByCountry: { equals: trimmed, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  })
  if (existing) return

  // No translation available for a custom entry — store the typed value in
  // whichever column matches its script, leave the other null. English text
  // is capitalized to match the seeded list's styling.
  const isEnglish = isEnglishText(trimmed)
  await prisma.provider.create({
    data: {
      type,
      name: isEnglish ? capitalizeFirst(trimmed) : null,
      nameByCountry: isEnglish ? null : trimmed,
      country: DEFAULT_COUNTRY,
      familyId,
      createdBy: userId,
    },
  })
}
```

`ensureProviderExists` is a best-effort save — not wrapped in the same transaction as the card write. If it fails, the card save still succeeds; the provider just won't be remembered that one time.

### Wiring into `app/actions.ts`

At the end of `createCard` and `updateCard`, after the `GiftCard` write succeeds:

```ts
await ensureProviderExists('CARD', data.provider ?? '', familyId, userId)
```

Note: `updateCard` currently only destructures `familyId` from `getAuthenticatedFamilyId()` (no `userId`) — it'll need to pull `userId` too so it has something to pass as `createdBy`.

### `app/cards/page.tsx`

Fetch options alongside cards and pass them down:

```ts
const providerOptions = await getProviderOptions('CARD')
...
return <GiftCardsClient cards={payload} providerOptions={providerOptions} />
```

---

## Component Design — `ProviderCombobox`

New file: `components/ProviderCombobox.tsx`. Generic — no Gift Card–specific logic, so it can be reused as-is for other entity types.

### Props

```ts
type ProviderComboboxProps = {
  name: string                  // form field name (e.g. "provider") for FormData capture
  defaultValue?: string
  options: ProviderOption[]     // global + family custom, already merged
  placeholder?: string
}
```

### Interaction modes

1. **Browse** — on focus, show the full `options` list in a dropdown panel below the input, rendering each row's `display` value.
2. **Type-ahead search** — as the user types, filter `options` by case-insensitive substring match against `display`, `name`, *and* `nameByCountry` — so typing the English name of a seeded row finds it even though only the localized `display` is shown (e.g. typing `"Shu"` matches Shufersal's row even though the row renders `שופרסל`). The matching substring is highlighted only within the rendered `display` text.
3. **Free text** — if the typed value doesn't case-insensitively match any option's `display`, `name`, or `nameByCountry`, show an `Add "{value}"` row at the bottom of the filtered results (or as the only row when there are zero matches). Selecting it, or just blurring/submitting with unmatched text, keeps the typed value as-is — the actual DB write happens server-side via `ensureProviderExists` on form submit, not from the component.

### Behavior details

- Internally an uncontrolled-style text input (local `useState` for the query string, same pattern already used for the `link` field in `AddCardModal`) — the visible `<input>` itself carries `name="provider"` so `FormData` capture in `handleSubmit` needs no changes.
- Selecting an option (click or `Enter`) always sets the input's value to that option's `display` string — even when the match came from `name` or `nameByCountry` rather than `display` itself.
- Dropdown closes on: selecting an option, `Escape`, or click-outside.
- Keyboard: `ArrowDown`/`ArrowUp` moves a highlighted row, `Enter` selects the highlighted row (or the "Add" row if none is matched), `Escape` closes without changing the value.
- Mobile: options list rows are `min-h-11` (44px) for tap targets, per the project's touch-target rule.

### Visual spec

- Input reuses the existing `inputClass` styling for visual consistency with other fields.
- Dropdown panel: white background, `rounded-xl`, `border border-slate-200`, `shadow-lg`, `max-h-56 overflow-y-auto`, positioned absolutely below the input.
- Option row: `min-h-11 px-3 flex items-center`, hover/highlighted state `bg-emerald-50 text-emerald-700`.
- "Add new" row: visually distinct — `+` icon prefix, `text-emerald-600 font-medium`, pinned to the bottom of the list.

### Accessibility

`role="combobox"` on the input, `aria-expanded`, `aria-controls` pointing at the listbox `id`; each option `role="option"`; `aria-activedescendant` tracks the highlighted row.

---

## Wiring into Gift Card Forms

`components/GiftCardsClient.tsx`:

- `AddCardModal` and `EditCardModal` both receive/derive `providerOptions: ProviderOption[]` (passed down from the page → `GiftCardsClient` → each modal).
- Replace the current plain input:
  ```tsx
  <Field label={t.providerLabel}>
    {/* TODO: replace with a closed list (combobox with custom value option) */}
    <input name="provider" placeholder={t.providerPlaceholder} className={inputClass} />
  </Field>
  ```
  with:
  ```tsx
  <Field label={t.providerLabel}>
    <ProviderCombobox
      name="provider"
      defaultValue={card?.provider}   // EditCardModal only
      options={providerOptions}
      placeholder={t.providerPlaceholder}
    />
  </Field>
  ```
- Removes the `TODO` comment that's been sitting in `AddCardModal` since the initial build.

---

## i18n

No new keys strictly required — reuses existing `providerLabel` / `providerPlaceholder`. One optional addition for the "Add new" row:

**English:** `addProviderOption: 'Add "{value}"'`
**Hebrew:** `addProviderOption: 'הוסף "{value}"'`

(`{value}` interpolated client-side; exact templating mechanism follows however the codebase already handles interpolated i18n strings, if at all — otherwise hardcode `Add: ` prefix + value.)

---

## Implementation Order

1. Add `Provider` model to `schema.prisma`; run the raw SQL migration (dev + prod)
2. Seed global `CARD` providers via SQL insert
3. Add `lib/providerTypes.ts`
4. Add `app/providers/actions.ts` (`getProviderOptions`, `ensureProviderExists`)
5. Call `ensureProviderExists` from `createCard` and `updateCard` in `app/actions.ts`
6. Fetch and pass `providerOptions` in `app/cards/page.tsx`
7. Build `components/ProviderCombobox.tsx`
8. Swap the provider `<input>` for `<ProviderCombobox>` in `AddCardModal` and `EditCardModal`

---

## Out of Scope

- Wiring into Voucher / Club / Refund forms (data model and component are ready for it, but call sites are a separate follow-up)
- Real per-family `country` (no `FamilyGroup.country` field exists yet — `getProviderOptions`/`ensureProviderExists` hardcode `'IL'` until multi-country support is actually needed)
- Admin UI for managing the global provider list (seeded/edited via SQL only, for now)
- Provider logos/icons
- Renaming or merging duplicate custom providers across families
- Cross-scope duplicate prevention beyond the insert-time check (e.g. a global "IKEA" and a pre-existing family-custom "ikea" added before this feature shipped won't retroactively merge)
