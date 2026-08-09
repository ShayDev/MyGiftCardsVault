'use client'

import React, { useRef, useState, useEffect, useTransition } from 'react'
import { createVoucher, updateVoucher, markVoucherUsed, deleteVoucher, type VoucherItem } from '../app/vouchers/actions'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { useCurrency } from '../hooks/useCurrency'
import { getT } from '../lib/i18n'
import { formatCode } from '../lib/formatCode'
import { formatExpiresAt, formatDate, formatDateSlashFull, isExpiringSoon } from '../lib/date'
import { firstName } from '../lib/formatName'
import { useFamilyAttribution } from '../hooks/useFamilyAttributionStore'
import { adjustNavBadgeCount } from '../hooks/useNavBadgeCountsStore'
import { useSearchQueryStore } from '../hooks/useSearchQueryStore'
import type { ProviderOption } from '../lib/providerTypes'
import Spinner from './Spinner'
import ProviderCombobox from './ProviderCombobox'
import ScanButton, { type ExtractedFields } from './ScanButton'
import { HighlightMatch } from './HighlightMatch'
import { ExpiryDaysBadge } from './ExpiryDaysBadge'

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  amazon:    'bg-amber-100 text-amber-700',
  target:    'bg-red-100 text-red-700',
  walmart:   'bg-blue-100 text-blue-700',
  starbucks: 'bg-green-100 text-green-700',
  apple:     'bg-slate-100 text-slate-700',
  google:    'bg-indigo-100 text-indigo-700',
}

function providerColor(provider: string): string {
  const key = provider.toLowerCase()
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key]
  const palette = [
    'bg-violet-100 text-violet-700',
    'bg-pink-100 text-pink-700',
    'bg-teal-100 text-teal-700',
    'bg-orange-100 text-orange-700',
    'bg-cyan-100 text-cyan-700',
  ]
  return palette[provider.charCodeAt(0) % palette.length]
}

function formatCurrency(amount: number, currencyLocale: string, currencyCode: string): string {
  return new Intl.NumberFormat(currencyLocale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount)
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

// ── Add Voucher Modal ──────────────────────────────────────────────────────────

function AddVoucherModal({
  onClose,
  providerOptions,
}: {
  onClose: () => void
  providerOptions: ProviderOption[]
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [providerPrefill, setProviderPrefill] = useState('')
  const [providerKey, setProviderKey] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const linkRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef<HTMLInputElement>(null)
  const expiresAtRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLInputElement>(null)

  function handleExtracted(fields: ExtractedFields) {
    if (typeof fields.provider === 'string') {
      setProviderPrefill(fields.provider)
      setProviderKey((k) => k + 1)
    }
    if (nameRef.current && !nameRef.current.value) {
      const name = typeof fields.name === 'string' ? fields.name : fields.provider
      if (typeof name === 'string') nameRef.current.value = name
    }
    if (codeRef.current && typeof fields.code === 'string') codeRef.current.value = fields.code
    if (linkRef.current && typeof fields.link === 'string') linkRef.current.value = fields.link
    if (valueRef.current && typeof fields.value === 'number') valueRef.current.value = String(fields.value)
    if (expiresAtRef.current && typeof fields.expiresAt === 'string') expiresAtRef.current.value = fields.expiresAt
    if (notesRef.current && !notesRef.current.value && typeof fields.notes === 'string') notesRef.current.value = fields.notes
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    setError(null)
    startTransition(async () => {
      try {
        await createVoucher(fd)
        adjustNavBadgeCount('vouchers', 1)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateVoucher)
      }
    })
  }

  return (
    <Modal title={t.addNewVoucher} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ScanButton entityType="VOUCHER" onExtracted={handleExtracted} />
        <Field label={t.voucherName} required>
          <input ref={nameRef} name="name" required placeholder="e.g. Birthday Discount" className={inputClass} />
        </Field>
        <Field label={t.providerLabel}>
          <ProviderCombobox key={providerKey} name="provider" defaultValue={providerPrefill} options={providerOptions} placeholder={t.providerPlaceholder} />
        </Field>
        <Field label={t.voucherCode}>
          <input ref={codeRef} name="code" placeholder={t.voucherCodePlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.voucherLink}>
          <input ref={linkRef} name="link" type="url" placeholder={t.voucherLinkPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.voucherValueOptional}>
          <input
            ref={valueRef}
            name="value"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label={t.expirationOptional}>
          <input
            ref={expiresAtRef}
            name="expiresAt"
            type="date"
            className={inputClass}
          />
        </Field>
        <Field label={t.notesOptional}>
          <input ref={notesRef} name="notes" placeholder={t.notesPlaceholder} className={inputClass} />
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
            {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.adding}</span> : t.addVoucher}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Voucher Detail Modal ───────────────────────────────────────────────────────

function VoucherDetailModal({
  voucher,
  onClose,
  onEdit,
  onUpdated,
  expiringSoonDays,
  currency,
}: {
  voucher: VoucherItem
  onClose: () => void
  onEdit: () => void
  onUpdated: () => void
  expiringSoonDays: number
  currency: string | null
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const { code: currencyCode } = useCurrency(currency)
  const soon = (expiresAt: string | undefined) => isExpiringSoon(expiresAt, expiringSoonDays)
  const [showCode, setShowCode] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [formattedCode, setFormattedCode] = useState(true)
  const { names: attributionNames, showAddedBy } = useFamilyAttribution()
  const addedByName = showAddedBy && voucher.createdBy && attributionNames[voucher.createdBy]
    ? firstName(attributionNames[voucher.createdBy])
    : null
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function copyCode() {
    if (!voucher.code) return
    navigator.clipboard.writeText(voucher.code).then(() => {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    })
  }

  const maskedCode = voucher.code
    ? voucher.code.replace(/.(?=.{4})/g, '•')
    : null

  function handleToggleUsed() {
    setError(null)
    startTransition(async () => {
      try {
        await markVoucherUsed(voucher.id, !voucher.isUsed)
        adjustNavBadgeCount('vouchers', voucher.isUsed ? 1 : -1)
        onUpdated()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateVoucher)
      }
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteVoucher(voucher.id)
        if (!voucher.isUsed) adjustNavBadgeCount('vouchers', -1)
        onUpdated()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateVoucher)
      }
    })
  }

  return (
    <Modal title={t.voucherDetails} onClose={onClose}>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          {voucher.provider && (
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(voucher.provider)}`}>
              {voucher.provider}
            </span>
          )}
          <span className="text-slate-400 text-xs font-mono">#{voucher.seq}</span>
          {voucher.isUsed ? (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
              {t.usedVouchers}
            </span>
          ) : (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
              {t.activeVouchers}
            </span>
          )}
        </div>

        {/* Name */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.voucherName}</p>
          <p className="text-sm font-medium text-slate-800">{voucher.name}</p>
        </div>

        {/* Code */}
        {voucher.code && (
          <div className="voucher-code-section rounded-xl border border-slate-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <p className="text-xs text-slate-400">{t.voucherCode}</p>
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {showCode ? t.hide : t.reveal}
              </button>
            </div>
            {showCode ? (
              <div className="voucher-code-revealed px-3 pb-3 space-y-2">
                <p className="font-mono text-slate-800 text-xl font-extrabold tracking-widest break-all" dir="ltr">
                  {formattedCode ? formatCode(voucher.code) : voucher.code}
                </p>
                <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormattedCode(!formattedCode)}
                  className="voucher-format-btn flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-colors"
                >
                  {formattedCode ? 'ABC...' : 'ABCD-...'}
                </button>
                <button
                  type="button"
                  onClick={copyCode}
                  className="voucher-copy-btn flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
                >
                  {copiedCode ? (
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
                {maskedCode}
              </p>
            )}
          </div>
        )}

        {/* Link */}
        {voucher.link && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t.voucherLink}</p>
            <div className="flex items-center gap-2">
              <a
                href={voucher.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {t.openLink}
              </a>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(voucher.link!).then(() => { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000) }) }}
                className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
              >
                {copiedLink ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                )}
                {copiedLink ? t.copied : t.copy}
              </button>
            </div>
          </div>
        )}

        {/* Value */}
        {voucher.value !== undefined && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.voucherValueOptional}</p>
            <p className="text-sm font-mono font-semibold text-slate-800">{formatCurrency(voucher.value, t.currencyLocale, currencyCode)}</p>
          </div>
        )}

        {/* Expiry */}
        {voucher.expiresAt && (
          <div className={soon(voucher.expiresAt) ? 'p-2 rounded-xl bg-rose-50 border border-rose-200' : undefined}>
            <p className="text-xs text-slate-400 mb-0.5">{t.expires}</p>
            <p className={`text-sm font-mono flex items-center gap-1.5 ${soon(voucher.expiresAt) ? 'text-rose-600 font-semibold' : 'text-slate-800'}`}>
              {formatDateSlashFull(voucher.expiresAt!)}
              {soon(voucher.expiresAt) && <ExpiryDaysBadge expiresAt={voucher.expiresAt!} />}
            </p>
          </div>
        )}

        {/* Notes */}
        {voucher.notes && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.notesLabel}</p>
            <p className="text-sm text-slate-700">{voucher.notes}</p>
          </div>
        )}

        {/* Used at / by */}
        {voucher.isUsed && voucher.usedAt && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.usedOn}</p>
            <p className="text-sm text-slate-700">{formatDate(voucher.usedAt, t.currencyLocale)}</p>
          </div>
        )}
        {voucher.isUsed && voucher.usedBy && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.usedBy}</p>
            <p className="text-sm font-mono text-slate-500 truncate">{voucher.usedBy}</p>
          </div>
        )}

        {/* Added */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.dateAdded}</p>
          <p className="text-sm text-slate-700">
            {formatDateSlashFull(voucher.createdAt)}
            {addedByName && ` (${addedByName})`}
          </p>
        </div>

        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleToggleUsed}
            disabled={isPending}
            className={`flex-1 h-11 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${
              voucher.isUsed
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-slate-800 hover:bg-slate-900 text-white'
            }`}
          >
            {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.saving}</span> : voucher.isUsed ? t.markAsUnused : t.markAsUsed}
          </button>
          <button
            type="button"
            onClick={() => { onClose(); onEdit() }}
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors"
            title={t.edit}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-60"
            title={t.removeCard}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Edit Voucher Modal ─────────────────────────────────────────────────────────

function EditVoucherModal({
  voucher,
  onClose,
  providerOptions,
}: {
  voucher: VoucherItem
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
        await updateVoucher(voucher.id, fd)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateVoucher)
      }
    })
  }

  return (
    <Modal title={t.editVoucher} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.voucherName} required>
          <input name="name" required defaultValue={voucher.name} placeholder="e.g. Birthday Discount" className={inputClass} />
        </Field>
        <Field label={t.providerLabel}>
          <ProviderCombobox
            name="provider"
            defaultValue={voucher.provider}
            options={providerOptions}
            placeholder={t.providerPlaceholder}
          />
        </Field>
        <Field label={t.voucherCode}>
          <input name="code" defaultValue={voucher.code ?? ''} placeholder={t.voucherCodePlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.voucherLink}>
          <input name="link" type="url" defaultValue={voucher.link ?? ''} placeholder={t.voucherLinkPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.voucherValueOptional}>
          <input name="value" type="number" min="0.01" step="0.01" placeholder="0.00" defaultValue={voucher.value ?? ''} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.expirationOptional}>
          <input name="expiresAt" type="date" defaultValue={voucher.expiresAt ? voucher.expiresAt.slice(0, 10) : ''} className={inputClass} />
        </Field>
        <Field label={t.notesOptional}>
          <input name="notes" placeholder={t.notesPlaceholder} defaultValue={voucher.notes ?? ''} className={inputClass} />
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

// ── Voucher Row ────────────────────────────────────────────────────────────────

function VoucherRow({ voucher, query, expiringSoonDays, onClick, onDelete, currency }: { voucher: VoucherItem; query: string; expiringSoonDays: number; onClick: () => void; onDelete?: () => Promise<void>; currency: string | null }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const { code: currencyCode } = useCurrency(currency)
  const [deleting, startDelete] = useTransition()

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    startDelete(async () => { await onDelete?.() })
  }

  const expiringSoon = isExpiringSoon(voucher.expiresAt, expiringSoonDays)

  return (
    <div className={`voucher-row w-full rounded-2xl border shadow-sm hover:shadow-md transition-all flex items-center gap-3 pr-2 ${
      expiringSoon ? 'bg-rose-50/60 border-rose-200 hover:bg-rose-50' : 'bg-white border-slate-100 hover:border-slate-200'
    }`}>
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left p-4 flex items-center gap-3"
      >
        <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-right">#{voucher.seq}</span>
        {voucher.provider && (
          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(voucher.provider)}`}>
            <HighlightMatch text={voucher.provider} query={query} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 truncate"><HighlightMatch text={voucher.name} query={query} /></span>
            {voucher.expiresAt && (
              <div className="flex-shrink-0 text-xs font-mono">
                <div className="text-slate-400">{t.expires}</div>
                <div className={`flex items-center gap-1.5 ${expiringSoon ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                  {formatExpiresAt(voucher.expiresAt!)}
                  {expiringSoon && <ExpiryDaysBadge expiresAt={voucher.expiresAt!} />}
                </div>
              </div>
            )}
          </div>
        </div>
        {voucher.value !== undefined && (
          <span className="flex-shrink-0 text-xs font-mono text-slate-500">
            {formatCurrency(voucher.value, t.currencyLocale, currencyCode)}
          </span>
        )}
        {!onDelete && (
          <div className="flex-shrink-0">
            {voucher.isUsed ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                {t.usedVouchers}
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                {t.activeVouchers}
              </span>
            )}
          </div>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-40"
          title={t.removeCard}
        >
          {deleting ? <Spinner /> : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function VouchersClient({
  vouchers,
  providerOptions,
  expiringSoonDays,
  currency,
}: {
  vouchers: VoucherItem[]
  providerOptions: ProviderOption[]
  expiringSoonDays: number
  currency: string | null
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<VoucherItem | null>(null)
  const [editTarget, setEditTarget] = useState<VoucherItem | null>(null)
  const [showUsed, setShowUsed] = useState(false)

  const active = vouchers.filter((v) => !v.isUsed)
  const used = vouchers.filter((v) => v.isUsed)

  const rawQuery = useSearchQueryStore((s) => s.query).trim()
  const query = rawQuery.toLowerCase()
  const matchesQuery = (v: VoucherItem) =>
    !query ||
    v.name.toLowerCase().includes(query) ||
    v.provider.toLowerCase().includes(query) ||
    (v.notes?.toLowerCase().includes(query) ?? false) ||
    (v.code?.toLowerCase().includes(query) ?? false)
  const visibleActive = active.filter(matchesQuery)
  const visibleUsed = used.filter(matchesQuery)

  return (
    <div className="vouchers-page space-y-6">
      {/* Page header */}
      <div className="vouchers-page-header flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t.vouchersTab}</h1>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t.addVoucher}
        </button>
      </div>

      {/* Active vouchers */}
      <section className="vouchers-section-active">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t.activeVouchers}</h2>
          {visibleActive.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{visibleActive.length}</span>
          )}
        </div>
        {active.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-slate-500 font-medium mb-1">{t.noVouchersYet}</p>
            <p className="text-slate-400 text-sm">{t.addFirstVoucherPrompt}</p>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-4 h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              {t.addVoucher}
            </button>
          </div>
        ) : visibleActive.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-slate-400 text-sm">{t.searchNoResults(rawQuery)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleActive.map((v) => (
              <VoucherRow key={v.id} voucher={v} query={rawQuery} expiringSoonDays={expiringSoonDays} onClick={() => setSelected(v)} currency={currency} />
            ))}
          </div>
        )}
      </section>

      {/* Used vouchers */}
      <section className="vouchers-section-used">
        <button
          onClick={() => setShowUsed((v) => !v)}
          className="flex items-center gap-2 mb-3 w-full text-left"
        >
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t.usedVouchers}</h2>
          {visibleUsed.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{visibleUsed.length}</span>
          )}
          <svg
            className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${showUsed ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showUsed && used.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">{t.noUsedVouchers}</p>
          </div>
        ) : showUsed && visibleUsed.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">{t.searchNoResults(rawQuery)}</p>
          </div>
        ) : showUsed ? (
          <div className="space-y-2">
            {visibleUsed.map((v) => (
              <VoucherRow key={v.id} voucher={v} query={rawQuery} expiringSoonDays={expiringSoonDays} onClick={() => setSelected(v)} onDelete={() => deleteVoucher(v.id)} currency={currency} />
            ))}
          </div>
        ) : null}
      </section>

      {/* Modals */}
      {showAdd && (
        <AddVoucherModal onClose={() => setShowAdd(false)} providerOptions={providerOptions} />
      )}
      {selected && (
        <VoucherDetailModal
          voucher={selected}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditTarget(selected); setSelected(null) }}
          onUpdated={() => setSelected(null)}
          expiringSoonDays={expiringSoonDays}
          currency={currency}
        />
      )}
      {editTarget && (
        <EditVoucherModal
          voucher={editTarget}
          onClose={() => setEditTarget(null)}
          providerOptions={providerOptions}
        />
      )}
    </div>
  )
}
