# Dark Mode Setting — HLD

## Overview

Let a user switch the app between Light, Dark, and System appearance. This is the **big-scope** setting of the two — the toggle mechanism itself is small, but the app currently has **zero dark-mode styling anywhere**: `app/globals.css` is just `@import "tailwindcss";`, Tailwind is v4 (no config file), and every one of the 16 component/page files that render UI hardcodes light-only classes (`bg-white`, `text-slate-900`, `border-slate-200`, `bg-slate-50`, …). There is no shared design-system layer (no shadcn/ui atoms in `/components` yet, despite the project structure doc mentioning them) — every screen is raw Tailwind, so retrofitting is a mechanical, file-by-file pass, not a one-place fix.

**Scope decision — per-device, not per-family.** Appearance is a personal UI preference, not shared data — mirrors exactly how the language toggle already works (`hooks/useLanguageStore.ts`: Zustand + `persist` → `localStorage`, applied via a small client `<LanguageProvider>` that sets attributes on `<html>`). Two family members should be able to have different themes on their own devices without affecting each other or the data they see.

**Scope decision — three states, not a plain toggle.** `light | dark | system`, defaulting to `system` — the now-standard pattern (OS, most apps) and cheap to support once the mechanism exists. A plain on/off toggle would be simpler to build but a worse default UX and doesn't meaningfully reduce the real cost here, which is the styling retrofit, not the switch logic.

**Out of scope:** scheduled/time-based theme switching, per-page overrides, retrofitting every last visual (e.g. rarely-seen error states) in the first pass — see Implementation order for what ships first vs. follows.

---

## 1. Enabling class-based dark mode in Tailwind v4

Tailwind v4 defaults to `prefers-color-scheme`-only dark mode (no manual override possible) unless a custom variant opts into class-based switching. Add to `app/globals.css`:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

This makes every `dark:` utility used anywhere in the app key off a `.dark` class on an ancestor (`<html>`), which the theme store controls — independent of the OS setting when the user picks an explicit Light/Dark, but still able to follow the OS when they pick System (see §3).

---

## 2. `hooks/useThemeStore.ts` (new — mirrors `useLanguageStore.ts`)

```ts
'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

type ThemeStore = {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'gcv-theme' }
  )
)
```

## 3. `components/ThemeProvider.tsx` (new — mirrors `LanguageProvider.tsx`)

```tsx
'use client'
import { useEffect } from 'react'
import { useThemeStore } from '../hooks/useThemeStore'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const apply = (dark: boolean) => root.classList.toggle('dark', dark)

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      const onChange = (e: MediaQueryListEvent) => apply(e.matches)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    apply(theme === 'dark')
  }, [theme])

  return <>{children}</>
}
```

Mounted in `app/layout.tsx` alongside `<LanguageProvider>`.

### The one real wrinkle: flash of wrong theme (FOUC)

`LanguageProvider`'s `useEffect` already has this same gap (a flash of `lang="en" dir="ltr"` before the persisted locale hydrates) and the codebase has accepted it there. Dark mode is more visually jarring if it flashes light-then-dark, so it's worth the extra ~10 lines: a tiny **blocking inline script** in `app/layout.tsx`'s `<head>`, before any stylesheet paints, reading `localStorage['gcv-theme']` directly and setting the class synchronously:

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html: `
    try {
      var t = JSON.parse(localStorage.getItem('gcv-theme') || '{}').state?.theme || 'system';
      var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    } catch (e) {}
  `}} />
  {/* ...existing meta/link tags... */}
</head>
```

*(Alternative considered: the `next-themes` package solves exactly this — blocking script, system-preference listener, SSR-safe — as a maintained dependency instead of ~30 lines of hand-rolled code. Given the codebase's existing preference for a small homegrown Zustand store over a library for the identical language case, and "no unnecessary abstractions," this HLD defaults to the homegrown version above for consistency. Flag if you'd rather pull in `next-themes` — it's a reasonable call either way.)*

---

## 4. Color token mapping (the actual retrofit)

Rather than picking `dark:` shades ad hoc per component, fix one mapping table up front and apply it uniformly — keeps the "Finance aesthetic" (Slate/Gray + Emerald recharge + Rose spent) consistent instead of every file inventing its own dark palette.

Dark surfaces use the `neutral` family, not `slate` — `slate` carries a blue tint that read as "washed out" once applied; `neutral` is a true gray and reads noticeably darker/cleaner at the same Tailwind step.

| Light (existing) | Dark (`dark:`) | Used for |
|---|---|---|
| `bg-white` | `dark:bg-neutral-900` | Cards, modals, header |
| `bg-slate-50` | `dark:bg-neutral-950` | Page background |
| `bg-slate-100` | `dark:bg-neutral-800` | Subtle fills, hover rows |
| `text-slate-900` | `dark:text-neutral-50` | Primary text |
| `text-slate-700` | `dark:text-neutral-200` | Secondary text |
| `text-slate-500` / `text-slate-400` | `dark:text-slate-400` | Muted text — mid grays already read acceptably on both backgrounds, verify per-instance rather than blanket-change |
| `border-slate-200` | `dark:border-neutral-700` | Card/section borders |
| `bg-emerald-50` / `text-emerald-700` (Recharge) | `dark:bg-emerald-950` / `dark:text-emerald-400` | Recharge accents |
| `bg-rose-50` / `text-rose-700` (Spent) | `dark:bg-rose-950` / `dark:text-rose-400` | Spent accents |
| `bg-emerald-600` (buttons) | `dark:bg-emerald-500` | Primary CTAs — kept vivid enough against dark backgrounds |

Every `className` string that references one of the left-hand tokens gains its right-hand `dark:` sibling. Existing `hover:`/`focus:` variants keep their own dark counterparts where contrast would otherwise break (e.g. `hover:bg-slate-50` → add `dark:hover:bg-slate-800`).

---

## 5. Retrofit surface — file-by-file

No shared atoms exist, so this is mechanical and per-file. Ordered by how much of the app each screen covers:

1. `app/layout.tsx` — root `<body>`, header shell (affects every page).
2. `components/BottomNav.tsx`, `components/HeaderNav.tsx`, `components/GlobalSearchHeader.tsx` — persistent chrome, seen on every screen.
3. `app/settings/SettingsClient.tsx` — smallest surface, also where the new theme picker itself lives; good first full-page proof point.
4. `components/GiftCardsClient.tsx` — largest file (~1400 lines: stat tiles, table, mobile list, add/spend/recharge/detail modals).
5. `components/VouchersClient.tsx`, `components/RefundsClient.tsx`, `components/ClubsClient.tsx` — same modal/list/detail shapes as Cards, similar effort each.
6. `components/ProviderCombobox.tsx`, `components/ScanButton.tsx`, `components/ExpiryDaysBadge.tsx`, `components/Spinner.tsx`, `components/HighlightMatch.tsx` — small shared pieces, quick pass once the token table above is settled.
7. `app/onboarding/*`, `app/sign-in/*` — pre-auth screens, lower priority (first-run only).

`meta[name=theme-color]` in `app/layout.tsx` (`#0f172a`) is already a dark slate — fine as the PWA chrome color in both themes, no change needed there.

---

## 6. Settings UI

**`SettingsClient.tsx`** — new section (client-only, no server action, since this is `localStorage`-backed, not a DB write):

```tsx
'use client'
import { useThemeStore, type ThemeMode } from '../../hooks/useThemeStore'

const theme = useThemeStore((s) => s.theme)
const setTheme = useThemeStore((s) => s.setTheme)

<div className="settings-appearance-section bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
  <h2 className="...">{t.settingsAppearance}</h2>
  <div className="theme-picker flex gap-2">
    {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
      <button
        key={mode}
        onClick={() => setTheme(mode)}
        className={`flex-1 min-h-[44px] rounded-xl border ... ${theme === mode ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}
      >
        {t[`theme${mode[0].toUpperCase()}${mode.slice(1)}` as const] /* themeLight / themeDark / themeSystem */}
      </button>
    ))}
  </div>
</div>
```

No `pending`/error state needed — it's an instant, local, reversible client toggle, unlike the DB-backed family settings elsewhere on the page.

### i18n — new keys (`lib/i18n.ts`, en + he)

| key | en | he |
|---|---|---|
| `settingsAppearance` | Appearance | מראה |
| `themeLight` | Light | בהיר |
| `themeDark` | Dark | כהה |
| `themeSystem` | System | לפי המערכת |

---

## Implementation order

1. `app/globals.css` — `@custom-variant dark`.
2. `hooks/useThemeStore.ts`, `components/ThemeProvider.tsx`, blocking inline script in `app/layout.tsx`; mount provider alongside `LanguageProvider`.
3. Lock the color-token table (§4) — treat it as the single source of truth for every subsequent file.
4. Settings UI + i18n keys — theme picker is usable (even before every screen is retrofitted, since unstyled dark mode just means some screens stay visually light until their pass lands — not broken, just incomplete).
5. Retrofit pass, file-by-file per §5's order, `tsc --noEmit` + a manual look at each screen in both themes after every file (no automated visual regression tooling in this repo today).
6. Manual check across the three modes: System follows OS live (toggle OS theme with the app open, in the `system` state, confirm it updates without reload); Light/Dark stay fixed regardless of OS; reload confirms no flash and the persisted choice survives; RTL (Hebrew) + Dark combined looks correct on at least one full screen (Cards).

---

## Open questions for you

1. Confirm per-device (Zustand/localStorage) over family-wide — this HLD assumes per-device since it's a personal display preference, not shared ledger data (opposite of the currency setting's reasoning).
2. Is a full-app retrofit the goal for v1, or would you rather ship the toggle + a partial retrofit (e.g. just Cards + Settings) first and extend screen-by-screen after? Given the size of §5, doing it incrementally behind the already-working toggle is a reasonable way to ship value sooner.
