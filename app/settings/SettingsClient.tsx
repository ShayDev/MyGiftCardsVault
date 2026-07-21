'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguageStore } from '../../hooks/useLanguageStore'
import { getT, localeDir } from '../../lib/i18n'
import { UserButton } from '@clerk/nextjs'
import CopyButton from './CopyButton'
import Spinner from '../../components/Spinner'
import { switchFamily } from './actions'

type Props = {
  familyName: string
  inviteCode: string
  userName: string | null
  email: string
}

export default function SettingsClient({ familyName, inviteCode, userName, email }: Props) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]

  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSwitch(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await switchFamily(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-8 px-4" dir={dir}>
      <div className="mb-4">
        <Link href="/cards" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
          {t.back}
        </Link>
      </div>
      <h1 className="text-xl font-bold text-slate-900 mb-6">{t.settingsTitle}</h1>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsFamily}</h2>
        <div className="mb-4">
          <p className="text-xs text-slate-400 mb-1">{t.settingsFamilyName}</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 text-lg">{familyName}</p>
            <CopyButton text={familyName} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">{t.settingsInviteCode}</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 text-lg tracking-widest">{inviteCode}</p>
            <CopyButton text={inviteCode} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
          <p className="text-xs text-slate-400 mt-2">{t.settingsInviteHint}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        {!switching ? (
          <button
            onClick={() => setSwitching(true)}
            className="w-full min-h-[44px] bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-3 border border-slate-200 transition-colors"
          >
            {t.settingsSwitchFamilyButton}
          </button>
        ) : (
          <form action={handleSwitch} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.onboardingFamilyNameLabel}</label>
              <input
                name="familyName"
                type="text"
                required
                placeholder={t.onboardingFamilyNamePlaceholder}
                pattern="[A-Za-z0-9 '_-]+"
                onInput={(e) => {
                  const el = e.currentTarget
                  el.value = el.value.replace(/[^A-Za-z0-9 '_-]/g, '')
                }}
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
            <p className="text-xs text-slate-400">{t.settingsSwitchFamilyHint}</p>
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setSwitching(false)
                  setError(null)
                }}
                disabled={pending}
                className="flex-1 min-h-[44px] bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-medium rounded-xl px-4 py-3 border border-slate-200 transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl px-4 py-3 transition-colors"
              >
                {pending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.settingsSwitching}</span> : t.settingsSwitchButton}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsAccount}</h2>
        <div className="flex items-center gap-3">
          <UserButton />
          <div>
            <p className="text-sm font-medium text-slate-900">{userName ?? email}</p>
            <p className="text-xs text-slate-400">{email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
