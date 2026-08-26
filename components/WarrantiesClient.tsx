"use client";

import React, { useRef, useState, useEffect, useTransition } from "react";
import {
  createWarranty,
  updateWarranty,
  deleteWarranty,
  type WarrantyItem,
  type WarrantyProviderOption,
} from "../app/warranties/actions";
import { useLanguageStore } from "../hooks/useLanguageStore";
import { getT } from "../lib/i18n";
import { localeDir } from "../lib/i18n";
import { formatDateSlashFull, daysUntil, isExpiringSoon } from "../lib/date";
import { resizeImage } from "../lib/resizeImage";
import { firstName } from "../lib/formatName";
import { useFamilyAttribution } from "../hooks/useFamilyAttributionStore";
import { adjustNavBadgeCount } from "../hooks/useNavBadgeCountsStore";
import { useSearchQueryStore } from "../hooks/useSearchQueryStore";
import { resolveCurrency } from "../lib/currency";
import Spinner from "./Spinner";
import WarrantyProviderCombobox from "./WarrantyProviderCombobox";
import { extractImage, TextExtractArea, type ExtractedFields } from "./ScanButton";
import { HighlightMatch } from "./HighlightMatch";
import { ExpiryDaysBadge } from "./ExpiryDaysBadge";

// ── Helpers ────────────────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  samsung: "bg-blue-100 text-blue-700",
  lg: "bg-rose-100 text-rose-700",
  apple: "bg-slate-100 text-slate-700",
  ikea: "bg-yellow-100 text-yellow-700",
  bosch: "bg-red-100 text-red-700",
};

function providerColor(name: string): string {
  const key = name.toLowerCase();
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
  const palette = [
    "bg-violet-100 text-violet-700",
    "bg-pink-100 text-pink-700",
    "bg-teal-100 text-teal-700",
    "bg-orange-100 text-orange-700",
    "bg-cyan-100 text-cyan-700",
  ];
  return palette[name.charCodeAt(0) % palette.length];
}

function isExpired(w: WarrantyItem): boolean {
  return w.expiresAt !== undefined && daysUntil(w.expiresAt) < 0;
}

function formatAmount(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
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
          <h2 id="modal-title" className="font-semibold text-slate-800 dark:text-neutral-100 text-base">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label={t.close}
            className="w-11 h-11 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

// ── Add Warranty Modal ─────────────────────────────────────────────────────────

function AddWarrantyModal({
  onClose,
  providerOptions,
  currency,
}: {
  onClose: () => void;
  providerOptions: WarrantyProviderOption[];
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
  const [purchasedFromPrefill, setPurchasedFromPrefill] = useState("");
  const [purchasedFromKey, setPurchasedFromKey] = useState(0);
  const [claimElsewhere, setClaimElsewhere] = useState(false);

  const productNameRef = useRef<HTMLInputElement>(null);
  const branchRef = useRef<HTMLInputElement>(null);
  const purchaseDateRef = useRef<HTMLInputElement>(null);
  const durationMonthsRef = useRef<HTMLInputElement>(null);
  const expiresAtRef = useRef<HTMLInputElement>(null);
  const purchasePriceRef = useRef<HTMLInputElement>(null);
  const currencyRef = useRef<HTMLInputElement>(null);
  const referenceIdRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  function recomputeExpiresAt() {
    const pd = purchaseDateRef.current?.value;
    const dm = durationMonthsRef.current?.value;
    if (!pd || !dm || !expiresAtRef.current) return;
    const months = parseInt(dm, 10);
    if (!Number.isFinite(months) || months <= 0) return;
    const d = new Date(pd);
    d.setMonth(d.getMonth() + months);
    expiresAtRef.current.value = d.toISOString().slice(0, 10);
  }

  function applyExtractedFields(fields: ExtractedFields) {
    if (productNameRef.current && typeof fields.productName === "string")
      productNameRef.current.value = fields.productName;
    if (typeof fields.purchasedFrom === "string") {
      setPurchasedFromPrefill(fields.purchasedFrom);
      setPurchasedFromKey((k) => k + 1);
    }
    if (branchRef.current && typeof fields.branch === "string")
      branchRef.current.value = fields.branch;
    if (purchaseDateRef.current && typeof fields.purchaseDate === "string")
      purchaseDateRef.current.value = fields.purchaseDate;
    if (durationMonthsRef.current && typeof fields.durationMonths === "number")
      durationMonthsRef.current.value = String(fields.durationMonths);
    if (purchasePriceRef.current && typeof fields.purchasePrice === "number")
      purchasePriceRef.current.value = String(fields.purchasePrice);
    if (currencyRef.current && typeof fields.currency === "string")
      currencyRef.current.value = fields.currency.toUpperCase();
    if (referenceIdRef.current && typeof fields.referenceId === "string")
      referenceIdRef.current.value = fields.referenceId;
    if (typeof fields.expiresAt === "string" && expiresAtRef.current) {
      expiresAtRef.current.value = fields.expiresAt; // explicit expiry wins over duration math
    } else {
      recomputeExpiresAt();
    }
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
      applyExtractedFields(await extractImage(file, "WARRANTY"));
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
          uploadForm.append("folder", "warranties");
          const res = await fetch("/api/upload", { method: "POST", body: uploadForm });
          if (!res.ok) throw new Error("Image upload failed");
          const { url } = await res.json();
          fd.set("imageUrl", url);
        }
        await createWarranty(fd);
        adjustNavBadgeCount("warranties", 1);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToCreateWarranty);
      }
    });
  }

  return (
    <Modal title={t.addNewWarranty} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.warrantyImageOptional}>
          <div className="warranty-scan-mode-toggle flex gap-1.5 mb-1.5">
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
                <label className="warranty-image-upload flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 overflow-hidden">
                  <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              ) : (
                <div className="warranty-image-triggers flex gap-2">
                  <label className="warranty-image-camera flex-1 flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.174C3.163 7.54 2.5 8.36 2.5 9.315V18a2.25 2.25 0 002.25 2.25h14.5A2.25 2.25 0 0021.5 18V9.315c0-.955-.663-1.775-1.552-1.912a48.11 48.11 0 00-1.134-.174 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-4.552 0 2.192 2.192 0 00-1.736 1.039l-.822 1.316z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                    </svg>
                    <span className="text-xs mt-1">{t.scanTakePhoto}</span>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                  </label>
                  <label className="warranty-image-gallery flex-1 flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-slate-200 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-600 cursor-pointer transition-colors bg-slate-50 dark:bg-neutral-800 hover:bg-emerald-50 dark:hover:bg-emerald-950 text-slate-400">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 4.5h18a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 18V6A1.5 1.5 0 013 4.5z"
                      />
                    </svg>
                    <span className="text-xs mt-1">{t.scanChooseImage}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                </div>
              )}
              {isScanning && (
                <p className="warranty-image-scanning flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <Spinner className="w-3 h-3" />
                  {t.scanning}
                </p>
              )}
              {scanError && <p className="warranty-image-scan-error text-xs text-rose-500 mt-1">{scanError}</p>}
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
            <TextExtractArea entityType="WARRANTY" onExtracted={applyExtractedFields} t={t} />
          )}
        </Field>

        <Field label={t.warrantyProductName} required>
          <input ref={productNameRef} name="productName" required placeholder={t.warrantyProductNamePlaceholder} className={inputClass} />
        </Field>

        <Field label={t.warrantyPurchasedFrom} required>
          <WarrantyProviderCombobox
            key={purchasedFromKey}
            name="purchasedFrom"
            required
            prefillName={purchasedFromPrefill}
            options={providerOptions}
            placeholder={t.warrantyPurchasedFromPlaceholder}
          />
        </Field>

        <Field label={t.warrantyBranch}>
          <input ref={branchRef} name="branch" placeholder={t.warrantyBranchPlaceholder} className={inputClass} />
        </Field>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={claimElsewhere}
              onChange={(e) => setClaimElsewhere(e.target.checked)}
              className="accent-emerald-500 w-4 h-4"
            />
            {t.warrantyClaimElsewhere}
          </label>
        </div>
        {claimElsewhere && (
          <Field label={t.warrantyCompany}>
            <WarrantyProviderCombobox name="warrantyCompany" options={providerOptions} placeholder={t.warrantyCompanyPlaceholder} />
          </Field>
        )}

        <div className="flex gap-3">
          <Field label={t.warrantyPurchaseDate}>
            <input ref={purchaseDateRef} name="purchaseDate" type="date" onChange={recomputeExpiresAt} className={inputClass} />
          </Field>
          <Field label={t.warrantyDuration}>
            <input
              ref={durationMonthsRef}
              name="durationMonths"
              type="number"
              min="1"
              step="1"
              onChange={recomputeExpiresAt}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
        <Field label={t.warrantyExpiresAt}>
          <input ref={expiresAtRef} name="expiresAt" type="date" className={inputClass} />
        </Field>
        <div className="flex gap-3">
          <Field label={t.warrantyPurchasePrice}>
            <input
              ref={purchasePriceRef}
              name="purchasePrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={t.refundCurrency}>
            <input
              ref={currencyRef}
              name="currency"
              maxLength={3}
              defaultValue={defaultCurrency}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
              }}
              className={`${inputClass} font-mono uppercase w-24`}
            />
          </Field>
        </div>
        <Field label={t.warrantyReference}>
          <input ref={referenceIdRef} name="referenceId" className={inputClass} />
        </Field>
        <Field label={t.warrantyLink}>
          <input ref={linkRef} name="link" type="url" placeholder={t.warrantyLinkPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.notesOptional}>
          <input ref={notesRef} name="notes" placeholder={t.notesPlaceholder} className={inputClass} />
        </Field>

        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">{error}</p>
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
              t.addWarranty
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit Warranty Modal ────────────────────────────────────────────────────────

function EditWarrantyModal({
  warranty,
  onClose,
  providerOptions,
}: {
  warranty: WarrantyItem;
  onClose: () => void;
  providerOptions: WarrantyProviderOption[];
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claimElsewhere, setClaimElsewhere] = useState(Boolean(warranty.warrantyCompany));

  const purchaseDateRef = useRef<HTMLInputElement>(null);
  const durationMonthsRef = useRef<HTMLInputElement>(null);
  const expiresAtRef = useRef<HTMLInputElement>(null);

  function recomputeExpiresAt() {
    const pd = purchaseDateRef.current?.value;
    const dm = durationMonthsRef.current?.value;
    if (!pd || !dm || !expiresAtRef.current) return;
    const months = parseInt(dm, 10);
    if (!Number.isFinite(months) || months <= 0) return;
    const d = new Date(pd);
    d.setMonth(d.getMonth() + months);
    expiresAtRef.current.value = d.toISOString().slice(0, 10);
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await updateWarranty(warranty.id, fd);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateWarranty);
      }
    });
  }

  return (
    <Modal title={t.editWarranty} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={t.warrantyProductName} required>
          <input name="productName" required defaultValue={warranty.productName} className={inputClass} />
        </Field>

        <Field label={t.warrantyPurchasedFrom} required>
          <WarrantyProviderCombobox
            name="purchasedFrom"
            required
            defaultValue={warranty.purchasedFrom}
            options={providerOptions}
            placeholder={t.warrantyPurchasedFromPlaceholder}
          />
        </Field>

        <Field label={t.warrantyBranch}>
          <input name="branch" defaultValue={warranty.branch ?? ""} placeholder={t.warrantyBranchPlaceholder} className={inputClass} />
        </Field>

        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              checked={claimElsewhere}
              onChange={(e) => setClaimElsewhere(e.target.checked)}
              className="accent-emerald-500 w-4 h-4"
            />
            {t.warrantyClaimElsewhere}
          </label>
        </div>
        {claimElsewhere && (
          <Field label={t.warrantyCompany}>
            <WarrantyProviderCombobox
              name="warrantyCompany"
              defaultValue={warranty.warrantyCompany}
              options={providerOptions}
              placeholder={t.warrantyCompanyPlaceholder}
            />
          </Field>
        )}

        <div className="flex gap-3">
          <Field label={t.warrantyPurchaseDate}>
            <input
              ref={purchaseDateRef}
              name="purchaseDate"
              type="date"
              defaultValue={warranty.purchaseDate ? warranty.purchaseDate.slice(0, 10) : ""}
              onChange={recomputeExpiresAt}
              className={inputClass}
            />
          </Field>
          <Field label={t.warrantyDuration}>
            <input
              ref={durationMonthsRef}
              name="durationMonths"
              type="number"
              min="1"
              step="1"
              defaultValue={warranty.durationMonths ?? ""}
              onChange={recomputeExpiresAt}
              className={`${inputClass} font-mono`}
            />
          </Field>
        </div>
        <Field label={t.warrantyExpiresAt}>
          <input
            ref={expiresAtRef}
            name="expiresAt"
            type="date"
            defaultValue={warranty.expiresAt ? warranty.expiresAt.slice(0, 10) : ""}
            className={inputClass}
          />
        </Field>
        <div className="flex gap-3">
          <Field label={t.warrantyPurchasePrice}>
            <input
              name="purchasePrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              defaultValue={warranty.purchasePrice ?? ""}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <Field label={t.refundCurrency}>
            <input
              name="currency"
              maxLength={3}
              defaultValue={warranty.currency ?? ""}
              onChange={(e) => {
                e.target.value = e.target.value.toUpperCase();
              }}
              className={`${inputClass} font-mono uppercase w-24`}
            />
          </Field>
        </div>
        <Field label={t.warrantyReference}>
          <input name="referenceId" defaultValue={warranty.referenceId ?? ""} className={inputClass} />
        </Field>
        <Field label={t.warrantyLink}>
          <input name="link" type="url" defaultValue={warranty.link ?? ""} placeholder={t.warrantyLinkPlaceholder} className={inputClass} />
        </Field>
        <Field label={t.notesOptional}>
          <input name="notes" defaultValue={warranty.notes ?? ""} placeholder={t.notesPlaceholder} className={inputClass} />
        </Field>

        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">{error}</p>
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

// ── Warranty Detail Modal ──────────────────────────────────────────────────────

function WarrantyDetailModal({
  warranty,
  onClose,
  onEdit,
  expiringSoonDays,
}: {
  warranty: WarrantyItem;
  onClose: () => void;
  onEdit: () => void;
  expiringSoonDays: number;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const soon = (expiresAt: string | undefined) => isExpiringSoon(expiresAt, expiringSoonDays);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { names: attributionNames, showAddedBy } = useFamilyAttribution();
  const addedByName =
    showAddedBy && warranty.createdBy && attributionNames[warranty.createdBy]
      ? firstName(attributionNames[warranty.createdBy])
      : null;
  const [error, setError] = useState<string | null>(null);

  const claimContact = warranty.warrantyCompany ?? warranty.purchasedFrom;
  const expired = isExpired(warranty);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteWarranty(warranty.id);
        if (!expired) adjustNavBadgeCount("warranties", -1);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.failedToUpdateWarranty);
      }
    });
  }

  return (
    <Modal title={t.warrantyDetails} onClose={onClose}>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(warranty.purchasedFrom.display)}`}>
            {warranty.purchasedFrom.display}
          </span>
          <span className="text-slate-400 text-xs font-mono">#{warranty.seq}</span>
          <span
            className={`ml-auto px-2.5 py-1 rounded-full text-xs font-semibold ${
              expired
                ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400"
                : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {expired ? t.expiredWarranties : t.activeWarranties}
          </span>
        </div>

        {/* Product */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.warrantyProductName}</p>
          <p className="text-lg font-semibold text-slate-800 dark:text-neutral-100">{warranty.productName}</p>
        </div>

        {/* Purchase price */}
        {warranty.purchasePrice !== undefined && warranty.currency && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.warrantyPurchasePrice}</p>
            <p className="text-sm font-mono text-slate-700 dark:text-neutral-200" dir="ltr">
              {formatAmount(warranty.purchasePrice, warranty.currency, t.currencyLocale)}
            </p>
          </div>
        )}

        {/* Branch */}
        {warranty.branch && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.warrantyBranch}</p>
            <p className="text-sm text-slate-700 dark:text-neutral-200">{warranty.branch}</p>
          </div>
        )}

        {/* Reference */}
        {warranty.referenceId && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.warrantyReference}</p>
            <p className="text-sm font-mono text-slate-700 dark:text-neutral-200">{warranty.referenceId}</p>
          </div>
        )}

        {/* Expires */}
        {warranty.expiresAt && (
          <div
            className={
              soon(warranty.expiresAt)
                ? "p-2 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800"
                : undefined
            }
          >
            <p className="text-xs text-slate-400 mb-0.5">{t.expires}</p>
            <p
              className={`text-sm font-mono flex items-center gap-1.5 ${soon(warranty.expiresAt) ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-800 dark:text-neutral-100"}`}
            >
              {formatDateSlashFull(warranty.expiresAt)}
              {soon(warranty.expiresAt) && <ExpiryDaysBadge expiresAt={warranty.expiresAt} />}
            </p>
          </div>
        )}

        {/* Claim contact */}
        <div className="warranty-claim-contact rounded-xl border border-slate-100 dark:border-neutral-800 bg-white dark:bg-neutral-800/60 px-3 py-3">
          <p className="text-xs text-slate-400 mb-1">
            {t.warrantyCompany}
            {!warranty.warrantyCompany && <span className="ms-1">{t.warrantySameAsPurchase}</span>}
          </p>
          <p className="text-sm font-medium text-slate-800 dark:text-neutral-100">{claimContact.display}</p>
          {(claimContact.phone || claimContact.url) && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-neutral-400" dir="ltr">
              {claimContact.phone && <a href={`tel:${claimContact.phone}`}>{claimContact.phone}</a>}
              {claimContact.url && (
                <a href={claimContact.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400">
                  {claimContact.url}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Link */}
        {warranty.link && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t.warrantyLink}</p>
            <div className="flex items-center gap-2">
              <a
                href={warranty.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                  navigator.clipboard.writeText(warranty.link!).then(() => {
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  });
                }}
                className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-slate-100 dark:bg-neutral-700 hover:bg-slate-200 dark:hover:bg-neutral-600 text-slate-600 dark:text-neutral-300 text-xs font-medium transition-colors"
              >
                {copiedLink ? (
                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
        {warranty.notes && (
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t.notesLabel}</p>
            <p className="text-sm text-slate-700 dark:text-neutral-200">{warranty.notes}</p>
          </div>
        )}

        {/* Image */}
        {warranty.imageUrl && (
          <div>
            <p className="text-xs text-slate-400 mb-1.5">{t.warrantyImageOptional}</p>
            <a href={warranty.imageUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={warranty.imageUrl}
                alt="warranty receipt"
                className="warranty-image-thumbnail w-full max-h-48 object-cover rounded-xl border border-slate-100 dark:border-neutral-800 hover:opacity-90 transition-opacity"
              />
            </a>
          </div>
        )}

        {/* Added */}
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{t.dateAdded}</p>
          <p className="text-sm text-slate-700 dark:text-neutral-200">
            {formatDateSlashFull(warranty.createdAt)}
            {addedByName && ` (${addedByName})`}
          </p>
        </div>

        {error && (
          <p className="text-sm text-rose-500 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit();
            }}
            className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-neutral-700 text-sm font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            {t.edit}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-rose-200 dark:border-rose-800 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors disabled:opacity-60"
            title={t.removeCard}
          >
            {isPending ? (
              <Spinner />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Warranty Row ───────────────────────────────────────────────────────────────

function WarrantyRow({
  warranty,
  query,
  expiringSoonDays,
  onClick,
}: {
  warranty: WarrantyItem;
  query: string;
  expiringSoonDays: number;
  onClick: () => void;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const dir = localeDir[locale];
  const expiringSoon = isExpiringSoon(warranty.expiresAt, expiringSoonDays);

  return (
    <button
      type="button"
      dir={dir}
      onClick={onClick}
      className={`warranty-row w-full rounded-2xl border shadow-sm hover:shadow-md transition-all p-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-start overflow-hidden ${
        expiringSoon
          ? "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-950/60"
          : "bg-white dark:bg-neutral-900 border-slate-100 dark:border-neutral-800 hover:border-slate-200 dark:hover:border-neutral-700"
      }`}
    >
      <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-6" dir="ltr">
        #{warranty.seq}
      </span>
      <span className={`flex-shrink-0 max-w-[45%] sm:max-w-none truncate px-2.5 py-1 rounded-full text-xs font-semibold ${providerColor(warranty.purchasedFrom.display)}`}>
        <HighlightMatch text={warranty.purchasedFrom.display} query={query} />
      </span>
      <div className="flex-1 min-w-[64px]">
        <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100 truncate">
          <HighlightMatch text={warranty.productName} query={query} />
        </p>
        {warranty.referenceId && (
          <p className="text-xs font-mono text-slate-400 truncate mt-0.5">
            <HighlightMatch text={warranty.referenceId} query={query} />
          </p>
        )}
      </div>
      {warranty.expiresAt && (
        // basis-full drops this to its own line on narrow screens — see the
        // "expire notice covers other elements" mobile overflow fix.
        <div className="basis-full sm:basis-auto flex-shrink-0 flex sm:block justify-end text-xs font-mono text-end">
          <div>
            <div className="text-slate-400">{t.expires}</div>
            <div className={`flex items-center gap-1.5 ${expiringSoon ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-slate-400"}`}>
              {formatDateSlashFull(warranty.expiresAt)}
              <ExpiryDaysBadge expiresAt={warranty.expiresAt} />
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function WarrantiesClient({
  warranties,
  providerOptions,
  expiringSoonDays,
  currency,
}: {
  warranties: WarrantyItem[];
  providerOptions: WarrantyProviderOption[];
  expiringSoonDays: number;
  currency: string | null;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const t = getT(locale);
  const dir = localeDir[locale];
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<WarrantyItem | null>(null);
  const [editTarget, setEditTarget] = useState<WarrantyItem | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  // page.tsx already orders by expiresAt asc, nulls last — Active keeps that
  // order (soonest-expiring first); Expired is re-sorted desc (most recently
  // expired first) since the query order is the wrong direction for it.
  const active = warranties.filter((w) => !isExpired(w));
  const expired = warranties
    .filter(isExpired)
    .sort((a, b) => new Date(b.expiresAt!).getTime() - new Date(a.expiresAt!).getTime());

  const rawQuery = useSearchQueryStore((s) => s.query).trim();
  const query = rawQuery.toLowerCase();
  const matchesQuery = (w: WarrantyItem) =>
    !query ||
    w.productName.toLowerCase().includes(query) ||
    w.purchasedFrom.display.toLowerCase().includes(query) ||
    (w.branch?.toLowerCase().includes(query) ?? false) ||
    (w.notes?.toLowerCase().includes(query) ?? false) ||
    (w.referenceId?.toLowerCase().includes(query) ?? false);
  const visibleActive = active.filter(matchesQuery);
  const visibleExpired = expired.filter(matchesQuery);

  return (
    <div className="warranties-page space-y-6" dir={dir}>
      {/* Page header */}
      <div className="warranties-page-header flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 dark:text-neutral-400">{t.warrantiesTab}</h1>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t.addWarranty}
        </button>
      </div>

      {/* Active */}
      <section className="warranties-section-active">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t.activeWarranties}</h2>
          {visibleActive.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
              {visibleActive.length}
            </span>
          )}
        </div>
        {active.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-8 text-center">
            <p className="text-slate-500 font-medium mb-1">{t.noWarrantiesYet}</p>
            <p className="text-slate-400 text-sm">{t.addFirstWarrantyPrompt}</p>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-4 h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
            >
              {t.addWarranty}
            </button>
          </div>
        ) : visibleActive.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-8 text-center">
            <p className="text-slate-400 text-sm">{t.searchNoResults(rawQuery)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleActive.map((w) => (
              <WarrantyRow key={w.id} warranty={w} query={rawQuery} expiringSoonDays={expiringSoonDays} onClick={() => setSelected(w)} />
            ))}
          </div>
        )}
      </section>

      {/* Expired */}
      <section className="warranties-section-expired">
        <button onClick={() => setShowExpired((v) => !v)} className="flex items-center gap-2 mb-3 w-full text-left">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{t.expiredWarranties}</h2>
          {visibleExpired.length > 0 && (
            <span className="text-xs text-slate-400 bg-slate-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
              {visibleExpired.length}
            </span>
          )}
          <svg
            className={`ml-auto w-4 h-4 text-slate-400 transition-transform ${showExpired ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showExpired && expired.length > 0 && visibleExpired.length === 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">{t.searchNoResults(rawQuery)}</p>
          </div>
        )}
        {showExpired && visibleExpired.length === 0 && expired.length === 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-slate-100 dark:border-neutral-800 shadow-sm p-6 text-center">
            <p className="text-slate-400 text-sm">{t.noExpiredWarranties}</p>
          </div>
        )}
        {showExpired && visibleExpired.length > 0 && (
          <div className="space-y-2">
            {visibleExpired.map((w) => (
              <WarrantyRow key={w.id} warranty={w} query={rawQuery} expiringSoonDays={expiringSoonDays} onClick={() => setSelected(w)} />
            ))}
          </div>
        )}
      </section>

      {/* Modals */}
      {showAdd && <AddWarrantyModal onClose={() => setShowAdd(false)} providerOptions={providerOptions} currency={currency} />}
      {selected && (
        <WarrantyDetailModal
          warranty={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditTarget(selected);
            setSelected(null);
          }}
          expiringSoonDays={expiringSoonDays}
        />
      )}
      {editTarget && (
        <EditWarrantyModal warranty={editTarget} onClose={() => setEditTarget(null)} providerOptions={providerOptions} />
      )}
    </div>
  );
}
