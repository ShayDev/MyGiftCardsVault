'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { StatTile, BarChart, StackedBarChart } from './admin/charts'
import { formatDateSlashFull } from '../lib/date'
import type { ContentTotals, FamilyRow, MonthlyRow } from '../lib/adminStats'

// English-only by design — this is an operator console, not user-facing chrome.
// See plans/admin-menu-hld.md.

const SERIES = [
  { key: 'cards', label: 'Cards', colorClass: 'bg-emerald-500' },
  { key: 'vouchers', label: 'Vouchers', colorClass: 'bg-sky-500' },
  { key: 'refunds', label: 'Refunds', colorClass: 'bg-rose-500' },
  { key: 'clubs', label: 'Clubs', colorClass: 'bg-amber-500' },
  { key: 'warranties', label: 'Warranties', colorClass: 'bg-violet-500' },
] as const

type Props = {
  recordsByMonth: MonthlyRow[]
  totals: ContentTotals
  families: FamilyRow[]
}

type FamilySortKey = keyof FamilyRow

const FAMILY_COLUMNS: { key: FamilySortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Family' },
  { key: 'members', label: 'Members', numeric: true },
  { key: 'cards', label: 'Cards', numeric: true },
  { key: 'vouchers', label: 'Vouchers', numeric: true },
  { key: 'refunds', label: 'Refunds', numeric: true },
  { key: 'clubs', label: 'Clubs', numeric: true },
  { key: 'warranties', label: 'Warranties', numeric: true },
  { key: 'createdAt', label: 'Created', numeric: true },
  { key: 'lastActivityAt', label: 'Last activity', numeric: true },
]

export default function AdminClient({ recordsByMonth, totals, families }: Props) {
  const buckets = useMemo(() => {
    const now = new Date()
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
    }
    return months.map((ym) => {
      const segments: Record<string, number> = {}
      for (const s of SERIES) {
        segments[s.key] = recordsByMonth.find((r) => r.month === ym && r.entity === s.key)?.count ?? 0
      }
      const [y, mm] = ym.split('-').map(Number)
      const label = new Date(y, mm - 1, 1).toLocaleDateString('en-US', { month: 'short' })
      return { label, segments }
    })
  }, [recordsByMonth])

  const totalsBar = SERIES.map((s) => ({
    label: s.label,
    value: totals[s.key],
    colorClass: s.colorClass,
  }))

  // Sum of the five trackable-content entities only — deliberately excludes
  // families/users, which are a different kind of count (accounts, not items).
  const totalItems = SERIES.reduce((sum, s) => sum + totals[s.key], 0)

  const [sortKey, setSortKey] = useState<FamilySortKey>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sortedFamilies = useMemo(() => {
    const rows = [...families]
    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      let cmp: number
      if (av == null && bv == null) cmp = 0
      else if (av == null) cmp = -1
      else if (bv == null) cmp = 1
      else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv
      else cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [families, sortKey, sortDir])

  function toggleSort(key: FamilySortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="admin-page flex flex-col gap-6" dir="ltr">
      <div className="admin-header flex items-center justify-between gap-3">
        <h1 className="admin-title text-xl font-bold text-slate-900 dark:text-neutral-200">Admin</h1>
        <Link
          href="/cards"
          className="admin-back text-sm text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
        >
          &larr; Back to app
        </Link>
      </div>

      <section className="admin-totals-section flex flex-col gap-4">
        <h2 className="admin-section-title text-sm font-semibold uppercase tracking-wide text-slate-500">
          Content totals
        </h2>
        <div className="admin-totals-grid grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total Items" value={totalItems} highlight />
          <StatTile label="Cards" value={totals.cards} />
          <StatTile label="Vouchers" value={totals.vouchers} />
          <StatTile label="Refunds" value={totals.refunds} />
          <StatTile label="Clubs" value={totals.clubs} />
          <StatTile label="Warranties" value={totals.warranties} />
          <StatTile label="Families" value={totals.families} />
          <StatTile label="Users" value={totals.users} />
        </div>
        <div className="admin-totals-chart rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
          <BarChart data={totalsBar} />
        </div>
      </section>

      <section className="admin-records-section flex flex-col gap-4">
        <h2 className="admin-section-title text-sm font-semibold uppercase tracking-wide text-slate-500">
          Records created (last 12 months)
        </h2>
        <div className="admin-records-chart rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
          <StackedBarChart buckets={buckets} series={SERIES.map((s) => ({ ...s }))} />
        </div>
      </section>

      <section className="admin-families-section flex flex-col gap-4">
        <h2 className="admin-section-title text-sm font-semibold uppercase tracking-wide text-slate-500">
          Families ({families.length})
        </h2>
        <div className="admin-families-scroll overflow-x-auto rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
          <table className="admin-families-table w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-neutral-700 text-left text-xs uppercase tracking-wide text-slate-400">
                {FAMILY_COLUMNS.map((col) => (
                  <th key={col.key} className={`px-3 py-2.5 font-semibold ${col.numeric ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="admin-col-sort inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {col.label}
                      {sortKey === col.key && <span aria-hidden>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFamilies.map((f) => (
                <tr
                  key={f.id}
                  className="admin-family-row border-b border-slate-100 last:border-0 dark:border-neutral-800"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-neutral-200">{f.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-neutral-400">{f.members}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-neutral-400">{f.cards}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-neutral-400">{f.vouchers}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-neutral-400">{f.refunds}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-neutral-400">{f.clubs}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-neutral-400">{f.warranties}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500 dark:text-neutral-500">
                    {formatDateSlashFull(f.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-500 dark:text-neutral-500">
                    {f.lastActivityAt ? formatDateSlashFull(f.lastActivityAt) : '—'}
                  </td>
                </tr>
              ))}
              {sortedFamilies.length === 0 && (
                <tr>
                  <td colSpan={FAMILY_COLUMNS.length} className="px-3 py-6 text-center text-slate-400">
                    No families yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
