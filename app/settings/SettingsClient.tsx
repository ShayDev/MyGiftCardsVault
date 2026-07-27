'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguageStore } from '../../hooks/useLanguageStore'
import { getT, localeDir } from '../../lib/i18n'
import { UserButton } from '@clerk/nextjs'
import CopyButton from './CopyButton'
import Spinner from '../../components/Spinner'
import { switchFamily, createNewFamily, switchToOwnFamily } from './actions'

type Props = {
  familyName: string
  inviteCode: string
  userName: string | null
  email: string
  ownedFamilyName: string | null
  ownsCurrentFamily: boolean
}

type Mode = 'closed' | 'choose' | 'join' | 'create'

const familyNameInputProps = {
  pattern: "[A-Za-z0-9 '_-]+",
  onInput: (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    el.value = el.value.replace(/[^A-Za-z0-9 '_-]/g, '')
  },
}

export default function SettingsClient({
  familyName,
  inviteCode,
  userName,
  email,
  ownedFamilyName,
  ownsCurrentFamily,
}: Props) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]

  const [mode, setMode] = useState<Mode>('closed')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [switchingBack, setSwitchingBack] = useState(false)

  function closeForm() {
    setMode('closed')
    setError(null)
  }

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

  async function handleSwitchBack() {
    setSwitchingBack(true)
    await switchToOwnFamily()
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

      {ownedFamilyName && !ownsCurrentFamily && (
        <button
          onClick={handleSwitchBack}
          disabled={switchingBack}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 mb-4 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 font-medium rounded-xl px-4 py-3 border border-emerald-200 transition-colors"
        >
          {switchingBack ? (
            <span className="flex items-center justify-center gap-2"><Spinner />{t.settingsSwitching}</span>
          ) : (
            t.settingsSwitchBackTo(ownedFamilyName)
          )}
        </button>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        {mode === 'closed' && (
          <button
            onClick={() => setMode('choose')}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-3 border border-slate-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            {t.settingsSwitchFamilyButton}
          </button>
        )}

        {mode === 'choose' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setMode('join')}
              className="w-full min-h-[44px] bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-3 border border-slate-200 transition-colors"
            >
              {t.settingsChooseJoin}
            </button>
            {!ownedFamilyName && (
              <button
                onClick={() => setMode('create')}
                className="w-full min-h-[44px] bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-xl px-4 py-3 border border-slate-200 transition-colors"
              >
                {t.settingsChooseCreate}
              </button>
            )}
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-sm">
              {t.cancel}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form action={(fd) => handleSubmit(switchFamily, fd)} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.onboardingFamilyNameLabel}</label>
              <input
                name="familyName"
                type="text"
                required
                placeholder={t.onboardingFamilyNamePlaceholder}
                {...familyNameInputProps}
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
                onClick={closeForm}
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

        {mode === 'create' && (
          <form action={(fd) => handleSubmit(createNewFamily, fd)} className="flex flex-col gap-4">
            <p className="text-sm text-slate-500">{t.settingsCreateFamilySubtitle}</p>
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
                {...familyNameInputProps}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeForm}
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
                {pending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.settingsCreating}</span> : t.settingsCreateButton}
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
