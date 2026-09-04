# Admin Menu — High-Level Design

**Status:** Open questions at the end feed [admin-menu-dd.md](./admin-menu-dd.md). Phased on purpose — Phase 1 is a superadmin-only, **read-only** usage dashboard; later phases add app-wide settings and a family-scoped view for family owners.

## Goal

A dedicated `/admin` area for the app operator to **see how the app is being used** — adoption and feature-usage graphs plus a families table, across *all* families (not one family's data).

This is an internal console, not a user-facing feature. The audience for Phase 1 is one person.

Changing app-wide settings from here (starting with the Scan AI engine) is **deferred** — see "Deferred: app-wide settings" below.

---

## Access model

### Phase 1 — superadmin only

A hardcoded allowlist (`lib/superadmin.ts`), checked against the signed-in user's `User.email`. Just the operator for now. No schema change, no `User.role` change (`role` stays `owner` / `member` for the existing family-ownership feature — superadmin is orthogonal to it).

The user confirmed: *"only me is the super admin, a hardcoded list is secured enough."* A hardcoded list is genuinely fine here — there's no self-service admin onboarding to build, and Phase 1 is read-only aggregate stats, nothing destructive.

### Later — family owners (family-scoped)

Eventually `role === 'owner'` unlocks a **cut-down** `/admin` showing *only that owner's family's* data (the same panels, `familyId`-filtered) and **none** of the app-wide settings. Out of scope for Phase 1 — noted here so the Phase 1 data layer takes an optional `familyId` filter from day one rather than being rewritten later.

---

## Navigation / entry point

**Not** a 6th `BottomNav` tab — the bottom bar is already at 5 and crowds below ~380px (see [warranty-dd.md](./warranty-dd.md) §6).

Phase 1 entry: a **superadmin-only link on the Settings page** (`/settings` is already a server component that loads the `User` row, so the `isSuperadmin` check costs nothing there). Direct navigation to `/admin` also works and is gated server-side regardless.

A header link (via a fetch-once client store, same shape as `useNavBadgeCountsStore`) is a later nicety, not Phase 1.

---

## What the dashboard shows

Two hard constraints shape Phase 1:

1. **Multi-currency.** Families are USD *or* ILS (per-family `currency` setting). App-wide "total balance" would sum across currencies meaninglessly. Phase 1 **avoids money aggregates**; real financial dashboards arrive later when they're family-scoped and single-currency.
2. **`UserLoginStat` keeps only totals + `lastLoginAt` / `lastVisitAt`, no history.** So engagement is a *current snapshot*, never a time series — unless we start recording history (not in Phase 1).

### Full panel set (the target — user wants all of these eventually)

| # | Panel | Source | Phase |
|---|---|---|---|
| 1 | Growth over time — new families + new users per month | `FamilyGroup.createdAt`, `User.createdAt` | later |
| 2 | Records created over time — monthly, stacked by entity type | `createdAt` on each entity table | **1** |
| 3 | Content totals (now) — active counts per entity type | count per table, "active" per NavBadge definitions | **1** |
| 4 | Engagement snapshot — active in 7/30d, PWA-install rate, OS split | `UserLoginStat` | later |
| 5 | Scan health — success rate + p50/p95 latency by engine | **new `ExtractLog` table** | **undecided** |

### Tables

| Table | Columns | Phase |
|---|---|---|
| Families | name, members, #cards/#vouchers/#refunds/#clubs/#warranties, created, last activity | **1** |
| Users | email, family, role, logins, visits, last visit, OS, PWA | later |
| Recent extracts | time, engine, entity, modality, ok, ms | with panel 5 |

### Phase 1 scope (locked)

- **Panel 2** (records created over time)
- **Panel 3** (content totals now)
- **Families table**

That's it — read-only, no mutations, no schema change. Panel 5 / `ExtractLog` is a separate deferred decision; the page layout leaves a slot for it.

---

## Deferred: app-wide settings (incl. the Scan AI engine)

Not in Phase 1. Captured here so the eventual implementation doesn't re-derive it.

The Scan engine picker **used to** live on the Settings page as a per-family preference (`FamilySettings.aiEngine`). It was removed in commit `2fd2323` ("manage ai engines") because the LLM engine is **shared infrastructure** (one family member flipping it changed extraction for *every* family) and a single JSON blob couldn't express "different engine per input modality". It moved to `AI_ENGINE_TEXT` / `AI_ENGINE_IMAGE` env vars — which fixed "any user can change it" but made switching engines a Vercel env edit + redeploy, exactly the wrong friction mid-outage.

When this is picked up, the admin menu is where that control returns — gated to the operator, persisted in a **new `AppSetting` key-value DB table** (not Edge Config / Clerk metadata / a committed file — those are either extra moving parts or not runtime-writable). Resolution order at extract time: **DB row → env var → `'groq'`**, read **once per warm instance** (`unstable_cache`, no TTL) and re-read only when the admin toggle fires `revalidateTag('app-settings')` — never per `/api/extract` request. `lib/extractEngines.ts` stays DB-free (it's imported by `scripts/diagnose-extract.ts`); a new `lib/appSettings.ts` owns the resolution.

The same `AppSetting` table would later absorb the hardcoded flags `ENABLE_NAV_BADGES` / `ENABLE_ADDED_BY_ATTRIBUTION`.

---

## Charts

**Hand-rolled inline SVG** — a small `BarChart` / `StackedBarChart` / `StatTile` set under `components/admin/`. No charting dependency. Rationale: Phase 1 is ~2 simple charts + a tile grid for an audience of one, on a mobile-first PWA where bundle weight matters and the "no unnecessary abstractions" rule applies. Revisit (Recharts) only if a later family-facing panel wants real interactivity.

---

## i18n

**The admin UI is English-only — no i18n keys.** It's an operator console for one bilingual person, and every string added to `lib/i18n.ts` is paid for twice (en + he) forever. Same spirit as the "brand name stays English" rule. Easily reversible if the family-owner tier later makes it user-facing.

---

## Security notes

- `/admin` page **and** any future admin server action independently call `requireSuperadmin()` — never trust the page gate alone.
- The dashboard reads across all families. It exposes **family names, member counts, entity counts, emails, and coarse activity timestamps** — no card numbers, codes, balances, or any encrypted field. Keep it that way: aggregate counts and names only.

---

## Open Questions — for the DD

1. **Panel 5 / `ExtractLog`** — in or out? It means writing one row per `/api/extract` call (engine, entityType, modality, ok, ms, createdAt — no image, no extracted content). The user is deferring this. DD assumes **out**, page leaves a slot.
2. **Superadmin identity — email vs. clerkId in the allowlist.** Email is readable and already on the `User` row; clerkId is stable across email changes. DD proposes **email**, with the list in `lib/superadmin.ts` (optionally overridable by a `SUPERADMIN_EMAILS` env var).
3. **"Active" definition for the Families table counts** — reuse NavBadge's per-entity "active" rules (cards need a balance query), or just `isActive`-only for speed? DD proposes reusing NavBadge rules for panel 3, but `isActive`-only for the Families *table* to avoid an app-wide balance computation per row.
4. **Records-over-time window** — all-time by month, or last 12 months? DD proposes **last 12 months**, monthly buckets.
