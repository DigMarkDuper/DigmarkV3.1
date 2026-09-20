/**
 * WaAdminDataForm — the WA Admin "+ Tambah Data" action: a primary header
 * button that opens a modal form appending ONE new row to the live
 * "WA ADMIN REPORT" tab via the EXISTING backend (POST /api/tables/wa_admin).
 *
 * UI-layer only. The backend append path is already complete (appendTableController
 * -> buildCellRows -> appendRowsToSheet, INSERT_ROWS/USER_ENTERED, cache invalidation
 * + audit); this component builds the schema-keyed payload client-side and POSTs it.
 *
 * - Reuses the existing modal chrome pattern (fixed overlay + backdrop, Escape /
 *   backdrop close, brand surface), Button, and the design-system tokens.
 * - Field styling mirrors the shared FIELD_BASE in @/components/ui/Field (identical
 *   tokens) but is local so it can apply per-field red error state and support
 *   date/time inputs (the shared TextInput has no date/time types and no external
 *   className for error styling).
 * - Validation + payload assembly live in the pure module @/workspaces/waAdminForm
 *   (unit-tested). This component only wires them to state + the API.
 */
"use client";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Row } from "@/server/adapter/source";
import { postJson } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { normalizePhone } from "@/server/utils/helpers";
import {
  WA_ADMIN_PAYLOAD_KEYS,
  STATUS_COLUMN,
  PIC_FALLBACK,
  SUMBER_FALLBACK,
  KATEGORI_FALLBACK,
  STATUS_FALLBACK,
  MEKARI_TAG_OPTIONS,
  distinctCellValues,
  emptyWaAdminFormValue,
  validateWaAdminForm,
  buildWaAdminPayload,
  type WaAdminFormValues,
  type WaAdminFieldErrors,
  type WaAdminFieldName,
} from "@/workspaces/waAdminForm";

const KEY = WA_ADMIN_PAYLOAD_KEYS;

/** Input/textarea/select base — identical tokens to @/components/ui/Field FIELD_BASE. */
const FIELD_BASE =
  "w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink " +
  "placeholder:text-muted/70 focus:border-brand focus:shadow-[var(--dm-shadow-xs)] " +
  "focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
/** Red error-state overlay (replaces the neutral border colour). */
const FIELD_ERROR =
  " border-danger focus:border-danger focus:ring-danger";

/** Dropdown column -> its value domain (live rows first, verified fallback if none). */
const DROPDOWNS: { field: WaAdminFieldName; defaultValue: string; fallback: string[] }[] = [
  { field: "pic", defaultValue: "PIC", fallback: PIC_FALLBACK },
  { field: "sumber", defaultValue: KEY.sumber, fallback: SUMBER_FALLBACK },
  { field: "kategori", defaultValue: KEY.kategori, fallback: KATEGORI_FALLBACK },
  { field: "status", defaultValue: STATUS_COLUMN, fallback: STATUS_FALLBACK },
];

/** Form-field metadata for labels + required marks (exact Indonesian copy). */
const FIELD_LABELS: Record<WaAdminFieldName, string> = {
  tanggalMasuk: "Tanggal Masuk",
  noHp: "No Hp",
  jamChatMasuk: "Jam Chat Masuk",
  pic: "PIC",
  nama: "Nama",
  asal: "Asal",
  sumber: "Sumber",
  pertanyaan: "Pertanyaan",
  kategori: "Kategori",
  mekariTag: "Mekari Tag",
  status: "Status",
  keteranganAdmin: "Keterangan Admin",
};

function ErrText({ error }: { error?: string }) {
  return error ? (
    <span role="alert" data-error className="text-[0.78rem] font-semibold text-danger">
      {error}
    </span>
  ) : null;
}

/** Label + optional required asterisk + inline error line (shared by all fields). */
function FieldWrap({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[0.82rem] font-semibold text-muted">
        {label}
        {required ? <span aria-hidden className="text-danger"> *</span> : null}
      </label>
      {children}
      <ErrText error={error} />
    </div>
  );
}

type TextType = "text" | "date" | "time";

function TextField({
  id, label, required, error, type = "text", value, placeholder, onInput, minH,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  type?: TextType;
  value: string;
  placeholder?: string;
  onInput?: (v: string) => void;
  minH?: boolean;
}) {
  return (
    <FieldWrap label={label} required={required} error={error} htmlFor={id}>
      {minH ? (
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => onInput?.(e.target.value)}
          className={`${FIELD_BASE.replace("h-10", "h-auto py-2 min-h-[76px]")}${error ? FIELD_ERROR : ""}`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onInput?.(e.target.value)}
          className={`${FIELD_BASE}${error ? FIELD_ERROR : ""}`}
        />
      )}
    </FieldWrap>
  );
}

function SelectField({
  id, label, required, error, value, options, onSelect, placeholder,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  value: string;
  options: string[];
  onSelect?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <FieldWrap label={label} required={required} error={error} htmlFor={id}>
      <span className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onSelect?.(e.target.value)}
          className={`${FIELD_BASE} appearance-none pr-9${error ? FIELD_ERROR : ""}`}
        >
          <option value="" disabled>
            {placeholder ?? "— Pilih —"}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
          ▾
        </span>
      </span>
    </FieldWrap>
  );
}

const SUCCESS_MESSAGE = "Data berhasil ditambahkan ke WA Admin.";

export interface WaAdminDataFormProps {
  rows: Row[];
  onRefresh?: () => void;
  /** Render the modal open on first mount (used by SSR render gate). */
  initialOpen?: boolean;
}

export function WaAdminDataForm({
  rows,
  onRefresh,
  initialOpen = false,
}: WaAdminDataFormProps) {
  const [open, setOpen] = useState(initialOpen);
  const [values, setValues] = useState<WaAdminFormValues>(() => emptyWaAdminFormValue());
  const [errors, setErrors] = useState<WaAdminFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // Derive dropdown options from the LIVE rows (with verified fallbacks).
  const dropdowns = useMemo(
    () =>
      DROPDOWNS.map((d) => ({
        field: d.field,
        options: distinctCellValues(rows, d.defaultValue, d.fallback),
      })),
    [rows],
  );

  const set = (field: WaAdminFieldName) => (value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  const close = () => {
    if (saving) return; // never close mid-submit
    setOpen(false);
    setSubmitError(null);
    setErrors({});
  };

  const resetForm = () => {
    setValues(emptyWaAdminFormValue());
    setErrors({});
    setSubmitError(null);
  };

  const openHandler = () => {
    resetForm();
    setOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return; // prevent double-click / duplicate row on second submit

    const errs = validateWaAdminForm(values);
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      // Show the normalized 62-form back in the field when it IS valid.
      if (!errs.noHp) {
        const norm = normalizePhone(values.noHp);
        setValues((v) => ({ ...v, noHp: norm }));
      }
      return; // block submit; keep values for correction
    }

    // valid: surface the stored 62-form phone back into the field.
    const norm = normalizePhone(values.noHp);
    setValues((v) => ({ ...v, noHp: norm }));

    setSaving(true);
    setSubmitError(null);
    try {
      await postJson("/api/tables/wa_admin", buildWaAdminPayload({ ...values, noHp: norm }));
      close();
      resetForm();
      onRefresh?.();
      setSuccess(SUCCESS_MESSAGE);
    } catch (err) {
      // On failure: keep ALL form values (do NOT clear) — retry won't duplicate,
      // because saving is re-enabled and a new success clears/resets only then.
      const msg =
        err && typeof err === "object" && "message" in (err as { message?: string })
          ? (err as { message?: string }).message
          : "Gagal menyimpan data ke WA Admin. Silakan coba lagi.";
      setSubmitError(msg ?? "Gagal menyimpan data ke WA Admin. Silakan coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      <div className="grid gap-5 md:grid-cols-2">
        <TextField
          id="wa-tanggal" type="date" label={FIELD_LABELS.tanggalMasuk} required
          error={errors.tanggalMasuk} value={values.tanggalMasuk} onInput={set("tanggalMasuk")}
        />
        <TextField
          id="wa-nohp" type="text" label={FIELD_LABELS.noHp} required
          error={errors.noHp} value={values.noHp} onInput={set("noHp")}
          placeholder="08xx / 628xx"
        />
        <TextField
          id="wa-jam" type="time" label={FIELD_LABELS.jamChatMasuk} required
          error={errors.jamChatMasuk} value={values.jamChatMasuk} onInput={set("jamChatMasuk")}
        />
        {dropdowns.map((d) => (
          <SelectField
            key={d.field}
            id={`wa-${d.field}`}
            label={FIELD_LABELS[d.field]}
            required
            error={errors[d.field]}
            value={values[d.field]}
            options={d.options}
            onSelect={set(d.field)}
          />
        ))}
        <TextField
          id="wa-nama" type="text" label={FIELD_LABELS.nama} required
          error={errors.nama} value={values.nama} onInput={set("nama")}
        />
        <TextField
          id="wa-asal" type="text" label={FIELD_LABELS.asal}
          value={values.asal} onInput={set("asal")} placeholder="(opsional)"
        />
        <TextField
          id="wa-pertanyaan" type="text" label={FIELD_LABELS.pertanyaan} minH
          value={values.pertanyaan} onInput={set("pertanyaan")} placeholder="(opsional)"
        />
        <SelectField
          id="wa-mekari"
          label={FIELD_LABELS.mekariTag}
          value={values.mekariTag}
          options={MEKARI_TAG_OPTIONS}
          onSelect={set("mekariTag")}
          placeholder="(opsional)"
        />
        <TextField
          id="wa-keterangan" type="text" label={FIELD_LABELS.keteranganAdmin} minH
          value={values.keteranganAdmin} onInput={set("keteranganAdmin")} placeholder="(opsional)"
        />
      </div>

      {submitError ? (
        <div
          role="alert"
          className="mt-5 rounded-[12px] border border-danger/30 bg-danger/10 px-4 py-3 text-[0.9rem] font-semibold text-danger"
        >
          ⚠️ {submitError}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" type="button" onClick={close} disabled={saving}>
          Batal
        </Button>
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan Data"}
        </Button>
      </div>
    </form>
  );

  return (
    <>
      <Button variant="primary" onClick={openHandler} className="shrink-0 px-4 py-2 text-[0.92rem]">
        + Tambah Data
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tambah Data WA Admin"
          data-hermes-no-print
          onKeyDown={(ev) => {
            if (ev.key === "Escape") close();
          }}
          className="z-[70]"
        >
          <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm" onClick={close} aria-hidden />
          <div className="fixed left-1/2 top-1/2 z-10 flex max-h-[92vh] w-[96%] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--dm-shadow)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-divider px-5 py-3.5">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand/10 text-[1.05rem]">
                💬
              </span>
              <h3 className="text-[1.15rem] font-extrabold tracking-[-0.01em] text-ink">
                Tambah Data WA Admin
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={close} disabled={saving} className="shrink-0">
                  ✕
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-4 text-[0.84rem] text-muted">
                Masukkan data baru untuk ditambahkan ke tabel WA ADMIN REPORT. Kolom bertanda{" "}
                <span aria-hidden className="text-danger">*</span> wajib diisi.
              </p>
              {body}
            </div>
          </div>
        </div>
      ) : null}

      {success ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[80] grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-[14px] border border-success/40 bg-surface px-4 py-3 shadow-[var(--dm-shadow)]"
        >
          <span aria-hidden className="text-[1.05rem] text-success">✓</span>
          <span className="text-[0.9rem] font-bold text-success">{success}</span>
        </div>
      ) : null}
    </>
  );
}