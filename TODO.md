# TODO

## Future Features

### ✅ Encrypt Sensitive Fields at Rest
Encrypt sensitive text fields before storing in the DB and decrypt on read. Covers cards and vouchers.

**Fields to encrypt:**
- `GiftCard.fullNumber` — full card number
- `GiftCard.link` — card URL (may contain auth tokens or personal links)
- `Voucher.code` — redemption code
- `Voucher.link` — voucher URL

**What's needed:**
- ✅ Choose an encryption strategy (AES-256-GCM with a server-side `ENCRYPTION_KEY` env var)
- ✅ Build a shared `lib/encrypt.ts` with `encrypt`, `decrypt`, and `isEncrypted`
- ✅ Encrypt the four fields above in their respective `create*` server actions before writing to DB
- ✅ Decrypt in `cards/page.tsx` and `vouchers/page.tsx` before passing to the client
- ✅ `scripts/migrate-encrypt.ts` — one-time migration, safe to re-run
- ✅ `scripts/decrypt.ts` — CLI tool to decrypt any stored value locally
- ✅ `scripts/test-encrypt.ts` — round-trip, uniqueness, tamper detection, optional DB test
- ✅ Add `ENCRYPTION_KEY` to `.env.example` and Vercel env vars
- ✅ Add `ENCRYPTION_KEY` to `.env.local` and Vercel
- ✅ Run `migrate-encrypt.ts` against dev DB (3 cards, 2 vouchers)
- ✅ Run `migrate-encrypt.ts` against production DB (8 cards, 5 vouchers)
- ✅ Also covers CVV (see CVV Support task above)

**Note:** This is encryption (reversible), not hashing — values need to be retrieved for display.

---

### ⬜ Per-Card Currency Support
Allow each gift card to have its own currency (e.g. USD, ILS, EUR) instead of using the app-wide locale currency.

**What's needed:**
- ⬜ Add `currency String` column to `GiftCard` schema + migration (no DB default — resolved at create time)
- ⬜ Default currency derived from active locale at card creation time (`he` → ILS, `en` → USD)
- ⬜ Add currency selector to the Add Card form (pre-filled with locale default, overridable)
- ⬜ Pass `currency` field through `CardWithBalance` type
- ⬜ Use card's own currency in `formatCurrency()` calls for balance display and transactions
- ⬜ Display currency code alongside balance in card list and detail modal

---

### ✅ CVV Support
Add an optional CVV field to gift cards for cards that require it at checkout.

**What's needed:**
- ✅ Add `cvv String?` column to `GiftCard` in Prisma schema + migration
- ✅ Add CVV input to the Add Card form (optional, masked)
- ✅ Show CVV in Card Detail modal with reveal/hide toggle (same pattern as `fullNumber`)
- ✅ Encrypt CVV at rest alongside `fullNumber` (see Encrypt Sensitive Fields task)

---

### ✅ Vouchers Tab/Screen
Add a separate vouchers section for one-time use codes (promo codes, store credits, gift vouchers).

**What's needed:**
- ✅ Add `Voucher` model to Prisma schema + migration
- ✅ Create `/vouchers` page (Server Component) with voucher list
- ✅ Add voucher Server Actions: `createVoucher`, `markVoucherUsed`, `deleteVoucher`
- ✅ Build `VouchersClient` with Add/Detail modals (code reveal pattern like `fullNumber`)
- ✅ Two-section layout: "Active" on top, "Used" below (always visible, no toggle)
- ✅ Navigation: bottom tab bar with Vouchers tab in `BottomNav`
- ✅ Add all voucher translation keys to `i18n.ts` (en + he)
- ⬜ Consider applying same two-section pattern to Gift Cards (zero-balance cards in a "Used" section)

**See:** `plans/vouchers-hld.md` for full design.

---

### ✅ Add `createdBy` to All Relevant Tables
Track which user created each record, mirroring the existing `createdAt` pattern.

**What's needed:**
- ✅ Add `createdBy String?` (FK → `User.id`) to `GiftCard`, `Transaction`, `Voucher`, and `ClubMember` tables
- ✅ Migration (column present in schema + Neon)
- ✅ Populate `createdBy` in all relevant Server Actions (`app/actions.ts`, `app/vouchers/actions.ts`)
- ⬜ Optionally display "Added by" in card/voucher detail modals

---

### ✅ Add Sequence Number to Gift Cards
Add an auto-increment `seq` column to `GiftCard` so each card has a human-readable number (#1, #2…), consistent with the Voucher model.

**What's needed:**
- ✅ Add `seq Int @default(autoincrement())` to `GiftCard` in Prisma schema + migration
- ✅ Display `#seq` in the card list and detail modal

---

### ⬜ Club Members Tab
A dedicated section for loyalty/membership cards (supermarket clubs, gym memberships, etc.).

**What's needed:**
- ✅ Add `ClubMember` model to Prisma schema (seq, name, provider, memberId, ownerName, idType, expiresAt, notes, isActive, createdBy)
- ⬜ Run Neon migration: CREATE SEQUENCE + CREATE TABLE ClubMember + FK to FamilyGroup
- ⬜ Add local migration file under `prisma/migrations/`
- ⬜ Add EN + HE translations for clubs section to `lib/i18n.ts`
- ⬜ Create server actions `app/clubs/actions.ts` (createClub, deleteClub, type ClubItem)
- ⬜ Create clubs page `app/clubs/page.tsx`
- ⬜ Create `ClubsClient` component (add form, card list, detail modal)
- ⬜ Add Clubs tab to `BottomNav`
- ⬜ Create `vw_clubs_overview` view on Neon

---

### ⬜ Coupons Tab (Future)
A separate tab for percentage-off and promo discount codes (e.g. "20% off next order").

**What's needed:**
- ⬜ Decide on coupon fields: code, discount type (% or fixed), value, provider, expiry, notes
- ⬜ Add `Coupon` model to Prisma schema + migration
- ⬜ Include `seq`, `createdBy`, `usedBy`, `usedAt` fields — same pattern as Voucher
- ⬜ Build Coupons tab alongside Gift Cards and Vouchers tabs

---

### ⬜ Multi-Family Support (Option A)
Allow a single user to belong to multiple families and switch between them in the app.

**What's needed:**
- ⬜ Replace `User.familyId` (single) with a `FamilyMembership` join table (many-to-many)
- ⬜ Add a family switcher to the header
- ⬜ All server actions need to know the "active family" (cookie or session)
- ⬜ Onboarding: allow joining more than one family after initial setup
- ⬜ Settings: show all families the user belongs to, with leave/switch options
