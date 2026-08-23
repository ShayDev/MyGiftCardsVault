'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'
import type { WarrantyProviderOption } from '../app/warranties/actions'

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'

const smallInputClass =
  'w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 text-xs text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'

function matches(option: WarrantyProviderOption, query: string): boolean {
  const q = query.toLowerCase()
  return (
    option.display.toLowerCase().includes(q) ||
    (option.name?.toLowerCase().includes(q) ?? false) ||
    (option.nameByCountry?.toLowerCase().includes(q) ?? false)
  )
}

function isExactMatch(option: WarrantyProviderOption, query: string): boolean {
  const q = query.toLowerCase()
  return (
    option.display.toLowerCase() === q ||
    option.name?.toLowerCase() === q ||
    option.nameByCountry?.toLowerCase() === q
  )
}

/**
 * Sibling of ProviderCombobox, not a reuse of it — this one resolves to a
 * real WarrantyProvider row id (a required FK on Warranty), and surfaces
 * phone/url which the generic Provider table never needed. See
 * plans/warranty-dd.md §3.
 */
export default function WarrantyProviderCombobox({
  name,
  options,
  defaultValue,
  prefillName,
  required,
  placeholder,
}: {
  name: string
  options: WarrantyProviderOption[]
  /** Edit mode: the warranty's actual existing selection — always a real WarrantyProvider row. */
  defaultValue?: WarrantyProviderOption
  /** Add mode, e.g. from AI scan: a plain name with no known id yet — matched
   *  against `options` case-insensitively; falls back to free text if no match. */
  prefillName?: string
  required?: boolean
  placeholder?: string
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const resolvedDefault =
    defaultValue ?? (prefillName ? options.find((o) => isExactMatch(o, prefillName)) : undefined)
  const [query, setQuery] = useState(resolvedDefault?.display ?? prefillName ?? '')
  const [selected, setSelected] = useState<WarrantyProviderOption | null>(resolvedDefault ?? null)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const trimmed = query.trim()
  const filtered = trimmed ? options.filter((o) => matches(o, trimmed)) : options
  const showAddRow = trimmed.length > 0 && !filtered.some((o) => isExactMatch(o, trimmed))
  const rowCount = filtered.length + (showAddRow ? 1 : 0)
  const isNewEntry = !selected && trimmed.length > 0

  function selectOption(option: WarrantyProviderOption) {
    setQuery(option.display)
    setSelected(option)
    setPhoneDraft('')
    setUrlDraft('')
    setOpen(false)
  }

  function selectAddRow() {
    setOpen(false)
  }

  function handleChange(value: string) {
    setQuery(value)
    setSelected(null) // typing after a selection invalidates it — reselect or create new
    setHighlighted(0)
    setOpen(true)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown') setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((i) => Math.min(i + 1, rowCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted < filtered.length) {
        selectOption(filtered[highlighted])
      } else if (showAddRow) {
        selectAddRow()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="warranty-provider-combobox relative space-y-1.5">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={`${name}-combobox-listbox`}
        value={query}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={inputClass}
        onFocus={() => setOpen(true)}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {/* Real submitted fields — the visible input above is unnamed on purpose,
          so a stray extra FormData entry never collides with these. */}
      <input type="hidden" name={`${name}Id`} value={selected?.id ?? ''} />
      <input type="hidden" name={`${name}Name`} value={selected ? '' : trimmed} />
      <input type="hidden" name={`${name}Phone`} value={selected ? '' : phoneDraft.trim()} />
      <input type="hidden" name={`${name}Url`} value={selected ? '' : urlDraft.trim()} />

      {selected && (selected.phone || selected.url) && (
        <p className="warranty-provider-contact-preview text-xs text-slate-400 flex flex-wrap gap-x-3">
          {selected.phone && <span dir="ltr">{selected.phone}</span>}
          {selected.url && <span dir="ltr">{selected.url}</span>}
        </p>
      )}

      {isNewEntry && (
        <div className="warranty-provider-new-contact grid grid-cols-2 gap-2">
          <input
            type="tel"
            value={phoneDraft}
            onChange={(e) => setPhoneDraft(e.target.value)}
            placeholder={t.warrantyCompanyPhone}
            className={smallInputClass}
            dir="ltr"
          />
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder={t.warrantyCompanyUrl}
            className={smallInputClass}
            dir="ltr"
          />
        </div>
      )}

      {open && rowCount > 0 && (
        <div
          id={`${name}-combobox-listbox`}
          role="listbox"
          className="warranty-provider-combobox-panel absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg"
        >
          {filtered.map((option, i) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(option)}
              className={`warranty-provider-combobox-option flex min-h-11 w-full items-center px-3 text-left text-sm ${
                i === highlighted ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-800'
              }`}
            >
              {option.display}
            </button>
          ))}
          {showAddRow && (
            <button
              type="button"
              role="option"
              aria-selected={filtered.length === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onClick={selectAddRow}
              className={`warranty-provider-combobox-add-option flex min-h-11 w-full items-center gap-1.5 px-3 text-left text-sm font-medium text-emerald-600 dark:text-emerald-400 ${
                filtered.length === highlighted ? 'bg-emerald-50 dark:bg-emerald-950' : 'hover:bg-slate-50 dark:hover:bg-neutral-800'
              }`}
            >
              <span>+</span>
              <span>{t.addProviderOption} &ldquo;{trimmed}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
