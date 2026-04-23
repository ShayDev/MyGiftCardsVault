import crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes)')
  return Buffer.from(hex, 'hex')
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return decipher.update(Buffer.from(ciphertextHex, 'hex')) + decipher.final('utf8')
}

/** Returns true if a string looks like an encrypted value (iv:authTag:ciphertext). */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32
}
