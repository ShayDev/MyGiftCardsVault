'use client'

import { useEffect } from 'react'
import { create } from 'zustand'
import { getFamilyAttribution } from '../app/actions'

export type FamilyAttribution = { names: Record<string, string>; showAddedBy: boolean }

type FamilyAttributionStore = {
  data: FamilyAttribution | null
  setData: (data: FamilyAttribution) => void
}

// Plain in-memory store (no persist middleware) — resets on a full page reload,
// so the underlying fetch happens at most once per browser session, not once ever.
const useFamilyAttributionStore = create<FamilyAttributionStore>((set) => ({
  data: null,
  setData: (data) => set({ data }),
}))

const EMPTY: FamilyAttribution = { names: {}, showAddedBy: false }

export function useFamilyAttribution(): FamilyAttribution {
  const { data, setData } = useFamilyAttributionStore()

  useEffect(() => {
    if (data === null) {
      getFamilyAttribution().then(setData)
    }
  }, [data, setData])

  return data ?? EMPTY
}
