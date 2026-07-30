'use client'

import { create } from 'zustand'

type SearchQueryState = {
  query: string
  setQuery: (query: string) => void
}

// Plain, not persist-backed — the active query is transient UI state, shared
// between GlobalSearchHeader (where it's typed) and each *Client.tsx (where
// it's filtered against). Deliberately not cleared on route change: staying
// filtered while navigating between tabs is the intended behavior.
export const useSearchQueryStore = create<SearchQueryState>((set) => ({
  query: '',
  setQuery: (query) => set({ query }),
}))
