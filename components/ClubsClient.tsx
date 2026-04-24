'use client'

import React, { useState, useTransition } from 'react'
import { createClub, deleteClub, type ClubItem } from '../app/clubs/actions'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT, localeDir } from '../lib/i18n'
import { formatCode } from '../lib/formatCode'
import Spinner from './Spinner'

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ── Modal Shell ────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="modal-panel relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="modal-header flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-semibold text-slate-800 text-base">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Field ──────────────────────────────────────────────────────────────────────

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  )
}

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'

// ── Add Club Modal ─────────────────────────────────────────────────────────────

function AddClubModal({ onClose }: { onClose: () => void }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await createClub(new FormData(e.currentTarget))
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateClub)
      }
    })
  }

  return (
    <Modal title={t.addNewClub} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.clubName}>
          <input name="name" required placeholder="e.g. Shufersal Club" className={inputClass} />
        </Field>
        <Field label={t.providerLabel}>
          <input name="provider" placeholder={t.providerPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.ownerNameLabel}>
          <input name="ownerName" placeholder="e.g. Mom" className={inputClass} />
        </Field>
        <Field label={t.memberIdLabel}>
          <input name="memberId" required placeholder={t.memberIdPlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.idTypeLabel}>
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
            maxLength={4}
            pattern="(0[1-9]|1[0-2])\d{2}"
            placeholder="MMYY"
            className={`${inputClass} font-mono`}
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
  onUpdated,
}: {
  club: ClubItem
  onClose: () => void
  onUpdated: () => void
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [showMemberId, setShowMemberId] = useState(false)
  const [copiedMemberId, setCopiedMemberId] = useState(false)
  const [formattedMemberId, setFormattedMemberId] = useState(true)
  const [isPending, startTransition] = useTransition()
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
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.expires}</p>
            <p className="text-sm font-mono text-slate-800">{`${club.expiresAt!.slice(0, 2)}/${club.expiresAt!.slice(2)}`}</p>
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
          <p className="text-sm text-slate-700">{formatDate(club.createdAt)}</p>
        </div>

        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="w-full h-11 rounded-xl border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-60"
        >
          {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.removing}</span> : t.removeCard}
        </button>
      </div>
    </Modal>
  )
}

// ── Club Row ───────────────────────────────────────────────────────────────────

function ClubRow({ club, onClick }: { club: ClubItem; onClick: () => void }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const maskedId = club.memberId ? club.memberId.replace(/.(?=.{4})/g, '•') : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all p-4 flex items-center gap-3"
    >
      <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-center">#{club.seq}</span>
      {club.provider && (
        <div className="flex-shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(club.provider)}`}>
            {club.provider}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 truncate">{club.name}</span>
          {maskedId && (
            <span className="text-sm font-mono font-semibold text-slate-600 tracking-wider flex-shrink-0" dir="ltr">{maskedId}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {club.ownerName && (
            <span className="text-xs text-slate-400 truncate">{club.ownerName}</span>
          )}
          {club.idType && (
            <span className="text-xs text-slate-400">{t.idTypes[club.idType]}</span>
          )}
        </div>
      </div>
      {club.expiresAt && (
        <span className="flex-shrink-0 text-xs font-mono text-slate-400">{`${club.expiresAt!.slice(0, 2)}/${club.expiresAt!.slice(2)}`}</span>
      )}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ClubsClient({ clubs }: { clubs: ClubItem[] }) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<ClubItem | null>(null)

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
      ) : (
        <section className="clubs-section">
          <div className="space-y-2">
            {clubs.map((c) => (
              <ClubRow key={c.id} club={c} onClick={() => setSelected(c)} />
            ))}
          </div>
        </section>
      )}

      {showAdd && <AddClubModal onClose={() => setShowAdd(false)} />}
      {selected && (
        <ClubDetailModal
          club={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => setSelected(null)}
        />
      )}
    </div>
  )
}
