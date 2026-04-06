'use client'

import { useState } from 'react'
import { useLanguageStore } from '../../hooks/useLanguageStore'
import { getT, localeDir } from '../../lib/i18n'
import { createFamily, joinFamily } from './actions'

type Mode = 'choose' | 'create' | 'join'

export default function OnboardingClient() {
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]

  async function handleSubmit(
    action: (fd: FormData) => Promise<{ error: string } | void>,
    formData: FormData
  ) {
    setPending(true)
    setError(null)
    const result = await action(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-8" dir={dir}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <span className="font-bold text-slate-900">
            {t.brandFirst}<span className="text-emerald-600">{t.brandSecond}</span>
          </span>
        </div>

        {mode === 'choose' && (
          <>
            <h1 className="text-xl font-bold text-slate-900 mb-1">{t.onboardingWelcome}</h1>
            <p className="text-slate-500 text-sm mb-6">{t.onboardingSubtitle}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode('create')}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl px-4 py-3 transition-colors"
              >
                {t.onboardingCreate}
              </button>
              <button
                onClick={() => setMode('join')}
                className="w-full min-h-[44px] bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-3 border border-slate-200 transition-colors"
              >
                {t.onboardingJoin}
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <button onClick={() => setMode('choose')} className="text-slate-400 hover:text-slate-600 text-sm mb-4">
              {t.onboardingBack}
            </button>
            <h1 className="text-xl font-bold text-slate-900 mb-1">{t.onboardingCreateTitle}</h1>
            <p className="text-slate-500 text-sm mb-6">{t.onboardingCreateSubtitle}</p>
            <form action={async (fd) => handleSubmit(createFamily, fd)} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t.onboardingFamilyNameLabel}{' '}
                  <span className="text-slate-400 font-normal">{t.onboardingFamilyNameHint}</span>
                </label>
                <input
                  name="familyName"
                  type="text"
                  required
                  placeholder={t.onboardingFamilyNamePlaceholder}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={pending}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl px-4 py-3 transition-colors"
              >
                {pending ? t.onboardingCreating : t.onboardingCreateButton}
              </button>
            </form>
          </>
        )}

        {mode === 'join' && (
          <>
            <button onClick={() => setMode('choose')} className="text-slate-400 hover:text-slate-600 text-sm mb-4">
              {t.onboardingBack}
            </button>
            <h1 className="text-xl font-bold text-slate-900 mb-1">{t.onboardingJoinTitle}</h1>
            <p className="text-slate-500 text-sm mb-6">{t.onboardingJoinSubtitle}</p>
            <form action={async (fd) => handleSubmit(joinFamily, fd)} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.onboardingFamilyNameLabel}</label>
                <input
                  name="familyName"
                  type="text"
                  required
                  placeholder={t.onboardingFamilyNamePlaceholder}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-xs text-slate-400 mt-1">{t.onboardingNameHint}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t.onboardingCodeLabel}</label>
                <input
                  name="inviteCode"
                  type="text"
                  required
                  placeholder={t.onboardingCodePlaceholder}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              {error && <p className="text-rose-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={pending}
                className="w-full min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl px-4 py-3 transition-colors"
              >
                {pending ? t.onboardingJoining : t.onboardingJoinButton}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
