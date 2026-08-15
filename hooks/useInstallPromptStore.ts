'use client'

import { create } from 'zustand'

// Not persisted — the deferred prompt event can't survive a reload anyway, and
// `installed`/`canInstall` are re-derived fresh each session by InstallPromptListener.
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallPromptStore = {
  deferred: BeforeInstallPromptEvent | null
  installed: boolean
  setPrompt: (e: BeforeInstallPromptEvent | null) => void
  markInstalled: () => void
  promptInstall: () => Promise<void>
}

export const useInstallPromptStore = create<InstallPromptStore>()((set, get) => ({
  deferred: null,
  installed: false,
  setPrompt: (deferred) => set({ deferred }),
  markInstalled: () => set({ installed: true, deferred: null }),
  async promptInstall() {
    const { deferred } = get()
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice // resolves on accept/dismiss; the DB write is still gated on `appinstalled`
    set({ deferred: null })
  },
}))
