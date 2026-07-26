# AI Image Extraction (Gift Cards, Vouchers, Refunds) — HLD

**Status:** High-level design only. Options are laid out below for a decision before writing the detailed design (data model, exact prompts/schemas, component structure).

## Goal

Let a user snap/upload a photo (gift card, voucher screenshot, refund receipt/confirmation) and have an LLM read it and pre-fill the Add form, instead of typing everything by hand. The user always reviews the pre-filled form and hits Save themselves — extraction never auto-submits.

---

## Constraint that shapes everything: this must run on a free tier

The app has no paid infrastructure budget. Every LLM call has to land on a provider's free tier, which means the design has to tolerate: low rate limits, possible model deprecation/rotation, and "free" sometimes meaning "your data may be used for training" (worth checking each provider's current terms before committing — noted per option below, but terms change and should be re-verified at implementation time).

---

## LLM Provider Options

| Option | Vision support | Free tier shape | Structured JSON output | Pros | Cons |
|---|---|---|---|---|---|
| **Google Gemini API** (2.0/2.5 Flash) | Yes, strong | Generous — free tier exists for these models (rate-limited per-minute/per-day; exact numbers change, verify at implementation time) | Yes — native `responseSchema` / JSON mode | Best accuracy-for-free-cost tradeoff for receipt/card-style structured reading; well-documented; widely used for exactly this OCR+extraction use case | Requires a Google AI Studio API key; rate limits mean a busy family could hit caps; free-tier terms can change |
| **Groq API** (Llama 4 Scout/Maverick vision, or similar hosted open models) | Yes, on vision-capable hosted models | Free tier with per-minute/per-day rate limits | Partial — JSON mode support varies by model, needs more prompt-level enforcement | Very fast inference; genuinely free tier, no trial-credit expiry; good fallback/second option | Vision model selection on Groq changes over time; extraction accuracy less proven for this specific use case than Gemini; smaller free-tier request caps historically |
| **OpenRouter free models** (`:free` tagged, e.g. some Gemini/Llama variants) | Depends on model selected | Free, but rate-limited per-model and models rotate in/out | Depends on underlying model | One integration, easy to swap models later without changing the calling code | Free models are the least stable option — availability, quality, and rate limits change without much notice; not something to build a "must work reliably" feature on alone |
| **Hugging Face Inference API** (free tier, e.g. Qwen2-VL, other open VLMs) | Varies by model | Free rate-limited tier, cold starts common | Weak — usually needs manual JSON parsing/repair from free-text output | Wide model choice, no vendor lock-in | Cold-start latency hurts UX (user waiting on a modal); weakest structured-output story of the options here — most engineering effort for the worst reliability |
| **Client/server OCR only** (Tesseract.js) + regex/heuristic parsing | N/A — text extraction, not semantic understanding | Free forever, no API key, no rate limit, no network dependency | No — hand-rolled parsing per field | Zero cost ever, fully private (nothing leaves the server/device), no quota anxiety | Not an LLM — brittle against varied receipt/card layouts; "extract the amount" is easy, "figure out which of 3 numbers on this receipt is the total" is not; significant ongoing maintenance as new provider formats show up |

### Recommendation

**Google Gemini (Flash tier) as the primary extractor, with a manual-entry fallback that's always available (not a secondary LLM).** Reasoning: its free tier is the most generous and best-documented of the hosted-LLM options for this specific "read a photo, return structured JSON" task, and native JSON-schema output means less prompt-engineering fragility than Groq/OpenRouter/HF. Tesseract-only was considered as the "zero risk" option but rejected as primary — it would mean building and maintaining bespoke parsing logic per provider/receipt format, which is more ongoing work than calling an LLM, for a worse result.

This is a recommendation, not a decision — see the open question at the end.

---

## Scope

All three entity types, one shared extraction pipeline (same upload UI, same API route, different output schema + different "which fields get shown to pre-fill" per entity):

| Entity | Source image | Fields to extract |
|---|---|---|
| Gift Card | Photo of the physical card (front, and back if it has a code) | `provider` (name printed on card, matched against `ProviderCombobox` list where possible), `last4`, `expiresAt` (full date) |
| Voucher | Screenshot or photo of a voucher/promo code | `provider`, `code`, `value` (amount, if printed), `expiresAt` (full date) |
| Refund | Photo/screenshot of a receipt or refund confirmation | `provider`, `amount`, `currency`, `referenceId`, `expiresAt` (if a store-credit expiry is shown) |

**Deliberately excluded from extraction: `fullNumber` and `cvv`.** See the security section below — this is the one place where "AI can read it" and "AI should read it" diverge.

---

## Security & Privacy — the part that needs a decision before DD

This app already treats `fullNumber`/`cvv`/`code`/`link` as sensitive enough to encrypt at rest (`lib/encrypt.ts`). Sending a photo of a gift card to a third-party LLM API is a bigger exposure than that: the *image itself* — potentially showing the full card number and CVV together, which is the exact combination needed to spend the card — leaves the app and goes to Google/Groq/whoever's servers.

Two sub-decisions:

1. **Do we extract `last4` only, or the full card number, from the image?**
   Recommendation: **`last4` only.** The form still lets the user type the full number and CVV manually afterward if they want it stored (existing optional fields) — the LLM call just doesn't need to see or return them. This avoids ever sending a CVV in an API payload.

2. **What happens to the uploaded image after extraction?**
   Unlike Refunds (which already deliberately keeps `imageUrl` as a permanent, visible receipt attached to the record), a gift-card photo showing a full number is not something this app should retain — there's no `GiftCard.imageUrl` field today and this design shouldn't add one for cards. Recommendation: the image is uploaded to a short-lived location (or held in memory in the API route and never written to Blob storage at all), passed to the LLM, and discarded immediately after the extraction response comes back. Refunds can keep its existing "attach the receipt permanently" behavior unchanged, since that's a lower-sensitivity image and users already rely on being able to view it later.

These two calls shape the DD (whether the upload route needs Blob storage at all for cards/vouchers, vs. just streaming the file to the LLM call and dropping it).

---

## High-Level Architecture

```
User taps "Scan" in Add Card / Add Voucher / Add Refund modal
        │
        ▼
Client picks/captures an image (existing <input type="file"> pattern, like Refunds' image upload)
        │
        ▼
POST to a new server route, e.g. /api/extract  (image + entity type)
        │  (server-side — API key never reaches the client)
        ▼
Server calls the chosen LLM's vision API with:
  - the image
  - a prompt + JSON schema specific to the entity type (from the Scope table above)
        │
        ▼
LLM returns structured JSON (or the route falls back to "extraction failed" on error/timeout/rate-limit)
        │
        ▼
Client receives the parsed fields, pre-fills the Add form's inputs (including ProviderCombobox,
matched case-insensitively against the existing provider list where possible)
        │
        ▼
User reviews/edits every field like normal, hits Save — nothing is ever auto-submitted
```

Failure handling is not an edge case here — free-tier rate limits mean "the extraction call fails" needs to be a normal, well-handled path, not an exception. On any failure (timeout, rate limit, malformed response, low-confidence parse) the form simply opens empty, exactly like today — extraction is additive, never a blocker to manually adding a card/voucher/refund.

---

## Open Questions (need answers before DD)

1. **Which LLM provider to commit to** — Gemini (recommended), Groq, OpenRouter, or start with Tesseract-only and add an LLM later?
2. **Confirm the `last4`-only / no-persisted-image approach for cards** (Security section above) — or is showing/storing the full card photo actually wanted despite the exposure?
3. **Voucher/Refund images** — do these get a permanent `imageUrl` (like Refunds already has) or are they also discard-after-extraction? Refunds already has `imageUrl` and existing UI for it — should extraction reuse that same "attach the image" flow, or should extraction be usable *without* choosing to permanently attach the photo?
4. **Where's the "Scan" entry point** — a button inside the existing Add modal (opens camera/file picker, then fills the same form), or a separate first-class "Scan a card" flow before the Add modal even opens?
