'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { detectOS, isStandalone } from '../lib/platform'

export default function VisitTracker() {
  const { isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn) return

    if (!sessionStorage.getItem('visit-counted')) {
      fetch('/api/track-visit', {
        method: 'POST',
        body: JSON.stringify({ os: detectOS() }),
      }).then(() => sessionStorage.setItem('visit-counted', '1'))
    }

    // Indirect install-confirmation path (mainly for iOS, which has no `appinstalled`
    // event — see plans/pwa-install-ios-hld.md §3): if the app is running standalone,
    // it was installed at some point, so report it once per session. Also a fallback
    // for an Android install that happened before InstallPromptListener existed/mounted.
    if (isStandalone() && !sessionStorage.getItem('install-tracked')) {
      fetch('/api/track-install', { method: 'POST' }).then(() => sessionStorage.setItem('install-tracked', '1'))
    }
  }, [isSignedIn])

  return null
}
