'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguageStore } from '../../hooks/useLanguageStore'
import { useThemeStore } from '../../hooks/useThemeStore'
import { getT, localeDir } from '../../lib/i18n'
import { UserButton } from '@clerk/nextjs'
import CopyButton from './CopyButton'
import Spinner from '../../components/Spinner'
import CurrencyToggle from '../../components/CurrencyToggle'
import { switchFamily, createNewFamily, switchToOwnFamily, updateExpiringSoonDays, updateCurrency } from './actions'
import { SUPPORTED_CURRENCIES } from '../../lib/currency'

type Props = {
  familyName: string
  inviteCode: string
  userName: string | null
  email: string
  ownedFamilyName: string | null
  ownsCurrentFamily: boolean
  expiringSoonDays: number
  currency: string | null
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
  expiringSoonDays,
  currency,
}: Props) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  // Slider only has two visual positions — 'system' (the initial default, before
  // anyone has touched the toggle) resolves against the OS preference so the knob
  // starts on the correct side; any click after that sets an explicit light/dark.
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const resolve = () => setIsDark(theme === 'dark' || (theme === 'system' && mq.matches))
    resolve()
    mq.addEventListener('change', resolve)
    return () => mq.removeEventListener('change', resolve)
  }, [theme])

  const [mode, setMode] = useState<Mode>('closed')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [switchingBack, setSwitchingBack] = useState(false)

  const [expirySaving, setExpirySaving] = useState(false)
  const [expiryError, setExpiryError] = useState<string | null>(null)
  const [expirySaved, setExpirySaved] = useState(false)

  async function handleExpirySubmit(formData: FormData) {
    setExpirySaving(true)
    setExpiryError(null)
    setExpirySaved(false)
    const result = await updateExpiringSoonDays(formData)
    setExpirySaving(false)
    if (result?.error) {
      setExpiryError(result.error)
    } else {
      setExpirySaved(true)
      setTimeout(() => setExpirySaved(false), 2000)
    }
  }

  const [currencySaving, setCurrencySaving] = useState(false)
  const [currencyError, setCurrencyError] = useState<string | null>(null)
  const [currencySaved, setCurrencySaved] = useState(false)

  async function handleCurrencySubmit(formData: FormData) {
    setCurrencySaving(true)
    setCurrencyError(null)
    setCurrencySaved(false)
    const result = await updateCurrency(formData)
    setCurrencySaving(false)
    if (result?.error) {
      setCurrencyError(result.error)
    } else {
      setCurrencySaved(true)
      setTimeout(() => setCurrencySaved(false), 2000)
    }
  }

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
        <Link href="/cards" className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
          {t.back}
        </Link>
      </div>
      <div className="settings-header-row flex items-center justify-between mb-6 gap-2">
        <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-400">{t.settingsTitle}</h1>
        <div className="settings-header-controls flex items-center gap-2">
        <CurrencyToggle currency={currency} />
        <button
          type="button"
          dir="ltr"
          role="switch"
          aria-checked={isDark}
          aria-label={isDark ? t.themeDark : t.themeLight}
          title={isDark ? t.themeDark : t.themeLight}
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className={`theme-slider relative w-16 h-9 rounded-full flex items-center px-1.5 transition-colors flex-shrink-0 ${
            isDark ? 'bg-neutral-700' : 'bg-slate-200'
          }`}
        >
          {/* Fixed end icons sit under the knob's two resting positions — the knob
              (rendered after them, so it paints on top) covers whichever one is
              currently active and shows its own copy of that same icon instead,
              while the inactive side's icon stays visible plain on the track. */}
          <svg className="absolute left-2 w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
          <svg className="absolute right-2 w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
          <span
            className={`theme-slider-knob w-6 h-6 rounded-full shadow bg-white flex items-center justify-center transition-transform ${
              isDark ? 'translate-x-7 text-neutral-700' : 'translate-x-0 text-amber-500'
            }`}
          >
            {isDark ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            )}
          </span>
        </button>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-700 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsFamily}</h2>
        <div className="mb-4">
          <p className="text-xs text-slate-400 mb-1">{t.settingsFamilyName}</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 dark:text-neutral-400 text-lg">{familyName}</p>
            <CopyButton text={familyName} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">{t.settingsInviteCode}</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 dark:text-neutral-400 text-lg tracking-widest">{inviteCode}</p>
            <CopyButton text={inviteCode} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
          <p className="text-xs text-slate-400 mt-2">{t.settingsInviteHint}</p>
        </div>
      </div>

      {ownedFamilyName && !ownsCurrentFamily && (
        <button
          onClick={handleSwitchBack}
          disabled={switchingBack}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 mb-4 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:opacity-50 text-emerald-700 dark:text-emerald-400 font-medium rounded-xl px-4 py-3 border border-emerald-200 dark:border-emerald-800 transition-colors"
        >
          {switchingBack ? (
            <span className="flex items-center justify-center gap-2"><Spinner />{t.settingsSwitching}</span>
          ) : (
            t.settingsSwitchBackTo(ownedFamilyName)
          )}
        </button>
      )}

      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-700 p-5 mb-4">
        {mode === 'closed' && (
          <button
            onClick={() => setMode('choose')}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-400 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-neutral-700 transition-colors"
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
              className="w-full min-h-[44px] bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-400 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-neutral-700 transition-colors"
            >
              {t.settingsChooseJoin}
            </button>
            {!ownedFamilyName && (
              <button
                onClick={() => setMode('create')}
                className="w-full min-h-[44px] bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 text-slate-700 dark:text-neutral-400 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-neutral-700 transition-colors"
              >
                {t.settingsChooseCreate}
              </button>
            )}
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm">
              {t.cancel}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <form action={(fd) => handleSubmit(switchFamily, fd)} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-400 mb-1">{t.onboardingFamilyNameLabel}</label>
              <input
                name="familyName"
                type="text"
                required
                placeholder={t.onboardingFamilyNamePlaceholder}
                {...familyNameInputProps}
                className="w-full border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-400 mt-1">{t.onboardingNameHint}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-400 mb-1">{t.onboardingCodeLabel}</label>
              <input
                name="inviteCode"
                type="text"
                required
                placeholder={t.onboardingCodePlaceholder}
                className="w-full border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-xs text-slate-400">{t.settingsSwitchFamilyHint}</p>
            {error && <p className="text-rose-600 dark:text-rose-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={pending}
                className="flex-1 min-h-[44px] bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 disabled:opacity-50 text-slate-700 dark:text-neutral-400 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-neutral-700 transition-colors"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-neutral-400 mb-1">
                {t.onboardingFamilyNameLabel}{' '}
                <span className="text-slate-400 font-normal">{t.onboardingFamilyNameHint}</span>
              </label>
              <input
                name="familyName"
                type="text"
                required
                placeholder={t.onboardingFamilyNamePlaceholder}
                {...familyNameInputProps}
                className="w-full border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {error && <p className="text-rose-600 dark:text-rose-400 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={pending}
                className="flex-1 min-h-[44px] bg-white dark:bg-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-700 disabled:opacity-50 text-slate-700 dark:text-neutral-400 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-neutral-700 transition-colors"
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

      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-700 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.expiringSoonDaysLabel}</h2>
        <form action={handleExpirySubmit} className="flex flex-col gap-2">
          <p className="text-xs text-slate-400">{t.expiringSoonDaysHelp}</p>
          <div className="flex items-center gap-3">
            <input
              name="expiringSoonDays"
              type="number"
              min={0}
              max={365}
              defaultValue={expiringSoonDays}
              className="w-24 border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={expirySaving}
              className="min-h-[44px] px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {expirySaving ? <span className="flex items-center justify-center gap-2"><Spinner />{t.saving}</span> : t.saveChanges}
            </button>
            {expirySaved && <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.expiringSoonDaysSaved}</span>}
          </div>
          {expiryError && <p className="text-rose-600 dark:text-rose-400 text-sm">{expiryError}</p>}
        </form>
      </div>

      {/* Full currency dropdown — superseded by the quick USD/ILS CurrencyToggle next to
          the title above. Commented out, not deleted, in case the toggle doesn't stick.
      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-700 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsCurrencyLabel}</h2>
        <form action={handleCurrencySubmit} className="flex flex-col gap-2">
          <p className="text-xs text-slate-400">{t.settingsCurrencyHelp}</p>
          <div className="flex items-center gap-3">
            <select
              key={currency ?? 'auto'}
              name="currency"
              defaultValue={currency ?? ''}
              className="min-h-[44px] border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-xl px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{t.settingsCurrencyFollowLanguage}</option>
              {SUPPORTED_CURRENCIES.map(({ code, symbol }) => (
                <option key={code} value={code}>{code} ({symbol})</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={currencySaving}
              className="min-h-[44px] px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {currencySaving ? <span className="flex items-center justify-center gap-2"><Spinner />{t.saving}</span> : t.saveChanges}
            </button>
            {currencySaved && <span className="text-sm text-emerald-600 dark:text-emerald-400">{t.settingsCurrencySaved}</span>}
          </div>
          {currencyError && <p className="text-rose-600 dark:text-rose-400 text-sm">{currencyError}</p>}
        </form>
      </div>
      */}

      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-200 dark:border-neutral-700 p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsAccount}</h2>
        <div className="flex items-center gap-3">
          <UserButton />
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-neutral-400">{userName ?? email}</p>
            <p className="text-xs text-slate-400">{email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
