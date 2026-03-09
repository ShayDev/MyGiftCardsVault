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
