# Sensitive Field Encryption — Design Document

## Goal

Encrypt sensitive text fields before writing to the DB and decrypt server-side before passing data to client components. The client never receives or handles cipher text — it always sees plain values (or nothing, for fields left empty).

---

## Fields to Encrypt

| Table      | Field        | Reason                                   |
| ---------- | ------------ | ---------------------------------------- |
| `GiftCard` | `fullNumber` | Full card number                         |
| `GiftCard` | `cvv`        | CVV/CVC                                  |
| `GiftCard` | `link`       | May contain auth tokens or personal URLs |
| `Voucher`  | `code`       | Redemption code                          |
| `Voucher`  | `link`       | May contain auth tokens or personal URLs |

---

## Options Considered

### 1. AES-256-GCM (app-level, symmetric) ✅ chosen

Encrypt/decrypt in a shared `lib/encrypt.ts` with a single `ENCRYPTION_KEY` env var.

**Pros:**

- Authenticated encryption — GCM auth tag detects any tampering or corruption before decryption
- Zero external dependencies — Node.js built-in `crypto` module
- Full control over which fields are encrypted and exactly when decryption happens
- Protects against leaked DB credentials — ciphertext is useless without the app key
- Fast — AES hardware acceleration on modern CPUs

**Cons:**

- Single key compromise exposes all rows — no per-row key isolation
- Key rotation requires a re-encryption pass over every row
- Key management is manual — must keep `ENCRYPTION_KEY` out of source control and rotate it carefully

---

### 2. AES-256-CBC (app-level, symmetric)

Same symmetric approach but an older cipher mode.

**Pros:**

- Widely documented, simple to find examples

**Cons:**

- No authentication tag — cannot detect tampering without a separate HMAC
- Vulnerable to padding oracle attacks if not implemented carefully
- Strictly worse than GCM with no upside — skip it

---

### 3. Database-level (pgcrypto / Neon TDE)

Postgres `pgp_sym_encrypt` / `pgp_sym_decrypt` via the `pgcrypto` extension, or Neon's Transparent Data Encryption at the storage layer.

**Pros:**

- TDE requires zero app code changes — completely transparent
- pgcrypto keeps encryption logic inside the DB

**Cons:**

- TDE only protects against physical disk/storage theft — the DB process itself sees plaintext, so leaked connection strings or SQL injection still exposes data
- pgcrypto requires the encryption key to travel to the DB on every query
- Neither option protects against the primary threat model: compromised DB credentials

---

### 4. Envelope encryption / KMS (AWS KMS, GCP KMS, HashiCorp Vault)

A master key in an external service encrypts a per-row Data Encryption Key (DEK). DEKs encrypt the actual field values.

**Pros:**

- Gold standard for enterprise and multi-tenant systems
- Key rotation only re-wraps DEKs — no need to re-encrypt all rows
- Full audit trail on every key usage
- True separation of concerns: the app never holds the master key

**Cons:**

- External service dependency — KMS outage means the app cannot decrypt any data
- Adds latency on every decrypt (API call to KMS)
- Significant setup and operational complexity
- Overkill for a family-scoped app — the risk/complexity tradeoff doesn't pay off here

---

### 5. Prisma client extension (transparent field encryption)

Use Prisma's `$extends` API to auto-encrypt on every write and auto-decrypt on every read for marked fields.

**Pros:**

- Encryption is invisible to all app code — actions and page components need zero changes
- Consistent — impossible to forget a field once registered in the extension

**Cons:**

- Decrypts every field on every query, even when the value isn't needed
- Harder to implement "skip decryption for non-sensitive queries"
- Prisma extension API is relatively new and less battle-tested
- More magic — harder to audit and reason about in a security review

---

### Comparison

| Option           | Auth tag | No ext deps | Key rotation      | Protects vs leaked DB creds | Complexity |
| ---------------- | -------- | ----------- | ----------------- | --------------------------- | ---------- |
| AES-256-GCM ✅   | ✅       | ✅          | Re-encrypt rows   | ✅                          | Low        |
| AES-256-CBC      | ❌       | ✅          | Re-encrypt rows   | ✅                          | Low        |
| pgcrypto / TDE   | —        | ❌          | Varies            | ❌                          | Medium     |
| KMS envelope     | ✅       | ❌          | Re-wrap DEKs only | ✅                          | High       |
| Prisma extension | ✅ (GCM) | ✅          | Re-encrypt rows   | ✅                          | Medium     |

---

## Encryption Strategy: AES-256-GCM

**Algorithm:** AES-256-GCM  
**Why GCM over CBC:** Authenticated encryption — the auth tag detects any tampering or corruption of the ciphertext before decryption. CBC has no authentication and is vulnerable to padding oracle attacks.

### Stored format

Each encrypted value is stored as a single colon-delimited string:

```
<iv_hex>:<authTag_hex>:<ciphertext_hex>
```

- `iv` — 12 random bytes (96-bit), freshly generated per encryption call
- `authTag` — 16 bytes GCM authentication tag
- `ciphertext` — arbitrary length, same byte-length as plaintext

A fresh IV per call means two identical plaintexts produce different ciphertexts — no information leakage from repeated values.

### Key

- Single `ENCRYPTION_KEY` env var: **64 hex characters = 32 bytes = 256 bits**
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Required in: `.env.local`, `.env.example` (placeholder), Vercel environment variables

---

## Implementation Plan

### 1. `lib/encrypt.ts`

```ts
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64)
    throw new Error("ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return (
    decipher.update(Buffer.from(ciphertextHex, "hex")) + decipher.final("utf8")
  );
}

/** Returns true if a string looks like an encrypted value (iv:authTag:ciphertext). */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length === 24 && parts[1].length === 32;
}
```

`isEncrypted` is used by the migration script to skip rows that are already encrypted.

---

### 2. Server Actions — encrypt on write

In `app/actions.ts` (`createCard`):

```ts
import { encrypt } from "@/lib/encrypt";

// before prisma.giftCard.create(...)
if (fullNumber) data.fullNumber = encrypt(fullNumber);
if (cvv) data.cvv = encrypt(cvv);
if (link) data.link = encrypt(link);
```

In `app/vouchers/actions.ts` (`createVoucher`):

```ts
if (code) data.code = encrypt(code);
if (link) data.link = encrypt(link);
```

---

### 3. Page Server Components — decrypt on read

In `app/cards/page.tsx`, after fetching from DB:

```ts
import { decrypt, isEncrypted } from "@/lib/encrypt";

const cards = raw.map((card) => ({
  ...card,
  fullNumber: card.fullNumber
    ? isEncrypted(card.fullNumber)
      ? decrypt(card.fullNumber)
      : card.fullNumber
    : undefined,
  cvv: card.cvv
    ? isEncrypted(card.cvv)
      ? decrypt(card.cvv)
      : card.cvv
    : undefined,
  link: card.link
    ? isEncrypted(card.link)
      ? decrypt(card.link)
      : card.link
    : undefined,
}));
```

The `isEncrypted` guard handles the migration window when some rows are still plain text.

Same pattern in `app/vouchers/page.tsx` for `code` and `link`.

---

### 4. Migration Script

One-time script to encrypt existing plain-text rows in the DB.

**File:** `scripts/migrate-encrypt.ts`

```ts
import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../lib/encrypt";

const prisma = new PrismaClient();

async function main() {
  // GiftCards
  const cards = await prisma.giftCard.findMany();
  for (const card of cards) {
    const update: Record<string, string> = {};
    if (card.fullNumber && !isEncrypted(card.fullNumber))
      update.fullNumber = encrypt(card.fullNumber);
    if (card.cvv && !isEncrypted(card.cvv)) update.cvv = encrypt(card.cvv);
    if (card.link && !isEncrypted(card.link)) update.link = encrypt(card.link);
    if (Object.keys(update).length) {
      await prisma.giftCard.update({ where: { id: card.id }, data: update });
      console.log(`encrypted card ${card.id}`);
    }
  }

  // Vouchers
  const vouchers = await prisma.voucher.findMany();
  for (const v of vouchers) {
    const update: Record<string, string> = {};
    if (v.code && !isEncrypted(v.code)) update.code = encrypt(v.code);
    if (v.link && !isEncrypted(v.link)) update.link = encrypt(v.link);
    if (Object.keys(update).length) {
      await prisma.voucher.update({ where: { id: v.id }, data: update });
      console.log(`encrypted voucher ${v.id}`);
    }
  }

  console.log("done");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run with:

```bash
npx tsx scripts/migrate-encrypt.ts
```

Safe to re-run — `isEncrypted` skips already-encrypted rows.

---

### 5. Environment Variables

`.env.example`:

```
ENCRYPTION_KEY=replace_with_64_hex_chars_from_crypto_randomBytes_32
```

Generate your key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Decrypt CLI Script

A local utility to verify any encrypted value from the DB — no DB connection required. Copy the ciphertext from a DB row, pass it as an argument, get the plaintext back in your terminal.

**File:** `scripts/decrypt.ts`

```ts
import { decrypt } from "../lib/encrypt";

const cipher = process.argv[2];

if (!cipher) {
  console.error("Usage: npx tsx scripts/decrypt.ts <encrypted_value>");
  console.error(
    'Example: npx tsx scripts/decrypt.ts "a1b2c3...:d4e5f6...:7890ab..."',
  );
  process.exit(1);
}

try {
  console.log(decrypt(cipher));
} catch {
  console.error("Decryption failed — wrong key or corrupted value");
  process.exit(1);
}
```

Usage (requires `ENCRYPTION_KEY` in your shell or `.env.local`):

```bash
# inline key
ENCRYPTION_KEY=your64hexkey npx tsx scripts/decrypt.ts "a1b2c3:d4e5f6:7890ab"

# or if dotenv is loaded via tsx
npx tsx --env-file=.env.local scripts/decrypt.ts "<value copied from DB>"
```

cd "c:\Dev\CloudeProjects\MyGiftCardsVault"
npx tsx --env-file=.env.local scripts/decrypt.ts "<value copied from DB>"

npx tsx --env-file=.env.local scripts/decrypt.ts "bcecbf7e7a97497a65379d25:09c67a5e9ec3c33d70fbc4efb483c1cb:5a374ab785b1bd0612824638abe63d28"

Prints the raw plaintext to stdout — pipe to `pbcopy` / `clip` if you don't want it visible in the terminal:

```bash
npx tsx --env-file=.env.local scripts/decrypt.ts "a1b2c3:..." | clip   # Windows
npx tsx --env-file=.env.local scripts/decrypt.ts "a1b2c3:..." | pbcopy # macOS
```

---

## Local Test Script

After implementing `lib/encrypt.ts`, run this to verify encrypt → decrypt round-trip and DB round-trip locally.

**File:** `scripts/test-encrypt.ts`

```ts
import { encrypt, decrypt, isEncrypted } from "../lib/encrypt";
import { PrismaClient } from "@prisma/client";

// ── Unit: round-trip ──────────────────────────────────────────────────────────
const samples = [
  "4111111111111114",
  "ABC123-XYZ",
  "https://example.com/redeem?token=secret&user=me",
  "123", // short CVV
  "", // empty — should not be encrypted
];

console.log("\n── Round-trip test ──────────────────────────────────────────");
let allPassed = true;
for (const plain of samples) {
  if (!plain) continue;
  const cipher = encrypt(plain);
  const recovered = decrypt(cipher);
  const ok = recovered === plain;
  console.log(
    `${ok ? "✅" : "❌"}  "${plain}" → "${cipher.slice(0, 30)}..." → "${recovered}"`,
  );
  if (!ok) allPassed = false;
}

// ── Unit: two encryptions of same value differ ────────────────────────────────
console.log("\n── Uniqueness test (same input → different ciphertext) ──────");
const a = encrypt("same-value");
const b = encrypt("same-value");
const unique = a !== b;
console.log(`${unique ? "✅" : "❌"}  Two encryptions differ: ${unique}`);
if (!unique) allPassed = false;

// ── Unit: isEncrypted ─────────────────────────────────────────────────────────
console.log("\n── isEncrypted test ─────────────────────────────────────────");
console.log(
  `${isEncrypted(encrypt("hello")) ? "✅" : "❌"}  encrypted string detected`,
);
console.log(
  `${!isEncrypted("4111111111111114") ? "✅" : "❌"}  plain card number not detected`,
);
console.log(
  `${!isEncrypted("ABC-DEF") ? "✅" : "❌"}  plain voucher code not detected`,
);

// ── DB round-trip (optional, needs DB connection) ─────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--db")) {
  console.log(
    "\n── DB round-trip test ───────────────────────────────────────",
  );
  const prisma = new PrismaClient();
  try {
    const testCode = "TEST-" + Date.now();
    const v = await prisma.voucher.create({
      data: {
        name: "__encrypt-test__",
        provider: "test",
        seq: 0,
        familyId: process.env.TEST_FAMILY_ID!,
        code: encrypt(testCode),
      },
    });
    const fetched = await prisma.voucher.findUniqueOrThrow({
      where: { id: v.id },
    });
    const recovered = fetched.code ? decrypt(fetched.code) : null;
    const ok = recovered === testCode;
    console.log(
      `${ok ? "✅" : "❌"}  DB round-trip: stored cipher, recovered "${recovered}"`,
    );
    await prisma.voucher.delete({ where: { id: v.id } });
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`\n${allPassed ? "✅ All tests passed" : "❌ Some tests FAILED"}`);
```

Run without DB:

```bash
npx tsx scripts/test-encrypt.ts
```

Run with DB round-trip (needs `TEST_FAMILY_ID` in `.env.local`):

```bash
npx tsx scripts/test-encrypt.ts --db
```

---

## Rollback

If something goes wrong before migration, the `isEncrypted` guard in the page means old plain-text rows still render correctly. To fully roll back: remove the `encrypt()` calls from actions and remove the `decrypt()` calls from pages.

---

## Sequence Diagram

```
createCard(formData)
  └─ encrypt(fullNumber) ──► DB stores: "iv:tag:cipher"

cards/page.tsx (RSC)
  └─ prisma.giftCard.findMany()
  └─ decrypt(fullNumber) ──► CardWithBalance { fullNumber: "4111..." }
  └─ <GiftCardsClient cards={...} />  ← plain values only
```
