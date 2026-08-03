'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { getNavBadgeCounts, type NavBadgeCounts, type NavBadgeCategory } from '../app/actions'

type NavBadgeCountsStore = {
  data: NavBadgeCounts | null
  setData: (data: NavBadgeCounts) => void
  adjust: (key: keyof NavBadgeCounts, delta: number) => void
}

// Plain in-memory store (no persist middleware) — resets on a full page reload,
// so the underlying fetch happens at most once per browser session, not once ever.
// `hasExpired`/`hasExpiringSoon` are deliberately left untouched by `adjust` — they're
// stale-until-reload by design: they can only change by the calendar passing an
// expiresAt date, never by a user action, so there's nothing to adjust locally.
const useNavBadgeCountsStore = create<NavBadgeCountsStore>((set, get) => ({
  data: null,
  setData: (data) => set({ data }),
  adjust: (key, delta) => {
    const current = get().data
    if (!current) return
    const category = current[key]
    set({ data: { ...current, [key]: { ...category, count: Math.max(0, category.count + delta) } } })
  },
}))

const EMPTY_CATEGORY: NavBadgeCategory = { count: 0, hasExpired: false, hasExpiringSoon: false }
const EMPTY: NavBadgeCounts = { cards: EMPTY_CATEGORY, vouchers: EMPTY_CATEGORY, clubs: EMPTY_CATEGORY, refunds: EMPTY_CATEGORY }

export function useNavBadgeCounts(): NavBadgeCounts {
  const { data, setData } = useNavBadgeCountsStore()

  useEffect(() => {
    if (data === null) {
      getNavBadgeCounts().then(setData)
    }
  }, [data, setData])

  return data ?? EMPTY
}

/** Imperative update for use inside action success handlers — skips silently if counts haven't loaded yet. */
export function adjustNavBadgeCount(key: keyof NavBadgeCounts, delta: number) {
  useNavBadgeCountsStore.getState().adjust(key, delta)
}
