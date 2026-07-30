'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const MAX_RECENT = 6

type RecentSearchesState = {
  recent: string[] // most-recent-first, de-duped case-insensitively
  addRecent: (query: string) => void
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      recent: [],
      addRecent: (query) => {
        const trimmed = query.trim()
        if (!trimmed) return
        const withoutDupe = get().recent.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())
        set({ recent: [trimmed, ...withoutDupe].slice(0, MAX_RECENT) })
      },
    }),
    { name: 'gcv-recent-searches' }
  )
)
