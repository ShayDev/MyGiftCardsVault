# Warranty Support — Detailed Design

**Status:** Ready to implement. Builds on [warranty-hld.md](./warranty-hld.md); all open questions there are now decided.

## Decisions locked

| Question | Decision |
|---|---|
| Nav placement | **5th `BottomNav` tab**, always visible. Labels collapse to icon-only under a ~380px viewport. |
| Expiry capture | **`purchaseDate` + `durationMonths`** drive a computed `expiresAt`, directly overridable. `expiresAt` is the one field every badge/section calculation reads. |
| Status model | **Computed, not stored.** Active = `expiresAt` null or in the future; Expired = `expiresAt` in the past. No `isUsed`/`status` column. |
| AI scan | **Yes** — `WARRANTY` added as a 4th `entityType` to `/api/extract`, extracting `purchasedFrom` only. |
| Proof of purchase | **Both** `imageUrl` (permanent Vercel Blob, like `Refund`) and `link` (encrypted URL field). |
| Purchase-vs-claim company | **New dedicated `WarrantyProvider` table** (`name`/`nameByCountry`/`country`, `phone`/`url`), used for *both* roles: `purchasedFrom` (required) and `warrantyCompany` (optional, defaults to "same as purchasedFrom"). Not the generic `Provider` table, but mirrors its `name`/`nameByCountry`/`country` bilingual-display shape exactly (added after initial implementation, at the user's request, to match `Provider`). |
| `WarrantyProvider` scope | **Family + global**, same `familyId` default-`'0'` sentinel convention as `Provider`. Seed common manufacturers/retailers as global rows. |
| Physical branch/location | **Optional free-text `branch` field on `Warranty`** (e.g. "Rishon LeZion"), paired with `purchasedFrom` — not a structured/reusable sub-entity under `WarrantyProvider`. Typed fresh per warranty, no autocomplete. |

---

## 1. Data model

### `WarrantyProvider` (new Prisma model)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `id` | `String` (uuid) | PK |
| 2 | `familyId` | `String` | Default `'0'` sentinel = shared/global (not a real FK), same convention as `Provider.familyId` — a real family id means a custom entry added by that family |
| 3 | `name` | `String?` | Canonical/English name — nullable, at least one of `name`/`nameByCountry` must be set (DB `CHECK`), same as `Provider.name` |
| 4 | `phone` | `String?` | Support/claims phone number |
| 5 | `url` | `String?` | Support/claims website |
| 6 | `nameByCountry` | `String?` | Localized display name (Hebrew, for `country = 'IL'`) — nullable, same as `Provider.nameByCountry` |
| 7 | `country` | `String` | ISO 3166-1 alpha-2, default `'IL'` — same as `Provider.country` |
| 8 | `createdBy` | `String?` | FK → `User.id`, loose reference like `Provider.createdBy` |
| 9 | `createdAt` | `DateTime` | Default `now()` |

Deliberately **not** folded into the generic `Provider` table: `Provider` is shaped for "just a display name" across `CARD`/`VOUCHER`/`CLUB`/`REFUND`, and bolting `phone`/`url` columns onto it that only ever populate for one type would make that table's shape lie about what it's for. `WarrantyProvider` is a small sibling table with the same directory *pattern* as `Provider` — family + global sentinel, dedup, free-text-creates-a-row, and (added after initial implementation, at the user's request) the identical `name`/`nameByCountry`/`country` bilingual-display shape — but its own table, with its own `phone`/`url` columns none of the other four types need.

**No `type` column** — unlike `Provider`, `WarrantyProvider` only ever backs one kind of entry (there's no `CARD`/`VOUCHER`/etc. split to make here), so it has no discriminator column at all.

### `Warranty` (new Prisma model)

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `id` | `String` (uuid) | PK |
| 2 | `seq` | `Int` (autoincrement) | Human-readable number (#1, #2…) |
| 3 | `familyId` | `String` | FK → `FamilyGroup` |
| 4 | `productName` | `String` | What was bought, e.g. "LG Fridge" — required |
| 5 | `purchasedFromId` | `String` | FK → `WarrantyProvider` — where it was bought, **required** |
| 6 | `branch` | `String?` | Physical branch/location of `purchasedFrom`, e.g. "Rishon LeZion" — free text, not a relation |
| 7 | `warrantyCompanyId` | `String?` | FK → `WarrantyProvider` — who to claim with, **optional**; `null` means "same as `purchasedFrom`" |
| 8 | `purchaseDate` | `DateTime?` | Optional — needed only to compute `durationMonths` → `expiresAt` |
| 9 | `durationMonths` | `Int?` | Optional — warranty length in months, display/reference only |
| 10 | `expiresAt` | `DateTime?` | **Authoritative** expiry date — computed at entry time, directly editable |
| 11 | `referenceId` | `String?` | Receipt/order/serial number |
| 12 | `notes` | `String?` | Free-text notes |
| 13 | `link` | `String?` | URL to receipt/warranty registration page — **encrypted at rest** |
| 14 | `imageUrl` | `String?` | Uploaded receipt/warranty card photo (Vercel Blob, permanent, not encrypted) |
| 15 | `isActive` | `Boolean` | Default `true` — soft delete |
| 16 | `createdBy` | `String?` | FK → `User.id` |
| 17 | `createdAt` | `DateTime` | Default `now()` |

**Why `branch` lives on `Warranty`, not `WarrantyProvider`:** the company directory is shared/reusable across the family (and globally seeded); a specific branch is not — it's one-off context for one purchase ("which IKEA did I actually buy this at"), not something worth deduping/autocompleting. Keeping it a plain string avoids growing `WarrantyProvider` into a two-level company→branch hierarchy for a field that's only ever display context, never queried/filtered on.

**Encryption:** only `link`, same policy as `Refund.link`/`Voucher.link`. `imageUrl` stays a plain public Blob URL. `WarrantyProvider.phone`/`url` are **not** encrypted — they're shared reusable directory data, not a secret tied to one family's purchase, same trust level as `Provider.name`.

### Schema additions (`prisma/schema.prisma`)

```prisma
model WarrantyProvider {
  id            String   @id @default(uuid())
  familyId      String   @default("0")
  name          String?
  phone         String?
  url           String?
  nameByCountry String?
  country       String   @default("IL")
  createdBy     String?
  createdAt     DateTime @default(now())

  purchasedWarranties Warranty[] @relation("PurchasedFrom")
  claimedWarranties   Warranty[] @relation("ClaimWith")

  @@index([familyId])
}

model Warranty {
  id                String            @id @default(uuid())
  seq               Int               @default(autoincrement())
  familyId          String
  family            FamilyGroup       @relation(fields: [familyId], references: [id])
  productName       String
  purchasedFromId   String
  purchasedFrom     WarrantyProvider  @relation("PurchasedFrom", fields: [purchasedFromId], references: [id])
  branch            String?
  warrantyCompanyId String?
  warrantyCompany   WarrantyProvider? @relation("ClaimWith", fields: [warrantyCompanyId], references: [id])
  purchaseDate      DateTime?
  durationMonths    Int?
  expiresAt         DateTime?
  referenceId       String?
  notes             String?
  link              String?
  imageUrl          String?
  isActive          Boolean           @default(true)
  createdBy         String?
  createdAt         DateTime          @default(now())
}
```

Also add `warranties Warranty[]` and `warrantyProviders WarrantyProvider[]` to `FamilyGroup` (the latter only used for the `familyId`-scoped read query below, not a Prisma-enforced FK — same non-FK sentinel caveat as `Provider.familyId`, so this relation is effectively informational/unused the same way `Provider` never declared one either — **omit it**, consistent with how `Provider` has no `FamilyGroup` relation today).

### Migration SQL (dev, then prod)

```sql
CREATE TABLE IF NOT EXISTS "WarrantyProvider" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "familyId"      TEXT        NOT NULL DEFAULT '0',
  "name"          TEXT,
  "phone"         TEXT,
  "url"           TEXT,
  "nameByCountry" TEXT,
  "country"       TEXT        NOT NULL DEFAULT 'IL',
  "createdBy"     TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "WarrantyProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarrantyProvider_name_check" CHECK ("name" IS NOT NULL OR "nameByCountry" IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS "WarrantyProvider_familyId_idx" ON "WarrantyProvider" ("familyId");
CREATE UNIQUE INDEX IF NOT EXISTS "WarrantyProvider_scope_name_unique"
  ON "WarrantyProvider" ("country", "familyId", lower(COALESCE("nameByCountry", "name")));

CREATE SEQUENCE IF NOT EXISTS "Warranty_seq_seq";

CREATE TABLE IF NOT EXISTS "Warranty" (
  "id"                TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "seq"               INTEGER     NOT NULL DEFAULT nextval('"Warranty_seq_seq"'),
  "familyId"          TEXT        NOT NULL,
  "productName"       TEXT        NOT NULL,
  "purchasedFromId"   TEXT        NOT NULL,
  "branch"            TEXT,
  "warrantyCompanyId" TEXT,
  "purchaseDate"      TIMESTAMPTZ,
  "durationMonths"    INTEGER,
  "expiresAt"         TIMESTAMPTZ,
  "referenceId"       TEXT,
  "notes"             TEXT,
  "link"              TEXT,
  "imageUrl"          TEXT,
  "isActive"          BOOLEAN     NOT NULL DEFAULT true,
  "createdBy"         TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Warranty_familyId_fkey" FOREIGN KEY ("familyId")
    REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Warranty_purchasedFromId_fkey" FOREIGN KEY ("purchasedFromId")
    REFERENCES "WarrantyProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Warranty_warrantyCompanyId_fkey" FOREIGN KEY ("warrantyCompanyId")
    REFERENCES "WarrantyProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
```

`ON DELETE SET NULL` for `warrantyCompanyId` (optional field — losing the specific claim contact should fall back to "same as purchasedFrom," not block/cascade); `ON DELETE RESTRICT` for `purchasedFromId` (required field — a `WarrantyProvider` in use as a purchase location shouldn't be deletable out from under a warranty; there's no delete UI for `WarrantyProvider` in v1 anyway, so this is a safety rail, not an active constraint).

### Seed data — a caution, not a shortcut

Seed a handful of common manufacturers/retailers as global rows (`familyId = '0'`), same spirit as `Provider`'s seed script. **Unlike** `Provider`'s seed (where a wrong store *name* is harmless), a wrong `phone`/`url` here actively misdirects someone trying to file a real warranty claim — worse than leaving it blank. Seed `name` freely; leave `phone`/`url` **empty at seed time** unless each one is individually verified against the manufacturer's real current support page at implementation time. This is a manual verification step for whoever implements this, not something to auto-generate.

---

## 2. Computing `expiresAt` from `purchaseDate` + `durationMonths`

Unchanged from the original design — client-side only:

```ts
function computeExpiresAt(purchaseDate: string, durationMonths: number): string {
  const d = new Date(purchaseDate)
  d.setMonth(d.getMonth() + durationMonths)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD, matches <input type="date">
}
```

This only **pre-fills** the `expiresAt` input, which stays directly editable. Whatever's in `expiresAt` at submit time is what's stored and is the only field `isExpiringSoon()`/nav badges/section-sorting ever read.

---

## 3. `WarrantyProviderCombobox` — new component, not a `ProviderCombobox` reuse

`components/WarrantyProviderCombobox.tsx`. Same interaction shape as `ProviderCombobox` (browse/search the directory, or type free text to create a new entry) but extended for the `phone`/`url` fields `Provider` never needed:

- **Selecting an existing entry** — field shows the name; a small read-only line beneath shows its `phone`/`url` (if set) so the user can see the contact info they're about to save without needing to open a detail view.
- **Typing a name with no match** — reveals two additional optional inputs, "Phone" and "Website," inline beneath the name field, so the new `WarrantyProvider` row is created with contact info in one step instead of a name-only stub the user has to go back and fill in later.
- **Two independent instances per Add/Edit form** — one for `purchasedFrom` (required), one for `warrantyCompany` (optional, hidden behind a "Claim through a different company" toggle — collapsed by default, since most warranties are claimed through the seller). Both query the same shared directory (`getWarrantyProviderOptions()`), so a company entered once (e.g. via `purchasedFrom` on an earlier warranty) is immediately selectable as `warrantyCompany` on a later one, and vice versa.

```tsx
'use client'
export default function WarrantyProviderCombobox({
  name,               // form field name for the resolved id, e.g. "purchasedFromId"
  options,            // WarrantyProviderOption[] — preloaded, same as ProviderCombobox
  defaultValue,       // existing WarrantyProviderOption | undefined, for edit mode
  required,
}: {
  name: string
  options: WarrantyProviderOption[]
  defaultValue?: WarrantyProviderOption
  required?: boolean
}) {
  // query/filter state (search across name), free-text branch reveals phone/url inputs,
  // on submit either an existing id is used as-is or a client-marked "new:{name}" token
  // is resolved server-side into a real row — see ensureWarrantyProviderExists below
}
```

### `WarrantyProviderOption` type

```ts
export type WarrantyProviderOption = {
  id: string
  name: string
  phone?: string
  url?: string
}
```

---

## 4. Server Actions (`app/warranties/actions.ts`)

| Action | Input | Effect |
|---|---|---|
| `getWarrantyProviderOptions` | — | Returns global (`familyId='0'`) + the current family's own `WarrantyProvider` rows, deduped by name — feeds both `WarrantyProviderCombobox` instances |
| `createWarranty` | `FormData` | Resolves/creates `WarrantyProvider` row(s) (see below), validates with Zod, encrypts `link`, inserts `Warranty` |
| `updateWarranty` | `warrantyId: string`, `FormData` | Same resolution/validation/encryption, updates editable fields |
| `deleteWarranty` | `warrantyId: string` | Sets `isActive = false` (soft delete) |

No `markWarrantyUsed`/`markWarrantyReceived` — status is computed, not stored.

### Resolving a `WarrantyProviderCombobox` submission → a `WarrantyProvider` id

Mirrors `Provider`'s existing "submit a name not in the list → insert it" flow (`ensureProviderExists`), extended to optionally carry `phone`/`url` at creation time:

```ts
async function ensureWarrantyProviderExists(
  input: { id?: string; name?: string; phone?: string; url?: string },
  familyId: string,
): Promise<string | null> {
  if (input.id) return input.id // existing selection, nothing to create
  if (!input.name?.trim()) return null // optional field left blank (warrantyCompany case)
  const created = await prisma.warrantyProvider.create({
    data: { familyId, name: input.name.trim(), phone: input.phone || null, url: input.url || null },
  })
  return created.id
}
```

`createWarranty`/`updateWarranty` call this once for `purchasedFrom` (required — the "name" branch always applies if no `id`) and once for `warrantyCompany` (optional — returns `null` when the claim-company toggle was never opened, which becomes `warrantyCompanyId: null` on the `Warranty` row).

### Zod schema

```ts
const CreateWarrantySchema = z.object({
  productName:        z.string().min(1, 'Product name is required'),
  purchasedFromId:     z.string().optional(),   // set when an existing entry was picked
  purchasedFromName:   z.string().optional(),    // set when free-text creates a new entry
  purchasedFromPhone:  z.string().optional(),
  purchasedFromUrl:    z.string().url().optional(),
  branch:              z.string().optional(),    // free-text physical branch/location of purchasedFrom
  warrantyCompanyId:    z.string().optional(),
  warrantyCompanyName:  z.string().optional(),
  warrantyCompanyPhone: z.string().optional(),
  warrantyCompanyUrl:   z.string().url().optional(),
  purchaseDate:        z.string().datetime().optional(),
  durationMonths:      z.coerce.number().int().positive().optional(),
  expiresAt:           z.string().datetime().optional(),
  referenceId:         z.string().optional(),
  notes:               z.string().optional(),
  link:                z.string().url().optional(),
  imageUrl:            z.string().url().optional(),
}).refine((v) => v.purchasedFromId || v.purchasedFromName, {
  message: 'Where it was purchased is required',
  path: ['purchasedFromName'],
})
```

### `WarrantyItem` type

```ts
export type WarrantyItem = {
  id: string
  seq: number
  productName: string
  purchasedFrom: WarrantyProviderOption
  branch?: string
  warrantyCompany?: WarrantyProviderOption // undefined = "same as purchasedFrom"
  purchaseDate?: string
  durationMonths?: number
  expiresAt?: string
  referenceId?: string
  notes?: string
  link?: string
  imageUrl?: string
  createdAt: string
}
```

`decrypt(link)` happens in `app/warranties/page.tsx` before this reaches the client, same as every other encrypted field in the app. `purchasedFrom`/`warrantyCompany` come from a `select`-with-relation on the `Warranty` query (one query, no N+1).

---

## 5. Pages & Components

### `app/warranties/page.tsx` (Server Component)
- Fetches all active warranties for the family (`isActive: true`), including `purchasedFrom`/`warrantyCompany` relations, ordered by `createdAt desc`
- Also fetches `getWarrantyProviderOptions()` for the Add/Edit form comboboxes
- Decrypts `link`, maps to `WarrantyItem[]`, passes both to `WarrantiesClient`

### `components/WarrantiesClient.tsx` (Client Component)

**WarrantyRow** — list item showing:
- `#seq`
- `productName` (primary text)
- `purchasedFrom.name` as a badge
- `ExpiryDaysBadge` (reused as-is)
- Reference ID if set (truncated)

**AddWarrantyModal** — form fields:
- Product name (required)
- Purchased from (required, `WarrantyProviderCombobox`)
- Branch / location (optional, plain text input directly beneath Purchased From — e.g. "Rishon LeZion")
- "Claim through a different company" toggle → reveals a second `WarrantyProviderCombobox` for `warrantyCompany` (optional)
- Purchase date (optional, date picker)
- Duration (months) (optional, numeric)
- Expiry date (auto-computed from the two above when both are set; always directly editable — see §2)
- Reference / order / serial number (optional)
- Notes (optional)
- Link (optional, URL)
- Image (optional) — same dropzone as `AddRefundModal`, uploads to Vercel Blob at Save time
- **Scan button** — same photo/paste-text toggle as Refund's Add modal, prefilling `productName`/`purchasedFromName` (feeding the `WarrantyProviderCombobox`'s free-text branch, matched case-insensitively against existing options first)/`purchaseDate`/`durationMonths`/`expiresAt`/`referenceId`. Never prefills `warrantyCompany` — see §6.

**WarrantyDetailModal** — shows all fields. Claim-contact section shows `warrantyCompany` if set, else falls back to displaying `purchasedFrom`'s phone/url with a small "(same as purchase location)" note — this fallback is display-only, nothing is written to `warrantyCompanyId`. If `link` is set: mask → reveal → copy treatment (same pattern as `Voucher.link`). If `imageUrl` is set: tappable thumbnail → full-screen view. Edit / Delete buttons (same Edit-mode pattern as the other four entities).

### Two-section layout (computed, not stored)
- **Active** section on top — `expiresAt === null || expiresAt >= today`, ordered by `expiresAt asc` (soonest-expiring first, nulls last), falling back to `createdAt desc`
- **Expired** section below — `expiresAt < today`, ordered by `expiresAt desc`
- Always-visible, no toggle — same pattern as Vouchers/Refunds/Clubs

---

## 6. Navigation — `components/BottomNav.tsx`

Unchanged from the prior draft of this DD — 5th tab, shield-check icon, narrow-screen label collapse:

```tsx
{
  href: '/warranties',
  label: t.warrantiesTab,
  active: pathname.startsWith('/warranties'),
  badgeKey: 'warranties',
  icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.25-7 10-4-1.75-7-5.5-7-10V6l7-3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </svg>
  ),
},
```

```tsx
<span className="hidden min-[380px]:inline">{tab.label}</span>
```
plus `title={tab.label}` on the `<Link>` for accessibility when the label is hidden.

---

## 7. AI Image Extraction — `app/api/extract/route.ts`

Add a 4th schema — **`purchasedFrom` only**, not `warrantyCompany` (a receipt shows where you bought something, essentially never who services its warranty):

```ts
WARRANTY: {
  type: 'object',
  properties: {
    productName:    { type: 'string' },
    purchasedFrom:  { type: 'string', description: 'the store or seller name on the receipt' },
    branch:         { type: 'string', description: 'the specific branch/location printed on the receipt (e.g. city or address), if shown' },
    purchaseDate:   { type: 'string', description: 'YYYY-MM-DD, or omit if not visible' },
    durationMonths: { type: 'number', description: 'warranty length in months if stated, e.g. "2 years" = 24' },
    expiresAt:      { type: 'string', description: 'YYYY-MM-DD explicit expiry date, only if printed directly (overrides duration math)' },
    referenceId:    { type: 'string', description: 'receipt, order, or serial number' },
  },
},
```

Prompt: *"Read this receipt or warranty card. Return the product name, the store or seller name printed on it, the specific branch/location if one is shown (e.g. a city or address), the purchase date if visible, the warranty length in months if stated (convert years to months), an explicit expiry date only if one is printed directly, and any receipt/order/serial number. Do not guess a separate warranty service company — only extract who sold the item."*

`AddWarrantyModal` follows Refund's dual-purpose file input (not Card/Voucher's discard-after-scan pattern), since Warranty also keeps a permanent `imageUrl`: selecting a photo both shows the upload preview and immediately fires `/api/extract`; the image is persisted to Blob only at Save time via `handleSubmit`, exactly like `AddRefundModal` today.

### `app/api/upload/route.ts` — generalize the hardcoded folder

```ts
const folder = (form.get('folder') as string | null) ?? 'refunds'
const blob = await put(`${folder}/${userId}-${Date.now()}.${ext}`, file, {
  access: 'public',
  contentType: file.type,
})
```

`AddWarrantyModal`'s upload call passes `fd.set('folder', 'warranties')`.

---

## 8. Nav Badge Counts — `app/actions.ts`

```ts
export type NavBadgeCounts = { cards: NavBadgeCategory; vouchers: NavBadgeCategory; clubs: NavBadgeCategory; refunds: NavBadgeCategory; warranties: NavBadgeCategory }
```

```ts
const [activeCards, vouchers, clubs, refunds, warranties] = await Promise.all([
  // ...existing 4 unchanged...
  prisma.warranty.findMany({ where: { familyId, isActive: true }, select: { id: true, expiresAt: true } }),
])

return {
  cards: category(cardsWithBalance),
  vouchers: category(vouchers),
  clubs: category(clubs),
  refunds: category(refunds),
  warranties: category(warranties.filter((w) => w.expiresAt === null || w.expiresAt >= now)),
}
```

The pre-filter keeps the Warranties badge count matching the Active section (see §5) rather than counting already-expired items — an expired warranty still contributes to `hasExpired`/`hasExpiringSoon` color logic via the same `category()` helper, just not to the raw count. `EMPTY_NAV_BADGE_CATEGORY` defaults and the `!ENABLE_NAV_BADGES` short-circuit both extend with `warranties: EMPTY_NAV_BADGE_CATEGORY`.

`hooks/useNavBadgeCountsStore.ts`'s `EMPTY` constant gets the same 5th key; `adjustNavBadgeCount('warranties', ±1)` is called from `WarrantiesClient` the same way the other four call it today.

---

## 9. i18n Keys (`lib/i18n.ts`)

### English
```
warrantiesTab: 'Warranties'
addWarranty: 'Add Warranty'
addNewWarranty: 'Add New Warranty'
warrantyProductName: 'Product'
warrantyProductNamePlaceholder: 'e.g. LG Fridge'
warrantyPurchasedFrom: 'Purchased From'
warrantyBranch: 'Branch / Location'
warrantyBranchPlaceholder: 'e.g. Rishon LeZion'
warrantyClaimElsewhere: 'Claim through a different company'
warrantyCompany: 'Warranty Company'
warrantyCompanyPhone: 'Phone'
warrantyCompanyUrl: 'Website'
warrantyPurchaseDate: 'Purchase Date'
warrantyDuration: 'Warranty Length (months)'
warrantyExpiresAt: 'Expires On'
warrantyReference: 'Receipt / Order / Serial #'
warrantyDetails: 'Warranty Details'
warrantySameAsPurchase: '(same as purchase location)'
activeWarranties: 'Active'
expiredWarranties: 'Expired'
noWarrantiesYet: 'No warranties yet'
noExpiredWarranties: 'No expired warranties'
addFirstWarrantyPrompt: 'Track a product warranty from purchase to expiry'
failedToCreateWarranty: 'Failed to add warranty'
failedToUpdateWarranty: 'Failed to update warranty'
```

### Hebrew
```
warrantiesTab: 'אחריות'
addWarranty: 'הוסף אחריות'
addNewWarranty: 'הוסף אחריות חדשה'
warrantyProductName: 'מוצר'
warrantyProductNamePlaceholder: 'לדוגמה: מקרר LG'
warrantyPurchasedFrom: 'נרכש מ'
warrantyBranch: 'סניף / מיקום'
warrantyBranchPlaceholder: 'לדוגמה: ראשון לציון'
warrantyClaimElsewhere: 'מימוש האחריות דרך גורם אחר'
warrantyCompany: 'חברת האחריות'
warrantyCompanyPhone: 'טלפון'
warrantyCompanyUrl: 'אתר אינטרנט'
warrantyPurchaseDate: 'תאריך רכישה'
warrantyDuration: 'משך האחריות (חודשים)'
warrantyExpiresAt: 'בתוקף עד'
warrantyReference: 'מספר קבלה / הזמנה / סידורי'
warrantyDetails: 'פרטי אחריות'
warrantySameAsPurchase: '(זהה למקום הרכישה)'
activeWarranties: 'בתוקף'
expiredWarranties: 'פג תוקף'
noWarrantiesYet: 'אין פריטי אחריות עדיין'
noExpiredWarranties: 'אין פריטי אחריות שפג תוקפם'
addFirstWarrantyPrompt: 'עקוב אחר אחריות למוצר מהרכישה ועד לפקיעתה'
failedToCreateWarranty: 'הוספת האחריות נכשלה'
failedToUpdateWarranty: 'עדכון האחריות נכשל'
```

Plus the existing Scan-related keys (`scanButton`, `scanning`, `scanFailed`, `scanModePhoto`, `scanModeText`, `scanTextPlaceholder`, `scanTextButton`) are reused as-is.

---

## 10. Implementation Order

1. Add `WarrantyProvider` + `Warranty` models + `warranties` relation to `prisma/schema.prisma`
2. Run migration script on dev + prod (`scripts/migrate-warranty.ts`) — table creation only; seed script is a separate step (see next)
3. Seed starter `WarrantyProvider` rows — **names only**, `phone`/`url` left blank unless manually verified (see §1 caution)
4. Add i18n keys to `lib/i18n.ts`
5. Create `app/warranties/actions.ts` (`getWarrantyProviderOptions`, `ensureWarrantyProviderExists`, `createWarranty`, `updateWarranty`, `deleteWarranty`)
6. Create `components/WarrantyProviderCombobox.tsx`
7. Create `app/warranties/page.tsx`
8. Create `components/WarrantiesClient.tsx` (Add/Detail modals, two-section list)
9. Generalize `app/api/upload/route.ts` with the `folder` param
10. Add `WARRANTY` schema + prompt to `app/api/extract/route.ts`; wire Scan button into `AddWarrantyModal`
11. Extend `NavBadgeCounts` (`app/actions.ts`) + `useNavBadgeCountsStore.ts` with `warranties`
12. Add the 5th tab + narrow-screen label collapse to `components/BottomNav.tsx`
13. `tsc --noEmit` after each numbered group, not one big change

---

## Out of Scope (v1)

- Manual "claimed" tracking — see HLD
- Expiry reminders/notifications beyond the existing badge highlight
- Multiple images per warranty
- Standalone `WarrantyProvider` directory management screen (edit/delete a company's phone/url after creation) — v1 only creates entries inline while adding a warranty
- Global Search integration — `warranties` isn't wired into `plans/global-search-hld.md` since that feature itself hasn't shipped yet

## Future

- **`isClaimed`/`claimedAt`** — only if users actually want to log "I used this warranty," mirroring `Refund`'s `isUsed`/`usedAt`
- **Reminder notifications** as the item nears `expiresAt`
- **`WarrantyProvider` directory screen** — view/edit/delete companies directly, once there are enough of them per family for that to matter

---

## Verification

1. `tsc --noEmit` after each implementation-order group.
2. Add a warranty where `purchasedFrom` is picked from the seed list and `warrantyCompany` is left blank — confirm the detail view falls back to showing `purchasedFrom`'s contact info with the "(same as purchase location)" note, and `warrantyCompanyId` is `null` in the DB.
3. Add a warranty where `warrantyCompany` is a *different*, freshly-typed company with phone+url — confirm a new `WarrantyProvider` row is created and linked, and that same company is now selectable from either combobox on the next warranty added.
4. Add a warranty with `purchaseDate` + `durationMonths` only — confirm `expiresAt` auto-computes, then hand-edit it and confirm the edited value is what's saved.
5. Confirm an item with `expiresAt` in the past lands in "Expired," one in the future or null lands in "Active."
6. Scan a photo of a receipt — confirm `purchasedFrom`/`branch`/`productName`/dates prefill and `warrantyCompany` stays untouched/collapsed; Save — confirm the image lands in Blob storage under `warranties/` only after Save.
7. Confirm the nav badge count for Warranties matches the Active-section count, and its color reflects `hasExpired`/`hasExpiringSoon`.
8. Resize below ~380px width — confirm all 5 tabs show icon-only with no label wrapping and still meet the 44px touch-target minimum.
9. Confirm `link` round-trips through `encrypt`/`decrypt` correctly; confirm `WarrantyProvider.phone`/`url` are stored in plain text (by design, not a bug) when inspected directly against Neon.
10. Try deleting (soft-delete via `isActive=false`) a warranty whose `purchasedFrom` is also used by another active warranty — confirm the `WarrantyProvider` row itself is untouched and the other warranty is unaffected (no cascade).
