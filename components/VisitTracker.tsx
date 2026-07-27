'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'

export default function VisitTracker() {
  const { isSignedIn } = useAuth()

  useEffect(() => {
    if (!isSignedIn) return
    if (sessionStorage.getItem('visit-counted')) return

    fetch('/api/track-visit', { method: 'POST' }).then(() => {
      sessionStorage.setItem('visit-counted', '1')
    })
  }, [isSignedIn])

  return null
}
