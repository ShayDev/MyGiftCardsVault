# Warranty Support — HLD

**Status:** Superseded by [warranty-dd.md](./warranty-dd.md) — the open questions below are decided there.

## Overview

A new section for tracking product warranties (electronics, appliances, furniture…) — what was bought, where it was bought, who to actually contact to claim the warranty (often a different company than the seller), when, for how long it's covered, and proof of purchase. Unlike Vouchers/Refunds there's no manual "used" toggle: a warranty's status (Active vs Expired) is derived purely from its expiry date, same spirit as the Ledger Rule already governing `GiftCard` balances — don't store a flag for something that's computable.

**The purchase-vs-claim split, which shaped the data model:** you might buy a product from Store A but the actual warranty is honored by Manufacturer B's service center — a plain single `provider` field (the pattern every other entity in this app uses) can't represent that. This is the one place Warranty's data model diverges structurally from Cards/Vouchers/Clubs/Refunds.

---

## Open Questions — resolved, see [warranty-dd.md](./warranty-dd.md)

1. **Where does it live in the nav?** → **Resolved:** 5th bottom-nav tab at every width, labels dropped to icon-only under ~380px viewport width.
2. **How is expiry captured?** → **Resolved:** capture `purchaseDate` + `durationMonths`, auto-compute `expiresAt`, directly overridable.
3. **Does Scan (AI image-extract) cover Warranty too?** → **Resolved:** yes, new `entityType` on the existing `/api/extract` route — extracts the purchase-location company only (see point 5), not the claim company, since a receipt doesn't print who services the warranty.
4. **Receipt/proof of purchase — image, link, or both?** → **Resolved:** both, matching Refund's `imageUrl` + `link` pattern.
5. **How is "who to claim the warranty with" represented, given it's often a different company than the seller?** → **Resolved:** a new dedicated `WarrantyProvider` table (name, phone, url) — a company directory shared by *both* roles on a `Warranty`: `purchasedFrom` (required — where it was bought) and `warrantyCompany` (optional — who to claim with, defaults to "same as purchased from" when left unset). Not the existing generic `Provider` table (which has no phone/url and is shaped for the other four entities' simpler "just a name" case) and not two separate tables — one directory backs both fields, since the same company is frequently both the seller and the warranty contact.
6. **Is `WarrantyProvider` a shared directory or per-family only?** → **Resolved:** shared, same `familyId` default-`'0'`-sentinel pattern as the existing `Provider` table — global seed rows (common manufacturers/retailers) plus each family's own custom entries.
7. **Some chains have multiple physical branches (e.g. "IKEA — Rishon LeZion" vs "IKEA — Netanya") — does that need its own structure?** → **Resolved:** no new structure. A single optional `branch` free-text field on `Warranty` itself, paired with `purchasedFrom` — typed fresh per warranty, no reuse/autocomplete, no relation to `WarrantyProvider`. The company directory (`WarrantyProvider`) stays branch-agnostic; the specific branch is just context for that one purchase.

---

## Data Model (shape, see DD for exact schema/migration)

Two new Prisma models:

- **`WarrantyProvider`** — a reusable company directory: `id`, `familyId` (default `'0'` = shared/global), `name`, `phone`, `url`, `createdBy`, `createdAt`. Not tied to the generic `Provider` table's `type` enum — this is its own small table because it carries fields (`phone`, `url`) none of the other four entity types need.
- **`Warranty`** — same skeleton as `Refund`/`ClubMember` for the common fields (`id`, `seq`, `familyId`, `productName`, `purchaseDate`, `durationMonths`, `expiresAt`, `referenceId`, `notes`, `link` [encrypted], `imageUrl`, `isActive`, `createdBy`, `createdAt`), plus two FKs into `WarrantyProvider`: `purchasedFromId` (required) and `warrantyCompanyId` (nullable), an optional free-text `branch` (physical location of `purchasedFrom`, e.g. "Rishon LeZion" — see point 7), and an optional `purchasePrice`/`currency` pair (added after initial implementation, at the user's request — same shape as `Refund.amount`/`Refund.currency`).

---

## High-Level Architecture

```
Add Warranty modal (Scan photo | Paste text | manual)
        │
        ▼
purchasedFrom (required, WarrantyProviderCombobox) — free text creates a new
WarrantyProvider row (name only; phone/url addable inline)
        │
warrantyCompany (optional, same combobox, same directory) — left blank means
"same as purchasedFrom" for display purposes
        │
purchaseDate + durationMonths → client computes expiresAt (editable)
        │
        ▼
createWarranty Server Action → resolve/create WarrantyProvider row(s) →
encrypt(link) → insert Warranty row
        │
        ▼
/warranties (Server Component) → decrypt(link) → WarrantiesClient
        │
        ▼
Two sections, computed not stored: Active (expiresAt in the future or null)
on top, Expired (expiresAt in the past) below. Detail view shows the
effective claim contact: warrantyCompany if set, else purchasedFrom.
```

---

## Touch Points in the Existing Codebase

- `prisma/schema.prisma` — new `WarrantyProvider` model, new `Warranty` model, both `WarrantyProvider[]`/`Warranty[]` relations on `FamilyGroup`
- `lib/encrypt.ts` — reused as-is, no changes
- `app/api/extract/route.ts` — new `WARRANTY` schema + prompt, extracting `purchasedFrom` only (not `warrantyCompany`)
- `app/api/upload/route.ts` — currently hardcodes the `refunds/` Blob folder; needs a `folder` param to also serve `warranties/`
- `app/actions.ts` — `NavBadgeCounts` gains a `warranties` category
- `components/BottomNav.tsx` — 5th tab + narrow-screen label collapse
- `lib/i18n.ts` — new `en`/`he` keys
- New: `components/WarrantyProviderCombobox.tsx` — a `ProviderCombobox` sibling, not a reuse of it, since it needs to surface/edit `phone`/`url`, not just a name

---

## Out of Scope (v1)

- Manual "claimed" tracking (marking a warranty as used to get a repair/replacement) — status is purely date-derived.
- Reminders/notifications before expiry (beyond the existing nav-badge amber/rose highlight).
- Attaching multiple receipt images to one warranty (one `imageUrl`, same limit as Refund).
- Editing a `WarrantyProvider`'s phone/url from anywhere other than "create it inline while adding a warranty" — no standalone company-directory management screen in v1.
