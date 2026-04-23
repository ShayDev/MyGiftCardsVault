import { encrypt, decrypt, isEncrypted } from '../lib/encrypt'
import prisma from '../lib/prisma'

let allPassed = true

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✅' : '❌'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) allPassed = false
}

// ── Round-trip ────────────────────────────────────────────────────────────────
console.log('\n── Round-trip ───────────────────────────────────────────────')
const samples = [
  '4111111111111114',
  'ABC123-XYZ',
  'https://example.com/redeem?token=secret&user=me',
  '123',
]
for (const plain of samples) {
  const recovered = decrypt(encrypt(plain))
  check(`"${plain}"`, recovered === plain, recovered !== plain ? `got "${recovered}"` : undefined)
}

// ── Uniqueness (fresh IV per call) ────────────────────────────────────────────
console.log('\n── Uniqueness ───────────────────────────────────────────────')
const a = encrypt('same-value')
const b = encrypt('same-value')
check('Two encryptions of same input differ', a !== b)

// ── isEncrypted detection ─────────────────────────────────────────────────────
console.log('\n── isEncrypted ──────────────────────────────────────────────')
check('Detects encrypted string',       isEncrypted(encrypt('hello')))
check('Ignores plain card number',     !isEncrypted('4111111111111114'))
check('Ignores plain voucher code',    !isEncrypted('ABC-DEF'))
check('Ignores plain URL',             !isEncrypted('https://example.com'))

// ── Tamper detection ──────────────────────────────────────────────────────────
console.log('\n── Tamper detection ─────────────────────────────────────────')
const cipher = encrypt('original')
const tampered = cipher.slice(0, -2) + 'ff'
let threw = false
try { decrypt(tampered) } catch { threw = true }
check('Throws on tampered ciphertext', threw)

// ── DB round-trip (opt-in) ────────────────────────────────────────────────────
async function runDbTest() {
  console.log('\n── DB round-trip ────────────────────────────────────────────')
  const familyId = process.env.TEST_FAMILY_ID
  if (!familyId) {
    console.log('⚠️  Skipped — set TEST_FAMILY_ID in .env.local to enable')
    return
  }
  const testCode = 'TEST-' + Date.now()
  const v = await prisma.voucher.create({
    data: { name: '__encrypt-test__', provider: 'test', seq: 0, familyId, code: encrypt(testCode) },
  })
  const fetched = await prisma.voucher.findUniqueOrThrow({ where: { id: v.id } })
  const recovered = fetched.code ? decrypt(fetched.code) : null
  check('DB write → read → decrypt', recovered === testCode, recovered ?? 'null')
  await prisma.voucher.delete({ where: { id: v.id } })
}

async function main() {
  if (process.argv.includes('--db')) await runDbTest()
  console.log(`\n${allPassed ? '✅ All tests passed' : '❌ Some tests FAILED'}`)
  if (!allPassed) process.exit(1)
}

main().catch(console.error)
