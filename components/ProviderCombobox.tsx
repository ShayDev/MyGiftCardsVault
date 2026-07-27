'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT } from '../lib/i18n'
import type { ProviderOption } from '../lib/providerTypes'

const inputClass =
  'w-full h-11 px-3 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition'

function matches(option: ProviderOption, query: string): boolean {
  const q = query.toLowerCase()
  return (
    option.display.toLowerCase().includes(q) ||
    (option.name?.toLowerCase().includes(q) ?? false) ||
    (option.nameByCountry?.toLowerCase().includes(q) ?? false)
  )
}

function isExactMatch(option: ProviderOption, query: string): boolean {
  const q = query.toLowerCase()
  return (
    option.display.toLowerCase() === q ||
    option.name?.toLowerCase() === q ||
    option.nameByCountry?.toLowerCase() === q
  )
}

export default function ProviderCombobox({
  name,
  defaultValue,
  options,
  placeholder,
  required,
}: {
  name: string
  defaultValue?: string
  options: ProviderOption[]
  placeholder?: string
  required?: boolean
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [query, setQuery] = useState(defaultValue ?? '')
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

  const filtered = query.trim() ? options.filter((o) => matches(o, query.trim())) : options
  const showAddRow = query.trim().length > 0 && !filtered.some((o) => isExactMatch(o, query.trim()))
  const rowCount = filtered.length + (showAddRow ? 1 : 0)

  function selectOption(option: ProviderOption) {
    setQuery(option.display)
    setOpen(false)
  }

  function selectAddRow() {
    setOpen(false)
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
    <div ref={rootRef} className="provider-combobox relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="provider-combobox-listbox"
        name={name}
        value={query}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={inputClass}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
          setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && rowCount > 0 && (
        <div
          id="provider-combobox-listbox"
          role="listbox"
          className="provider-combobox-panel absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {filtered.map((option, i) => (
            <button
              key={option.display}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(option)}
              className={`provider-combobox-option flex min-h-11 w-full items-center px-3 text-left text-sm ${
                i === highlighted ? 'bg-emerald-50 text-emerald-700' : 'text-slate-700 hover:bg-slate-50'
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
              className={`provider-combobox-add-option flex min-h-11 w-full items-center gap-1.5 px-3 text-left text-sm font-medium text-emerald-600 ${
                filtered.length === highlighted ? 'bg-emerald-50' : 'hover:bg-slate-50'
              }`}
            >
              <span>+</span>
              <span>{t.addProviderOption} &ldquo;{query.trim()}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
