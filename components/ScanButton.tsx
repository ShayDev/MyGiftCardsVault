'use client'

import React, { useState } from 'react'
import { useLanguageStore } from '../hooks/useLanguageStore'
import { getT, type Translations } from '../lib/i18n'
import Spinner from './Spinner'

export type ExtractedFields = Record<string, string | number>
export type EntityType = 'CARD' | 'VOUCHER' | 'REFUND'

export async function extractImage(file: File, entityType: EntityType): Promise<ExtractedFields> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('entityType', entityType)
  const res = await fetch('/api/extract', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data.fields
}

export async function extractText(text: string, entityType: EntityType): Promise<ExtractedFields> {
  const fd = new FormData()
  fd.append('text', text)
  fd.append('entityType', entityType)
  const res = await fetch('/api/extract', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error)
  return data.fields
}

/** Textarea + extract button. Standalone so RefundsClient (which has its own photo dropzone) can use just this half. */
export function TextExtractArea({
  entityType,
  onExtracted,
  t,
}: {
  entityType: EntityType
  onExtracted: (fields: ExtractedFields) => void
  t: Translations
}) {
  const [text, setText] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExtract() {
    if (!text.trim()) return
    setIsScanning(true)
    setError(null)
    try {
      onExtracted(await extractText(text, entityType))
    } catch {
      setError(t.scanTextFailed)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="scan-text-area">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.scanTextPlaceholder}
        rows={4}
        disabled={isScanning}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
      />
      <button
        type="button"
        onClick={handleExtract}
        disabled={isScanning || !text.trim()}
        className="scan-text-extract-button mt-2 h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
      >
        {isScanning ? <span className="flex items-center gap-2"><Spinner className="w-3.5 h-3.5" />{t.scanning}</span> : t.scanTextButton}
      </button>
      {error && <p className="scan-text-error text-xs text-rose-500 mt-1">{error}</p>}
    </div>
  )
}

export default function ScanButton({
  entityType,
  onExtracted,
}: {
  entityType: EntityType
  onExtracted: (fields: ExtractedFields) => void
}) {
  const t = getT(useLanguageStore((s) => s.locale))
  const [mode, setMode] = useState<'photo' | 'text'>('text')
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setIsScanning(true)
    setError(null)
    try {
      onExtracted(await extractImage(file, entityType))
    } catch {
      setError(t.scanFailed)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="scan-button-wrapper">
      <div className="scan-mode-toggle flex gap-1.5 mb-1.5">
        <button
          type="button"
          onClick={() => setMode('text')}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${mode === 'text' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-100'}`}
        >
          {t.scanModeText}
        </button>
        <button
          type="button"
          onClick={() => setMode('photo')}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors ${mode === 'photo' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:bg-slate-100'}`}
        >
          {t.scanModePhoto}
        </button>
      </div>
      {mode === 'photo' ? (
        <>
          <label className="scan-button flex items-center justify-center gap-2 h-11 px-4 rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-400 cursor-pointer transition-colors bg-slate-50 hover:bg-emerald-50 text-sm font-medium text-slate-600">
            {isScanning ? (
              <>
                <Spinner />
                <span>{t.scanning}</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C3.163 7.54 2.5 8.36 2.5 9.315V18a2.25 2.25 0 002.25 2.25h14.5A2.25 2.25 0 0021.5 18V9.315c0-.955-.663-1.775-1.552-1.912a48.11 48.11 0 00-1.134-.174 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-4.552 0 2.192 2.192 0 00-1.736 1.039l-.822 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
                <span>{t.scanButton}</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isScanning}
              onChange={handleFileChange}
            />
          </label>
          {error && <p className="scan-button-error text-xs text-rose-500 mt-1">{error}</p>}
        </>
      ) : (
        <TextExtractArea entityType={entityType} onExtracted={onExtracted} t={t} />
      )}
    </div>
  )
}
