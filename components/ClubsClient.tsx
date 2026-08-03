'use client'

import React, { useState, useRef, useEffect, useTransition } from 'react'
import { createClub, updateClub, deleteClub, type ClubItem } from '../app/clubs/actions'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT, localeDir } from '../lib/i18n'
import { formatCode } from '../lib/formatCode'
import { formatExpiresAt, formatDateSlashFull, isExpiringSoon } from '../lib/date'
import { firstName } from '../lib/formatName'
import { useFamilyAttribution } from '../hooks/useFamilyAttributionStore'
import { adjustNavBadgeCount } from '../hooks/useNavBadgeCountsStore'
import { useSearchQueryStore } from '../hooks/useSearchQueryStore'
import type { ProviderOption } from '../lib/providerTypes'
import Spinner from './Spinner'
import ProviderCombobox from './ProviderCombobox'
import { HighlightMatch } from './HighlightMatch'
import { ExpiryDaysBadge } from './ExpiryDaysBadge'

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  shufersal: 'bg-red-100 text-red-700',
  rami:      'bg-orange-100 text-orange-700',
  gym:       'bg-blue-100 text-blue-700',
  super:     'bg-green-100 text-green-700',
  pharmacy:  'bg-teal-100 text-teal-700',
}

function providerColor(provider: string): string {
  const key = provider.toLowerCase()
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key]
  const palette = [
    'bg-violet-100 text-violet-700',
    'bg-pink-100 text-pink-700',
    'bg-amber-100 text-amber-700',
    'bg-cyan-100 text-cyan-700',
    'bg-indigo-100 text-indigo-700',
  ]
  return palette[provider.charCodeAt(0) % palette.length]
}

// ── Modal Shell ────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => { if (e.target === dialogRef.current) onClose() }}
      aria-labelledby="modal-title"
      className="modal-overlay fixed inset-0 z-50 w-full h-full m-0 max-w-none max-h-none border-0 bg-transparent p-0 sm:p-4 flex items-end sm:items-center justify-center backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="modal-panel relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="modal-header flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 id="modal-title" className="font-semibold text-slate-800 text-base">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  )
}

// ── Field ──────────────────────────────────────────────────────────────────────

function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  )
}

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'

// ── Add Club Modal ─────────────────────────────────────────────────────────────

function AddClubModal({
  onClose,
  providerOptions,
}: {
  onClose: () => void
  providerOptions: ProviderOption[]
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await createClub(new FormData(e.currentTarget))
        adjustNavBadgeCount('clubs', 1)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateClub)
      }
    })
  }

  return (
    <Modal title={t.addNewClub} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.clubName} required>
          <input name="name" required placeholder="e.g. Shufersal Club" className={inputClass} />
        </Field>
        <Field label={t.providerLabel}>
          <ProviderCombobox name="provider" options={providerOptions} placeholder={t.providerPlaceholder} />
        </Field>
        <Field label={t.ownerNameLabel}>
          <input name="ownerName" placeholder="e.g. Mom" className={inputClass} />
        </Field>
        <Field label={t.memberIdLabel} required>
          <input name="memberId" required placeholder={t.memberIdPlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.idTypeLabel} required>
          <select name="idType" required defaultValue="" className={inputClass}>
            <option value="" disabled>{t.idTypePlaceholder}</option>
            {(Object.entries(t.idTypes) as [keyof typeof t.idTypes, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label={t.expirationOptional}>
          <input
            name="expiresAt"
            type="date"
            className={inputClass}
          />
        </Field>
        <Field label={t.notesOptional}>
          <input name="notes" placeholder={t.notesPlaceholder} className={inputClass} />
        </Field>
        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.adding}</span> : t.addClub}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Club Detail Modal ─────────────────────────────────────────────────────────��

function ClubDetailModal({
  club,
  onClose,
  onEdit,
  onUpdated,
  expiringSoonDays,
}: {
  club: ClubItem
  onClose: () => void
  onEdit: () => void
  onUpdated: () => void
  expiringSoonDays: number
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const soon = (expiresAt: string | undefined) => isExpiringSoon(expiresAt, expiringSoonDays)
  const [showMemberId, setShowMemberId] = useState(false)
  const [copiedMemberId, setCopiedMemberId] = useState(false)
  const [formattedMemberId, setFormattedMemberId] = useState(true)
  const [isPending, startTransition] = useTransition()
  const { names: attributionNames, showAddedBy } = useFamilyAttribution()
  const addedByName = showAddedBy && club.createdBy && attributionNames[club.createdBy]
    ? firstName(attributionNames[club.createdBy])
    : null
  const [error, setError] = useState<string | null>(null)

  function copyMemberId() {
    if (!club.memberId) return
    navigator.clipboard.writeText(club.memberId).then(() => {
      setCopiedMemberId(true)
      setTimeout(() => setCopiedMemberId(false), 2000)
    })
  }

  const maskedMemberId = club.memberId
    ? club.memberId.replace(/.(?=.{4})/g, '•')
    : null

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteClub(club.id)
        adjustNavBadgeCount('clubs', -1)
        onUpdated()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToDeleteClub)
      }
    })
  }

  return (
    <Modal title={t.clubDetails} onClose={onClose}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {club.provider && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(club.provider)}`}>
              {club.provider}
            </span>
          )}
          <span className="text-slate-400 text-xs font-mono">#{club.seq}</span>
        </div>

        {/* Name */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.clubName}</p>
          <p className="text-sm font-medium text-slate-800">{club.name}</p>
        </div>

        {/* Owner */}
        {club.ownerName && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.ownerNameLabel}</p>
            <p className="text-sm text-slate-800">{club.ownerName}</p>
          </div>
        )}

        {/* Member ID */}
        {club.memberId && (
          <div className="club-memberid-section rounded-xl border border-slate-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <p className="text-xs text-slate-400">{t.memberIdLabel}</p>
              <button
                type="button"
                onClick={() => setShowMemberId(!showMemberId)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {showMemberId ? t.hide : t.reveal}
              </button>
            </div>
            {showMemberId ? (
              <div className="club-memberid-revealed px-3 pb-3 space-y-2">
                <p className="font-mono text-slate-800 text-xl font-extrabold tracking-widest break-all" dir="ltr">
                  {formattedMemberId ? formatCode(club.memberId) : club.memberId}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormattedMemberId(!formattedMemberId)}
                    className="club-format-btn flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-colors"
                  >
                    {formattedMemberId ? 'ABC...' : 'ABCD-...'}
                  </button>
                  <button
                    type="button"
                    onClick={copyMemberId}
                    className="club-copy-btn flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
                  >
                    {copiedMemberId ? (
                      <>
                        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {t.copied}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        {t.copy}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className="font-mono text-slate-700 text-sm tracking-wider break-all px-3 pb-3" dir="ltr">
                {maskedMemberId}
              </p>
            )}
          </div>
        )}

        {/* ID type */}
        {club.idType && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.idTypeLabel}</p>
            <p className="text-sm text-slate-700">{t.idTypes[club.idType]}</p>
          </div>
        )}

        {/* Expiry */}
        {club.expiresAt && (
          <div className={soon(club.expiresAt) ? 'p-2 rounded-xl bg-rose-50 border border-rose-200' : undefined}>
            <p className="text-xs text-slate-400 mb-0.5">{t.expires}</p>
            <p className={`text-sm font-mono flex items-center gap-1.5 ${soon(club.expiresAt) ? 'text-rose-600 font-semibold' : 'text-slate-800'}`}>
              {formatDateSlashFull(club.expiresAt!)}
              {soon(club.expiresAt) && <ExpiryDaysBadge expiresAt={club.expiresAt!} />}
            </p>
          </div>
        )}

        {/* Notes */}
        {club.notes && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.notesLabel}</p>
            <p className="text-sm text-slate-700">{club.notes}</p>
          </div>
        )}

        {/* Added */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.dateAdded}</p>
          <p className="text-sm text-slate-700">
            {formatDateSlashFull(club.createdAt)}
            {addedByName && ` (${addedByName})`}
          </p>
        </div>

        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { onClose(); onEdit() }}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:text-emerald-600 hover:border-emerald-200 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {t.edit}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="flex-1 h-11 rounded-xl border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <><Spinner />{t.removing}</>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {t.remove}
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Club Modal ────────────────────────────────────────────────────────────

function EditClubModal({
  club,
  onClose,
  providerOptions,
}: {
  club: ClubItem
  onClose: () => void
  providerOptions: ProviderOption[]
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        await updateClub(club.id, fd)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateClub)
      }
    })
  }

  return (
    <Modal title={t.editClub} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.clubName} required>
          <input name="name" required defaultValue={club.name} placeholder="e.g. Shufersal Club" className={inputClass} />
        </Field>
        <Field label={t.providerLabel}>
          <ProviderCombobox
            name="provider"
            defaultValue={club.provider}
            options={providerOptions}
            placeholder={t.providerPlaceholder}
          />
        </Field>
        <Field label={t.ownerNameLabel}>
          <input name="ownerName" defaultValue={club.ownerName ?? ''} placeholder="e.g. Mom" className={inputClass} />
        </Field>
        <Field label={t.memberIdLabel} required>
          <input name="memberId" required defaultValue={club.memberId ?? ''} placeholder={t.memberIdPlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.idTypeLabel} required>
          <select name="idType" required defaultValue={club.idType ?? ''} className={inputClass}>
            <option value="" disabled>{t.idTypePlaceholder}</option>
            {(Object.entries(t.idTypes) as [keyof typeof t.idTypes, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label={t.expirationOptional}>
          <input name="expiresAt" type="date" defaultValue={club.expiresAt ? club.expiresAt.slice(0, 10) : ''} className={inputClass} />
        </Field>
        <Field label={t.notesOptional}>
          <input name="notes" placeholder={t.notesPlaceholder} defaultValue={club.notes ?? ''} className={inputClass} />
        </Field>
        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            {t.cancel}
          </button>
          <button type="submit" disabled={isPending} className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors">
            {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.saving}</span> : t.saveChanges}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Club Row ───────────────────────────────────────────────────────────────────

function ClubRow({ club, query, expiringSoonDays, onClick }: { club: ClubItem; query: string; expiringSoonDays: number; onClick: () => void }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const maskedId = club.memberId ? club.memberId.replace(/.(?=.{4})/g, '•') : null
  const expiringSoon = isExpiringSoon(club.expiresAt, expiringSoonDays)

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-start rounded-2xl border shadow-sm hover:shadow-md transition-all p-4 flex items-center gap-3 ${
        expiringSoon ? 'bg-rose-50/60 border-rose-200 hover:bg-rose-50' : 'bg-white border-slate-100 hover:border-slate-200'
      }`}
    >
      <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-center">#{club.seq}</span>
      {club.provider && (
        <div className="flex-shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(club.provider)}`}>
            <HighlightMatch text={club.provider} query={query} />
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 truncate"><HighlightMatch text={club.name} query={query} /></span>
          {maskedId && (
            // memberId is filtered against as-typed but rendered masked here — no visible
            // highlight for a match that came in purely via the hidden digits.
            <span className="text-sm font-mono font-semibold text-slate-600 tracking-wider flex-shrink-0" dir="ltr">{maskedId}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {club.ownerName && (
            <span className="text-xs text-slate-400 truncate"><HighlightMatch text={club.ownerName} query={query} /></span>
          )}
          {club.idType && (
            <span className="text-xs text-slate-400">{t.idTypes[club.idType]}</span>
          )}
        </div>
      </div>
      {club.expiresAt && (
        <span className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-mono ${expiringSoon ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
          {formatExpiresAt(club.expiresAt!)}
          {expiringSoon && <ExpiryDaysBadge expiresAt={club.expiresAt!} />}
        </span>
      )}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ClubsClient({
  clubs,
  providerOptions,
  expiringSoonDays,
}: {
  clubs: ClubItem[]
  providerOptions: ProviderOption[]
  expiringSoonDays: number
}) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<ClubItem | null>(null)
  const [editTarget, setEditTarget] = useState<ClubItem | null>(null)

  const rawQuery = useSearchQueryStore((s) => s.query).trim()
  const query = rawQuery.toLowerCase()
  const matchesQuery = (c: ClubItem) =>
    !query ||
    c.name.toLowerCase().includes(query) ||
    c.provider.toLowerCase().includes(query) ||
    (c.notes?.toLowerCase().includes(query) ?? false) ||
    (c.ownerName?.toLowerCase().includes(query) ?? false) ||
    (c.memberId?.toLowerCase().includes(query) ?? false)
  const visibleClubs = clubs.filter(matchesQuery)

  return (
    <div className="clubs-page space-y-6" dir={dir}>
      <div className="clubs-page-header flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t.clubsTab}</h1>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t.addClub}
        </button>
      </div>

      {clubs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <p className="text-slate-500 font-medium mb-1">{t.noClubsYet}</p>
          <p className="text-slate-400 text-sm">{t.addFirstClubPrompt}</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-4 h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
          >
            {t.addClub}
          </button>
        </div>
      ) : visibleClubs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
          <p className="text-slate-400 text-sm">{t.searchNoResults(rawQuery)}</p>
        </div>
      ) : (
        <section className="clubs-section">
          <div className="space-y-2">
            {visibleClubs.map((c) => (
              <ClubRow key={c.id} club={c} query={rawQuery} expiringSoonDays={expiringSoonDays} onClick={() => setSelected(c)} />
            ))}
          </div>
        </section>
      )}

      {showAdd && (
        <AddClubModal onClose={() => setShowAdd(false)} providerOptions={providerOptions} />
      )}
      {selected && (
        <ClubDetailModal
          club={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditTarget(selected); setSelected(null) }}
          onUpdated={() => setSelected(null)}
          expiringSoonDays={expiringSoonDays}
        />
      )}
      {editTarget && (
        <EditClubModal
          club={editTarget}
          onClose={() => setEditTarget(null)}
          providerOptions={providerOptions}
        />
      )}
    </div>
  )
}
