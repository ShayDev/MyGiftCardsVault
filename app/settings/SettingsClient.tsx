'use client'

import { useLanguageStore } from '../../hooks/useLanguageStore'
import { getT, localeDir } from '../../lib/i18n'
import { UserButton } from '@clerk/nextjs'
import CopyButton from './CopyButton'

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

  return (
    <div className="max-w-md mx-auto py-8 px-4" dir={dir}>
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
