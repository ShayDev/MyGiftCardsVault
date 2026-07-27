# AI Image Extraction (Gift Cards, Vouchers, Refunds) — Detailed Design

**Status:** Ready to implement. Builds on [ai-image-extract-hld.md](./ai-image-extract-hld.md); the four open questions there are now decided (see below).

## Decisions locked (supersedes the HLD's "Open Questions")

| Question | Decision |
|---|---|
| LLM provider | **Google Gemini Flash**, called via a plain `fetch()` to the REST `generateContent` endpoint. No new SDK dependency. Uses the `gemini-flash-latest` model alias (not a dated model name like `gemini-2.5-flash`, which was found deprecated for new API keys during testing) — Google keeps this alias pointed at their current recommended flash model, avoiding the "re-verify model name" maintenance burden the original HLD flagged. |
| Card image handling | **`fullNumber` and `cvv` are extracted** (revised — see note below); the photo itself is still **never persisted**. No `GiftCard.imageUrl` column. |
| Voucher/Refund image handling | **Revised — Refund only.** Refund keeps its existing `imageUrl` flow unchanged. Voucher does **not** get an `imageUrl` column — a scanned voucher photo is discarded after extraction, same as Cards. |
| Scan entry point | **A "Scan" button inside the existing Add modal** for each of Cards/Vouchers/Refunds — not a separate flow. |
| Text-paste extraction (added post-implementation) | **All three entities** get a "Paste text" mode alongside "Photo", via a toggle in the same Scan control — not a separate always-visible field. |

**Revision note on card extraction:** the HLD recommended `last4`-only specifically to avoid the app's own code path returning/auto-filling the full number + CVV together. That recommendation has been overridden — `fullNumber` and `cvv` are both extracted and pre-filled now. Worth stating plainly: the photo sent to Gemini already shows whatever the card physically displays, so this change doesn't alter what leaves the app in the image — it only changes whether the app *also* auto-fills those two fields from the response instead of requiring the user to type them. The mitigation that remains: the image itself is still never persisted (see below), so there's no permanent stored artifact of the full number+CVV pair beyond the encrypted text fields the user already reviews and saves today.

---

## 1. Data model change

**None.** `GiftCard`, `ClubMember`, `Voucher`, and `Refund` schemas are all unchanged. Refund already has `imageUrl`; Voucher does not gain one — a scanned voucher photo is used only to prefill the form, then discarded, same as Cards.

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
- `entityType`: `"CARD" | "VOUCHER" | "REFUND"`
- either `file` (the image) **or** `text` (pasted text) — exactly one is required; the route 400s if neither/both are meaningfully present

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
      provider:   { type: 'string' },
      fullNumber: { type: 'string', description: 'digits only, no spaces/dashes' },
      cvv:        { type: 'string', description: '3 or 4 digits, from the back of the card if shown' },
      expiresAt:  { type: 'string', description: 'YYYY-MM-DD, or omit if not visible' },
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

`callGemini` posts to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=...` with `inlineData` (base64 image + mime type) and `generationConfig.responseSchema` set to the matching schema above, `responseMimeType: 'application/json'`. Prompt text is a single instruction per entity type, e.g. for CARD: *"Read this gift card photo (front and back if both are shown). Return the provider/brand name as printed, the full card number, the CVV if visible on the back, and the expiration date if visible."* Set a request timeout (e.g. `AbortSignal.timeout(15_000)`) so a hung call can't leave the Add modal stuck — surfaces as the same generic `{ error }` response.

**Deriving `last4`:** the `GiftCard` create schema requires `last4 || link` (see `CreateCardSchema`'s `.refine` in `app/actions.ts`). Rather than asking Gemini for a redundant `last4` field, the client derives it once `fullNumber` comes back: `fullNumber.slice(-4)`, and pre-fills the `last4` input from that — satisfying the existing validation without a schema change or a second extracted field.

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

- **`AddCardModal`** (`components/GiftCardsClient.tsx`): `entityType="CARD"`, uses the standalone `<ScanButton>` component, prefills `name` (falling back to the extracted `provider` if the model doesn't find a distinct product name/title), `provider`, `fullNumber`, `cvv`, `expiresAt`, `defaultBalance` (from the card's printed denomination, extracted as `value`), and a client-derived `last4` (see §3). The photo itself is discarded after the `/api/extract` call returns — no Blob upload happens for cards, ever.
- **`AddVoucherModal`** (`components/VouchersClient.tsx`): same as Cards — standalone `<ScanButton entityType="VOUCHER">`, prefills `name` (same provider-fallback rule as Cards), `provider`, `code`, `value`, `expiresAt`. No image field exists on this modal at all; the photo is never persisted.
- **`AddRefundModal`** (`components/RefundsClient.tsx`): `entityType="REFUND"`, prefills `provider`, `amount`, `currency`, `referenceId`, `expiresAt`. This is the one modal where the Scan trigger and the existing permanent-image dropzone share one `<input type="file">` — selecting a photo both shows the preview (as today) *and* immediately fires the `/api/extract` call, using the exported `extractImage()` helper from `ScanButton.tsx` directly rather than the `<ScanButton>` component (which owns its own file input). The image is only ever persisted to Blob storage at Save time via the existing `/api/upload` call in `handleSubmit` — extraction itself never uploads or stores anything, matching the HLD's "extraction never auto-submits, never persists by itself" principle.

Edit modals are **not** touched — scanning is an add-time convenience only, consistent with the HLD scope.

---

## 6. Text-paste extraction

Added after initial implementation: alongside "Photo", each Scan control gets a "Paste text" mode for pasting an email/SMS/confirmation instead of photographing something. Same `/api/extract` route, same per-entity `SCHEMAS` — only the prompt and the request payload differ (a `text` string instead of `file` + `inlineData`). Server-side, `TEXT_PROMPTS` (parallel to `IMAGE_PROMPTS`) gives Gemini instructions appropriate to reading pasted text rather than a photo.

Client-side, `components/ScanButton.tsx` exports two additional pieces reused across all three modals:
- `extractText(text, entityType)` — the text-mode counterpart to `extractImage()`.
- `TextExtractArea` — a standalone textarea + extract button + its own loading/error state, used two ways:
  - Inside the default `<ScanButton>` export (Cards, Vouchers) as the `mode === 'text'` branch of a photo/text toggle built into that component.
  - Directly by `AddRefundModal`, which doesn't use `<ScanButton>` at all (its photo path is tied to the existing permanent-upload dropzone) — it renders its own matching photo/text toggle and swaps between the existing dropzone and `<TextExtractArea entityType="REFUND" .../>`, sharing the same `applyExtractedFields()` field-assignment function for both paths.

No persistence implications: pasted text is never stored anywhere (there was never an "image" to discard or keep — it just doesn't exist as an artifact after the extraction response comes back), so this doesn't reopen the Card/Voucher "never persisted" or Refund `imageUrl` decisions above.

---

## 7. i18n additions

New keys in `lib/i18n.ts` (both `en`/`he`): `scanButton` ("Scan" / "סרוק"), `scanning` ("Scanning…" / "סורק..."), `scanFailed` ("Couldn't read image — enter manually" / "לא ניתן לקרוא את התמונה - הזן ידנית"), `scanModePhoto` ("Photo" / "תמונה"), `scanModeText` ("Paste text" / "הדבק טקסט"), `scanTextPlaceholder`, `scanTextButton` ("Extract" / "חלץ").

---

## 8. Explicitly out of scope for this DD

- Retry/backoff queueing for rate-limited Gemini calls — a failure just shows `scanFailed` and the user re-taps Scan or types manually.
- Any provider fallback (Groq/OpenRouter/Tesseract) — single-provider for v1, per the locked decision.
- Editing/re-scanning an existing card/voucher/refund (Edit modals unchanged).
- Confidence scoring or partial-field warnings — the model either returns a field or omits it; omitted fields simply leave that input blank for the user to fill.

---

## Verification

1. `tsc --noEmit` / `npm run build` pass with no schema changes needed.
2. Manually test each entity's Scan button in both Photo and Paste-text modes: confirm fields pre-fill correctly (including `fullNumber`/`cvv` for cards, now extracted rather than left empty), and Save persists correctly — including the Refund image landing in Blob storage only after Save, not before, and confirming no Voucher photo is ever uploaded anywhere.
3. Test the failure path by temporarily using an invalid `GEMINI_API_KEY` — confirm the modal shows `scanFailed` and remains fully usable for manual entry.
4. Confirm a mid-scan modal close/cancel never leaves an orphaned Blob upload for Refund (it can't, per the design — upload only happens in `handleSubmit`).
