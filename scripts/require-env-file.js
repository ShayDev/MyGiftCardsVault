const fs = require('fs')

const file = process.argv[2]

if (!fs.existsSync(file)) {
  console.error(`ERROR: ${file} not found.`)
  console.error(`Refusing to proceed — without it, prisma.config.ts silently falls back to .env.local's DATABASE_URL (the dev database).`)
  console.error(`Run: vercel env pull ${file} --environment=production`)
  process.exit(1)
}
