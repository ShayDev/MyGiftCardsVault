"use client";

import React, { useRef, useState, useEffect, useTransition } from "react";
import {
  createRefund,
  updateRefund,
  markRefundReceived,
  markRefundUsed,
  useRefundAmount,
  deleteRefund,
  type RefundItem,
} from "../app/refunds/actions";
import { useLanguageStore } from "../hooks/useLanguageStore";
import { useCurrency } from "../hooks/useCurrency";
import { getT } from "../lib/i18n";
import { localeDir } from "../lib/i18n";
import { resolveCurrency } from "../lib/currency";
import { formatCode } from "../lib/formatCode";
import {
  formatExpiresAt,
  formatDate,
  formatDateSlashFull,
  isExpiringSoon,
} from "../lib/date";
import { resizeImage } from "../lib/resizeImage";
import { firstName } from "../lib/formatName";
import { useFamilyAttribution } from "../hooks/useFamilyAttributionStore";
import { adjustNavBadgeCount } from "../hooks/useNavBadgeCountsStore";
import { useSearchQueryStore } from "../hooks/useSearchQueryStore";
import type { ProviderOption } from "../lib/providerTypes";
import Spinner from "./Spinner";
import ProviderCombobox from "./ProviderCombobox";
import {
  extractImage,
  TextExtractArea,
  type ExtractedFields,
} from "./ScanButton";
import { HighlightMatch } from "./HighlightMatch";
import { ExpiryDaysBadge } from "./ExpiryDaysBadge";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  amazon: "bg-amber-100 text-amber-700",
  target: "bg-red-100 text-red-700",
  walmart: "bg-blue-100 text-blue-700",
  starbucks: "bg-green-100 text-green-700",
  apple: "bg-slate-100 text-slate-700",
  google: "bg-indigo-100 text-indigo-700",
  zara: "bg-zinc-100 text-zinc-700",
  ikea: "bg-yellow-100 text-yellow-700",
};

function providerColor(provider: string): string {
  const key = provider.toLowerCase();
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
  const palette = [
    "bg-violet-100 text-violet-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-orange-100 text-orange-700",
    "bg-cyan-100 text-cyan-700",
  ];
  return palette[provider.charCodeAt(0) % palette.length];
}

function formatAmount(
  amount: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// ── Modal Shell ────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = getT(useLanguageStore((s) => s.locale));
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      aria-labelledby="modal-title"
      className="modal-overlay fixed inset-0 z-50 w-full h-full m-0 max-w-none max-h-none border-0 bg-transparent p-0 sm:p-4 flex items-end sm:items-center justify-center backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="modal-panel relative w-full sm:max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="modal-header flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex-shrink-0">
          <h2
            id="modal-title"
            className="font-semibold text-slate-800 dark:text-neutral-100 text-base"
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-5 py-5 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}

// ── Field ──────────────────────────────────────────────────────────────────────

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700 dark:text-neutral-300">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

const inputClass =
  "w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 dark:bg-neutral-800 text-sm text-slate-800 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition";

// ── Add Refund Modal ───────────────────────────────────────────────────────────

function AddRefundModal({
  onClose,
  providerOptions,
  currency,
}: {
  onClose: () => void;
  providerOptions: ProviderOption[];
  currency: string | null;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const defaultCurrency = resolveCurrency(currency, locale);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<"photo" | "text">("text");
  const [providerPrefill, setProviderPrefill] = useState("");
  const [providerKey, setProviderKey] = useState(0);
  const amountRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLInputElement>(null);
  const referenceIdRef = useRef<HTMLInputElement>(null);
  const expiresAtRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  function applyExtractedFields(fields: ExtractedFields) {
    if (typeof fields.provider === "string") {
      setProviderPrefill(fields.provider);
      setProviderKey((k) => k + 1);
    }
    if (amountRef.current && typeof fields.amount === "number")
      amountRef.current.value = String(fields.amount);
    if (currencyRef.current && typeof fields.currency === "string")
      currencyRef.current.value = fields.currency.toUpperCase();
    if (referenceIdRef.current && typeof fields.referenceId === "string")
      referenceIdRef.current.value = fields.referenceId;
    if (expiresAtRef.current && typeof fields.expiresAt === "string")
      expiresAtRef.current.value = fields.expiresAt;
    if (codeRef.current && typeof fields.code === "string")
      codeRef.current.value = fields.code;
    if (linkRef.current && typeof fields.link === "string")
      linkRef.current.value = fields.link;
    if (
      notesRef.current &&
      !notesRef.current.value &&
      typeof fields.notes === "string"
    )
      notesRef.current.value = fields.notes;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0] ?? null;
    if (!rawFile) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    const file = await resizeImage(rawFile);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    setIsScanning(true);
    setScanError(null);
    try {
      applyExtractedFields(await extractImage(file, "REFUND"));
    } catch {
      setScanError(t.scanFailed);
    } finally {
      setIsScanning(false);
    }
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        if (imageFile) {
          const uploadForm = new FormData();
          uploadForm.append("file", imageFile);
          const res = await fetch("/api/upload", {
            method: "POST",
            body: uploadForm,
          });
          if (!res.ok) throw new Error("Image upload failed");
          const { url } = await res.json();
          fd.set("imageUrl", url);
        }
        await createRefund(fd);
        adjustNavBadgeCount("refunds", 1);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateRefund);
      }
    });
  }

  return (
    <Modal title={t.addNewRefund} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.refundImageOptional}>
          <div className="refund-scan-mode-toggle flex gap-1.5 mb-1.5">
            <button
              type="button"
              onClick={() => setScanMode("text")}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${scanMode === "text" ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"}`}
            >
              {t.scanModeText}
            </button>
            <button
              type="button"
              onClick={() => setScanMode("photo")}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${scanMode === "photo" ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"}`}
            >
              {t.scanModePhoto}
            </button>
          </div>
          {scanMode === "photo" ? (
            <>
              {imagePreview ? (
                <label className="refund-image-upload flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 overflow-hidden">
                  <img
                    src={imagePreview}
                    alt="preview"
                    className="w-full h-full object-cover"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              ) : (
                <div className="refund-image-triggers flex gap-2">
                  <label className="refund-image-camera flex-1 flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C3.163 7.54 2.5 8.36 2.5 9.315V18a2.25 2.25 0 002.25 2.25h14.5A2.25 2.25 0 0021.5 18V9.315c0-.955-.663-1.775-1.552-1.912a48.11 48.11 0 00-1.134-.174 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-4.552 0 2.192 2.192 0 00-1.736 1.039l-.822 1.316z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                      />
                    </svg>
                    <span className="text-xs mt-1">{t.scanTakePhoto}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  <label className="refund-image-gallery flex-1 flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 4.5h18a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 18V6A1.5 1.5 0 013 4.5z"
                      />
                    </svg>
                    <span className="text-xs mt-1">{t.scanChooseImage}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
              )}
              {isScanning && (
                <p className="refund-image-scanning flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <Spinner className="w-3 h-3" />
                  {t.scanning}
                </p>
              )}
              {scanError && (
                <p className="refund-image-scan-error text-xs text-rose-500 mt-1">
                  {scanError}
                </p>
              )}
              {imagePreview && !isScanning && (
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setImageFile(null);
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 mt-1"
                >
                  {t.removeCard}
                </button>
              )}
            </>
          ) : (
            <TextExtractArea
              entityType="REFUND"
              onExtracted={applyExtractedFields}
              t={t}
            />
          )}
        </Field>
        {/* Status radio */}
        <div className="flex gap-3">
          {(["received", "pending"] as const).map((s) => (
            <label
              key={s}
              className="flex-1 flex items-center gap-2 h-11 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-950 transition-colors"
            >
              <input
                type="radio"
                name="status"
                value={s}
                defaultChecked={s === "received"}
                className="accent-emerald-500"
              />
              <span className="text-sm text-slate-700 dark:text-neutral-200">
                {s === "received" ? t.receivedRefunds : t.pendingRefunds}
              </span>
            </label>
          ))}
        </div>

        <Field label={t.refundProvider} required>
          <ProviderCombobox
            key={providerKey}
            name="provider"
            required
            defaultValue={providerPrefill}
            options={providerOptions}
            placeholder="e.g. Zara, IKEA"
          />
        </Field>
        <div className="flex gap-3">
          <Field label={t.refundAmount} required>
            <input
              ref={amountRef}
              name="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={t.refundCurrency} required>
            <input
              ref={currencyRef}
              name="currency"
              required
              maxLength={3}
              defaultValue={defaultCurrency}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
              }}
              className={`${inputClass} font-mono uppercase w-24`}
            />
          </Field>
        </div>
        <Field label={t.refundReference}>
          <input
            ref={referenceIdRef}
            name="referenceId"
            placeholder={t.refundReferencePlaceholder}
            className={inputClass}
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
        <Field label={t.refundCode}>
          <input
            ref={codeRef}
            name="code"
            placeholder={t.refundCodePlaceholder}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label={t.refundLink}>
          <input
            ref={linkRef}
            name="link"
            type="url"
            placeholder={t.refundLinkPlaceholder}
            className={inputClass}
          />
        </Field>
        <Field label={t.notesOptional}>
          <input
            ref={notesRef}
            name="notes"
            placeholder={t.notesPlaceholder}
            className={inputClass}
          />
        </Field>

        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {t.adding}
              </span>
            ) : (
              t.addRefund
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit Refund Modal ──────────────────────────────────────────────────────────

function EditRefundModal({
  refund,
  onClose,
  providerOptions,
}: {
  refund: RefundItem;
  onClose: () => void;
  providerOptions: ProviderOption[];
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await updateRefund(refund.id, fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateRefund);
      }
    });
  }

  return (
    <Modal title={t.editRefund} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-3">
          {(["received", "pending"] as const).map((s) => (
            <label
              key={s}
              className="flex-1 flex items-center gap-2 h-11 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 cursor-pointer has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 dark:has-[:checked]:bg-emerald-950 transition-colors"
            >
              <input
                type="radio"
                name="status"
                value={s}
                defaultChecked={s === refund.status}
                className="accent-emerald-500"
              />
              <span className="text-sm text-slate-700 dark:text-neutral-200">
                {s === "received" ? t.receivedRefunds : t.pendingRefunds}
              </span>
            </label>
          ))}
        </div>
        <Field label={t.refundProvider} required>
          <ProviderCombobox
            name="provider"
            required
            defaultValue={refund.provider}
            options={providerOptions}
            placeholder="e.g. Zara, IKEA"
          />
        </Field>
        <div className="flex gap-3">
          <Field label={t.refundAmount} required>
            <input
              name="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="0.00"
              defaultValue={refund.amount}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={t.refundCurrency} required>
            <input
              name="currency"
              required
              maxLength={3}
              defaultValue={refund.currency}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
              }}
              className={`${inputClass} font-mono uppercase w-24`}
            />
          </Field>
        </div>
        <Field label={t.refundReference}>
          <input
            name="referenceId"
            placeholder={t.refundReferencePlaceholder}
            defaultValue={refund.referenceId ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label={t.expirationOptional}>
          <input
            name="expiresAt"
            type="date"
            defaultValue={refund.expiresAt ? refund.expiresAt.slice(0, 10) : ""}
            className={inputClass}
          />
        </Field>
        <Field label={t.refundCode}>
          <input
            name="code"
            placeholder={t.refundCodePlaceholder}
            defaultValue={refund.code ?? ""}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label={t.refundLink}>
          <input
            name="link"
            type="url"
            placeholder={t.refundLinkPlaceholder}
            defaultValue={refund.link ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label={t.notesOptional}>
          <input
            name="notes"
            placeholder={t.notesPlaceholder}
            defaultValue={refund.notes ?? ""}
            className={inputClass}
          />
        </Field>
        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {t.saving}
              </span>
            ) : (
              t.saveChanges
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Use Amount Modal ───────────────────────────────────────────────────────────

function UseAmountModal({
  refund,
  onClose,
  currency,
}: {
  refund: RefundItem;
  onClose: () => void;
  currency: string | null;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const { code: currencyCode } = useCurrency(currency);
  const remaining = refund.amount - refund.usedAmount;
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    if (val > remaining) {
      setError(t.amountExceedsRefund);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await useRefundAmount(refund.id, val);
        // Mirrors useRefundAmount's own "fully used" math in app/refunds/actions.ts — keep in sync.
        const fullyUsed = refund.usedAmount + val >= refund.amount;
        if (fullyUsed) adjustNavBadgeCount("refunds", -1);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateRefund);
      }
    });
  }

  return (
    <Modal title={t.useAmount} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 dark:bg-neutral-800 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">{t.refundRemaining}</span>
          <span
            className="text-sm font-mono font-semibold text-slate-800 dark:text-neutral-100"
            dir="ltr"
          >
            {formatAmount(remaining, currencyCode, t.currencyLocale)}
          </span>
        </div>
        <Field label={t.refundAmount}>
          <input
            type="number"
            min="0.01"
            max={remaining}
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} font-mono`}
            autoFocus
          />
        </Field>
        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={isPending || !amount}
            className="flex-1 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {t.saving}
              </span>
            ) : (
              t.useAmount
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Refund Detail Modal ────────────────────────────────────────────────────────

function RefundDetailModal({
  refund,
  onClose,
  onEdit,
  expiringSoonDays,
  currency,
}: {
  refund: RefundItem;
  onClose: () => void;
  onEdit: () => void;
  expiringSoonDays: number;
  currency: string | null;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const { code: currencyCode } = useCurrency(currency);
  const soon = (expiresAt: string | undefined) =>
    isExpiringSoon(expiresAt, expiringSoonDays);
  const [showCode, setShowCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [formattedCode, setFormattedCode] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { names: attributionNames, showAddedBy } = useFamilyAttribution();
  const addedByName =
    showAddedBy && refund.createdBy && attributionNames[refund.createdBy]
      ? firstName(attributionNames[refund.createdBy])
      : null;
  const [error, setError] = useState<string | null>(null);
  const [showUseAmount, setShowUseAmount] = useState(false);

  const maskedCode = refund.code
    ? refund.code.replace(/.(?=.{4})/g, "•")
    : null;

  function copyCode() {
    if (!refund.code) return;
    navigator.clipboard.writeText(refund.code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  }

  function handleToggleReceived() {
    setError(null);
    startTransition(async () => {
      try {
        await markRefundReceived(refund.id, refund.status !== "received");
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateRefund);
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteRefund(refund.id);
        if (!refund.isUsed) adjustNavBadgeCount("refunds", -1);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateRefund);
      }
    });
  }

  const isPending_ = refund.status === "pending";

  return (
    <Modal title={t.refundDetails} onClose={onClose}>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(refund.provider)}`}
          >
            {refund.provider}
          </span>
          <span className="text-slate-400 text-xs font-mono">
            #{refund.seq}
          </span>
          {isPending_ ? (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
              {t.pendingRefunds}
            </span>
          ) : (
            <span className="ml-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
              {t.receivedRefunds}
            </span>
          )}
        </div>

        {/* Amount */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.refundAmount}</p>
          <p className="text-2xl font-mono font-bold text-slate-800 dark:text-neutral-100" dir="ltr">
            {formatAmount(refund.amount, currencyCode, t.currencyLocale)}
          </p>
        </div>

        {/* Reference */}
        {refund.referenceId && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.refundReference}</p>
            <p className="text-sm font-mono text-slate-700 dark:text-neutral-200">
              {refund.referenceId}
            </p>
          </div>
        )}

        {/* Expires */}
        {refund.expiresAt && (
          <div
            className={
              soon(refund.expiresAt)
                ? "p-2 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800"
                : undefined
            }
          >
            <p className="text-xs text-slate-400 mb-0.5">{t.expires}</p>
            <p
              className={`text-sm font-mono flex items-center gap-1.5 ${soon(refund.expiresAt) ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-800 dark:text-neutral-100"}`}
            >
              {formatDateSlashFull(refund.expiresAt)}
              {soon(refund.expiresAt) && (
                <ExpiryDaysBadge expiresAt={refund.expiresAt} />
              )}
            </p>
          </div>
        )}

        {/* Received on */}
        {!isPending_ && refund.receivedAt && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">
              {t.refundReceivedOn}
            </p>
            <p className="text-sm text-slate-700 dark:text-neutral-200">
              {formatDate(refund.receivedAt, t.currencyLocale)}
            </p>
          </div>
        )}

        {/* Code */}
        {refund.code && (
          <div className="refund-code-section rounded-xl border border-slate-100 dark:border-neutral-800 bg-white dark:bg-neutral-800/60 overflow-hidden">
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
                <p
                  className="font-mono text-slate-800 dark:text-neutral-100 text-xl font-extrabold tracking-widest break-all"
                  dir="ltr"
                >
                  {formattedCode ? formatCode(refund.code) : refund.code}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormattedCode(!formattedCode)}
                    className="refund-format-btn flex items-center gap-1 h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-600 text-slate-500 dark:text-neutral-300 text-xs font-medium transition-colors"
                  >
                    {formattedCode ? "ABC..." : "ABCD-..."}
                  </button>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="refund-copy-btn flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-600 text-slate-600 dark:text-neutral-300 text-xs font-medium transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <svg
                          className="w-4 h-4 text-emerald-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        {t.copied}
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <rect
                            x="9"
                            y="9"
                            width="13"
                            height="13"
                            rx="2"
                            ry="2"
                          />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        {t.copy}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p
                className="font-mono text-slate-700 dark:text-neutral-200 text-sm tracking-wider break-all px-3 pb-3"
                dir="ltr"
              >
                {maskedCode}
              </p>
            )}
          </div>
        )}

        {/* Link */}
        {refund.link && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t.refundLink}</p>
            <div className="flex items-center gap-2">
              <a
                href={refund.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                {t.openLink}
              </a>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(refund.link!).then(() => {
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  });
                }}
                className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-600 text-slate-600 dark:text-neutral-300 text-xs font-medium transition-colors"
              >
                {copiedLink ? (
                  <svg
                    className="w-4 h-4 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
                {copiedLink ? t.copied : t.copy}
              </button>
            </div>
          </div>
        )}

        {/* Notes */}
        {refund.notes && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.notesLabel}</p>
            <p className="text-sm text-slate-700 dark:text-neutral-200">{refund.notes}</p>
          </div>
        )}

        {/* Image */}
        {refund.imageUrl && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">
              {t.refundImageOptional}
            </p>
            <a href={refund.imageUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={refund.imageUrl}
                alt="refund receipt"
                className="refund-image-thumbnail w-full max-h-48 object-cover rounded-xl border border-slate-100 dark:border-neutral-800 hover:opacity-90 transition-opacity"
              />
            </a>
          </div>
        )}

        {/* Added */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.dateAdded}</p>
          <p className="text-sm text-slate-700 dark:text-neutral-200">
            {formatDateSlashFull(refund.createdAt)}
            {addedByName && ` (${addedByName})`}
          </p>
        </div>

        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleToggleReceived}
            disabled={isPending}
            className={`flex-1 h-11 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 ${
              isPending_
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-slate-700 hover:bg-slate-800 text-white"
            }`}
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner />
                {t.saving}
              </span>
            ) : isPending_ ? (
              t.markAsReceived
            ) : (
              t.markAsPending
            )}
          </button>
          {!refund.isUsed && (
            <button
              type="button"
              onClick={() => setShowUseAmount(true)}
              disabled={isPending}
              className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-neutral-800 hover:bg-slate-200 dark:hover:bg-neutral-700 text-sm font-medium text-slate-700 dark:text-neutral-200 transition-colors disabled:opacity-60"
            >
              {t.useAmount}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              startTransition(async () => {
                try {
                  await markRefundUsed(refund.id, !refund.isUsed);
                  adjustNavBadgeCount("refunds", refund.isUsed ? 1 : -1);
                  onClose();
                } catch {
                  setError(t.failedToUpdateRefund);
                }
              });
            }}
            disabled={isPending}
            className="h-11 px-3 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-60"
          >
            {refund.isUsed ? t.markAsUnused : t.markAsUsed}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-slate-200 dark:border-neutral-700 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors"
            title={t.edit}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-rose-200 dark:border-rose-800 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors disabled:opacity-60"
            title={t.removeCard}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
      {showUseAmount && (
        <UseAmountModal
          refund={refund}
          onClose={() => {
            setShowUseAmount(false);
            onClose();
          }}
          currency={currency}
        />
      )}
    </Modal>
  );
}

// ── Refund Row ─────────────────────────────────────────────────────────────────

function RefundRow({
  refund,
  query,
  expiringSoonDays,
  onClick,
  onDelete,
  currency,
}: {
  refund: RefundItem;
  query: string;
  expiringSoonDays: number;
  onClick: () => void;
  onDelete?: () => Promise<void>;
  currency: string | null;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const { code: currencyCode } = useCurrency(currency);
  const dir = localeDir[locale];
  const isPending = refund.status === "pending";
  const [toggling, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    startDelete(async () => {
      await onDelete?.();
    });
  }

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    startToggle(async () => {
      await markRefundReceived(refund.id, isPending);
    });
  }

  const expiringSoon = isExpiringSoon(refund.expiresAt, expiringSoonDays);

  return (
    <div
      dir={dir}
      className={`refund-row w-full rounded-2xl border shadow-sm hover:shadow-md transition-all p-4 flex items-center gap-3 pr-2 ${
        expiringSoon
          ? "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60"
          : "bg-white dark:bg-neutral-900 border-slate-100 dark:border-neutral-800 hover:border-slate-200 dark:hover:border-neutral-700"
      }`}
    >
      {/* Radio toggle */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={toggling}
        title={isPending ? t.markAsReceived : t.markAsPending}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center transition-opacity disabled:opacity-40"
      >
        {isPending ? (
          <svg
            className="w-5 h-5 text-slate-300 hover:text-emerald-400 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="12" cy="12" r="9" />
          </svg>
        ) : (
          <svg
            className="w-5 h-5 text-emerald-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12 2a10 10 0 100 20A10 10 0 0012 2zm4.707 7.293a1 1 0 00-1.414 0L10 14.586l-2.293-2.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l6-6a1 1 0 000-1.414z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>

      {/* Clickable content */}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-3 text-start"
      >
        <span
          className="text-xs font-mono text-slate-400 flex-shrink-0 w-6"
          dir="ltr"
        >
          #{refund.seq}
        </span>
        <span
          className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(refund.provider)}`}
        >
          <HighlightMatch text={refund.provider} query={query} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2" dir="ltr">
            <p className="text-sm font-mono font-semibold text-slate-800 dark:text-neutral-100">
              {formatAmount(
                refund.amount - refund.usedAmount,
                currencyCode,
                t.currencyLocale,
              )}
            </p>
            {refund.usedAmount > 0 && (
              <p className="text-xs font-mono text-slate-400 line-through">
                {formatAmount(refund.amount, currencyCode, t.currencyLocale)}
              </p>
            )}
          </div>
          {refund.referenceId && (
            <div className="mt-0.5">
              <span className="text-xs font-mono text-slate-400 truncate">
                <HighlightMatch text={refund.referenceId} query={query} />
              </span>
            </div>
          )}
        </div>
        {refund.expiresAt && (
          <div className="flex-shrink-0 text-xs font-mono">
            <div className="text-slate-400">{t.expires}</div>
            <div
              className={`flex items-center gap-1.5 ${expiringSoon ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-400"}`}
            >
              {formatExpiresAt(refund.expiresAt)}
              {expiringSoon && <ExpiryDaysBadge expiresAt={refund.expiresAt} />}
            </div>
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
          {deleting ? (
            <Spinner />
          ) : (
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function RefundsClient({
  refunds,
  providerOptions,
  expiringSoonDays,
  currency,
}: {
  refunds: RefundItem[];
  providerOptions: ProviderOption[];
  expiringSoonDays: number;
  currency: string | null;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const dir = localeDir[locale];
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<RefundItem | null>(null);
  const [editTarget, setEditTarget] = useState<RefundItem | null>(null);
  const [showUsed, setShowUsed] = useState(false);

  // Preserves the query's expiresAt-ascending order (app/refunds/page.tsx) — no re-sort here.
  const active = refunds.filter((r) => !r.isUsed);
  const used = refunds.filter((r) => r.isUsed);

  const rawQuery = useSearchQueryStore((s) => s.query).trim();
  const query = rawQuery.toLowerCase();
  const matchesQuery = (r: RefundItem) =>
    !query ||
    r.provider.toLowerCase().includes(query) ||
    (r.notes?.toLowerCase().includes(query) ?? false) ||
    (r.referenceId?.toLowerCase().includes(query) ?? false) ||
    (r.code?.toLowerCase().includes(query) ?? false);
  const visibleActive = active.filter(matchesQuery);
  const visibleUsed = used.filter(matchesQuery);

  return (
    <div className="refunds-page space-y-6" dir={dir}>
      {/* Page header */}
      <div className="refunds-page-header flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-neutral-400">{t.refundsTab}</h1>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v16m8-8H4"
            />
          </svg>
          {t.addRefund}
        </button>
      </div>

      {/* Active */}
      <section className="refunds-section-active">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            {t.activeVouchers}
          </h2>
          {visibleActive.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
              {visibleActive.length}
            </span>
          )}
        </div>
        {active.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-8 text-center">
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
        ) : visibleActive.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-8 text-center">
            <p className="text-slate-400 text-sm">
              {t.searchNoResults(rawQuery)}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleActive.map((r) => (
              <RefundRow
                key={r.id}
                refund={r}
                query={rawQuery}
                expiringSoonDays={expiringSoonDays}
                onClick={() => setSelected(r)}
                currency={currency}
              />
            ))}
          </div>
        )}
      </section>

      {/* Used */}
      <section className="refunds-section-used">
        <button
          onClick={() => setShowUsed((v) => !v)}
          className="flex items-center gap-2 mb-3 w-full text-left"
        >
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
            {t.usedVouchers}
          </h2>
          {visibleUsed.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
              {visibleUsed.length}
            </span>
          )}
          <svg
            className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${showUsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {showUsed && used.length > 0 && visibleUsed.length === 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">
              {t.searchNoResults(rawQuery)}
            </p>
          </div>
        )}
        {showUsed && visibleUsed.length > 0 && (
          <div className="space-y-2">
            {visibleUsed.map((r) => (
              <RefundRow
                key={r.id}
                refund={r}
                query={rawQuery}
                expiringSoonDays={expiringSoonDays}
                onClick={() => setSelected(r)}
                onDelete={() => deleteRefund(r.id)}
                currency={currency}
              />
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {showAdd && (
        <AddRefundModal
          onClose={() => setShowAdd(false)}
          providerOptions={providerOptions}
          currency={currency}
        />
      )}
      {selected && (
        <RefundDetailModal
          refund={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditTarget(selected);
            setSelected(null);
          }}
          expiringSoonDays={expiringSoonDays}
          currency={currency}
        />
      )}
      {editTarget && (
        <EditRefundModal
          refund={editTarget}
          onClose={() => setEditTarget(null)}
          providerOptions={providerOptions}
        />
      )}
    </div>
  );
}
