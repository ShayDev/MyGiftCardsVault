'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { getNavBadgeCounts, type NavBadgeCounts } from '../app/actions'

type NavBadgeCountsStore = {
  data: NavBadgeCounts | null
  setData: (data: NavBadgeCounts) => void
  adjust: (key: keyof NavBadgeCounts, delta: number) => void
}

// Plain in-memory store (no persist middleware) — resets on a full page reload,
// so the underlying fetch happens at most once per browser session, not once ever.
const useNavBadgeCountsStore = create<NavBadgeCountsStore>((set, get) => ({
  data: null,
  setData: (data) => set({ data }),
  adjust: (key, delta) => {
    const current = get().data
    if (!current) return
    set({ data: { ...current, [key]: Math.max(0, current[key] + delta) } })
  },
}))

const EMPTY: NavBadgeCounts = { cards: 0, vouchers: 0, clubs: 0, refunds: 0 }

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
