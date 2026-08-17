# iOS Add to Home Screen Guidance — HLD

**Status: implemented, with two adjustments from the design below.** Companion to [pwa-install-android-hld.md](./pwa-install-android-hld.md) — reuses that HLD's DB shape, which shipped as `UserLoginStat.os` / `pwaInstalled` rather than the `pwaInstalledAt` / `pwaInstallPlatform` pair originally sketched here (see that doc's status note). Read that doc first for the shared schema.

(1) The instructional UI in §2 below shipped as a **Settings-page disclosure** (a button that expands the Share → Add to Home Screen steps inline, next to the Android install button), not an app-wide dismissible banner — both platforms' install affordance now live in one place. (2) §3's `InstallStandaloneTracker` component was folded into the existing `VisitTracker.tsx` (already mounted app-wide) rather than shipped as a separate component — same "detect standalone, POST once per session" logic, one fewer always-on component.

## Overview

iOS Safari has no equivalent of `beforeinstallprompt` or `appinstalled` — there is no programmatic way to trigger an install prompt, detect that the user tapped through one, or know the moment installation happened. Everything is a manual, undiscoverable-unless-told-about gesture: Share icon → **Add to Home Screen**. This HLD is about (a) telling users that gesture exists, since nothing in Safari's UI hints at it, and (b) approximating install tracking after the fact, since there's no event to hook.

**Scope decision — instructional UI, not a "prompt."** Unlike Android, there is nothing to programmatically invoke. The only lever available is showing the user *how* to do it themselves — a banner or small modal explaining the two-tap sequence, shown only to iOS Safari visitors who aren't already running standalone.

**Scope decision — detect install indirectly, on a later visit.** Since there's no `appinstalled` signal, "installed" can only be inferred by noticing the app is running in standalone display mode at all — which is only true *after* the user has already added it and reopened it from the home screen. The DB write happens then, not at the moment of the Share-sheet action (which the page never sees).

---

## 1. Detecting iOS + detecting standalone

```ts
// lib/platform.ts
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone()
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // navigator.standalone is Safari-specific and the longest-standing reliable signal on iOS;
  // display-mode:standalone is the standard cross-browser one — check both.
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}
```

Notes:
- `isIOS()` excludes standalone sessions on purpose — once installed, there's nothing left to instruct.
- No reliable way to distinguish "Safari" from "Chrome-on-iOS" from user agent alone in all cases, but it doesn't matter here: every iOS browser is a WebKit wrapper under Apple's rules, and **only Safari's own Share sheet** produces a true standalone-mode install — other iOS browsers' "add to home screen" (where they even offer one) just creates a bookmark shortcut that reopens inside that browser, not a standalone app. The instructions below are only correct for Safari; showing them inside e.g. Chrome-iOS would misdirect the user (no Share-sheet "Add to Home Screen" that behaves the same way is guaranteed to exist there). Given that caveat, and that reliably detecting "specifically Safari, not another iOS browser" from UA alone is fragile, the pragmatic choice is to only show this banner when `isIOS()` is true **and** accept that a small slice of non-Safari iOS users see instructions that don't quite apply to their browser — same tradeoff every other "add to home screen" guide on the web makes.

## 2. UI — dismissible instructional banner

A small banner (not a full modal — lower friction, easy to ignore), shown once per session, with a "don't show again" that persists like every other client-only preference in this app:

```ts
// hooks/useIosInstallBannerStore.ts
'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Store = { dismissed: boolean; dismiss: () => void }

export const useIosInstallBannerStore = create<Store>()(
  persist((set) => ({ dismissed: false, dismiss: () => set({ dismissed: true }) }), {
    name: 'gcv-ios-install-dismissed',
  })
)
```

```tsx
// components/IosInstallBanner.tsx
'use client'
import { useEffect, useState } from 'react'
import { isIOS, isStandalone } from '../lib/platform'
import { useIosInstallBannerStore } from '../hooks/useIosInstallBannerStore'

export default function IosInstallBanner() {
  const [show, setShow] = useState(false)
  const dismissed = useIosInstallBannerStore((s) => s.dismissed)
  const dismiss = useIosInstallBannerStore((s) => s.dismiss)

  useEffect(() => {
    setShow(isIOS() && !dismissed)
  }, [dismissed])

  if (!show) return null

  return (
    <div className="ios-install-banner ...">
      {/* Share icon + "Add to Home Screen" copy, matching this component's own i18n keys */}
      <button onClick={dismiss}>{t.close}</button>
    </div>
  )
}
```

Placement: alongside `VisitTracker`/`InstallStandaloneTracker` (§3) in `app/layout.tsx`, so it's available app-wide rather than gated to Settings — unlike the Android install button, this is meant to be noticed on a normal visit, not hunted down in a settings menu, since there's no browser-native affordance nudging the user at all.

*(Open question — not blocking: banner copy/visual design, and whether it should reappear after some cooldown even if dismissed, vs. permanently dismissed once. Recommend permanent dismissal for v1 — simplest, matches the "don't be naggy" bar every other one-time UI in this app already sets.)*

## 3. Confirming install after the fact

Reuses `pwaInstalledAt`/`pwaInstallPlatform` on `UserLoginStat` (defined in the Android HLD) and the same `/api/track-install` route — this component just calls it with `platform: 'ios'` when it detects standalone mode, mirroring `VisitTracker.tsx`'s existing "once per session" guard:

```tsx
// components/InstallStandaloneTracker.tsx
'use client'
import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { isStandalone } from '../lib/platform'

export default function InstallStandaloneTracker() {
  const { isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn || !isStandalone()) return
    if (sessionStorage.getItem('install-tracked')) return

    fetch('/api/track-install', {
      method: 'POST',
      body: JSON.stringify({ platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android' }),
    }).then(() => sessionStorage.setItem('install-tracked', '1'))
  }, [isSignedIn])

  return null
}
```

This single component actually covers **both** platforms' "confirm on next visit" path — Android's `appinstalled` listener (§1 of the Android HLD) still fires immediately at install time and is the more precise signal there, but this component is a useful fallback even on Android (e.g. a user who installed via Chrome's own UI in a session where the app's `appinstalled` listener wasn't mounted yet, or before this feature existed at all). Could replace `VisitTracker` entirely (one tracker doing both jobs) or stay a sibling — implementation detail, not a design fork.

---

## Implementation order

1. `lib/platform.ts` — `isIOS()` / `isStandalone()`.
2. `hooks/useIosInstallBannerStore.ts`.
3. `components/IosInstallBanner.tsx` + i18n keys (en/he) for the instructional copy.
4. `components/InstallStandaloneTracker.tsx` (depends on `/api/track-install` from the Android HLD already existing — build that first if doing both HLDs together).
5. Mount both in `app/layout.tsx`.
6. Manual verification: on an actual iPhone (Simulator or device — this cannot be verified via Chrome DevTools' device emulation, which doesn't emulate `navigator.standalone`), confirm the banner shows in Safari, confirm it's gone after Add to Home Screen + reopening from the home screen icon, confirm `UserLoginStat.pwaInstalledAt` gets set on that reopen.

## Out of scope (this HLD)

- Any way to detect the Share-sheet action itself, or a dismiss/decline signal — genuinely not observable from the page on iOS.
- Distinguishing Safari from other iOS browsers precisely (see §1's caveat).
- Push notifications — iOS supports these for installed PWAs only since iOS 16.4, with its own separate permission flow; not covered here.
