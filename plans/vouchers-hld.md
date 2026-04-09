# Vouchers Tab/Screen — HLD / DD

## Overview

A vouchers section for one-time use codes: promo codes, store credits, gift vouchers. Unlike gift cards, vouchers have no running ledger — they are simply "active" or "used".

---

## Data Model

### `Voucher` (new Prisma model)

| #  | Field       | Type        | Notes                                      |
|----|-------------|-------------|--------------------------------------------|
| 1  | `id`        | `String` (uuid) | PK                                     |
| 2  | `seq`       | `Int` (autoincrement) | Human-readable sequence number (#1, #2…) |
| 3  | `familyId`  | `String`    | FK → `FamilyGroup`                         |
| 4  | `name`      | `String`    | Display name, e.g. "Amazon 20% off"        |
| 5  | `provider`  | `String`    | Store/brand, e.g. "Amazon"                 |
| 6  | `code`      | `String`    | The actual voucher code (revealed on tap)  |
| 7  | `value`     | `Decimal?`  | Optional fixed monetary value (no % discounts — see Coupons task) |
| 8  | `expiresAt` | `String?`   | MMYY format (same as gift cards)           |
| 9  | `notes`     | `String?`   | Free-text notes                            |
| 10 | `isUsed`    | `Boolean`   | Default `false`                            |
| 11 | `usedAt`    | `DateTime?` | Set when `isUsed` flipped to `true`        |
| 12 | `isActive`  | `Boolean`   | Default `true` — soft delete               |
| 13 | `createdAt` | `DateTime`  | Default `now()`                            |
| 14 | `createdBy` | `String?`   | FK → `User.id` (see createdBy task)        |

### Migration
- Single `ADD TABLE` migration, no breaking changes.
- No changes to existing `GiftCard` or `Transaction` tables.

---

## Server Actions (`app/vouchers/actions.ts`)

| Action              | Input                          | Effect                                      |
|---------------------|--------------------------------|---------------------------------------------|
| `createVoucher`     | FormData                       | Validates with Zod, inserts `Voucher`       |
| `markVoucherUsed`   | `voucherId`, `isUsed: boolean` | Toggles `isUsed` + sets/clears `usedAt`     |
| `deleteVoucher`     | `voucherId`                    | Sets `isActive = false` (soft delete)       |

All actions call `getAuthenticatedFamilyId()` from `app/actions.ts`.

---

## Pages & Components

### `/vouchers/page.tsx` (Server Component)
- Fetches all active vouchers for the family (`isActive: true`), ordered by `createdAt desc`.
- Passes `VoucherItem[]` to `VouchersClient`.

### `VoucherItem` type
```ts
type VoucherItem = {
  id: string
  name: string
  provider: string
  code: string
  value?: number
  expiresAt?: string
  notes?: string
  isUsed: boolean
  usedAt?: string
  createdAt: string
  createdBy?: string
}
```

### `components/VouchersClient.tsx` (Client Component)
Mirrors the structure of `GiftCardsClient.tsx`:

- **Voucher list** — card per voucher, shows name, provider badge, value (if set), expiry, used/active status pill
- **AddVoucherModal** — form fields: name, provider, code (masked input), value (optional), expiry (optional), notes (optional)
- **VoucherDetailModal** — code reveal/hide toggle (same pattern as `fullNumber`), mark as used/unused button, delete button
- **Layout** — two sections on the same screen: "Active" at the top, "Used" collapsed/below (no toggle needed — always visible)

---

## Navigation Options (to prototype both)

### Option A — Bottom Tab Bar
```
[ Gift Cards ]  [ Vouchers ]
```
- Add a fixed bottom bar in the root layout or `cards`/`vouchers` layout.
- Active tab highlighted with emerald accent.
- Simple, mobile-native feel.

### Option B — Top Tab Switcher
```
Gift Cards | Vouchers
───────────
(content)
```
- Tabs at the top of the main content area, below the header.
- Feels more like a web app dashboard.
- Both tabs share the same header/stats bar area.

**Decision:** Prototype both; pick based on feel on mobile.

---

## i18n Keys to Add (en + he)

```
vouchersTab, addVoucher, addNewVoucher, voucherName, voucherCode,
voucherCodePlaceholder, voucherValue, voucherValueOptional,
markAsUsed, markAsUnused, usedOn, activeVouchers, usedVouchers,
noVouchersYet, addFirstVoucherPrompt, voucherDetails,
failedToCreateVoucher, failedToUpdateVoucher
```

---

## Out of Scope

- Percentage / discount codes → deferred to a future **Coupons** tab

## Decided

- **Used vouchers** → separate "Used" section below active ones on the same screen (always visible, no toggle)
- **Encryption of `code`** → deferred to the Encrypt Card Numbers task

## Notes

- The same "active / used" two-section pattern may be applied to Gift Cards in the future (zero-balance cards in a separate section until manually deleted)
