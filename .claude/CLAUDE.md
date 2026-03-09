# myGiftCardsVault — Claude Code Instructions

# Developer Profile

- **Role:** Experienced Developer (Angular/.NET background).
- **Style:** Prioritizes Clean Code, Simplicity, and Type Safety.
- **Architecture Mindset:** Prioritizes clean, simple, and type-safe code.
- **Preference:** Want to try Modern React (Next.js App Router) without unnecessary abstractions.

# Project Context: myGiftCardsVault (React Edition)

A mobile-first PWA for family gift card management.

## Project Overview

myGiftCardsVault is a gift card management application.

## Tech Stack

- **Framework:** Next.js 15+ (App Router).
- **Language:** TypeScript.
- **Backend:** Next.js API Routes (Node.js runtime).
- **Database:** PostgreSQL with Prisma ORM (or Supabase).
- **State Management:** - **Server State:** React Query (TanStack Query) for caching, invalidation, and optimistic updates.
  - **Client UI State:** Zustand (for modals, filters, and transient UI toggles).
  - **Initial Data Fetching:** React Server Components (RSC) for direct database access.
- **UI:** Tailwind CSS + Shadcn/UI (Mobile-first).

## UI Guidelines

- Use **Tailwind CSS** for all styling.
- **Mobile-First:** Use `flex-col` for mobile and `flex-row` for larger screens.
- **Interactive Elements:** Buttons must have a minimum height of `44px` (iOS standard) for easy thumb-tapping.
- **Theming:** Use a clean "Finance" aesthetic (Slate/Gray scales with Emerald for 'Recharge' and Rose for 'Spent').

## Architecture Principles

- **Ledger-Based:** Balance is derived from a `Transactions` table. Every action is an entry (Spent/Recharged).
- **Server Actions:** Use Next.js Server Actions for data mutations (updating balances).
- **PWA Ready:** Must support `next-pwa` or a manual service worker for "Add to Home Screen" capability.

## Coding Standards & Patterns

### 1. Data Integrity (The Ledger Rule)

- **No Balance Column:** Never store a `balance` field in the `GiftCard` table. Balance must be computed by summing transactions.
- **Immutability:** Transactions should generally be append-only to maintain an audit trail.
- **Currency Safety:** Use the `Decimal` type for all currency calculations to avoid floating-point errors.

### 2. React & Next.js Patterns

- **Server Actions:** Use Next.js Server Actions for all mutations (creating cards, adding transactions).
- **Components:** Default to Server Components. Use `'use client'` strictly for components requiring hooks (Zustand, React Query) or event listeners.
- **Validation:** Use **Zod** for all form schemas and API request validation.
- **Composition:** Prefer composition patterns over deeply nested prop drilling.

### 3. UI/UX Principles (Mobile-First)

- **Touch Targets:** Minimum interactive targets of 44x44px for one-handed mobile use.
- **Typography:** Use `font-mono` for currency and card numbers to ensure perfect vertical alignment in lists.
- **Instant Feel:** Implement Optimistic Updates via React Query so the UI reflects "Spend" and "Recharge" actions immediately.
- **PWA:** Ensure a manifest.json and Service Worker are configured for "Add to Home Screen" capability.

## Project Structure

- `/app`: Pages, Layouts, and Server Actions.
- `/components`: Reusable UI components (shadcn/ui atoms).
- `/hooks`: Custom React Query and Zustand store hooks.
- `/lib`: Prisma client, database utilities, and shared helper functions.
- `/types`: Zod schemas and TypeScript interfaces.

## Clean Code Rules

- **Keep it Simple:** No over-engineering. Use Server Actions for data.
- **Ledger-Based:** Balance is the sum of transactions. No "balance" column in the DB.
- **Type Safety:** Use Zod for form validation and Prisma types for DB entities.
- \*\*Mobil

## Business Logic

- **Rechargeable Support:** Logic must allow adding funds to cards marked as `isReloadable`.
- **Family Sharing:** Data is scoped by `familyId`.
