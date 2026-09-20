/**
 * WaAdminEditData — the WA Admin "✏️ Edit Data" action: a secondary header
 * button that opens a multi-screen modal (search → results → edit → confirm)
 * to EDIT ONE EXISTING row of the live "WA ADMIN REPORT" tab in place.
 *
 * UI-layer only. The write path is the EXISTING backend PATCH
 * /api/tables/wa_admin (updateCellController → updateCell → updateCellInSheet),
 * one cell per call with `{ rowIndex, column, value }`; this component reuses
 * `patchJson`. Pure helpers (search/diff/validate) come from waAdminEdit.ts.
 *
 * DATA-INTEGRITY: the ONLY row handle is the server-provided numeric
 * `__rowIndex` on each GET row. It is threaded from the search results into the
 * edit pre-fill and into EVERY PATCH `rowIndex`. Array position, filtered-array
 * index, and field values (e.g. Nama) are NEVER used as row identity — two rows
 * can share a Nama and MUST remain distinct editable rows addressed by their own
 * original spreadsheet indexes.
 *
 * Local field primitives are copied verbatim from WaAdminDataForm.tsx (the
 * shared Input/Select cannot do per-field error state or date/time types). The
 * shared-component ban is respected: nothing under src/components/ui/* changes.
 */
"use client";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Row } from "@/server/adapter/source";
import { patchJson } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import {
  WA_ADMIN_PAYLOAD_KEYS,
  STATUS_COLUMN,
  PIC_FALLBACK,
  SUMBER_FALLBACK,
  KATEGORI_FALLBACK,
  STATUS_FALLBACK,
  MEKARI_TAG_OPTIONS,
  distinctCellValues,
  type WaAdminFormValues,
  type WaAdminFieldErrors,
  type WaAdminFieldName,
} from "@/workspaces/waAdminForm";
import {
  searchRowsMulti,
  formatActiveCriteria,
  rowToFormValue,
  changedFieldValues,
  validateWaAdminEdit,
  type SearchClause,
} from "@/workspaces/waAdminEdit";

const KEY = WA_ADMIN_PAYLOAD_KEYS;
const SUCCESS_COPY = "Data berhasil diperbarui.";
const ERROR_COPY = "Data gagal diperbarui. Silakan coba lagi.";

/* --------------------------------------------------------------------------
 * Local field primitives — VERBATIM copy from WaAdminDataForm.tsx.
 * ------------------------------------------------------------------------ */
const FIELD_BASE =
  "w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink " +
  "placeholder:text-muted/70 focus:border-brand focus:shadow-[var(--dm-shadow-xs)] " +
  "focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
const FIELD_ERROR = " border-danger focus:border-danger focus:ring-danger";

function ErrText({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <span role="alert" data-error className="text-[0.78rem] font-semibold text-danger">
      {error}
    </span>
  );
}

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
  id,
  label,
  required,
  error,
  type = "text",
  value,
  placeholder,
  onInput,
  minH,
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
  const base = minH ? FIELD_BASE.replace("h-10", "h-auto py-2 min-h-[76px]") : FIELD_BASE;
  const cls = `${base}${error ? FIELD_ERROR : ""}`;
  return (
    <FieldWrap label={label} required={required} error={error} htmlFor={id}>
      {minH ? (
        <textarea id={id} value={value} placeholder={placeholder} rows={3}
          onChange={(e) => onInput?.(e.target.value)} className={cls} />
      ) : (
        <input id={id} type={type} value={value} placeholder={placeholder}
          onChange={(e) => onInput?.(e.target.value)} className={cls} />
      )}
    </FieldWrap>
  );
}

function SelectField({
  id,
  label,
  required,
  error,
  value,
  options,
  onSelect,
  placeholder,
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
  const cls = `${FIELD_BASE} appearance-none pr-9${error ? FIELD_ERROR : ""}`;
  return (
    <FieldWrap label={label} required={required} error={error} htmlFor={id}>
      <span className="relative">
        <select id={id} value={value} onChange={(e) => onSelect?.(e.target.value)} className={cls}>
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

/* --------------------------------------------------------------------------
 * Search criteria — user-friendly label order (No Hp DEFAULT, first) mapped to
 * the EXACT schema column they hit. The predicate runs against that column.
 * ------------------------------------------------------------------------ */
const SEARCH_CRITERIA: { label: string; column: string }[] = [
  { label: "No Hp", column: KEY.noHp },
  { label: "Tanggal Masuk", column: KEY.tanggalMasuk },
  { label: "Jam Chat Masuk", column: KEY.jamChatMasuk },
  { label: "PIC", column: KEY.pic },
  { label: "Nama", column: KEY.nama },
  { label: "Asal", column: KEY.asal },
  { label: "Sumber", column: KEY.sumber },
  { label: "Kategori", column: KEY.kategori },
  { label: "Mekari Tag", column: KEY.mekariTag },
  { label: "Status", column: STATUS_COLUMN },
];

/** UI labels for the 12 edit-form fields (same Indonesian copy as Tambah Data). */
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

/** Append the stored value to the option list when it is missing (§7 round-trip). */
function withStored(options: string[], stored: unknown): string[] {
  const out = [...options];
  const s = String(stored ?? "").trim();
  if (s && !out.includes(s)) out.push(s);
  return out;
}

type SearchRowState = { criterion: string; keyword: string };
type Screen = "closed" | "search" | "results" | "edit" | "confirm";
type ToastKind = "success" | "error";

export interface WaAdminEditDataProps {
  rows: Row[];
  onRefresh?: () => void;
}

export function WaAdminEditData({ rows, onRefresh }: WaAdminEditDataProps) {
  const [screen, setScreen] = useState<Screen>("closed");
  const [searchRowsState, setSearchRowsState] = useState<SearchRowState[]>([
    { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
    { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
    { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
  ]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Row[]>([]);
  const [lastQuery, setLastQuery] = useState("");

  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [rowIndex, setRowIndex] = useState(-1);
  const [preFill, setPreFill] = useState<WaAdminFormValues | null>(null);
  const [editValues, setEditValues] = useState<WaAdminFormValues | null>(null);
  const [errors, setErrors] = useState<WaAdminFieldErrors>({});

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);

  // Auto-dismiss the toast after 4s (mirrors WaAdminDataForm).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (kind: ToastKind, msg: string) => setToast({ kind, msg });

  // Close the whole modal (guarded: never mid-save).
  const goClose = () => {
    if (saving) return;
    setScreen("closed");
    setResults([]);
    setLastQuery("");
    setSelectedRow(null);
    setRowIndex(-1);
    setPreFill(null);
    setEditValues(null);
    setErrors({});
  };

  // Open Search from the header button, resetting search + selection state.
  const openSearch = () => {
    setSearchRowsState([
      { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
      { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
      { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
    ]);
    setSearchError(null);
    setResults([]);
    setLastQuery("");
    setSelectedRow(null);
    setRowIndex(-1);
    setPreFill(null);
    setEditValues(null);
    setErrors({});
    setScreen("search");
  };

  // Back to Search (empty state "Cari Lagi" keeps the current criteria).
  const goSearch = () => {
    if (saving) return;
    setSearchRowsState((rows_) =>
      rows_.map((r) => ({ ...r, keyword: "" })),
    );
    setSearchError(null);
    setResults([]);
    setLastQuery("");
    setScreen("search");
  };

  // Update one of the three search rows (criterion and/or keyword).
  const setSearchRow = (index: number, patch_: Partial<SearchRowState>) =>
    setSearchRowsState((rows_) =>
      rows_.map((r, i) => (i === index ? { ...r, ...patch_ } : r)),
    );

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const clauses: SearchClause[] = searchRowsState.map((s) => ({
      column:
        s.criterion === SEARCH_CRITERIA[0].label
          ? SEARCH_CRITERIA[0].column
          : SEARCH_CRITERIA.find((c) => c.label === s.criterion)?.column ?? s.criterion,
      keyword: s.keyword,
    }));
    if (clauses.every((c) => c.keyword.trim() === "")) {
      setSearchError("Masukkan kata kunci dahulu.");
      return;
    }
    const hits = searchRowsMulti(rows, clauses);
    setResults(hits);
    setLastQuery(formatActiveCriteria(clauses));
    setSearchError(null);
    setScreen("results");
  };

  // Select a result → edit, seeding rowIndex + pre-fill from that EXACT row.
  const openEditFor = (row: Row) => {
    if (saving) return;
    const pre = rowToFormValue(row);
    setSelectedRow(row);
    setRowIndex(Number(row.__rowIndex));
    setPreFill(pre);
    setEditValues(pre);
    setErrors({});
    setScreen("edit");
  };

  const setField = (field: WaAdminFieldName) => (value: string) =>
    setEditValues((v) => (v ? { ...v, [field]: value } : v));

  // Edit "Simpan Perubahan" → validate then advance to confirm.
  const handleEditNext = (e: FormEvent) => {
    e.preventDefault();
    if (saving || !editValues) return;
    const errs = validateWaAdminEdit(editValues);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return; // keep edits, block
    setScreen("confirm");
  };

  const backToResults = () => {
    if (saving) return;
    setErrors({});
    setScreen("results");
  };

  const backToEdit = () => {
    if (saving) return;
    setErrors({});
    setScreen("edit");
  };

  // Confirm "Simpan Perubahan" → one PATCH per changed field, then success/error.
  const handleSave = async () => {
    if (saving || !preFill || !editValues) return;
    const changed = changedFieldValues(preFill, editValues);
    const ri = rowIndex;
    if (changed.length === 0) {
      // Nothing changed → success, NO PATCH fired.
      goClose();
      onRefresh?.();
      showToast("success", SUCCESS_COPY);
      return;
    }
    setSaving(true);
    try {
      // Sequential one-cell PATCHes — fails loudly on the first error.
      for (const { column, value } of changed) {
        await patchJson("/api/tables/wa_admin", { rowIndex: ri, column, value });
      }
      setSaving(false);
      goClose();
      onRefresh?.();
      showToast("success", SUCCESS_COPY);
    } catch (err) {
      // Failed PATCH -> drop back to the EDIT screen with values intact for retry.
      setScreen("edit");
      const detail = err && typeof err === "object"
        ? (err as Record<string, unknown>)
        : {};
      // Log fine-grained details with the phone value redacted (never a credential);
      // keep the edit screen open with values intact for retry.
      const safeChanges = changed.map((c) =>
        c.column === KEY.noHp ? { column: c.column, value: "[redacted]" } : c,
      );
      console.error("Edit WA Admin PATCH failed", {
        rowIndex: ri,
        fields: safeChanges,
        status: detail.status,
        code: detail.code,
        message: detail.message,
        err,
      });
      setSaving(false);
      showToast("error", ERROR_COPY);
    }
  };

  /* -------------------------- render / screens -------------------------- */
  const open = screen !== "closed";

  // Dropdown value domains for the edit form (live-first, fallback, + stored).
  const editDropdowns = useMemo(() => {
    if (!selectedRow) return null;
    return {
      pic: withStored(distinctCellValues(rows, KEY.pic, PIC_FALLBACK), selectedRow[KEY.pic]),
      sumber: withStored(distinctCellValues(rows, KEY.sumber, SUMBER_FALLBACK), selectedRow[KEY.sumber]),
      kategori: withStored(distinctCellValues(rows, KEY.kategori, KATEGORI_FALLBACK), selectedRow[KEY.kategori]),
      status: withStored(distinctCellValues(rows, STATUS_COLUMN, STATUS_FALLBACK), selectedRow[STATUS_COLUMN]),
      mekari: withStored(MEKARI_TAG_OPTIONS as string[], selectedRow[KEY.mekariTag]),
    };
  }, [rows, selectedRow]);

  const screenMeta: Record<Screen, { title: string; icon: string }> = {
    closed: { title: "", icon: "" },
    search: { title: "Cari Data WA Admin", icon: "🔍" },
    results: { title: "Hasil Pencarian", icon: "📋" },
    edit: { title: "Ubah Data WA Admin", icon: "✏️" },
    confirm: { title: "Konfirmasi Perubahan", icon: "⚠️" },
  };
  const title = screenMeta[screen].title || "";
  const icon = screenMeta[screen].icon || "";

  let body: ReactNode = null;

  if (screen === "search") {
    body = (
      <form onSubmit={handleSearch} noValidate className="flex flex-col">
        <p className="mb-1 text-[0.80rem] text-muted">
          Kriteria berikut bersifat opsional: isi baris 2 dan/atau 3 untuk mempersempit hasil
          (minimal satu kata kunci harus diisi).
        </p>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr]">
            <SelectField
              id="wa-edit-kriteria-1"
              label="Kriteria 1"
              value={searchRowsState[0].criterion}
              options={SEARCH_CRITERIA.map((c) => c.label)}
              onSelect={(v) => setSearchRow(0, { criterion: v })}
            />
            <div className="flex flex-col gap-1">
              <TextField
                id="wa-edit-keyword-1"
                label="Kata kunci 1"
                value={searchRowsState[0].keyword}
                placeholder="Ketik kata kunci…"
                onInput={(v) => setSearchRow(0, { keyword: v })}
              />
              {searchError ? (
                <span data-error className="text-[0.78rem] font-semibold text-danger">
                  {searchError}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr]">
            <SelectField
              id="wa-edit-kriteria-2"
              label="Kriteria 2 (opsional)"
              value={searchRowsState[1].criterion}
              options={SEARCH_CRITERIA.map((c) => c.label)}
              onSelect={(v) => setSearchRow(1, { criterion: v })}
            />
            <div className="flex flex-col gap-1">
              <TextField
                id="wa-edit-keyword-2"
                label="Kata kunci 2 (opsional)"
                value={searchRowsState[1].keyword}
                placeholder="Ketik kata kunci… (opsional)"
                onInput={(v) => setSearchRow(1, { keyword: v })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr]">
            <SelectField
              id="wa-edit-kriteria-3"
              label="Kriteria 3 (opsional)"
              value={searchRowsState[2].criterion}
              options={SEARCH_CRITERIA.map((c) => c.label)}
              onSelect={(v) => setSearchRow(2, { criterion: v })}
            />
            <div className="flex flex-col gap-1">
              <TextField
                id="wa-edit-keyword-3"
                label="Kata kunci 3 (opsional)"
                value={searchRowsState[2].keyword}
                placeholder="Ketik kata kunci… (opsional)"
                onInput={(v) => setSearchRow(2, { keyword: v })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" type="submit" disabled={saving} className="shrink-0 px-4 py-2 text-[0.92rem]">
              Cari
            </Button>
          </div>
        </div>
      </form>
    );
  } else if (screen === "results") {
    if (results.length === 0) {
      body = (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="text-[0.92rem] text-ink">
            Tidak ada data yang cocok dengan kriteria: {lastQuery}. Coba kriteria atau kata kunci lain.
          </p>
          <Button variant="secondary" onClick={goSearch} className="shrink-0">
            Cari Lagi
          </Button>
        </div>
      );
    } else {
      body = (
        <div className="flex flex-col gap-2.5">
          <p className="mb-1 text-[0.84rem] text-muted">
            Ditemukan {results.length} baris yang cocok dengan kriteria: {lastQuery}. Pilih baris untuk diedit.
          </p>
          <ul className="flex flex-col gap-2">
            {results.map((row) => {
              const ridx = Number(row.__rowIndex);
              const asal =
                String(row[KEY.asal] ?? "").trim() ||
                String(row[KEY.sumber] ?? "").trim() ||
                String(row[KEY.pic] ?? "").trim() ||
                "—";
              const status = String(row[STATUS_COLUMN] ?? "").trim();
              return (
                <li key={ridx} className="list-none">
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit baris ${ridx + 1}: ${row[KEY.nama] ?? ""}`}
                    onClick={() => openEditFor(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEditFor(row);
                      }
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-border bg-surface-input px-4 py-3 transition-colors hover:border-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9rem] font-semibold text-ink">
                        {String(row[KEY.tanggalMasuk] ?? "").trim() || "—"} · {String(row[KEY.nama] ?? "").trim() || "—"}
                      </span>
                      <span className="block truncate text-[0.78rem] text-muted">
                        {String(row[KEY.noHp] ?? "").trim() || "—"} · {asal}
                      </span>
                    </span>
                    {status ? (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.75rem] font-semibold text-brand">
                        {status}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
  } else if (screen === "edit" && editValues) {
    body = (
      <form onSubmit={handleEditNext} noValidate className="flex flex-col">
        <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full bg-surface-input px-3 py-1 text-[0.78rem] font-semibold text-muted">
          Baris #{rowIndex + 1} · WA ADMIN REPORT
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <TextField id="wa-edit-tanggal" type="date" label={FIELD_LABELS.tanggalMasuk} required
            error={errors.tanggalMasuk} value={editValues.tanggalMasuk} onInput={setField("tanggalMasuk")} />
          <TextField id="wa-edit-nohp" type="text" label={FIELD_LABELS.noHp} required
            error={errors.noHp} value={editValues.noHp} onInput={setField("noHp")} placeholder="08xx / 628xx" />
          <TextField id="wa-edit-jam" type="time" label={FIELD_LABELS.jamChatMasuk} required
            error={errors.jamChatMasuk} value={editValues.jamChatMasuk} onInput={setField("jamChatMasuk")} />
          <SelectField id="wa-edit-pic" label={FIELD_LABELS.pic} required
            error={errors.pic} value={editValues.pic} onSelect={setField("pic")}
            options={editDropdowns?.pic ?? PIC_FALLBACK} />
          <TextField id="wa-edit-nama" type="text" label={FIELD_LABELS.nama} required
            error={errors.nama} value={editValues.nama} onInput={setField("nama")} />
          <TextField id="wa-edit-asal" type="text" label={FIELD_LABELS.asal}
            value={editValues.asal} onInput={setField("asal")} placeholder="(opsional)" />
          <SelectField id="wa-edit-sumber" label={FIELD_LABELS.sumber} required
            error={errors.sumber} value={editValues.sumber} onSelect={setField("sumber")}
            options={editDropdowns?.sumber ?? SUMBER_FALLBACK} />
          <TextField id="wa-edit-pertanyaan" type="text" label={FIELD_LABELS.pertanyaan} minH
            value={editValues.pertanyaan} onInput={setField("pertanyaan")} placeholder="(opsional)" />
          <SelectField id="wa-edit-kategori" label={FIELD_LABELS.kategori} required
            error={errors.kategori} value={editValues.kategori} onSelect={setField("kategori")}
            options={editDropdowns?.kategori ?? KATEGORI_FALLBACK} />
          <SelectField id="wa-edit-mekari" label={FIELD_LABELS.mekariTag}
            value={editValues.mekariTag} onSelect={setField("mekariTag")}
            options={editDropdowns?.mekari ?? MEKARI_TAG_OPTIONS} placeholder="(opsional)" />
          <SelectField id="wa-edit-status" label={FIELD_LABELS.status} required
            error={errors.status} value={editValues.status} onSelect={setField("status")}
            options={editDropdowns?.status ?? STATUS_FALLBACK} />
          <TextField id="wa-edit-keterangan" type="text" label={FIELD_LABELS.keteranganAdmin} minH
            value={editValues.keteranganAdmin} onInput={setField("keteranganAdmin")} placeholder="(opsional)" />
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" type="button" onClick={backToResults} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan Perubahan"}
          </Button>
        </div>
      </form>
    );
  } else if (screen === "confirm") {
    body = (
      <div className="flex flex-col">
        <p className="text-[0.92rem] text-ink">
          Apakah Anda yakin ingin menyimpan perubahan data ini?
        </p>
        <p className="mt-2 text-[0.82rem] text-muted">
          Perubahan akan diterapkan pada baris #{rowIndex + 1} dari tabel WA ADMIN REPORT.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" type="button" onClick={backToEdit} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan Perubahan"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={openSearch}
        className="shrink-0 px-4 py-2 text-[0.92rem]"
      >
        ✏️ Edit Data
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-hermes-no-print
          onKeyDown={(ev) => {
            if (ev.key === "Escape") goClose();
          }}
          className="z-[70]"
        >
          <div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={goClose}
            aria-hidden
          />
          <div className="fixed left-1/2 top-1/2 z-10 flex max-h-[92vh] w-[96%] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] border border-border bg-surface shadow-[var(--dm-shadow)]">
            <div className="flex flex-wrap items-center gap-3 border-b border-divider px-5 py-3.5">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand/10 text-[1.05rem]">
                {icon}
              </span>
              <h3 className="text-[1.15rem] font-extrabold tracking-[-0.01em] text-ink">
                {title}
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" onClick={goClose} disabled={saving} className="shrink-0">
                  ✕
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {screen === "edit" ? (
                <p className="mb-4 text-[0.84rem] text-muted">
                  Ubah nilai yang ingin diubah. Kolom bertanda{" "}
                  <span aria-hidden className="text-danger">*</span> wajib diisi. Nilai yang tidak
                  diubah tidak akan dikirim.
                </p>
              ) : screen === "search" ? (
                <p className="mb-4 text-[0.84rem] text-muted">
                  Cari baris yang ingin Anda ubah. Data dicocokkan per kolom; pilihlah baris yang
                  sesuai dari hasil.
                </p>
              ) : null}
              {body}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[80] grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-[14px] border bg-surface px-4 py-3 shadow-[var(--dm-shadow)] ${
            toast.kind === "error" ? "border-danger/40" : "border-success/40"
          }`}
        >
          <span aria-hidden className="text-[1.05rem]">
            {toast.kind === "error" ? "❌" : "✓"}
          </span>
          <span
            className={`text-[0.9rem] font-bold ${toast.kind === "error" ? "text-danger" : "text-success"}`}
          >
            {toast.msg}
          </span>
        </div>
      ) : null}
    </>
  );
}