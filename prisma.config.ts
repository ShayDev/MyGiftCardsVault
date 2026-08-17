import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { loadEnvConfig } from '@next/env'

// The second arg (`dev`) must be explicit — @next/env treats a missing/falsy value as
// "production" and loads .env.production.local *before* .env.local, so bare `prisma`
// CLI commands would silently target the production DATABASE_URL. `migrate:prod`
// dodges this by force-injecting its own env via `dotenv -o` ahead of time, but every
// other CLI invocation (`migrate dev`, `db push`, `studio`, ...) needs this to be true
// to get .env.local (the dev branch) instead.
loadEnvConfig(process.cwd(), true)

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  datasource: {
    // Direct (non-pooled) connection for the CLI — see .env.local's DIRECT_URL comment.
    // Falls back to DATABASE_URL so this doesn't break setups that only define one URL
    // (e.g. a local, non-Neon Postgres instance with no pooler in front of it at all).
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
  },
})
