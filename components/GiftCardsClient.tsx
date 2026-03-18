'use client'

import React, { useState, useTransition } from 'react'
import { createCard, deactivateCard, createTransaction } from '../app/actions'

export type CardWithBalance = {
  id: string
  name: string
  provider: string
  last4?: string | null
  fullNumber?: string
  notes?: string
  isReloadable: boolean
  createdAt: string
  balance: number
}

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount)
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
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
        <div className="px-5 py-5">{children}</div>
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

// ── Add Card Modal ─────────────────────────────────────────────────────────────

function AddCardModal({ onClose }: { onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [isReloadable, setIsReloadable] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set('isReloadable', String(isReloadable))

    setError(null)
    startTransition(async () => {
      try {
        await createCard(fd)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create card')
      }
    })
  }

  return (
    <Modal title="Add New Card" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Card Name">
          <input name="name" required placeholder="e.g. Amazon Shopping" className={inputClass} />
        </Field>
        <Field label="Provider">
          <input name="provider" required placeholder="e.g. Amazon, Target, Starbucks" className={inputClass} />
        </Field>
        <Field label="Last 4 Digits">
          <input
            name="last4"
            required
            maxLength={4}
            minLength={4}
            pattern="[0-9]{4}"
            placeholder="1234"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Full Card Number (optional)">
          <input
            name="fullNumber"
            placeholder="e.g. 6006491234561234"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Default Balance (USD)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
            <input
              name="defaultBalance"
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} pl-7 font-mono`}
            />
          </div>
        </Field>
        <Field label="Notes (optional)">
          <input
            name="notes"
            placeholder="e.g. Birthday gift from mom"
            className={inputClass}
          />
        </Field>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-slate-700">Reloadable</p>
            <p className="text-xs text-slate-400">Can funds be added to this card?</p>
          </div>
          <button
            type="button"
            onClick={() => setIsReloadable(!isReloadable)}
            className={`relative w-11 h-6 rounded-full transition-colors ${isReloadable ? 'bg-emerald-500' : 'bg-slate-200'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isReloadable ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </div>
        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isPending ? 'Adding…' : 'Add Card'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Card Detail Modal ──────────────────────────────────────────────────────────

function CardDetailModal({
  card,
  onClose,
  onSpend,
  onRecharge,
  onDelete,
}: {
  card: CardWithBalance
  onClose: () => void
  onSpend: () => void
  onRecharge: () => void
  onDelete: () => void
}) {
  const [showFull, setShowFull] = useState(false)

  const maskedFull = card.fullNumber
    ? card.fullNumber.replace(/.(?=.{4})/g, '•')
    : null

  return (
    <Modal title="Card Details" onClose={onClose}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${providerColor(card.provider)}`}>
            {card.provider.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 truncate">{card.name}</p>
            <p className="text-xs text-slate-400">{card.provider}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-slate-400">Balance</p>
            <p className={`font-mono font-bold text-base ${card.balance > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {formatCurrency(card.balance)}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border border-slate-100 bg-white">
            <p className="text-xs text-slate-400 mb-1">Last 4 Digits</p>
            <p className="font-mono text-slate-700 font-medium tracking-widest">
              {card.last4 ? `•••• ${card.last4}` : '—'}
            </p>
          </div>
          <div className="p-3 rounded-xl border border-slate-100 bg-white">
            <p className="text-xs text-slate-400 mb-1">Type</p>
            {card.isReloadable ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Reloadable
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                One-time
              </span>
            )}
          </div>
          <div className="p-3 rounded-xl border border-slate-100 bg-white col-span-2">
            <p className="text-xs text-slate-400 mb-1">Added</p>
            <p className="text-sm text-slate-700">{formatDate(card.createdAt)}</p>
          </div>
        </div>

        {/* Full number */}
        {card.fullNumber && (
          <div className="p-3 rounded-xl border border-slate-100 bg-white">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-400">Full Card Number</p>
              <button
                type="button"
                onClick={() => setShowFull(!showFull)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {showFull ? 'Hide' : 'Reveal'}
              </button>
            </div>
            <p className="font-mono text-slate-700 text-sm tracking-wider break-all">
              {showFull ? card.fullNumber : maskedFull}
            </p>
          </div>
        )}

        {/* Notes */}
        {card.notes && (
          <div className="p-3 rounded-xl border border-slate-100 bg-white">
            <p className="text-xs text-slate-400 mb-1">Notes</p>
            <p className="text-sm text-slate-700">{card.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => { onClose(); onSpend() }}
            className="flex-1 min-h-[44px] text-sm font-medium rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
          >
            Spend
          </button>
          {card.isReloadable && (
            <button
              onClick={() => { onClose(); onRecharge() }}
              className="flex-1 min-h-[44px] text-sm font-medium rounded-xl border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
            >
              Recharge
            </button>
          )}
          <button
            onClick={() => { onClose(); onDelete() }}
            className="min-h-[44px] w-11 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors"
            title="Remove card"
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

// ── Transaction Modal ──────────────────────────────────────────────────────────

function TransactionModal({
  card,
  type,
  currentBalance,
  onClose,
}: {
  card: CardWithBalance
  type: 'SPEND' | 'RECHARGE'
  currentBalance: number
  onClose: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isSpend = type === 'SPEND'
  const amountNum = parseFloat(amount) || 0
  const projected = isSpend ? currentBalance - amountNum : currentBalance + amountNum

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!amountNum || amountNum <= 0) {
      setError('Enter a valid amount')
      return
    }
    if (isSpend && amountNum > currentBalance) {
      setError('Amount exceeds available balance')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await createTransaction({ cardId: card.id, type, amount: amountNum, notes: notes || undefined })
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Transaction failed')
      }
    })
  }

  return (
    <Modal title={isSpend ? 'Spend from Card' : 'Recharge Card'} onClose={onClose}>
      <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${providerColor(card.provider)}`}>
          {card.provider.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-800 text-sm truncate">{card.name}</p>
          <p className="text-xs text-slate-400">{card.provider}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Balance</p>
          <p className={`font-mono font-semibold text-sm ${currentBalance > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {formatCurrency(currentBalance)}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Amount (USD)">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} pl-7 font-mono`}
              required
            />
          </div>
        </Field>

        {amount && amountNum > 0 && (
          <div className={`flex items-center justify-between text-sm px-3 py-2 rounded-xl ${projected >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
            <span>New balance</span>
            <span className="font-mono font-semibold">{formatCurrency(projected)}</span>
          </div>
        )}

        <Field label="Notes (optional)">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Grocery run"
            className={inputClass}
          />
        </Field>

        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className={`flex-1 h-11 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-60 ${isSpend ? 'bg-rose-500 hover:bg-rose-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}
          >
            {isPending ? 'Saving…' : isSpend ? 'Confirm Spend' : 'Confirm Recharge'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Delete Confirm Dialog ──────────────────────────────────────────────────────

function DeleteDialog({ card, onClose }: { card: CardWithBalance; onClose: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    startTransition(async () => {
      try {
        await deactivateCard(card.id)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove card')
      }
    })
  }

  return (
    <Modal title="Remove Card" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 border border-rose-100">
          <svg className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-rose-700">This will hide the card</p>
            <p className="text-xs text-rose-500 mt-0.5">
              <strong>{card.name}</strong> will be marked inactive. All transaction history is preserved.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 h-11 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isPending ? 'Removing…' : 'Remove Card'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, iconClass, valueClass,
}: {
  label: string
  value: string
  icon: React.ReactNode
  iconClass: string
  valueClass?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className={`text-xl font-bold mt-0.5 ${valueClass ?? 'text-slate-800'}`}>{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

// ── Main Client Component ──────────────────────────────────────────────────────

type ModalState =
  | { type: 'none' }
  | { type: 'add-card' }
  | { type: 'detail'; card: CardWithBalance }
  | { type: 'transaction'; card: CardWithBalance; txType: 'SPEND' | 'RECHARGE' }
  | { type: 'delete'; card: CardWithBalance }

export default function GiftCardsClient({ cards, onAddCard }: { cards: CardWithBalance[]; onAddCard?: () => void }) {
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const totalBalance = cards.reduce((sum, c) => sum + c.balance, 0)
  const reloadableCount = cards.filter((c) => c.isReloadable).length
  const emptyCount = cards.filter((c) => c.balance <= 0).length

  const close = () => setModal({ type: 'none' })

  return (
    <>
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Balance"
            value={formatCurrency(totalBalance)}
            valueClass="text-emerald-600"
            iconClass="bg-emerald-50 text-emerald-600"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Total Cards"
            value={String(cards.length)}
            iconClass="bg-slate-100 text-slate-600"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            }
          />
          <StatCard
            label="Reloadable"
            value={String(reloadableCount)}
            iconClass="bg-blue-50 text-blue-600"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            }
          />
          <StatCard
            label="Empty Cards"
            value={String(emptyCount)}
            valueClass={emptyCount > 0 ? 'text-rose-600' : undefined}
            iconClass="bg-rose-50 text-rose-500"
            icon={
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            }
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 text-base">All Cards</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                {cards.length} card{cards.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setModal({ type: 'add-card' })}
                className="min-h-[36px] px-3 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Card
              </button>
            </div>
          </div>

          {cards.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <p className="text-slate-500 font-medium">No gift cards yet</p>
              <p className="text-sm text-slate-400 mt-1">Add your first card to get started.</p>
              <button
                onClick={() => setModal({ type: 'add-card' })}
                className="mt-4 min-h-[44px] px-5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Add First Card
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="text-left font-medium text-slate-500 px-5 py-3 w-[28%]">Card</th>
                      <th className="text-left font-medium text-slate-500 px-4 py-3">Provider</th>
                      <th className="text-left font-medium text-slate-500 px-4 py-3">Card #</th>
                      <th className="text-left font-medium text-slate-500 px-4 py-3">Type</th>
                      <th className="text-right font-medium text-slate-500 px-4 py-3">Balance</th>
                      <th className="text-left font-medium text-slate-500 px-4 py-3">Added</th>
                      <th className="text-right font-medium text-slate-500 px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cards.map((card) => (
                      <tr key={card.id} className="hover:bg-slate-50/70 transition-colors group">
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => setModal({ type: 'detail', card })}
                            className="flex items-center gap-3 text-left hover:opacity-75 transition-opacity"
                          >
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${providerColor(card.provider)}`}>
                              {card.provider.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium text-slate-800 truncate underline-offset-2 hover:underline">{card.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600">{card.provider}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-slate-500 tracking-widest text-xs">
                            {card.last4 ? `•••• ${card.last4}` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {card.isReloadable ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Reloadable
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              One-time
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`font-mono font-semibold text-sm ${card.balance > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {formatCurrency(card.balance)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(card.createdAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setModal({ type: 'transaction', card, txType: 'SPEND' })}
                              className="h-8 px-2.5 text-xs font-medium rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              Spend
                            </button>
                            {card.isReloadable && (
                              <button
                                onClick={() => setModal({ type: 'transaction', card, txType: 'RECHARGE' })}
                                className="h-8 px-2.5 text-xs font-medium rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                              >
                                Recharge
                              </button>
                            )}
                            <button
                              onClick={() => setModal({ type: 'delete', card })}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                              title="Remove card"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {cards.map((card) => (
                  <div key={card.id} className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${providerColor(card.provider)}`}>
                        {card.provider.slice(0, 2).toUpperCase()}
                      </div>
                      <button
                        onClick={() => setModal({ type: 'detail', card })}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="font-medium text-slate-800 truncate">{card.name}</div>
                        <div className="text-xs text-slate-400">
                          {card.provider}
                          {card.last4 && (
                            <span className="font-mono ml-1.5 tracking-widest">•••• {card.last4}</span>
                          )}
                        </div>
                      </button>
                      <div className="text-right flex-shrink-0">
                        <div className={`font-mono font-bold text-base ${card.balance > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {formatCurrency(card.balance)}
                        </div>
                        {card.isReloadable ? (
                          <span className="text-xs text-emerald-600">Reloadable</span>
                        ) : (
                          <span className="text-xs text-slate-400">One-time</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setModal({ type: 'transaction', card, txType: 'SPEND' })}
                        className="flex-1 min-h-[44px] text-sm font-medium rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        Spend
                      </button>
                      {card.isReloadable && (
                        <button
                          onClick={() => setModal({ type: 'transaction', card, txType: 'RECHARGE' })}
                          className="flex-1 min-h-[44px] text-sm font-medium rounded-xl border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          Recharge
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ type: 'delete', card })}
                        className="min-h-[44px] w-11 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {modal.type === 'add-card' && <AddCardModal onClose={close} />}
      {modal.type === 'detail' && (
        <CardDetailModal
          card={modal.card}
          onClose={close}
          onSpend={() => setModal({ type: 'transaction', card: modal.card, txType: 'SPEND' })}
          onRecharge={() => setModal({ type: 'transaction', card: modal.card, txType: 'RECHARGE' })}
          onDelete={() => setModal({ type: 'delete', card: modal.card })}
        />
      )}
      {modal.type === 'transaction' && (
        <TransactionModal
          card={modal.card}
          type={modal.txType}
          currentBalance={modal.card.balance}
          onClose={close}
        />
      )}
      {modal.type === 'delete' && <DeleteDialog card={modal.card} onClose={close} />}
    </>
  )
}
