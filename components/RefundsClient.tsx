'use client'

import React, { useState, useTransition } from 'react'
import { createRefund, markRefundReceived, deleteRefund, type RefundItem } from '../app/refunds/actions'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'
import { localeDir } from '../lib/i18n'
import { formatCode } from '../lib/formatCode'
import Spinner from './Spinner'

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  amazon:    'bg-amber-100 text-amber-700',
  target:    'bg-red-100 text-red-700',
  walmart:   'bg-blue-100 text-blue-700',
  starbucks: 'bg-green-100 text-green-700',
  apple:     'bg-slate-100 text-slate-700',
  google:    'bg-indigo-100 text-indigo-700',
  zara:      'bg-zinc-100 text-zinc-700',
  ikea:      'bg-yellow-100 text-yellow-700',
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
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

// ── Add Refund Modal ───────────────────────────────────────────────────────────

function AddRefundModal({ onClose }: { onClose: () => void }) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const defaultCurrency = locale === 'he' ? 'ILS' : 'USD'
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setImageFile(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setImagePreview(url)
    } else {
      setImagePreview(null)
    }
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      try {
        if (imageFile) {
          const uploadForm = new FormData()
          uploadForm.append('file', imageFile)
          const res = await fetch('/api/upload', { method: 'POST', body: uploadForm })
          if (!res.ok) throw new Error('Image upload failed')
          const { url } = await res.json()
          fd.set('imageUrl', url)
        }
        await createRefund(fd)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateRefund)
      }
    })
  }

  return (
    <Modal title={t.addNewRefund} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.refundProvider}>
          <input name="provider" required placeholder="e.g. Zara, IKEA" className={inputClass} />
        </Field>
        <div className="flex gap-3">
          <Field label={t.refundAmount}>
            <input
              name="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={t.refundCurrency}>
            <input
              name="currency"
              required
              maxLength={3}
              defaultValue={defaultCurrency}
              className={`${inputClass} font-mono uppercase w-24`}
            />
          </Field>
        </div>
        <Field label={t.refundReference}>
          <input name="referenceId" placeholder={t.refundReferencePlaceholder} className={inputClass} />
        </Field>
        <Field label={t.refundExpectedBy}>
          <input name="expectedBy" type="date" className={inputClass} />
        </Field>
        <Field label={t.refundCode}>
          <input name="code" placeholder={t.refundCodePlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.refundLink}>
          <input name="link" type="url" placeholder={t.refundLinkPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.notesOptional}>
          <input name="notes" placeholder={t.notesPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.refundImageOptional}>
          <label className="refund-image-upload flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-400 cursor-pointer transition-colors bg-slate-50 hover:bg-emerald-50 overflow-hidden">
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs">{t.refundImageHint}</span>
              </div>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </label>
          {imagePreview && (
            <button
              type="button"
              onClick={() => { setImagePreview(null); setImageFile(null) }}
              className="text-xs text-rose-500 hover:text-rose-600 mt-1"
            >
              {t.removeCard}
            </button>
          )}
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
            {isPending ? <span className="flex items-center justify-center gap-2"><Spinner />{t.adding}</span> : t.addRefund}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Refund Detail Modal ────────────────────────────────────────────────────────

function RefundDetailModal({
  refund,
  onClose,
}: {
  refund: RefundItem
  onClose: () => void
}) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const [showCode, setShowCode] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [formattedCode, setFormattedCode] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const maskedCode = refund.code ? refund.code.replace(/.(?=.{4})/g, '•') : null

  function copyCode() {
    if (!refund.code) return
    navigator.clipboard.writeText(refund.code).then(() => {
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    })
  }

  function handleToggleReceived() {
    setError(null)
    startTransition(async () => {
      try {
        await markRefundReceived(refund.id, refund.status !== 'received')
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateRefund)
      }
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      try {
        await deleteRefund(refund.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateRefund)
      }
    })
  }

  const isPending_ = refund.status === 'pending'

  return (
    <Modal title={t.refundDetails} onClose={onClose}>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(refund.provider)}`}>
            {refund.provider}
          </span>
          <span className="text-slate-400 text-xs font-mono">#{refund.seq}</span>
          {isPending_ ? (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              {t.pendingRefunds}
            </span>
          ) : (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
              {t.receivedRefunds}
            </span>
          )}
        </div>

        {/* Amount */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.refundAmount}</p>
          <p className="text-2xl font-mono font-bold text-slate-800" dir="ltr">
            {formatAmount(refund.amount, refund.currency)}
          </p>
        </div>

        {/* Reference */}
        {refund.referenceId && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.refundReference}</p>
            <p className="text-sm font-mono text-slate-700">{refund.referenceId}</p>
          </div>
        )}

        {/* Expected by */}
        {isPending_ && refund.expectedBy && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.refundExpectedBy}</p>
            <p className="text-sm text-slate-700">{formatDate(refund.expectedBy)}</p>
          </div>
        )}

        {/* Received on */}
        {!isPending_ && refund.receivedAt && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.refundReceivedOn}</p>
            <p className="text-sm text-slate-700">{formatDate(refund.receivedAt)}</p>
          </div>
        )}

        {/* Code */}
        {refund.code && (
          <div className="refund-code-section rounded-xl border border-slate-100 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-1">
              <p className="text-xs text-slate-400">{t.refundCode}</p>
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {showCode ? t.hide : t.reveal}
              </button>
            </div>
            {showCode ? (
              <div className="refund-code-revealed px-3 pb-3 space-y-2">
                <p className="font-mono text-slate-800 text-xl font-extrabold tracking-widest break-all" dir="ltr">
                  {formattedCode ? formatCode(refund.code) : refund.code}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormattedCode(!formattedCode)}
                    className="refund-format-btn flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-colors"
                  >
                    {formattedCode ? 'ABC...' : 'ABCD-...'}
                  </button>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="refund-copy-btn flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors"
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
        {refund.link && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.refundLink}</p>
            <a
              href={refund.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t.openLink}
            </a>
          </div>
        )}

        {/* Notes */}
        {refund.notes && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.notesLabel}</p>
            <p className="text-sm text-slate-700">{refund.notes}</p>
          </div>
        )}

        {/* Image */}
        {refund.imageUrl && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t.refundImageOptional}</p>
            <a href={refund.imageUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={refund.imageUrl}
                alt="refund receipt"
                className="refund-image-thumbnail w-full max-h-48 object-cover rounded-xl border border-slate-100 hover:opacity-90 transition-opacity"
              />
            </a>
          </div>
        )}

        {/* Added */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.dateAdded}</p>
          <p className="text-sm text-slate-700">{formatDate(refund.createdAt)}</p>
        </div>

        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleToggleReceived}
            disabled={isPending}
            className={`flex-1 h-11 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${
              isPending_
                ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                : 'bg-slate-700 hover:bg-slate-800 text-white'
            }`}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2"><Spinner />{t.saving}</span>
            ) : isPending_ ? t.markAsReceived : t.markAsPending}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="h-11 px-4 rounded-xl border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-60"
          >
            {t.removeCard}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Refund Row ─────────────────────────────────────────────────────────────────

function RefundRow({ refund, onClick }: { refund: RefundItem; onClick: () => void }) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]
  const isPending = refund.status === 'pending'

  return (
    <button
      type="button"
      onClick={onClick}
      dir={dir}
      className="refund-row w-full text-start bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all p-4 flex items-center gap-3"
    >
      <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-right" dir="ltr">#{refund.seq}</span>
      <div className="flex-shrink-0">
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(refund.provider)}`}>
          {refund.provider}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono font-semibold text-slate-800" dir="ltr">
          {formatAmount(refund.amount, refund.currency)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {refund.referenceId && (
            <span className="text-xs font-mono text-slate-400 truncate">{refund.referenceId}</span>
          )}
          {isPending && refund.expectedBy && (
            <span className="text-xs text-amber-600">{formatDate(refund.expectedBy)}</span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0">
        {isPending ? (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
            {t.pendingRefunds}
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
            {t.receivedRefunds}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RefundsClient({ refunds }: { refunds: RefundItem[] }) {
  const locale = useLanguageStore((s) => s.locale)
  const t = getT(locale)
  const dir = localeDir[locale]
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<RefundItem | null>(null)

  const pending = refunds
    .filter((r) => r.status === 'pending')
    .sort((a, b) => {
      if (a.expectedBy && b.expectedBy) return a.expectedBy.localeCompare(b.expectedBy)
      if (a.expectedBy) return -1
      if (b.expectedBy) return 1
      return b.createdAt.localeCompare(a.createdAt)
    })

  const received = refunds
    .filter((r) => r.status === 'received')
    .sort((a, b) => (b.receivedAt ?? b.createdAt).localeCompare(a.receivedAt ?? a.createdAt))

  return (
    <div className="refunds-page space-y-6" dir={dir}>
      {/* Page header */}
      <div className="refunds-page-header flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">{t.refundsTab}</h1>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t.addRefund}
        </button>
      </div>

      {/* Pending */}
      <section className="refunds-section-pending">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{t.pendingRefunds}</h2>
        {pending.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <p className="text-slate-500 font-medium mb-1">{t.noRefundsYet}</p>
            <p className="text-slate-400 text-sm">{t.addFirstRefundPrompt}</p>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-4 h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              {t.addRefund}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <RefundRow key={r.id} refund={r} onClick={() => setSelected(r)} />
            ))}
          </div>
        )}
      </section>

      {/* Received */}
      <section className="refunds-section-received">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{t.receivedRefunds}</h2>
        {received.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">{t.noReceivedRefunds}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {received.map((r) => (
              <RefundRow key={r.id} refund={r} onClick={() => setSelected(r)} />
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {showAdd && <AddRefundModal onClose={() => setShowAdd(false)} />}
      {selected && (
        <RefundDetailModal
          refund={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
