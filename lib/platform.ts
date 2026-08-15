// Client-only device/platform detection for the PWA install affordance in Settings.
// See plans/pwa-install-android-hld.md and plans/pwa-install-ios-hld.md for the full design.

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // navigator.standalone is Safari-specific and the longest-standing reliable signal on iOS;
  // display-mode:standalone is the standard cross-browser one — check both.
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  // Excludes standalone sessions on purpose — once installed, there's nothing left to instruct.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !isStandalone()
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/.test(navigator.userAgent)
}

export function detectOS(): 'android' | 'ios' | 'web' {
  if (isAndroid()) return 'android'
  // Standalone iOS sessions should still report as 'ios', so check the UA directly here
  // rather than isIOS() (which excludes standalone).
  if (typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)) return 'ios'
  return 'web'
}
