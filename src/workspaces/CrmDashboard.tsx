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
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type { Row } from "@/server/adapter/source";
import { columnsFor } from "@/server/adapter/schema";
import { postJson } from "@/lib/api-client";
import { DataTable } from "@/components/grid/DataTable";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { TextInput, Select } from "@/components/ui/Field";
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
} from "@/workspaces/crm";

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
      <div className="max-h-[160px] overflow-y-auto rounded-[12px] border border-border bg-surface-input p-3">
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

export function CrmDashboard({ rows, columns, onRefresh }: CrmDashboardProps) {
  const declared = useMemo(() => columns ?? columnsFor("crm"), [columns]);

  // Filter/search state.
  const [search, setSearch] = useState("");
  const [mekariSel, setMekariSel] = useState<string[]>([]);
  const [domisiliSel, setDomisiliSel] = useState<string[]>([]);
  const [treatment, setTreatment] = useState("Semua");

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
    () => filterCrmRows(rows, { search, mekari: mekariSel, domisili: domisiliSel, treatment }),
    [rows, search, mekariSel, domisiliSel, treatment],
  );
  const metrics = useMemo(() => crmMetrics(filtered, rows), [filtered, rows]);

  const toggleMekari = (v: string) =>
    setMekariSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));
  const toggleDomisili = (v: string) =>
    setDomisiliSel((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

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

  const downloadMekari = () => {
    const csv = mekariCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = mekariFilename();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          <div className="rounded-[20px] border border-border bg-surface p-6 backdrop-blur-[10px] saturate-[140%] shadow-[var(--dm-shadow)]">
            <p className="mb-1 text-[0.95rem] font-semibold text-ink">Sinkronisasi WA Admin → CRM</p>
            {syncErr ? (
              <p role="alert" className="mt-2 rounded-[12px] border border-danger/30 bg-danger/10 px-3 py-2 text-[0.85rem] font-semibold text-danger">
                ⚠️ {syncErr}
              </p>
            ) : null}
            {syncOk ? (
              <p role="status" className="mt-2 rounded-[12px] border border-success/30 bg-success/10 px-3 py-2 text-[0.85rem] font-semibold text-success">
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
            className="rounded-[20px] border border-border bg-surface p-6 backdrop-blur-[10px] saturate-[140%] shadow-[var(--dm-shadow)]"
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
              className="block w-full text-[0.85rem] text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white file:font-semibold"
            />
            {importErr ? (
              <p role="alert" className="mt-2 rounded-[12px] border border-danger/30 bg-danger/10 px-3 py-2 text-[0.85rem] font-semibold text-danger">
                ⚠️ {importErr}
              </p>
            ) : null}
            {importMsg ? (
              <p role="status" className="mt-2 rounded-[12px] border border-success/30 bg-success/10 px-3 py-2 text-[0.85rem] font-semibold text-success">
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
            <div className="grid gap-5 md:grid-cols-2">
              <TextInput
                id="crm-search"
                label="Cari nama / nomor HP"
                placeholder="Ketik nama atau nomor HP..."
                value={search}
                onInput={setSearch}
              />
              <Select
                id="crm-treatment"
                label="Treatment"
                value={treatment}
                options={TREATMENT_OPTIONS.map((o) => ({ value: o, label: o }))}
                onSelect={setTreatment}
              />
            </div>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <MultiSelect
                label="Mekari Tag"
                options={options.mekari}
                selected={mekariSel}
                onToggle={toggleMekari}
              />
              <MultiSelect
                label="Domisili"
                options={options.domisili}
                selected={domisiliSel}
                onToggle={toggleDomisili}
              />
            </div>

            <div className="mt-6">
              <MetricRow>
                <MetricCard icon="🎯" label="Hasil Filter" value={String(metrics.hasilFilter)} />
                <MetricCard icon="🗄️" label="Total DB" value={String(metrics.totalDb)} />
                <MetricCard icon="1️⃣" label="Sudah T1" value={String(metrics.sudahT1)} />
                <MetricCard icon="2️⃣" label="Sudah T2" value={String(metrics.sudahT2)} />
              </MetricRow>
            </div>

            <Divider />

            <DataTable
              rows={filtered}
              columns={declared}
              emptyTitle="Tidak ada hasil filter."
              emptyHint="Ubah kata kunci atau pilihan filter."
            />

            <Divider />

            {/* Ekspor — Mekari CSV */}
            <SectionHeader title="Ekspor" subtitle="Unduh hasil filter sebagai CSV untuk Mekari." />
            <div className="flex justify-end">
              <Button variant="primary" onClick={downloadMekari} disabled={filtered.length === 0}>
                ⬇️ Unduh hasil filter (CSV Mekari)
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}