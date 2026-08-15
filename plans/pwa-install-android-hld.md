# Android Install Prompt + Install Tracking — HLD

**Status: implemented, with two adjustments from the design below** — (1) the `beforeinstallprompt`/`appinstalled` listener is mounted globally (`components/InstallPromptListener.tsx` in `app/layout.tsx`, backed by `hooks/useInstallPromptStore.ts`), not scoped inside `SettingsClient`, since the event can fire before Settings is ever opened and `preventDefault()` must be called synchronously to suppress Chrome's own UI. (2) `UserLoginStat` ended up with simpler columns than §3 below: `os` (`'android' | 'ios' | 'web'`, refreshed on every visit via `/api/track-visit`) and `pwaInstalled` (`Boolean`, forward-only) — same rationale (per-user, forward-only, no uninstall detection), just leaner. See `SettingsClient.tsx`'s install card for the shipped UI.

## Overview

Add a custom "Install app" control for Android/Chrome that captures the browser's native install eligibility signal, plus persist to the DB when a user actually completes an install (not just when they're *eligible* to). Also scopes the **future service worker** this depends on — its minimal responsibilities, not a full implementation.

**Scope decision — custom button over relying on Chrome's own banner.** Chrome will show its own install UI (mini-infobar / ⋮ menu item) automatically once the page is installable, with zero app code. Building a custom button is still worth it here because: (a) it lets the prompt live somewhere predictable (Settings, next to the other device-level toggles — theme, currency), instead of depending on Chrome's own timing/heuristics for when to surface its infobar, and (b) it's the only way to know *whether the user installed*, which Chrome's own UI doesn't expose to the page at all.

**Scope decision — track "installed", not "eligible".** `beforeinstallprompt` firing only means the browser *could* show an install prompt — most users on Android already satisfy this on nearly every visit. It is not a signal that installation happened. The DB write only happens on the browser's `appinstalled` event, which fires exactly once, only after a real, completed install (via our button or Chrome's own UI).

---

## 1. Capturing the install prompt

```ts
// hooks/useInstallPrompt.ts
'use client'
import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Already running standalone (installed on this device) — nothing to offer.
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // suppress Chrome's own mini-infobar; we drive the UI instead
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
      fetch('/api/track-install', {
        method: 'POST',
        body: JSON.stringify({ platform: 'android' }),
      })
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice // resolves on accept/dismiss; DB write still gated on `appinstalled`
    setDeferred(null)
  }

  return { canInstall: !!deferred, installed, promptInstall }
}
```

Key points:
- `e.preventDefault()` on `beforeinstallprompt` stops Chrome's own infobar so there's exactly one install affordance, not two competing ones.
- The deferred event can only be prompted **once** — after `userChoice` resolves (whether accepted or dismissed), it's spent; a fresh `beforeinstallprompt` won't refire for a while if dismissed (Chrome enforces its own cooldown, roughly a few months — not something the app controls or can shorten).
- `installed` also flips true immediately if the page loads already in standalone mode (covers a user who installed via Chrome's own UI in a past session, or a returning visit from the installed app itself) — same `matchMedia('(display-mode: standalone)')` check the iOS HLD uses, so this logic is shared across platforms conceptually even though the *trigger* (`appinstalled` vs. next-visit detection) differs.

## 2. UI — Settings entry

Small addition to `SettingsClient.tsx`, same section style as the theme/currency controls, conditionally rendered:

```tsx
const { canInstall, installed, promptInstall } = useInstallPrompt()

{!installed && canInstall && (
  <button onClick={promptInstall} className="...">
    {t.settingsInstallApp}
  </button>
)}
```

Nothing renders once `installed` is true, and nothing renders if the browser hasn't fired `beforeinstallprompt` yet (iOS, non-Chrome browsers, or a Chrome session that hasn't met installability criteria — see §4). No error state needed; this is a progressive-enhancement affordance, not a required flow.

*(Open question — not blocking: Settings-only for v1, or also a dismissible first-visit banner? Recommend Settings-only first — lower risk of feeling naggy, matches how every other device preference already lives there.)*

## 3. DB — extending `UserLoginStat`

Reuses the existing per-user stats table (`UserLoginStat`, keyed by `clerkId` — see `app/api/track-visit/route.ts`) rather than a new table, and rather than touching the core `User` model:

```prisma
model UserLoginStat {
  clerkId             String    @id
  loginCount          Int       @default(1)
  visitCount          Int       @default(0)
  lastLoginAt         DateTime  @default(now())
  lastVisitAt         DateTime  @default(now())
  pwaInstalledAt      DateTime? // first confirmed install; null = never installed (as far as we know)
  pwaInstallPlatform  String?   // 'android' | 'ios' — whichever platform triggered the write
}
```

```sql
ALTER TABLE "UserLoginStat" ADD COLUMN IF NOT EXISTS "pwaInstalledAt" TIMESTAMP(3);
ALTER TABLE "UserLoginStat" ADD COLUMN IF NOT EXISTS "pwaInstallPlatform" TEXT;
```

**`app/api/track-install/route.ts`** (mirrors `track-visit`'s shape exactly):

```ts
import { auth } from '@clerk/nextjs/server'
import prisma from '../../../lib/prisma'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return new Response(null, { status: 401 })
  const { platform } = await req.json().catch(() => ({ platform: null }))

  await prisma.userLoginStat.upsert({
    where:  { clerkId: userId },
    create: { clerkId: userId, pwaInstalledAt: new Date(), pwaInstallPlatform: platform },
    update: { pwaInstalledAt: new Date(), pwaInstallPlatform: platform }, // last-write-wins if re-installed on a different device/platform
  })

  return new Response(null, { status: 200 })
}
```

`pwaInstalledAt` is overwritten (not "set once") on every confirmed install — a user reinstalling on a new phone updates it to the latest install, which is the more useful signal ("do they currently have it installed on *some* device") than "did they ever, historically, install it." No per-device tracking in this design — one row per user, matching `UserLoginStat`'s existing one-row-per-user shape.

**Known limitation:** there's no browser event for *un*installing a PWA. `pwaInstalledAt` can only ever move forward — if a user installs then later removes the app, the DB still shows them as installed. Acceptable for what this is likely used for (engagement/analytics signal), not fixable without server-side heuristics (e.g. inferring uninstall from a long gap in standalone-mode visits, out of scope here).

## 4. Service worker — future piece, responsibilities only

A service worker isn't required for the button/tracking above to work — `beforeinstallprompt` can fire on manifest criteria alone on current Chrome versions — but it's the difference between "technically installable" and Chrome's more proactive install promotion, and it's a prerequisite for any offline resilience. Scoping its responsibilities now so the install feature above doesn't need to be redesigned when it lands:

**In scope for a v1 service worker:**
- Register at `public/sw.js`, loaded via a small guarded script (`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`), called once from a client component in `app/layout.tsx`.
- A minimal `fetch` handler — enough to count as "has a service worker with a fetch handler" for installability, without materially changing request behavior for most requests (network-first passthrough).
- Cache **only the static app shell**: manifest, icons, and a small offline-fallback page. Deliberately **not** caching card/voucher/refund/club data or any API response — this is a shared-finance app; a stale cached balance is worse than a loading spinner or an honest "you're offline" message. Correctness over offline availability for anything money-shaped.
- Versioned cache name (e.g. `gcv-shell-v1`, bumped per deploy or tied to a build id); `activate` event deletes any previously-versioned caches so updates don't accumulate stale entries indefinitely.
- `self.skipWaiting()` + `clients.claim()` on activate, so a deployed update takes effect on next reload instead of requiring the user to fully close and reopen the installed app (which most users won't know to do).

**Explicitly out of scope for v1:**
- Push notifications (needs its own consent flow, VAPID keys, and a notification-sending path from the server — separate feature).
- Background sync / offline mutation queueing (spend/recharge while offline, replayed later) — meaningfully more complex and risky for a ledger; would need its own design pass on conflict handling.
- Full offline CRUD or aggressive precaching of app data.

This section exists so the Android install flow above and any later SW implementation share the same assumptions — the SW doesn't need to know about `useInstallPrompt`/`appinstalled` at all; they're independent, the SW just improves the *odds* `beforeinstallprompt` fires promptly and adds resilience once it exists.

---

## Implementation order

1. `hooks/useInstallPrompt.ts`.
2. `prisma/schema.prisma` — extend `UserLoginStat`; migration (dev, then prod, same convention as every other raw-SQL column addition in this repo).
3. `app/api/track-install/route.ts`.
4. Settings UI entry (`t.settingsInstallApp` + neighboring i18n keys, en/he).
5. Manual verification: Chrome DevTools → Application → Manifest tab shows "Installability" checks passing; trigger install via the button, confirm `appinstalled` fires and `UserLoginStat.pwaInstalledAt` gets written; reload and confirm the button disappears (standalone-mode detection).
6. Service worker (`public/sw.js`) — separate follow-up piece per §4, not required to ship 1–5.

## Out of scope (this HLD)

- The service worker's actual implementation (responsibilities only, per §4).
- Any admin/analytics surface for viewing install stats — this HLD only gets the data into the DB.
- Uninstall detection (see limitation in §3).
