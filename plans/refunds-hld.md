# Refunds Tab — HLD / DD

## Overview

A dedicated tab for tracking store credit refunds — pending credits owed by a store, and received credits confirmed as usable. Scope is **store credit only** for the initial release (e.g. credit note, in-store balance, return voucher). Original payment method refunds (card/PayPal) are deferred.

Unlike gift cards there is no ledger. Unlike vouchers there is no code to reveal. A refund is simply created, tracked as pending, then marked received.

---

## Data Model

### `Refund` (new Prisma model)

| #  | Field         | Type                    | Notes                                                        |
|----|---------------|-------------------------|--------------------------------------------------------------|
| 1  | `id`          | `String` (uuid)         | PK                                                           |
| 2  | `seq`         | `Int` (autoincrement)   | Human-readable number (#1, #2…)                              |
| 3  | `familyId`    | `String`                | FK → `FamilyGroup`                                           |
| 4  | `provider`    | `String`                | Store/brand, e.g. "Zara", "IKEA"                            |
| 5  | `amount`      | `Decimal`               | Refund amount — required                                     |
| 6  | `currency`    | `String`                | ISO code, e.g. "ILS", "USD" — derived from locale at create |
| 7  | `status`      | `String`                | `"pending"` or `"received"` — default `"pending"`           |
| 8  | `referenceId` | `String?`               | Store reference / order number                               |
| 9  | `notes`       | `String?`               | Free-text notes                                              |
| 10 | `expectedBy`  | `DateTime?`             | Expected receive date (optional)                             |
| 11 | `receivedAt`  | `DateTime?`             | Set when status flipped to `"received"`                      |
| 12 | `code`        | `String?`               | Store credit code / barcode — encrypted at rest              |
| 13 | `link`        | `String?`               | URL to online credit page — encrypted at rest                |
| 14 | `imageUrl`    | `String?`               | URL of uploaded receipt/confirmation screenshot (optional)   |
| 15 | `isActive`    | `Boolean`               | Default `true` — soft delete                                 |
| 16 | `createdBy`   | `String?`               | FK → `User.id`                                               |
| 17 | `createdAt`   | `DateTime`              | Default `now()`                                              |

**Encryption:** `code`, `link`, and `imageUrl` are encrypted at rest using AES-256-GCM (same pattern as `Voucher.code` / `Voucher.link`). All other fields are not considered secrets.

**Future field:** `refundType String?` — will distinguish `"store_credit"` from `"original_payment"` once the second type is supported.

### Schema addition (`prisma/schema.prisma`)

```prisma
model Refund {
  id          String    @id @default(uuid())
  seq         Int       @default(autoincrement())
  familyId    String
  family      FamilyGroup @relation(fields: [familyId], references: [id])
  provider    String
  amount      Decimal   @db.Decimal(65, 30)
  currency    String
  status      String    @default("pending")
  referenceId String?
  notes       String?
  expectedBy  DateTime?
  receivedAt  DateTime?
  code        String?
  link        String?
  imageUrl    String?
  isActive    Boolean   @default(true)
  createdBy   String?
  createdAt   DateTime  @default(now())
}
```

Also add `refunds Refund[]` to the `FamilyGroup` model.

### Migration SQL

```sql
CREATE SEQUENCE IF NOT EXISTS "Refund_seq_seq";

CREATE TABLE IF NOT EXISTS "Refund" (
  "id"          TEXT        NOT NULL DEFAULT gen_random_uuid(),
  "seq"         INTEGER     NOT NULL DEFAULT nextval('"Refund_seq_seq"'),
  "familyId"    TEXT        NOT NULL,
  "provider"    TEXT        NOT NULL,
  "amount"      NUMERIC(65,30) NOT NULL,
  "currency"    TEXT        NOT NULL,
  "status"      TEXT        NOT NULL DEFAULT 'pending',
  "referenceId" TEXT,
  "notes"       TEXT,
  "expectedBy"  TIMESTAMPTZ,
  "receivedAt"  TIMESTAMPTZ,
  "code"        TEXT,
  "link"        TEXT,
  "imageUrl"    TEXT,
  "isActive"    BOOLEAN     NOT NULL DEFAULT true,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_familyId_fkey" FOREIGN KEY ("familyId")
    REFERENCES "FamilyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
```

---

## Server Actions (`app/refunds/actions.ts`)

| Action                | Input                              | Effect                                                   |
|-----------------------|------------------------------------|----------------------------------------------------------|
| `createRefund`        | `FormData`                         | Validates with Zod, inserts `Refund` with status=pending |
| `markRefundReceived`  | `refundId: string`, `received: boolean` | Toggles status + sets/clears `receivedAt`           |
| `deleteRefund`        | `refundId: string`                 | Sets `isActive = false` (soft delete)                    |

### Zod schema

```ts
const CreateRefundSchema = z.object({
  provider:    z.string().min(1, 'Provider is required'),
  amount:      z.number().positive('Amount must be positive'),
  currency:    z.string().length(3),
  referenceId: z.string().optional(),
  notes:       z.string().optional(),
  expectedBy:  z.string().datetime().optional(),
  code:        z.string().optional(),
  link:        z.string().url().optional(),
  imageUrl:    z.string().url().optional(),
})
```

### `RefundItem` type

```ts
export type RefundItem = {
  id: string
  seq: number
  provider: string
  amount: number
  currency: string
  status: 'pending' | 'received'
  referenceId?: string
  notes?: string
  expectedBy?: string
  receivedAt?: string
  code?: string
  link?: string
  imageUrl?: string
  createdAt: string
}
```

---

## Pages & Components

### `/refunds/page.tsx` (Server Component)
- Fetches all active refunds for the family (`isActive: true`), ordered by `createdAt desc`
- Maps to `RefundItem[]` and passes to `RefundsClient`

### `components/RefundsClient.tsx` (Client Component)

**RefundRow** — list item showing:
- `#seq`
- Provider badge (same color palette)
- Amount + currency (mono, prominent)
- Reference ID if set (truncated)
- `expectedBy` date if pending
- Status pill: emerald "Pending" / slate "Received"

**AddRefundModal** — form fields:
- Provider (required)
- Amount (required, numeric)
- Currency (pre-filled from locale — ILS for `he`, USD for `en` — overridable)
- Reference / order number (optional)
- Expected by date (optional, date picker)
- Notes (optional)
- Image (optional) — file upload input; uploaded to Vercel Blob, URL stored in `imageUrl`

**RefundDetailModal** — shows all fields, Mark as Received / Mark as Pending toggle button, delete button. If `code` is set, shows it with mask → reveal → format → copy treatment (same pattern as `Voucher.code`). If `link` is set, renders as a tappable link. If `imageUrl` is set, shows a tappable thumbnail that opens the image full-screen.

### Two-section layout
- **Pending** section on top — ordered by `expectedBy asc` (soonest first), falling back to `createdAt desc`
- **Received** section below — ordered by `receivedAt desc`
- Same always-visible pattern as Vouchers (no toggle)

---

## Navigation

Add a fourth tab to `BottomNav`:

```
[ Gift Cards ]  [ Vouchers ]  [ Clubs ]  [ Refunds ]
```

Icon: receipt / return arrow SVG.

i18n key: `refundsTab`

---

## i18n Keys (en + he)

### English
```
refundsTab: 'Refunds'
addRefund: 'Add Refund'
addNewRefund: 'Add New Refund'
refundProvider: 'Store / Provider'
refundAmount: 'Refund Amount'
refundCurrency: 'Currency'
refundReference: 'Reference / Order #'
refundReferencePlaceholder: 'e.g. ORD-12345'
refundExpectedBy: 'Expected By (optional)'
refundDetails: 'Refund Details'
pendingRefunds: 'Pending'
receivedRefunds: 'Received'
noRefundsYet: 'No refunds yet'
noReceivedRefunds: 'No received refunds'
addFirstRefundPrompt: 'Track a store credit or return refund'
markAsReceived: 'Mark as Received'
markAsPending: 'Mark as Pending'
refundReceivedOn: 'Received on'
failedToCreateRefund: 'Failed to add refund'
failedToUpdateRefund: 'Failed to update refund'
```

### Hebrew
```
refundsTab: 'החזרים'
addRefund: 'הוסף החזר'
addNewRefund: 'הוסף החזר חדש'
refundProvider: 'חנות / ספק'
refundAmount: 'סכום החזר'
refundCurrency: 'מטבע'
refundReference: 'מספר הזמנה / אסמכתא'
refundReferencePlaceholder: 'לדוגמה: ORD-12345'
refundExpectedBy: 'צפוי עד (אופציונלי)'
refundDetails: 'פרטי החזר'
pendingRefunds: 'ממתין'
receivedRefunds: 'התקבל'
noRefundsYet: 'אין החזרים עדיין'
noReceivedRefunds: 'אין החזרים שהתקבלו'
addFirstRefundPrompt: 'עקוב אחר זיכוי חנות או החזר כספי'
markAsReceived: 'סמן כהתקבל'
markAsPending: 'סמן כממתין'
refundReceivedOn: 'התקבל בתאריך'
failedToCreateRefund: 'הוספת ההחזר נכשלה'
failedToUpdateRefund: 'עדכון ההחזר נכשל'
```

---

## Implementation Order

1. Add `Refund` model + `refunds` relation to `prisma/schema.prisma`
2. Run migration script on dev + prod (`scripts/migrate-refunds.ts`)
3. Add i18n keys to `lib/i18n.ts`
4. Create `app/refunds/actions.ts`
5. Create `app/refunds/page.tsx`
6. Create `components/RefundsClient.tsx`
7. Add Refunds tab to `BottomNav`

---

## Out of Scope (initial release)

- Original payment method refunds (card / PayPal / bank)
- Partial refunds (one return split into multiple refund rows)
- Refund amount editing after creation

## Future

- **Parse from image** — upload a receipt or store confirmation screenshot → Claude vision API extracts provider, amount, reference → pre-fills the add form
- **`refundType`** field — distinguishes store credit from original payment method once the latter is supported
