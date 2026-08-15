'use client'

import { useEffect } from 'react'
import { isStandalone } from '../lib/platform'
import { useInstallPromptStore, type BeforeInstallPromptEvent } from '../hooks/useInstallPromptStore'

// Mounted once, app-wide (app/layout.tsx), not scoped to the Settings page — the
// `beforeinstallprompt` event fires at most once per tab lifetime and can fire before
// the user ever opens Settings, so a Settings-scoped listener would miss it (and fail
// to suppress Chrome's own install UI, which requires calling preventDefault()
// synchronously in the handler). SettingsClient just reads the resulting state back
// out of useInstallPromptStore.
export default function InstallPromptListener() {
  const setPrompt = useInstallPromptStore((s) => s.setPrompt)
  const markInstalled = useInstallPromptStore((s) => s.markInstalled)

  useEffect(() => {
    if (isStandalone()) {
      markInstalled()
      return
    }
    const onBeforeInstall = (e: Event) => {
      e.preventDefault() // suppress Chrome's own mini-infobar; the Settings button drives this instead
      setPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      markInstalled()
      fetch('/api/track-install', { method: 'POST' })
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [setPrompt, markInstalled])

  return null
}
