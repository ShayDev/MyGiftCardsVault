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

### Multi-Family Support (Option A)
Allow a single user to belong to multiple families and switch between them in the app.

**What's needed:**
- Replace `User.familyId` (single) with a `FamilyMembership` join table (many-to-many)
- Add a family switcher to the header
- All server actions need to know the "active family" (cookie or session)
- Onboarding: allow joining more than one family after initial setup
- Settings: show all families the user belongs to, with leave/switch options
