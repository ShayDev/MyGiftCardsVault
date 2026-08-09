'use client'

import { useEffect, useState } from 'react'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT, localeDir } from '../lib/i18n'
import { isInAppBrowser } from '../lib/inAppBrowser'

const DISMISSED_KEY = 'gcv-in-app-browser-dismissed'

export default function InAppBrowserWarning() {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY)) return
    if (isInAppBrowser(navigator.userAgent)) setVisible(true)
  }, [])

  if (!visible) return null

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setVisible(false)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      // Clipboard access can be denied inside some in-app browsers; the link is still visible below.
    }
  }

  return (
    <div
      className="in-app-browser-banner w-full max-w-sm mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
      dir={dir}
    >
      <div className="in-app-browser-banner-header flex items-start justify-between gap-2">
        <p className="in-app-browser-banner-title font-semibold text-sm">{t.inAppBrowserTitle}</p>
        <button
          onClick={dismiss}
          aria-label={t.close}
          className="in-app-browser-banner-dismiss shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-amber-400 hover:text-amber-700"
        >
          ✕
        </button>
      </div>
      <p className="in-app-browser-banner-body text-sm mt-1">{t.inAppBrowserBody}</p>
      <button
        onClick={copyLink}
        className="in-app-browser-banner-copy w-full min-h-[44px] mt-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl px-4 text-sm transition-colors"
      >
        {copied ? t.inAppBrowserLinkCopied : t.inAppBrowserCopyLink}
      </button>
    </div>
  )
}
