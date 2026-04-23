# Club Members Tab — HLD / DD

## Overview

A dedicated tab for loyalty and membership cards: supermarket clubs, gym memberships, pharmacy rewards, etc. Unlike gift cards there is no ledger — a club membership is simply active or deleted. Unlike vouchers there is no "used" state — memberships are ongoing until removed.

---

## Data Model

### `ClubMember` (already in Prisma schema)

| # | Field       | Type                  | Notes                                                     |
|---|-------------|-----------------------|-----------------------------------------------------------|
| 1 | `id`        | `String` (uuid)       | PK                                                        |
| 2 | `seq`       | `Int` (autoincrement) | Human-readable number (#1, #2…)                           |
| 3 | `familyId`  | `String`              | FK → `FamilyGroup`                                        |
| 4 | `name`      | `String`              | Display name, e.g. "Shufersal Club"                       |
| 5 | `provider`  | `String`              | Brand/chain, e.g. "Shufersal"                             |
| 6 | `memberId`  | `String?`             | Membership number — **encrypted at rest** (same as fullNumber) |
| 7 | `ownerName` | `String?`             | Family member who holds the membership                    |
| 8 | `idType`    | `String?`             | Type of ID used to register, e.g. "ID number", "Phone"   |
| 9 | `expiresAt` | `String?`             | MMYY format                                               |
| 10 | `notes`    | `String?`             | Free-text notes                                           |
| 11 | `isActive`  | `Boolean`             | Default `true` — soft delete only                         |
| 12 | `createdBy` | `String?`             | FK → `User.id`                                            |
| 13 | `createdAt` | `DateTime`            | Default `now()`                                           |

### Migration

The model exists in `schema.prisma`. A Neon migration must be run to create the table and sequence:

```sql
CREATE SEQUENCE IF NOT EXISTS "ClubMember_seq_seq";

CREATE TABLE IF NOT EXISTS "ClubMember" (
  "id"         TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "seq"        INTEGER     NOT NULL DEFAULT nextval('"ClubMember_seq_seq"'),
  "familyId"   TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "provider"   TEXT        NOT NULL,
  "memberId"   TEXT,
  "ownerName"  TEXT,
  "idType"     TEXT,
  "expiresAt"  TEXT,
  "notes"      TEXT,
  "isActive"   BOOLEAN     NOT NULL DEFAULT true,
  "createdBy"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "ClubMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClubMember_familyId_fkey" FOREIGN KEY ("familyId")
    REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
```

### Optional DB view

```sql
CREATE OR REPLACE VIEW vw_clubs_overview AS
SELECT
  cm."familyId",
  COUNT(*) FILTER (WHERE cm."isActive") AS active_count,
  COUNT(*) AS total_count
FROM "ClubMember" cm
GROUP BY cm."familyId";
```

---

## Encryption

`memberId` is sensitive (loyalty card number). It follows the same pattern as `GiftCard.fullNumber`:
- Encrypted with `encrypt()` in `createClub` before writing to DB
- Decrypted with `decrypt()` + `isEncrypted()` guard in `app/clubs/page.tsx` before passing to client
- Revealed in the detail modal with the same masked → reveal toggle UI

---

## Server Actions (`app/clubs/actions.ts`)

| Action        | Input              | Effect                                         |
|---------------|--------------------|------------------------------------------------|
| `createClub`  | `FormData`         | Validates with Zod, encrypts `memberId`, inserts row |
| `deleteClub`  | `clubId: string`   | Sets `isActive = false` (soft delete)          |

```ts
export type ClubItem = {
  id: string
  seq: number
  name: string
  provider: string
  memberId?: string      // decrypted before passing to client
  ownerName?: string
  idType?: string
  expiresAt?: string
  notes?: string
  createdAt: string
}
```

### Zod schema

```ts
const CreateClubSchema = z.object({
  name:      z.string().min(1),
  provider:  z.string().min(1),
  memberId:  z.string().optional(),
  ownerName: z.string().optional(),
  idType:    z.string().optional(),
  expiresAt: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/).optional(),
  notes:     z.string().optional(),
})
```

---

## Pages & Components

### `/clubs/page.tsx` (Server Component)
- Fetches all active clubs for the family (`isActive: true`), ordered by `seq asc`
- Decrypts `memberId` using `decrypt()` + `isEncrypted()` guard before passing to client
- Passes `ClubItem[]` to `ClubsClient`

### `components/ClubsClient.tsx` (Client Component)

**ClubRow** — list item showing:
- `#seq` in mono
- Provider badge (same color palette as cards/vouchers)
- Club name
- `ownerName` if set
- Expiry if set

**AddClubModal** — form fields:
- Name (required)
- Provider (required)
- Member ID (optional, mono input)
- Owner name (optional)
- ID type (optional, e.g. "ID number", "Phone")
- Expiry MMYY (optional)
- Notes (optional)

**ClubDetailModal** — fields shown:
- Provider badge + `#seq`
- Name
- Member ID section — same masked → reveal → copy pattern as `GiftCard.fullNumber`
  - Masked by default: `••••••• 1234`
  - Reveal toggle shows full ID in large mono + copy button
- Owner name
- ID type
- Expiry
- Notes
- Date added
- Delete button (soft delete)

### Single-section layout
No "used/active" split — clubs are either active (shown) or deleted. One flat list.  
Empty state prompts to add first club.

---

## Navigation

Add a third tab to `BottomNav`:

```
[ Gift Cards ]  [ Vouchers ]  [ Clubs ]
```

Icon: ID card / membership card SVG.

i18n key: `clubsTab`

---

## i18n Keys (en + he)

### English
```
clubsTab: 'Clubs'
addClub: 'Add Club'
addNewClub: 'Add New Club'
clubName: 'Club Name'
memberIdLabel: 'Member ID'
memberIdPlaceholder: 'e.g. 0501234567'
ownerNameLabel: 'Owner Name'
idTypeLabel: 'ID Type'
idTypePlaceholder: 'e.g. ID number, Phone'
clubDetails: 'Club Details'
noClubsYet: 'No clubs yet'
addFirstClubPrompt: 'Add your first loyalty or membership card'
failedToCreateClub: 'Failed to add club'
failedToDeleteClub: 'Failed to remove club'
```

### Hebrew
```
clubsTab: 'מועדונים'
addClub: 'הוסף מועדון'
addNewClub: 'הוסף מועדון חדש'
clubName: 'שם המועדון'
memberIdLabel: 'מספר מנוי'
memberIdPlaceholder: 'לדוגמה: 0501234567'
ownerNameLabel: 'שם בעל הכרטיס'
idTypeLabel: 'סוג מזהה'
idTypePlaceholder: 'לדוגמה: תעודת זהות, טלפון'
clubDetails: 'פרטי מועדון'
noClubsYet: 'אין מועדונים עדיין'
addFirstClubPrompt: 'הוסף את כרטיס המועדון הראשון שלך'
failedToCreateClub: 'הוספת המועדון נכשלה'
failedToDeleteClub: 'מחיקת המועדון נכשלה'
```

---

## Implementation Order

1. Run Neon migration (dev + prod)
2. Add i18n keys to `lib/i18n.ts`
3. Create `app/clubs/actions.ts`
4. Create `app/clubs/page.tsx`
5. Create `components/ClubsClient.tsx`
6. Add Clubs tab to `BottomNav`

---

## Out of Scope

- Editing an existing club — add + delete only for now
- Barcode/QR scanning for member ID
- Expiry notifications
