'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLanguageStore } from '../../hooks/useLanguageStore'
import { useThemeStore, type ThemeMode } from '../../hooks/useThemeStore'
import { getT, localeDir } from '../../lib/i18n'
import { UserButton } from '@clerk/nextjs'
import CopyButton from './CopyButton'
import Spinner from '../../components/Spinner'
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
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50 mb-6">{t.settingsTitle}</h1>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsFamily}</h2>
        <div className="mb-4">
          <p className="text-xs text-slate-400 mb-1">{t.settingsFamilyName}</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 dark:text-slate-50 text-lg">{familyName}</p>
            <CopyButton text={familyName} copyLabel={t.copy} copiedLabel={t.copied} />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">{t.settingsInviteCode}</p>
          <div className="flex items-center gap-2">
            <p className="font-mono font-semibold text-slate-900 dark:text-slate-50 text-lg tracking-widest">{inviteCode}</p>
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
        {mode === 'closed' && (
          <button
            onClick={() => setMode('choose')}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 transition-colors"
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
              className="w-full min-h-[44px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              {t.settingsChooseJoin}
            </button>
            {!ownedFamilyName && (
              <button
                onClick={() => setMode('create')}
                className="w-full min-h-[44px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 transition-colors"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t.onboardingFamilyNameLabel}</label>
              <input
                name="familyName"
                type="text"
                required
                placeholder={t.onboardingFamilyNamePlaceholder}
                {...familyNameInputProps}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-slate-400 mt-1">{t.onboardingNameHint}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">{t.onboardingCodeLabel}</label>
              <input
                name="inviteCode"
                type="text"
                required
                placeholder={t.onboardingCodePlaceholder}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <p className="text-xs text-slate-400">{t.settingsSwitchFamilyHint}</p>
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={pending}
                className="flex-1 min-h-[44px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 transition-colors"
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                {t.onboardingFamilyNameLabel}{' '}
                <span className="text-slate-400 font-normal">{t.onboardingFamilyNameHint}</span>
              </label>
              <input
                name="familyName"
                type="text"
                required
                placeholder={t.onboardingFamilyNamePlaceholder}
                {...familyNameInputProps}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={closeForm}
                disabled={pending}
                className="flex-1 min-h-[44px] bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-medium rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 transition-colors"
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
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
              className="w-24 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={expirySaving}
              className="min-h-[44px] px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
            >
              {expirySaving ? <span className="flex items-center justify-center gap-2"><Spinner />{t.saving}</span> : t.saveChanges}
            </button>
            {expirySaved && <span className="text-sm text-emerald-600">{t.expiringSoonDaysSaved}</span>}
          </div>
          {expiryError && <p className="text-rose-600 text-sm">{expiryError}</p>}
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsCurrencyLabel}</h2>
        <form action={handleCurrencySubmit} className="flex flex-col gap-2">
          <p className="text-xs text-slate-400">{t.settingsCurrencyHelp}</p>
          <div className="flex items-center gap-3">
            <select
              name="currency"
              defaultValue={currency ?? ''}
              className="min-h-[44px] border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 rounded-xl px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
            {currencySaved && <span className="text-sm text-emerald-600">{t.settingsCurrencySaved}</span>}
          </div>
          {currencyError && <p className="text-rose-600 text-sm">{currencyError}</p>}
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsAppearance}</h2>
        <div className="theme-picker flex gap-2">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              aria-pressed={theme === mode}
              className={`flex-1 min-h-[44px] rounded-xl border text-sm font-medium transition-colors ${
                theme === mode
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {mode === 'light' ? t.themeLight : mode === 'dark' ? t.themeDark : t.themeSystem}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">{t.settingsAccount}</h2>
        <div className="flex items-center gap-3">
          <UserButton />
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{userName ?? email}</p>
            <p className="text-xs text-slate-400">{email}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
