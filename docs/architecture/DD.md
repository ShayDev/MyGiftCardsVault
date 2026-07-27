# Detailed Design — myGiftCardsVault (Phase 1)

Models (Prisma)

- FamilyGroup: top-level scope for family data, `id`, `name`, `createdAt`.
- User: references `familyId`, has `role` (owner/member), minimal auth fields.
- GiftCard: `id`, `familyId`, `name`, `provider`, `last4`, `isReloadable`, `metadata`, `createdAt`.
- Transaction: append-only ledger entries with `id`, `giftCardId`, `type` (RECHARGE|SPEND), `amount` (Decimal), `notes`, `createdAt`.

Ledger Rule

- Transactions store positive `amount` values. Balance = sum(recharge) - sum(spend).

APIs and Server Patterns

- Server Components (RSC) will read data directly using Prisma for initial SSR.
- Server Actions will perform mutations and must validate with Zod.

Balance Calculation Strategy

- Use a single grouped aggregate query to compute per-card sums for efficiency.
- Post-process grouped results to produce a `Decimal` net balance per card.

Client store (Zustand)

- Keep `familyId` as a primary context key.
- UI state: `activeCardFilter`, `transactionModal` (visible, cardId), `activeCardId`.

Implementation notes

- Use Prisma `Decimal` in TypeScript via `Prisma.Decimal` (imported from `@prisma/client`).
- Provide a lightweight `lib/prisma.ts` to expose a cached Prisma Client instance for Next.js.

# Family Ownership & Switching (Phase 2)

Problem

- `User.role` (`owner`/`member`) is a single scalar tied to the user's current `familyId`. It gets overwritten on every family switch, so once an owner switches away from a family they created, ownership is unrecoverable — switching back re-assigns `'member'`.
- A user who already belongs to a family (owner or member) has no way to create a brand-new family of their own; `createFamily` blocks if `familyId` is already set.
- Model stays single-active-family-per-user (per earlier decision) — no multi-family membership join table, no "recent families" list. Switching still means re-pointing `familyId`, looked up by family name + invite code.

Data model changes

- `FamilyGroup`: add `ownerId String @unique` (FK → `User.id`), set once at creation time, immutable. Represents the family's original creator — the durable fact that switching must not lose. `@unique` is the enforcement mechanism for the one-family-per-owner invariant below (a second `create` with the same `ownerId` fails at the DB level, not just in app logic).
- `User.role` stays `owner`/`member`, but becomes *derived at switch time* from `FamilyGroup.ownerId` rather than a fixed identity carried across switches.

Ownership invariant

- A user may own **at most one** family, ever. Enforced by `FamilyGroup.ownerId @unique` plus an app-level pre-check in `createNewFamily` (so the failure is a friendly Zod-style `{ error }` return, not a raw constraint violation).
- Because ownership is unique and permanent, "my family" is always resolvable by `FamilyGroup.findFirst({ where: { ownerId: user.id } })` — no need to remember or re-enter its name/code once you've created it.

Server actions

- `createFamily` (`app/onboarding/actions.ts`, existing) — same trigger (first-time setup), but now sets `FamilyGroup.ownerId = user.id` at creation. Requires reordering the transaction: upsert `User` first (to obtain `id`), then create `FamilyGroup` with `ownerId`, then update `User.familyId` + `role = 'owner'`.
- `switchFamily` (`app/settings/actions.ts`, existing, join-by-code) — role is no longer hardcoded to `'member'`. After finding the target `FamilyGroup`, compute `role = family.ownerId === user.id ? 'owner' : 'member'` (this is what makes re-joining your own family by code correctly restore `'owner'` too, though the dedicated action below is the normal path for that).
- `createNewFamily` (`app/settings/actions.ts`, new) — lets a user who doesn't yet own a family create one and switch into it as owner. First checks `FamilyGroup.findFirst({ where: { ownerId: user.id } })`; if one already exists, returns `{ error: 'You already have a family — switch back to it instead.' }` rather than creating a second one. Otherwise, same creation logic as onboarding's `createFamily` (uppercased name, `nanoid(12)` invite code, `ownerId`), using `update` instead of `upsert` since the `User` row is guaranteed to exist.
- `switchToOwnFamily` (`app/settings/actions.ts`, new) — one-click "back to my family," no form input. Looks up `FamilyGroup.findFirst({ where: { ownerId: user.id } })`; if found, sets `familyId` + `role = 'owner'` and redirects to `/cards`. If the user has never created a family, returns `{ error }` (shouldn't be reachable from the UI since the button only renders when an owned family exists — see below).

Migration

- Idempotent, following the existing style in `prisma/migrations/20260406000000_add_clerk_auth/migration.sql`: `ALTER TABLE "FamilyGroup" ADD COLUMN IF NOT EXISTS "ownerId" TEXT`, backfill via `UPDATE "FamilyGroup" fg SET "ownerId" = u.id FROM "User" u WHERE u."familyId" = fg.id AND u.role = 'owner'`, then `ALTER COLUMN "ownerId" SET NOT NULL` and `CREATE UNIQUE INDEX IF NOT EXISTS "FamilyGroup_ownerId_key" ON "FamilyGroup"("ownerId")` once backfilled. Backfill is accurate because, prior to this feature shipping, every `role = 'owner'` row in production is still the true creator (switching doesn't exist yet), and each such user maps to exactly one family today — so the unique index will not fail on existing data.
- Families left without a resolvable owner after backfill (shouldn't occur, but defensively) get `ownerId` pointed at any current member, or are left nullable — decide at migration-write time based on what prod data actually looks like.

UI (Settings)

- `app/settings/page.tsx` additionally loads `ownedFamily = FamilyGroup.findFirst({ where: { ownerId: user.id } })` and passes its `name` (or `null`) to `SettingsClient`.
- If `ownedFamily` exists **and** it's not the user's current active family (`ownedFamily.id !== user.familyId`), show a quick-action row above the rest of the switcher: **"Switch back to [ownedFamily.name]"**, wired to `switchToOwnFamily` (plain `<form action={switchToOwnFamily}>`, no inputs) — this is the one-click path for exactly the "created a family, switched away as a guest, now want back" scenario.
- Below that, the existing two entry points remain: "Join another family" (name+code form → `switchFamily`) and "Create a new family" (name-only form → `createNewFamily`) — the latter is hidden or disabled (with the same "you already have a family" message) once `ownedFamily` is non-null.

Non-goals

- No multi-family membership table or one-click list of *joined* (non-owned) families — switching into a family you don't own still requires re-entering its name + invite code. Only your *own* family gets a shortcut, because it's the one relationship the system can prove is permanent.
- No ownership transfer or family deletion flows.
