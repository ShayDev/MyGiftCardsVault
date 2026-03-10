import path from 'node:path'
import { defineConfig } from 'prisma/config'
import { PrismaNeon } from '@prisma/adapter-neon'

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  migrate: {
    async adapter() {
      return new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
    },
  },
})
