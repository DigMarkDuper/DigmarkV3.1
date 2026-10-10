/**
 * CrmDashboard — presentational body of the CRM workspace (port of pages/5_CRM.py).
 *
 * Given normalized rows from GET /api/tables/crm, renders the V3 layout with
 * Phase D design-system components:
 *   - Sync & Import (2-col): WA Admin → CRM sync button (POST /api/sync/wa-to-crm,
 *     surfaces response message verbatim + added/skipped), and a client-side
 *     CRM import (xlsx/csv → _import_row transform → POST /api/tables/crm append).
 *   - Filter & Cari: search (Nama/No Hp substring), Mekari Tag + Domisili
 *     multiselects, Treatment select, metric row.
 *   - Data table of the filtered CRM rows.
 *   - Ekspor: Mekari CSV of the filtered rows (client-side).
 *   - Refresh footer.
 *
 * Writes happen ONLY through the API (sync + append); the server adapter decides
 * the backing spreadsheet. Empty rows short-circuit after Sync & Import, exactly
 * V3: empty_state + footer and stop (no filters/table/export).
 */
"use client";
import { useMemo, useState, useCallback, type ChangeEvent, type FormEvent } from "react";
import type { Row } from "@/server/adapter/source";
import { postJson } from "@/lib/api-client";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { TextInput } from "@/components/ui/Field";
import {
  buildCrmImportRows,
  crmFilterOptions,
  crmMetrics,
  filterCrmRows,
  mekariCsv,
  mekariFilename,
  parseFileToAoa,
  TREATMENT_OPTIONS,
  IMPORT_COLUMNS,
  computeTreatmentStatus,
  TREATMENT_CHIPS,
  validatePhones,
  buildPhoneListText,
  type TreatmentStatusBadge,
  normalizePhone,
} from "@/workspaces/crm";

/* ---------------------------------------------------------------------------
 * Props
 * ------------------------------------------------------------------------ */

export interface CrmDashboardProps {
  rows: Row[];
  /** Declared schema columns for the crm tab (rendering fallback). */
  columns?: string[];
  onRefresh?: () => void;
}

function errMessage(err: unknown, fallback: string): string {
  return err && typeof err === "object" && "message" in (err as { message?: string })
    ? (err as { message: string }).message
    : fallback;
}

/** Inline checkbox-group multiselect (V3 st.multiselect parity, no dep). */
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="mb-1 block text-[0.82rem] font-semibold text-muted">{label}</span>
      <div className="max-h-[160px] overflow-y-auto rounded-[8px] border border-border bg-surface-input p-3">
        {options.length === 0 ? (
          <span className="text-[0.8rem] text-muted/60">Tidak ada opsi.</span>
        ) : (
          options.map((o) => {
            const checked = selected.includes(o);
            return (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 py-0.5 text-[0.82rem] font-medium text-ink"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(o)}
                  className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand"
                />
                {o}
              </label>
            );
          })
        )}
      </div>
    </span>
  );
}

/** Chip button for quick-treatment-filtering. */
function TreatmentChip({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[0.78rem] font-semibold transition-all cursor-pointer select-none";
  const variant = active
    ? "bg-brand text-white shadow-[var(--dm-shadow-cta)] ring-2 ring-brand/30"
    : "bg-surface border border-border text-muted hover:border-brand/50 hover:text-ink";
  return <button type="button" onClick={onClick} className={`${base} ${variant}`}>{label}</button>;
}

/** Badge component for treatment status in table cells. */
function TreatmentBadge({ badge }: { badge: TreatmentStatusBadge }) {
  const styles: Record<string, string> = {
    empty: "bg-red-50 text-red-700 border-red-200",
    "t1-only": "bg-yellow-50 text-yellow-700 border-yellow-200",
    t2only: "bg-amber-50 text-amber-700 border-amber-200",
    both: "bg-green-50 text-green-700 border-green-200",
  };
  const key = badge.variant === "t2-only" ? "t2only" : badge.variant;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.72rem] font-semibold ${styles[key] ?? styles.empty}`}>
      {badge.label}
    </span>
  );
}

/** Detail cell for expanded row content. */
function DetailCell({ label, value, fullCol = false }: {
  label: string; value: unknown; fullCol?: boolean;
}) {
  const display = value === null || value === undefined ? String(value) : String(value);
  const isEmpty = display.trim() === "" || display.toLowerCase() === "nan";
  return (
    <div className={`rounded-[6px] border border-border bg-surface-input p-2 ${fullCol ? "col-span-3" : ""}`}>
      <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className={`block text-[0.8125rem] ${isEmpty ? "text-muted/60 italic" : "text-ink"}`}>
        {isEmpty ? "—" : display}
      </span>
    </div>
  );
}

export function CrmDashboard({ rows, columns, onRefresh }: CrmDashboardProps) {
  // --- Filters ---
  const [search, setSearch] = useState("");
  const [mekariSel, setMekariSel] = useState<string[]>([]);
  const [domisiliSel, setDomisiliSel] = useState<string[]>([]);
  const [kategoriSel, setKategoriSel] = useState<string[]>([]);
  const [treatment, setTreatment] = useState("Semua");

  // --- Bulk selection & expand ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedRowIdx, setExpandedRowIdx] = useState<number | null>(null);

  // Sync state.
  const [syncing, setSyncing] = useState(false);
  const [syncOk, setSyncOk] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  // Import state.
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  const options = useMemo(() => crmFilterOptions(rows), [rows]);
  const filtered = useMemo(
    () => filterCrmRows(rows, { search, mekari: mekariSel, domisili: domisiliSel, kategori: kategoriSel, treatment }),
    [rows, search, mekariSel, domisiliSel, kategoriSel, treatment],
  );
  const metrics = useMemo(() => crmMetrics(filtered, rows), [filtered, rows]);
  const phoneValidation = useMemo(() => validatePhones(filtered), [filtered]);

  const toggleMekari = (v: string) =>
    setMekariSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const toggleDomisili = (v: string) =>
    setDomisiliSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const toggleKategori = (v: string) =>
    setKategoriSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  /* --- Bulk selection helpers --- */
  const anySelected = selectedIds.size > 0;
  const allFilteredSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const selectedRows = useMemo(
    () => filtered.filter((_r, idx) => selectedIds.has(idx)),
    [filtered, selectedIds],
  );

  const toggleRowSelection = useCallback((idx: number) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }, []);

  const selectAllFiltered = useCallback(() => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else { const a = new Set<number>(); for (let i = 0; i < filtered.length; i++) a.add(i); setSelectedIds(a); }
  }, [filtered.length, selectedIds.size]);

  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setImportErr(null);
    setImportMsg(null);
  };

  const runSync = async () => {
    setSyncErr(null);
    setSyncOk(null);
    setSyncing(true);
    try {
      const res = await postJson<{ ok: boolean; message: string; added: number; skipped: number }>(
        "/api/sync/wa-to-crm",
        {},
      );
      setSyncOk(
        `${res.message}` +
          (typeof res.added === "number" ? ` (+${res.added} baru, ${res.skipped} dilewati)` : ""),
      );
      onRefresh?.();
    } catch (err) {
      setSyncErr(errMessage(err, "Sinkronisasi gagal."));
    } finally {
      setSyncing(false);
    }
  };

  const runImport = async (e: FormEvent) => {
    e.preventDefault();
    setImportErr(null);
    setImportMsg(null);
    if (!file) {
      setImportErr("Pilih file .xlsx atau .csv terlebih dahulu.");
      return;
    }
    setImporting(true);
    try {
      let aoa: unknown[][];
      try {
        aoa = await parseFileToAoa(file);
      } catch {
        aoa = [];
      }
      if (!aoa || aoa.length < 2) {
        setImportErr("File tidak dapat dibaca. Pastikan format .xlsx of .csv.");
        return;
      }
      const payload = buildCrmImportRows(aoa);
      if (!payload.length) {
        setImportErr("File tidak dapat dibaca. Pastikan format .xlsx of .csv.");
        return;
      }
      await postJson("/api/tables/crm", payload);
      setImportMsg(`${payload.length} baris diimport.`);
      setFile(null);
      onRefresh?.();
    } catch (err) {
      setImportErr(errMessage(err, "Import gagal."));
    } finally {
      setImporting(false);
    }
  };

  /* --- Export helpers --- */
  const downloadSelected = () => {
    if (!selectedRows.length) return;
    const csv = mekariCsv(selectedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = mekariFilename();
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadFiltered = () => {
    const csv = mekariCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = mekariFilename();
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const copyPhoneNumbers = async () => {
    const txt = buildPhoneListText(anySelected ? selectedRows : filtered);
    try {
      await navigator.clipboard.writeText(txt);
      setSyncOk(`📋 ${phoneValidation.validUnique} nomor berhasil disalin ke papan klip.`);
      setTimeout(() => setSyncOk(null), 3000);
    } catch { setSyncErr("Gagal menyalin nomor."); }
  };

  const hasData = rows.length > 0;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {hasData ? (
          <>
            {/* Page header + primary action (reference anatomy) */}
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
                  CRM / Leads
                </h1>
                <p className="mt-1 text-[0.92rem] text-muted">
                  Sinkronisasi WA→CRM, import/export, dan filter database lead.
                </p>
              </div>
              <Button variant="secondary" onClick={onRefresh} className="shrink-0">
                🔄 Refresh Data
              </Button>
            </header>
          </>
        ) : (
          <ModuleHero
            icon="🎯"
            title="CRM / Leads"
            desc="Sinkronisasi WA→CRM, import/export, dan filter database lead."
          />
        )}

        {/* Sync & Import (2-col) — always shown (V3 order) */}
        <SectionHeader title="Sync & Import" subtitle="Tarik prospects dan import data baru." />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Sync (left) */}
          <div className="rounded-[10px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]">
            <p className="mb-1 text-[0.95rem] font-semibold text-ink">Sinkronisasi WA Admin → CRM</p>
            {syncErr ? (
              <p role="alert" className="mt-2 rounded-[8px] border border-danger/30 bg-danger/10 px-3 py-2 text-[0.85rem] font-semibold text-danger">
                ⚠️ {syncErr}
              </p>
            ) : null}
            {syncOk ? (
              <p role="status" className="mt-2 rounded-[8px] border border-success/30 bg-success/10 px-3 py-2 text-[0.85rem] font-semibold text-success">
                ✅ {syncOk}
              </p>
            ) : null}
            <div className="mt-4">
              <Button variant="primary" onClick={runSync} disabled={syncing} className="w-full">
                {syncing ? "Menyinkronkan..." : "Tarik data unik dari WA Admin"}
              </Button>
            </div>
          </div>

          {/* Import (right) */}
          <form
            onSubmit={runImport}
            className="rounded-[10px] border border-border bg-surface p-6 shadow-[var(--dm-shadow)]"
          >
            <p className="mb-1 text-[0.95rem] font-semibold text-ink">Import data baru</p>
            <p className="mb-3 text-[0.82rem] text-muted">
              Kolom dikenali: <code className="rounded bg-muted/10 px-1">{IMPORT_COLUMNS.join(", ")}</code>.
            </p>
            <input
              id="crm-import-file"
              type="file"
              accept=".xlsx,.csv"
              onChange={onFile}
              className="block w-full text-[0.85rem] text-muted file:mr-3 file:rounded-[6px] file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white file:font-semibold"
            />
            {importErr ? (
              <p role="alert" className="mt-2 rounded-[8px] border border-danger/30 bg-danger/10 px-3 py-2 text-[0.85rem] font-semibold text-danger">
                ⚠️ {importErr}
              </p>
            ) : null}
            {importMsg ? (
              <p role="status" className="mt-2 rounded-[8px] border border-success/30 bg-success/10 px-3 py-2 text-[0.85rem] font-semibold text-success">
                ✅ {importMsg}
              </p>
            ) : null}
            <div className="mt-4">
              <Button variant="secondary" type="submit" disabled={importing} className="w-full">
                {importing ? "Mengimpor..." : "Konfirmasi import"}
              </Button>
            </div>
          </form>
        </div>

        <Divider />

        {/* On empty CRM V3 stops after empty_state + footer (no filters/table/export). */}
        {!hasData ? (
          <>
            <EmptyState title="Database CRM kosong." hint="Taruh data lewat Sync WA Admin atau import file." />
            <Divider />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={onRefresh}>
                🔄 Refresh Data
              </Button>
            </div>
          </>
        ) : (
          <>
            <SectionHeader title="Filter & Cari" subtitle="Cari dan filter database lead." />
            {/* Search */}
            <TextInput id="crm-search" label="Cari nama / nomor HP" placeholder="Ketik nama atau nomor HP..." value={search} onInput={setSearch} />
            {/* Treatment quick-chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {TREATMENT_CHIPS.map(chip => (
                <TreatmentChip key={chip.filter} label={chip.label} active={treatment === chip.filter} onClick={() => setTreatment(chip.filter)} />
              ))}
            </div>
            {/* Kategori + Mekari Tag + Domisili (3-col grid) */}
            <div className="mt-4 grid gap-5 md:grid-cols-3">
              <MultiSelect label="Kategori" options={options.kategori} selected={kategoriSel} onToggle={toggleKategori} />
              <MultiSelect label="Mekari Tag" options={options.mekari} selected={mekariSel} onToggle={toggleMekari} />
              <MultiSelect label="Domisili" options={options.domisili} selected={domisiliSel} onToggle={toggleDomisili} />
            </div>

            <div className="mt-6">
              <MetricRow>
                <MetricCard icon="🎯" label="Hasil Filter" value={String(metrics.hasilFilter)} />
                <MetricCard icon="🗄️" label="Total DB" value={String(metrics.totalDb)} />
                <MetricCard icon="🟡" label="Sudah T1" value={String(metrics.sudahT1)} />
                <MetricCard icon="🟢" label="Sudah T2" value={String(metrics.sudahT2)} />
              </MetricRow>
            </div>

            {/* Phone validation card */}
            <div className="mt-6 rounded-[10px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)]">
              <p className="mb-2 text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Validasi Nomor HP</p>
              <MetricRow>
                <MetricCard icon="📊" label="Total Baris" value={String(phoneValidation.total)} />
                <MetricCard icon="✅" label="Valid (unik)" value={String(phoneValidation.validUnique)} />
                <MetricCard icon="⚠️" label="Kosong/Kurang" value={String(phoneValidation.missingCount)} />
                <MetricCard icon="🔄" label="Duplikat" value={String(phoneValidation.duplicatesRemoved)} />
              </MetricRow>
            </div>

            <Divider />
            {/* ====================================================================
                BULK SELECTION TOOLBAR (above table)
                ==================================================================== */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {!anySelected ? (
                  <Button variant="ghost" onClick={selectAllFiltered} disabled={filtered.length === 0}>
                    ☑️ Pilih semua terfilter ({filtered.length})
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-[0.85rem] font-semibold text-brand">{selectedIds.size} terpilih</span>
                    <Button variant="ghost" onClick={deselectAll}>Batal pilih semua</Button>
                  </div>
                )}
              </div>
            </div>

            {/* ====================================================================
                DATA TABLE (custom: checkbox + simplified cols + expandable detail)
                ==================================================================== */}
            <div className="overflow-hidden rounded-[10px] border border-border bg-surface shadow-[var(--dm-shadow)]">
              {filtered.length === 0 ? (
                <div className="px-6 py-12"><EmptyState title="Tidak ada hasil filter." hint="Ubah kata kunci atau pilihan filter." /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    {/* Sticky header */}
                    <thead className="sticky top-0 z-10 border-b border-divider bg-surface">
                      <tr>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted" style={{ width: "36px" }}>
                          <input type="checkbox" checked={allFilteredSelected} onChange={selectAllFiltered}
                            className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand cursor-pointer" aria-label="Pilih semua" />
                        </th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted" style={{ width: "40px" }}>#</th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted">No Hp</th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted">Nama</th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted">Mekari Tag</th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted">Kategori</th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted">Domisili</th>
                        <th className="border-b border-divider px-3 py-2.5 text-left text-[0.75rem] font-semibold uppercase tracking-[0.02em] text-muted">Status Treatment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, idx) => {
                        const hpRaw = String(row["No Hp"] ?? "");
                        const hpNorm = normalizePhone(hpRaw);
                        const nama = String(row["Nama"] ?? "");
                        const mekari = String(row["Mekari Tag (Status Terakhir)"] ?? "");
                        const kategori = String(row["Kategori"] ?? "");
                        const domisili = String(row["Domisili"] ?? "");
                        const treatBadge = computeTreatmentStatus(row);
                        const isSelected = selectedIds.has(idx);

                        return (
                          <>
                            <tr key={idx}
                              className={`border-b border-divider cursor-pointer transition-colors ${isSelected ? "bg-brand/[0.06]" : "hover:bg-gray-50"}`}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).type !== "checkbox") setExpandedRowIdx(expandedRowIdx === idx ? null : idx);
                              }}
                            >
                              {/* Checkbox cell */}
                              <td className="border-b border-divider px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={isSelected} onChange={() => toggleRowSelection(idx)}
                                  className="h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand cursor-pointer"
                                  aria-label={`Pilih ${nama || idx}`} />
                              </td>
                              <td className="border-b border-divider px-3 py-2 text-[0.75rem] text-muted">{idx + 1}</td>
                              <td className="border-b border-divider px-3 py-2">
                                <span className={`text-[0.8125rem] font-mono ${hpNorm ? "text-ink" : "text-muted italic"}`}>{hpNorm || "—"}</span>
                              </td>
                              <td className="border-b border-divider px-3 py-2 text-[0.8125rem] font-medium text-ink">{nama || "—"}</td>
                              <td className="border-b border-divider px-3 py-2 text-[0.8125rem] text-ink">{mekari || "—"}</td>
                              <td className="border-b border-divider px-3 py-2 text-[0.8125rem] text-ink">{kategori || "—"}</td>
                              <td className="border-b border-divider px-3 py-2 text-[0.8125rem] text-ink">{domisili || "—"}</td>
                              <td className="border-b border-divider px-3 py-2"><TreatmentBadge badge={treatBadge} /></td>
                            </tr>
                            {/* Expanded detail row */}
                            {expandedRowIdx === idx && (
                              <tr className="bg-surface-strong">
                                <td colSpan={8} className="px-5 py-3">
                                  <div className="grid grid-cols-3 gap-3 text-[0.8125rem]">
                                    <DetailCell label="Tanggal Lahir" value={row["Tanggal Lahir"]} />
                                    <DetailCell label="Usia" value={row["Usia"]} />
                                    <DetailCell label="Keterangan Form" value={row["Keterangan Setelah Isi Form"]} />
                                    <DetailCell label="Tanggal Masuk" value={row["Tanggal Masuk Database"]} />
                                    <DetailCell label="Treatment 1" value={row["Treatment 1"]} />
                                    <DetailCell label="Treatment 2" value={row["Treatment 2"]} />
                                    <DetailCell label="Tgl Treatment 1" value={row["Tanggal Treatment 1"]} />
                                    <DetailCell label="Tgl Treatment 2" value={row["Tanggal Treatment 2"]} />
                                    <DetailCell label="Status" value={row["Status"]} />
                                    <DetailCell label="Updated Status" value={row["Updated Status After Treatment"]} />
                                    <DetailCell label="Catatan" value={row["Catatan"]} fullCol />
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ====================================================================
                EXPORT ACTIONS
                ==================================================================== */}
            <Divider />
            <SectionHeader title="Ekspor" subtitle="Unduh atau salin kontak untuk WhatsApp blasting." />
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={downloadFiltered} disabled={filtered.length === 0}>
                ⬇️ Export Filtered ({filtered.length} baris)
              </Button>
              <Button variant="secondary" onClick={downloadSelected} disabled={!anySelected}>
                ⬇️ Export Selected ({selectedIds.size})
              </Button>
              <Button variant="secondary" onClick={copyPhoneNumbers} disabled={filtered.length === 0}>
                📋 Copy Phone Numbers ({phoneValidation.validUnique} unik)
              </Button>
            </div>

            {/* Floating action bar when rows are selected */}
            {anySelected && (
              <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-[12px] border border-border bg-surface px-5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                <span className="text-[0.85rem] font-bold text-brand">{selectedIds.size} terpilih</span>
                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={downloadSelected} className="px-3 py-1.5 text-[0.78rem]">⬇️ Export</Button>
                  <Button variant="secondary" onClick={copyPhoneNumbers} className="px-3 py-1.5 text-[0.78rem]">📋 Copy Numbers</Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}