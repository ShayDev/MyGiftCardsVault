'use client'

import React, { useState, useTransition } from 'react'
import { createVoucher, markVoucherUsed, deleteVoucher, type VoucherItem } from '../app/vouchers/actions'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'
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

// ── Add Voucher Modal ──────────────────────────────────────────────────────────

function AddVoucherModal({ onClose }: { onClose: () => void }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    setError(null)
    startTransition(async () => {
      try {
        await createVoucher(fd)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateVoucher)
      }
    })
  }

  return (
    <Modal title={t.addNewVoucher} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.voucherName}>
          <input name="name" required placeholder="e.g. Birthday Discount" className={inputClass} />
        </Field>
        <Field label={t.providerLabel}>
          <input name="provider" required placeholder={t.providerPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.voucherCode}>
          <input name="code" placeholder={t.voucherCodePlaceholder} className={`${inputClass} font-mono`} />
        </Field>
        <Field label={t.voucherLink}>
          <input name="link" type="url" placeholder={t.voucherLinkPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.voucherValueOptional}>
          <input
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
  onUpdated,
}: {
  voucher: VoucherItem
  onClose: () => void
  onUpdated: () => void
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [showCode, setShowCode] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [formattedCode, setFormattedCode] = useState(true)
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
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(voucher.provider)}`}>
            {voucher.provider}
          </span>
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
            <p className="text-xs text-slate-400 mb-0.5">{t.voucherLink}</p>
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
          </div>
        )}

        {/* Value */}
        {voucher.value !== undefined && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.voucherValueOptional}</p>
            <p className="text-sm font-mono font-semibold text-slate-800">{voucher.value.toFixed(2)}</p>
          </div>
        )}

        {/* Expiry */}
        {voucher.expiresAt && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.expires}</p>
            <p className="text-sm font-mono text-slate-800">{`${voucher.expiresAt!.slice(0, 2)}/${voucher.expiresAt!.slice(2)}`}</p>
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
            <p className="text-sm text-slate-700">{formatDate(voucher.usedAt)}</p>
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
          <p className="text-sm text-slate-700">{formatDate(voucher.createdAt)}</p>
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

// ── Voucher Row ────────────────────────────────────────────────────────────────

function VoucherRow({ voucher, onClick, onDelete }: { voucher: VoucherItem; onClick: () => void; onDelete?: () => Promise<void> }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [deleting, startDelete] = useTransition()

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    startDelete(async () => { await onDelete?.() })
  }

  return (
    <div className="voucher-row w-full bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all flex items-center gap-3 pr-2">
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left p-4 flex items-center gap-3"
      >
        <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-right">#{voucher.seq}</span>
        <div className="flex-shrink-0">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(voucher.provider)}`}>
            {voucher.provider}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{voucher.name}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {voucher.value !== undefined && (
              <span className="text-xs font-mono text-slate-500">{voucher.value.toFixed(2)}</span>
            )}
            {voucher.expiresAt && (
              <span className="text-xs font-mono text-slate-400">{`${voucher.expiresAt!.slice(0, 2)}/${voucher.expiresAt!.slice(2)}`}</span>
            )}
          </div>
        </div>
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

export default function VouchersClient({ vouchers }: { vouchers: VoucherItem[] }) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<VoucherItem | null>(null)

  const active = vouchers.filter((v) => !v.isUsed)
  const used = vouchers.filter((v) => v.isUsed)

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
          {active.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{active.length}</span>
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
        ) : (
          <div className="space-y-2">
            {active.map((v) => (
              <VoucherRow key={v.id} voucher={v} onClick={() => setSelected(v)} />
            ))}
          </div>
        )}
      </section>

      {/* Used vouchers */}
      <section className="vouchers-section-used">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t.usedVouchers}</h2>
          {used.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{used.length}</span>
          )}
        </div>
        {used.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">{t.noUsedVouchers}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {used.map((v) => (
              <VoucherRow key={v.id} voucher={v} onClick={() => setSelected(v)} onDelete={() => deleteVoucher(v.id)} />
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {showAdd && <AddVoucherModal onClose={() => setShowAdd(false)} />}
      {selected && (
        <VoucherDetailModal
          voucher={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => setSelected(null)}
        />
      )}
    </div>
  )
}
