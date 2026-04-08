# myGiftCardsVault

A mobile-first PWA for family gift card management, built with Next.js 15 App Router.

## Features

- Track gift card balances using a ledger-based transaction model (no stored balance column)
- Support for reloadable and single-use gift cards
- Family-scoped data sharing
- Spend and Recharge transactions with full audit trail
- Mobile-first UI with PWA "Add to Home Screen" support

## Tech Stack

- **Framework:** Next.js 15 (App Router, Server Actions)
- **Language:** TypeScript
- **Database:** PostgreSQL (Neon) via Prisma ORM
- **Styling:** Tailwind CSS + Shadcn/UI
- **State:** React Query (server state) + Zustand (UI state)
- **Validation:** Zod

## Getting Started

### Prerequisites

- Node.js 18+
- A PostgreSQL database (e.g. [Neon](https://neon.tech))

### Setup

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Create a `.env` file at the project root with your database connection string:

```env
DATABASE_URL="postgresql://..."
```

3. Generate the Prisma client and push the schema:

```bash
npx prisma generate
npx prisma db push
```

4. (Optional) Seed the database:

```bash
npm run seed
```

5. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
/app          Pages, layouts, and Server Actions
/components   Reusable UI components (Shadcn/UI atoms)
/hooks        Custom React Query and Zustand store hooks
/lib          Prisma client, database utilities, shared helpers
/types        Zod schemas and TypeScript interfaces
/prisma       Prisma schema, migrations, and seed script
```

## Data Model

Balances are **never stored directly** — they are always derived by summing a card's transactions:

- **RECHARGE** — adds funds to a card
- **SPEND** — deducts funds from a card

This ledger approach ensures a full audit trail and eliminates balance drift.

## Scripts

| Command                   | Description              |
| ------------------------- | ------------------------ |
| `npm run dev`             | Start development server |
| `npm run build`           | Build for production     |
| `npm run start`           | Start production server  |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run seed`            | Seed the database        |

## Supporting Systems Links

- **CODE REPO**
- https://github.com/ShayDev/MyGiftCardsVault

- **DB**
  https://console.neon.tech/app/projects/solitary-boat-71971957

- **AUTH**
- https://dashboard.clerk.com/apps

- **HOST**
- https://vercel.com/shaydev-9479s-projects/my_gift_cards_vault
- vercel --prod

- **APP**
- https://mygiftcardsvault.vercel.app/
