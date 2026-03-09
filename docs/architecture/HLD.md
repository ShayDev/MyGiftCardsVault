# High-Level Design — myGiftCardsVault (Phase 1)

Purpose

- Provide a minimal, secure, and extensible foundation for family gift card management.

Key principles

- Ledger-based: balances are computed by summing transactions, never stored.
- Type-safe and explicit: TypeScript, Zod for validation, Prisma for DB types.
- Mobile-first PWA-ready UI with Tailwind and a small client store via Zustand.

Core components

- Database: PostgreSQL via Prisma. Models: `FamilyGroup`, `User`, `GiftCard`, `Transaction`.
- Server: Next.js App Router (Server Components for data fetching, Server Actions for mutations).
- Client: Zustand for minimal UI state (family context, modal toggles, filters).
- Money: use Prisma `Decimal` type for currency.

Phase 1 deliverables

- Prisma schema (models & enums).
- Global UI Store (Zustand) managing family context and UI toggles.
- Balance computation utilities that apply the Ledger Rule.
- Minimal Server Component listing cards + computed balances on initial load.

Security & scope

- Data is scoped by `familyId` for multi-family support.
- Transactions are append-only; mutations use Server Actions with validation.

Next steps

- Implement Server Actions, React Query hooks, and optimistic updates in Phase 2.
