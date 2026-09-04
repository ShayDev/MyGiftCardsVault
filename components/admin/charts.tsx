// Hand-rolled chart primitives for /admin — no charting dependency. Built with
// flexbox + Tailwind rather than inline SVG (simpler, responsive for free, no
// viewBox/text-distortion math for the handful of bars Phase 1 needs). Pure
// presentational, no hooks — safe to render from a server component too.
// See plans/admin-menu-dd.md §4.

export function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-stat-tile rounded-2xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <p className="admin-stat-tile-label text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="admin-stat-tile-value mt-1 text-2xl font-bold font-mono text-slate-900 dark:text-neutral-200">
        {value.toLocaleString('en-US')}
      </p>
    </div>
  )
}

type Bar = { label: string; value: number; colorClass?: string }

/** Horizontal bar chart — one row per item, fill width relative to the max. */
export function BarChart({ data }: { data: Bar[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="admin-bar-chart flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="admin-bar-row flex items-center gap-3">
          <span className="admin-bar-label w-24 shrink-0 text-right text-xs text-slate-500 dark:text-neutral-400">
            {d.label}
          </span>
          <div className="admin-bar-track relative h-6 flex-1 rounded-md bg-slate-100 dark:bg-neutral-800">
            <div
              className={`admin-bar-fill absolute inset-y-0 left-0 rounded-md ${d.colorClass ?? 'bg-emerald-500'}`}
              style={{ width: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="admin-bar-value w-10 shrink-0 text-xs font-mono text-slate-700 dark:text-neutral-300">
            {d.value}
          </span>
        </div>
      ))}
    </div>
  )
}

type Series = { key: string; label: string; colorClass: string }
type Bucket = { label: string; segments: Record<string, number> }

/** Vertical stacked-column chart — one column per bucket, one segment per series. */
export function StackedBarChart({ buckets, series }: { buckets: Bucket[]; series: Series[] }) {
  const totals = buckets.map((b) => series.reduce((sum, s) => sum + (b.segments[s.key] ?? 0), 0))
  const max = Math.max(1, ...totals)

  return (
    <div className="admin-stacked-chart flex flex-col gap-3">
      <div className="admin-stacked-scroll overflow-x-auto">
        <div className="admin-stacked-plot flex h-44 items-end gap-1.5 min-w-[420px]">
          {buckets.map((b, i) => (
            <div key={`${b.label}-${i}`} className="admin-stacked-col flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="admin-stacked-bar flex w-full max-w-[26px] flex-col-reverse overflow-hidden rounded-sm"
                style={{ height: `${(totals[i] / max) * 100}%` }}
              >
                {series.map((s) => {
                  const v = b.segments[s.key] ?? 0
                  if (!v) return null
                  return (
                    <div
                      key={s.key}
                      className={s.colorClass}
                      style={{ flexGrow: v }}
                      title={`${b.label} · ${s.label}: ${v}`}
                    />
                  )
                })}
              </div>
              <span className="admin-stacked-xlabel w-full truncate text-center text-[10px] text-slate-400">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="admin-stacked-legend flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="admin-legend-item flex items-center gap-1.5 text-xs text-slate-500 dark:text-neutral-400">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.colorClass}`} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
