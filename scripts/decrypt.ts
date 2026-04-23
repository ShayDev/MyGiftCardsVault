import { decrypt } from '../lib/encrypt'

const cipher = process.argv[2]

if (!cipher) {
  console.error('Usage: npx tsx --env-file=.env.local scripts/decrypt.ts <encrypted_value>')
  process.exit(1)
}

try {
  console.log(decrypt(cipher))
} catch {
  console.error('Decryption failed — wrong key or corrupted value')
  process.exit(1)
}
