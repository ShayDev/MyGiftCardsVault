# AI Image Extraction (Gift Cards, Vouchers, Refunds) — Detailed Design

**Status:** Ready to implement. Builds on [ai-image-extract-hld.md](./ai-image-extract-hld.md); the four open questions there are now decided (see below).

## Decisions locked (supersedes the HLD's "Open Questions")

| Question | Decision |
|---|---|
| LLM provider | **Google Gemini Flash** (`gemini-2.5-flash` at implementation time — re-verify current free-tier model name), called via a plain `fetch()` to the REST `generateContent` endpoint. No new SDK dependency. |
| Card image handling | **`last4` only, never persisted.** No `GiftCard.imageUrl` column. |
| Voucher/Refund image handling | **Reuse the existing `imageUrl` flow** (same as Refund today). Voucher gains an `imageUrl` column, encrypted at rest, exactly like Refund's. |
| Scan entry point | **A "Scan" button inside the existing Add modal** for each of Cards/Vouchers/Refunds — not a separate flow. |

---

## 1. Data model change

Only one schema change: `Voucher` gains the `imageUrl` column Refund already has.

```prisma
model Voucher {
  ...
  imageUrl    String?     // encrypted at rest, same pattern as Refund.imageUrl
  ...
}
```

Migration (hand-written, matching this repo's convention):
```sql
ALTER TABLE "Voucher" ADD COLUMN "imageUrl" TEXT;
```

Follow-on changes mirroring how `Refund.imageUrl`/`code`/`link` are already handled:
- `app/vouchers/actions.ts`: add `imageUrl: z.string().optional()` to `CreateVoucherSchema` (shared by create+update); encrypt on write (`data.imageUrl ? encrypt(data.imageUrl) : null`).
- `app/vouchers/page.tsx`: add `imageUrl: dec(v.imageUrl ?? null)` to the payload mapping (the `dec()` helper already exists there for `code`/`link`).
- `VoucherItem` type (`app/vouchers/actions.ts`): add `imageUrl?: string`.
- `components/VouchersClient.tsx`: add the same image-upload `<Field>` block (preview, hidden file input, remove button) and detail-view `<img>` block that `RefundsClient.tsx` already has (lines ~213-236 for the form, ~630-638 for the detail view) — copy verbatim, swap `refund`→`voucher` and the i18n key (reuse `t.refundImageOptional`/`t.refundImageHint`, or add `voucherImageOptional`/`voucherImageHint` if distinct copy is wanted).

No change to `GiftCard`, `ClubMember`, or `Refund` schemas.

---

## 2. New environment variable

`GEMINI_API_KEY` — server-only, never exposed to the client.

Add to `.env.example`:
```
# Google Gemini API — get from https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_api_key
```

You'll need to add it to `.env.local` for local dev, and separately to Vercel's project env vars (then `vercel env pull .env.production.local --environment=production`) for it to reach production — same manual step as any other secret in this project.

---

## 3. API route: `POST /api/extract`

New file: `app/api/extract/route.ts`, modeled directly on the existing `app/api/upload/route.ts` (same auth check, same `req.formData()` pattern) but it **never touches Blob storage** — the image bytes live only in the function's memory for the duration of the request.

**Request:** `multipart/form-data`
- `file`: the image
- `entityType`: `"CARD" | "VOUCHER" | "REFUND"`

**Response (success):** `{ fields: Record<string, string | number> }` — shape depends on `entityType`, see schemas below.

**Response (failure):** `{ error: string }` with a non-200 status. The route catches everything (Gemini timeout, rate limit, malformed JSON, missing file) and always returns this same shape — the client never needs to distinguish failure reasons, per the HLD's "failure is a normal path" principle.

```ts
// app/api/extract/route.ts (shape, not full implementation)
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const SCHEMAS = {
  CARD: {
    type: 'object',
    properties: {
      provider: { type: 'string' },
      last4:    { type: 'string' },
      expiresAt: { type: 'string', description: 'YYYY-MM-DD, or omit if not visible' },
    },
  },
  VOUCHER: {
    type: 'object',
    properties: {
      provider:  { type: 'string' },
      code:      { type: 'string' },
      value:     { type: 'number' },
      expiresAt: { type: 'string', description: 'YYYY-MM-DD, or omit if not visible' },
    },
  },
  REFUND: {
    type: 'object',
    properties: {
      provider:    { type: 'string' },
      amount:      { type: 'number' },
      currency:    { type: 'string', description: '3-letter ISO code' },
      referenceId: { type: 'string' },
      expiresAt:   { type: 'string', description: 'YYYY-MM-DD, or omit if not visible' },
    },
  },
} as const

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const entityType = form.get('entityType') as keyof typeof SCHEMAS | null
  if (!file || !entityType || !SCHEMAS[entityType]) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer()).toString('base64')
    const fields = await callGemini(bytes, file.type, entityType)
    return NextResponse.json({ fields })
  } catch {
    // Timeout, rate limit, malformed JSON, low-confidence parse — all collapse to one message.
    return NextResponse.json({ error: 'Extraction failed' }, { status: 502 })
  }
}
```

`callGemini` posts to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=...` with `inlineData` (base64 image + mime type) and `generationConfig.responseSchema` set to the matching schema above, `responseMimeType: 'application/json'`. Prompt text is a single instruction per entity type, e.g. for CARD: *"Read this gift card photo. Return the provider/brand name as printed, the last 4 digits only (never the full number), and the expiration date if visible."* Set a request timeout (e.g. `AbortSignal.timeout(15_000)`) so a hung call can't leave the Add modal stuck — surfaces as the same generic `{ error }` response.

**Why `expiresAt` as `YYYY-MM-DD`:** that's exactly the value format `<input type="date">` expects, so the client can drop it straight into the field with zero parsing — consistent with how `expiresAt` already flows through the rest of the app (see the recent MMYY→DateTime migration).

**Provider matching happens client-side, not here:** the route returns the raw string the model read off the image (e.g. `"AMAZON.COM"`). The client already has `providerOptions` loaded for the Add modal; matching/normalizing against that list reuses `ProviderCombobox`'s existing case-insensitive matching, not new server logic.

---

## 4. Shared client component: `ScanButton`

New file: `components/ScanButton.tsx`, used inside all three Add modals (`GiftCardsClient`, `VouchersClient`, `RefundsClient`). Extracting this once avoids tripling near-identical upload/loading/error logic across three files.

```tsx
'use client'
type ExtractedFields = Record<string, string | number>

export default function ScanButton({
  entityType,
  onExtracted,
}: {
  entityType: 'CARD' | 'VOUCHER' | 'REFUND'
  onExtracted: (fields: ExtractedFields) => void
}) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    setIsScanning(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('entityType', entityType)
      const res = await fetch('/api/extract', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onExtracted(data.fields)
    } catch {
      setError(t.scanFailed) // generic — form just stays as-is, user fills manually
    } finally {
      setIsScanning(false)
    }
  }
  // renders a button + hidden file input (camera-capable: accept="image/*" capture="environment"),
  // spinner while isScanning, inline error text on failure — no modal, no auto-submit.
}
```

### Wiring `onExtracted` into an uncontrolled form (the one non-obvious part)

Every Add modal in this codebase (`AddCardModal`, `AddVoucherModal`, `AddRefundModal`) uses **uncontrolled inputs** — fields are read via `new FormData(e.currentTarget)` on submit, not React state. That's fine for user typing, but an uncontrolled `<input defaultValue={x}>` does **not** update its displayed value if `x` changes after the input has already mounted — so simply storing extraction results in state and passing them as `defaultValue` won't visually pre-fill anything.

The minimal fix, consistent with the existing architecture (no need to convert every field to controlled state): give the `<form>` a `key` that changes when extraction completes, forcing a full remount with the new `defaultValue`s.

```tsx
const [prefill, setPrefill] = useState<ExtractedFields>({})
const [formKey, setFormKey] = useState(0)

function handleExtracted(fields: ExtractedFields) {
  setPrefill(fields)
  setFormKey((k) => k + 1)
}

<form key={formKey} onSubmit={handleSubmit} ...>
  <ScanButton entityType="CARD" onExtracted={handleExtracted} />
  ...
  <input name="last4" defaultValue={prefill.last4 ?? ''} ... />
  <input name="expiresAt" type="date" defaultValue={prefill.expiresAt ?? ''} ... />
  <ProviderCombobox name="provider" defaultValue={prefill.provider ?? ''} ... />
```

`ProviderCombobox` already initializes its internal `query` state from `defaultValue` via `useState(defaultValue ?? '')` — remounting it via the parent `key` picks up the new `defaultValue` for free, no change needed inside that component.

One consequence worth accepting: if the user had already typed into other fields before hitting Scan, the remount clears them (uncontrolled inputs reset on remount). Given extraction is meant to happen right when the modal opens — before manual typing — this is an acceptable trade-off rather than something to engineer around.

---

## 5. Modal changes (per entity)

Add a `ScanButton` as the first field in each Add modal, wired to that entity's `prefill`/`formKey` state:

- **`AddCardModal`** (`components/GiftCardsClient.tsx`): `entityType="CARD"`, prefills `provider`, `last4`, `expiresAt`. Note `fullNumber`/`cvv` are never touched by extraction (per the HLD's security decision) — those inputs are untouched by `prefill`.
- **`AddVoucherModal`** (`components/VouchersClient.tsx`): `entityType="VOUCHER"`, prefills `provider`, `code`, `value`, `expiresAt`. The image used for extraction is the *same* `imageFile` already selected for the (new) permanent upload — see below.
- **`AddRefundModal`** (`components/RefundsClient.tsx`): `entityType="REFUND"`, prefills `provider`, `amount`, `currency`, `referenceId`, `expiresAt`. Same image-reuse point applies.

**Image reuse for Voucher/Refund:** picking a file for Scan can be the *same* file already wired to the existing `imageFile`/`imagePreview` state (the upload dropzone already in `AddRefundModal`, and the new one being added to `AddVoucherModal`). Practically: the Scan button and the image dropzone can share one `<input type="file">` — selecting a photo both shows the preview (as today) *and* immediately fires the `/api/extract` call. The image is only ever persisted to Blob storage at Save time via the existing `/api/upload` call in `handleSubmit` — extraction itself never uploads or stores anything, matching the HLD's "extraction never auto-submits, never persists by itself" principle.

Edit modals are **not** touched — scanning is an add-time convenience only, consistent with the HLD scope.

---

## 6. i18n additions

New keys in `lib/i18n.ts` (both `en`/`he`): `scanButton` ("Scan" / "סרוק"), `scanning` ("Scanning…" / "סורק..."), `scanFailed` ("Couldn't read image — enter manually" / "לא ניתן לקרוא את התמונה - הזן ידנית").

---

## 7. Explicitly out of scope for this DD

- Retry/backoff queueing for rate-limited Gemini calls — a failure just shows `scanFailed` and the user re-taps Scan or types manually.
- Any provider fallback (Groq/OpenRouter/Tesseract) — single-provider for v1, per the locked decision.
- Editing/re-scanning an existing card/voucher/refund (Edit modals unchanged).
- Confidence scoring or partial-field warnings — the model either returns a field or omits it; omitted fields simply leave that input blank for the user to fill.

---

## Verification

1. `npx prisma migrate dev`/hand-written migration + `npx prisma generate` for the new `Voucher.imageUrl` column; confirm `tsc --noEmit` passes.
2. Manually test each entity's Scan button with a real photo: confirm fields pre-fill correctly, `fullNumber`/`cvv` stay empty for cards, and Save persists correctly (including the Voucher/Refund image landing in Blob storage only after Save, not before).
3. Test the failure path by temporarily using an invalid `GEMINI_API_KEY` — confirm the modal shows `scanFailed` and remains fully usable for manual entry.
4. Confirm a mid-scan modal close/cancel never leaves an orphaned Blob upload (it can't, per the design — upload only happens in `handleSubmit`).
