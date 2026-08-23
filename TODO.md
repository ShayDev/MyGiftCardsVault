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
- ✅ Consider applying same two-section pattern to Gift Cards (zero-balance cards in a "Used" section)

**See:** `plans/vouchers-hld.md` for full design.

---

### ✅ Add `createdBy` to All Relevant Tables

Track which user created each record, mirroring the existing `createdAt` pattern.

**What's needed:**

- ✅ Add `createdBy String?` (FK → `User.id`) to `GiftCard`, `Transaction`, `Voucher`, and `ClubMember` tables
- ✅ Migration (column present in schema + Neon)
- ✅ Populate `createdBy` in all relevant Server Actions (`app/actions.ts`, `app/vouchers/actions.ts`)
- ✅ Optionally display "Added by" in card/voucher detail modals (+ transaction history)

---

### ✅ Add Sequence Number to Gift Cards

Add an auto-increment `seq` column to `GiftCard` so each card has a human-readable number (#1, #2…), consistent with the Voucher model.

**What's needed:**

- ✅ Add `seq Int @default(autoincrement())` to `GiftCard` in Prisma schema + migration
- ✅ Display `#seq` in the card list and detail modal

---

### ✅ Club Members Tab

A dedicated section for loyalty/membership cards (supermarket clubs, gym memberships, etc.).

**What's needed:**

- ✅ Add `ClubMember` model to Prisma schema (seq, name, provider, memberId, ownerName, idType, expiresAt, notes, isActive, createdBy)
- ✅ Run Neon migration: CREATE SEQUENCE + CREATE TABLE ClubMember + FK to FamilyGroup (dev + prod)
- ✅ Add EN + HE translations for clubs section to `lib/i18n.ts`
- ✅ Create server actions `app/clubs/actions.ts` (createClub, deleteClub, type ClubItem)
- ✅ Create clubs page `app/clubs/page.tsx`
- ✅ Create `ClubsClient` component (add form, card list, detail modal)
- ✅ Add Clubs tab to `BottomNav`
- ✅ `memberId` encrypted at rest (uses shared `lib/encrypt.ts`)
- ⬜ Add local migration file under `prisma/migrations/` (used raw SQL scripts instead)
- ⬜ Create `vw_clubs_overview` view on Neon

---

### ✅ Refunds Tab

A dedicated section to track pending and received store refunds (credit notes, return credits).

**What's needed:**

- ✅ Define refund fields: provider, amount, status (pending / received), reference number, notes, expiration date — store credit only for now
- ✅ Add `Refund` model to Prisma schema + migration (seq, familyId, provider, amount, currency, status, referenceId, notes, expiresAt, receivedAt, isActive, createdBy, createdAt)
- ⬜ **Future:** Add `refundType` (store credit / original payment method) once original payment method flow is defined
- ✅ Server actions: `createRefund`, `updateRefund`, `markRefundReceived`, `markRefundUsed`, `useRefundAmount`, `deleteRefund`
- ✅ Two-section layout: "Pending" on top, "Received" below — same pattern as Vouchers
- ✅ Add EN + HE translations
- ✅ Add Refunds tab to `BottomNav`
- ✅ Parse refund from image (or pasted text) — Scan button in the Add modal calls Gemini Flash to pre-fill provider/amount/currency/referenceId/code/link/expiresAt/notes; same feature also covers Gift Cards and Vouchers (see `plans/ai-image-extract-dd.md`)

---

### ✅ Provider Field — Closed List with Custom Value

Replace the free-text provider input with a searchable combobox: a closed list of known providers stored in the DB (keyed by entity type), plus the ability to type a custom value that gets saved to the list for next time.

**Scope:** Gift Cards, Vouchers, Refunds, and Clubs all wired up — `ProviderCombobox` reused as-is across all four Add/Edit forms with per-type option lists (`CARD`/`VOUCHER`/`REFUND`/`CLUB`).

**What's needed:**

- ✅ Add a `Provider` table to Prisma schema + migration: `id`, `type` (`CARD`/`VOUCHER`/`CLUB`/`REFUND`), `name` (canonical/English, nullable), `nameByCountry` (localized display, nullable — at least one of the two set, enforced via DB `CHECK`), `country` (ISO 3166-1 alpha-2, default `IL`), `familyId` (default `'0'` sentinel = shared/global, not a real FK; a real family id = custom option added by that family), `balanceCheckUrl` (nullable, reserved — unused for now), `createdBy` (loose reference to `User.id`), `createdAt`
- ✅ Seed script to populate built-in providers per type — curated Israeli defaults (BuyMe, Isracard, Cal, Max, Shufersal, etc. for `CARD`; Pais/Hever/HitechZone for `VOUCHER`; Zara/IKEA/Fox/Castro for `REFUND`; Fox/Castro/Zara/Tzomet Sfarim/Steimatzky for `CLUB`) as global rows (`familyId = '0'`) — run against dev and prod, replacing the earlier generic international seed list
- ✅ Query/action to fetch provider options for a given `type`: global rows + the current family's own custom rows, deduped by displayed name
- ✅ When the combobox is submitted with a name not already in the list, insert it into `Provider` (matching `type`, `familyId` = current family) — routed into `name` if the typed text is plain English, otherwise `nameByCountry`; English entries capitalized to match the seeded list's styling
- ✅ Build a `ProviderCombobox` component supporting: browse the list, type-ahead search/filter (matching across both the English and localized name, not just what's displayed), and free-text entry for anything not found (all three interaction modes, not just one)
- ✅ Wire into Add/Edit forms for Gift Cards (`CARD`), Vouchers (`VOUCHER`), Refunds (`REFUND`, required field), and Clubs (`CLUB`) — `ProviderCombobox` gained a `required` prop for Refunds' mandatory provider field
- ✅ `ProviderCombobox` decoupled from Gift Card specifics (accepts `options`/`required` as props) — proven by reuse across all four entity types with zero component changes needed
- ⬜ **Future:** cache `getProviderOptions` (e.g. Next's `unstable_cache`/`"use cache"`, keyed by `type`+`familyId`, invalidated via `revalidateTag` from `ensureProviderExists`) if `/cards` load latency ever actually shows it's worth it — skipped for now since it's one small indexed query, not a measured bottleneck
- ⬜ **Future:** surface `balanceCheckUrl` in the UI (e.g. a "Check balance" link/button on the card detail modal) — column exists and is populated nowhere yet, purely reserved for this

**See:** `plans/provider-field-hld.md` for full design.

---

### ✅ Edit Support (All Tables)

Allow editing existing records across all entity types — Gift Cards, Vouchers, Clubs, and Refunds.

**What's needed:**

- ✅ `updateCard` server action — editable fields: provider, fullNumber, cvv, link, notes, expiresAt, isReloadable
- ✅ `updateVoucher` server action — editable fields: provider, code, link, value, notes, expiresAt
- ✅ `updateClub` server action — editable fields: name, provider, memberId, ownerName, idType, expiresAt, notes
- ✅ `updateRefund` server action — editable fields: provider, amount, currency, referenceId, code, link, notes, expiresAt
- ✅ Edit mode in each detail modal — tap an Edit button to switch fields to inputs, Save / Cancel
- ✅ Re-encrypt sensitive fields on save (fullNumber, cvv, link for cards; code, link for vouchers; memberId for clubs; code, link for refunds)
- ✅ Revalidate the relevant path after each update

---

### ⬜ Coupons Tab (Future)

A separate tab for percentage-off and promo discount codes (e.g. "20% off next order").

**What's needed:**

- ⬜ Decide on coupon fields: code, discount type (% or fixed), value, provider, expiry, notes
- ⬜ Add `Coupon` model to Prisma schema + migration
- ⬜ Include `seq`, `createdBy`, `usedBy`, `usedAt` fields — same pattern as Voucher
- ⬜ Build Coupons tab alongside Gift Cards and Vouchers tabs

---

### ⬜ Warranty Support

A dedicated section for tracking product warranties (electronics, appliances, etc.) — product, where it was purchased, who to actually claim the warranty with (often a different company than the seller), purchase date + duration (computed expiry, overridable), and proof of purchase (image + link).

**What's needed:**

- ⬜ Add `WarrantyProvider` model to Prisma schema + migration — a dedicated company directory (`id`, `familyId` [default `'0'` global sentinel], `name`, `phone`, `url`, `createdBy`, `createdAt`), **not** the generic `Provider` table
- ⬜ Add `Warranty` model + migration (`seq`, `familyId`, `productName`, `purchasedFromId` [required FK → `WarrantyProvider`], `branch` [optional free text, e.g. "Rishon LeZion"], `warrantyCompanyId` [optional FK → `WarrantyProvider`, defaults to "same as purchasedFrom"], `purchaseDate`, `durationMonths`, `expiresAt`, `referenceId`, `notes`, `link` [encrypted], `imageUrl`, `isActive`, `createdBy`, `createdAt`)
- ⬜ Seed starter `WarrantyProvider` rows — names only; `phone`/`url` left blank unless manually verified against real support info
- ⬜ New `WarrantyProviderCombobox` component (name/phone/url, not a `ProviderCombobox` reuse) — two instances per form, same shared directory
- ⬜ Server actions: `getWarrantyProviderOptions`, `ensureWarrantyProviderExists`, `createWarranty`, `updateWarranty`, `deleteWarranty` — no manual "used" state, status is computed from `expiresAt`
- ⬜ Two-section layout: "Active" on top, "Expired" below — computed from `expiresAt`, not a stored flag (unlike Vouchers/Refunds)
- ⬜ Add EN + HE translations
- ⬜ Add Warranties tab to `BottomNav` (5th tab; icon-only under ~380px width)
- ⬜ Add `WARRANTY` entityType to the AI image-extract flow (`/api/extract`, `purchasedFrom` only — not `warrantyCompany`); generalize `/api/upload`'s hardcoded `refunds/` folder
- ⬜ Extend `NavBadgeCounts` with a `warranties` category

**See:** `plans/warranty-hld.md` and `plans/warranty-dd.md` for full design.

---

### ⬜ Global Search

Search across all tabs (Gift Cards, Vouchers, Clubs, Refunds) from a single input.

**What's needed:**

- ⬜ Search input in the app header or a dedicated search page (`/search`)
- ⬜ Query across all entity types by name, provider, notes, and masked ID/code
- ⬜ Results grouped by type (Cards / Vouchers / Clubs / Refunds) with tap-to-open detail modal
- ⬜ Client-side filtering for small families; server-side `ILIKE` query for scale
- ⬜ Debounced input — no search-on-every-keystroke

---

### ✅ Nav Badge Counts (Active Items per Tab)

Show a small badge on each bottom-nav tab (Gift Cards, Vouchers, Clubs, Refunds) with the count of "active" items in that section.

**What's needed:**

- ✅ Boolean feature flag (`ENABLE_NAV_BADGES` in `app/actions.ts`), on by default — flip to `false` to skip the count query entirely and hide all badges, same pattern as `ENABLE_ADDED_BY_ATTRIBUTION`
- ✅ "Active" per entity: GiftCard = `isActive && balance > 0`, Voucher = `isActive && !isUsed`, ClubMember = `isActive`, Refund = `isActive && !isUsed`
- ✅ `getNavBadgeCounts()` Server Action counting all four entity types in one pass, fetched once per browser session via `hooks/useNavBadgeCountsStore.ts` (same plain-Zustand, no-`persist`, fetch-once shape as `useFamilyAttributionStore.ts`)
- ✅ Badge UI on `BottomNav` — numeric pill, hidden when count is 0, capped at `MAX_BADGE_COUNT = 9` showing `9+` above that
- ✅ User actions across all four entities (`GiftCardsClient`/`VouchersClient`/`ClubsClient`/`RefundsClient`) call `adjustNavBadgeCount()` on success (+1/-1) instead of re-querying — no i18n needed, it's just a number
- ✅ Two-tier expiry alert: each category in `NavBadgeCounts` is `{ count, hasExpired, hasExpiringSoon }` — badge is rose if the category has an already-expired active item, amber if none are expired but one is within the 90-day "expiring soon" window (same window as `isExpiringSoon()` in `lib/date.ts`), else emerald. Both flags are deliberately stale-until-reload: never adjusted locally by `adjustNavBadgeCount()` since they only change by the calendar passing a date, not by a user action — accepted tradeoff to avoid polling

---

### ✅ PWA Install Prompt + Tracking (Android)

Custom "Install app" control for Android/Chrome (captures `beforeinstallprompt`, shows our own button in Settings instead of relying purely on Chrome's own banner), plus persist to the DB when a user actually completes an install (`appinstalled` event) — not just when they're eligible to.

**Shipped as:**

- ✅ `hooks/useInstallPromptStore.ts` + `components/InstallPromptListener.tsx` (mounted app-wide in `app/layout.tsx`, not Settings-scoped — see HLD status note) — capture `beforeinstallprompt`, expose `canInstall`/`installed`/`promptInstall()`
- ✅ Extended `UserLoginStat` with `os String?` + `pwaInstalled Boolean` (leaner than the HLD's original `pwaInstalledAt`/`pwaInstallPlatform` — dev + prod migration)
- ✅ `app/api/track-install/route.ts` — upsert on confirmed install, mirrors `track-visit`'s shape
- ✅ Settings UI entry (button, hidden once installed) + i18n keys
- ⬜ **Future, not v1:** a real service worker (`public/sw.js`) — static app-shell caching only (never card/voucher/refund data), versioned cache + `skipWaiting`/`clients.claim` for updates, no push/background-sync yet

**See:** `plans/pwa-install-android-hld.md` for full design (status note at the top covers what changed).

---

### ✅ PWA Add to Home Screen Guidance (iOS)

iOS Safari has no `beforeinstallprompt`/`appinstalled` equivalent — everything is a manual Share → Add to Home Screen gesture nothing in Safari's UI hints at. Needs its own instructional guidance, plus an indirect way to confirm installation after the fact (detecting standalone mode on a later visit, since there's no install event to hook).

**Shipped as:**

- ✅ `lib/platform.ts` — `isIOS()` / `isAndroid()` / `isStandalone()` / `detectOS()` detection
- ✅ Settings-page disclosure (expand/collapse Share → Add to Home Screen steps), not an app-wide banner — lives next to the Android install button in the same Settings card
- ✅ Standalone-mode detection folded into `VisitTracker.tsx` (posts to `/api/track-install` once per session) instead of a separate `InstallStandaloneTracker` component
- ✅ i18n keys (en/he) for the instructional copy

**See:** `plans/pwa-install-ios-hld.md` for full design (status note at the top covers what changed). Shares the Android task's `UserLoginStat` columns + `/api/track-install` route.

---

### ⬜ Multi-Family Support (Option A)

Allow a single user to belong to multiple families and switch between them in the app.

**What's needed:**

- ⬜ Replace `User.familyId` (single) with a `FamilyMembership` join table (many-to-many)
- ⬜ Add a family switcher to the header
- ⬜ All server actions need to know the "active family" (cookie or session)
- ⬜ Onboarding: allow joining more than one family after initial setup
- ⬜ Settings: show all families the user belongs to, with leave/switch options
