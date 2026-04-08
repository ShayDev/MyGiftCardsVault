# TODO

## Future Features

### Encrypt Card Numbers at Rest
Encrypt `fullNumber` before storing in the DB and decrypt on read, so raw card numbers are never stored in plain text.

**What's needed:**
- Choose an encryption strategy (AES-256-GCM with a server-side `ENCRYPTION_KEY` env var)
- Encrypt `fullNumber` in `createCard` server action before writing to DB
- Decrypt in `cards/page.tsx` before passing to the client (only when the user requests reveal)
- Migrate existing plain-text `fullNumber` values in the DB
- Add `ENCRYPTION_KEY` to `.env.local`, `.env.example`, and Vercel env vars

**Note:** This is encryption (reversible), not hashing — card numbers need to be retrieved for display.

---

### Per-Card Currency Support
Allow each gift card to have its own currency (e.g. USD, ILS, EUR) instead of using the app-wide locale currency.

**What's needed:**
- Add `currency String` column to `GiftCard` schema + migration (no DB default — resolved at create time)
- Default currency derived from active locale at card creation time (`he` → ILS, `en` → USD)
- Add currency selector to the Add Card form (pre-filled with locale default, overridable)
- Pass `currency` field through `CardWithBalance` type
- Use card's own currency in `formatCurrency()` calls for balance display and transactions
- Display currency code alongside balance in card list and detail modal

---

### CVV Support
Add an optional CVV field to gift cards for cards that require it at checkout.

**What's needed:**
- Add `cvv String?` column to `GiftCard` in Prisma schema + migration
- Add CVV input to the Add Card form (optional, masked)
- Show CVV in Card Detail modal with reveal/hide toggle (same pattern as `fullNumber`)
- Consider encrypting CVV at rest alongside `fullNumber` (see Encrypt Card Numbers task)

---

### Multi-Family Support (Option A)
Allow a single user to belong to multiple families and switch between them in the app.

**What's needed:**
- Replace `User.familyId` (single) with a `FamilyMembership` join table (many-to-many)
- Add a family switcher to the header
- All server actions need to know the "active family" (cookie or session)
- Onboarding: allow joining more than one family after initial setup
- Settings: show all families the user belongs to, with leave/switch options
