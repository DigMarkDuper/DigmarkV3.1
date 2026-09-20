/**
 * AdsDashboard — presentational body of the Ads workspace (port of 7_Ads.py).
 *
 * Renders, V3-style:
 *   - "ROI Overview" MetricRow (Total Spend / Leads / Closing / CAC / ROAS)
 *     from the server scalars passed in (GET /api/ads/metrics), never computed
 *     here; empty -> "—" mirrors the Overview route's degraded handling.
 *   - Three tabs (TikTok / Meta/IG / Mekari). TikTok & Meta show per-platform
 *     KPIs (spend/leads/closing/CPL, derived in @@workspaces/ads), a raw file
 *     import (POST /api/import/{key}, multipart) and a server-guarded clear.
 *   - Mekari shows interaction/biaya KPIs + a DataTable when data exists, an
 *     EmptyState otherwise, the special summary-row import (client computes the
 *     row, then POST /api/tables/mekari) and a server-guarded clear.
 *   - Refresh footer (V3 refresh_button -> refetch).
 *
 * Writes go ONLY through the API. The browser never touches Sheets and the
 * destructive clear is ONLY a call to POST /api/clear/{key} (editor role +
 * confirm:true + exact tabTitle are enforced server-side and re-guarded by the
 * adapter). Viewer role hides the clear controls (the server still blocks).
 */
"use client";
import { useState } from "react";
import type { Row } from "@/server/adapter/source";
import { postJson, uploadFile } from "@/lib/api-client";
import { TAB_SCHEMAS } from "@/server/adapter/schema";
import { formatRoas, formatRupiah } from "@/components/ui-common";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { EmptyState } from "@/components/sections/EmptyState";
import { DataTable } from "@/components/grid/DataTable";
import {
  adsTab,
  buildMekariRow,
  mekariStats,
  parseFileToAoa,
  TIKTOK_TAB,
  META_TAB,
  type AdsTabConfig,
} from "@/workspaces/ads";

export interface AdsMetrics {
  spend: number;
  leads: number;
  closing: number;
  cac: number;
  roas: number;
  omzet: number;
}

export interface AdsDashboardProps {
  tiktokRows: Row[];
  metaRows: Row[];
  mekariRows: Row[];
  waRows: Row[];
  /** Final ROI scalars from GET /api/ads/metrics (null while loading/empty). */
  metrics: AdsMetrics | null;
  /** Declared schema columns for each ad tab (DataTable ordering). */
  columns: { tiktok: string[]; meta: string[]; mekari: string[] };
  /** Session role ("viewer" | "editor"). Clear controls need editor. */
  role: string;
  onRefresh?: () => void;
}

interface Notice {
  kind: "ok" | "err" | "warn";
  text: string;
}

function errText(err: unknown): string {
  if (err && typeof err === "object" && "message" in (err as { message?: string })) {
    return (err as { message: string }).message;
  }
  return "Operasi gagal. Periksa kembali file atau sesi.";
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  const cls =
    notice.kind === "ok"
      ? "border-success/30 bg-success/10 text-success"
      : notice.kind === "warn"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-danger/30 bg-danger/10 text-danger";
  return (
    <div role="status" className={`mt-3 rounded-[12px] border ${cls} px-4 py-3 text-[0.9rem] font-semibold`}>
      {notice.text}
    </div>
  );
}

/** Tab pill row (V3 st.tabs), matching the WorkspaceNav active look. */
const AD_TABS: { id: string; label: string }[] = [
  { id: "tiktok", label: "TikTok" },
  { id: "meta", label: "Meta/IG" },
  { id: "mekari", label: "Mekari" },
];

function TabBar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <div role="tablist" aria-label="Ads platforms" className="flex flex-wrap items-center gap-2">
      {AD_TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          onClick={() => onSelect(t.id)}
          className={
            "rounded-full px-4 py-1.5 text-[0.86rem] font-semibold transition-colors duration-150 " +
            (t.id === active
              ? "bg-surface-strong text-ink font-bold ring-2 ring-brand/40"
              : "bg-surface text-muted hover:text-brand-hover")
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Server-guarded destructive clear: confirm dialog requires the exact tab name. */
function ClearControl({
  tabKey,
  tabTitle,
  title,
  onCleared,
}: {
  tabKey: string;
  tabTitle: string;
  title: string;
  onCleared?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = async () => {
    if (typed !== tabTitle) return;
    setBusy(true);
    setNotice(null);
    try {
      await postJson(`/api/clear/${tabKey}`, { confirm: true, tabTitle });
      setNotice({ kind: "ok", text: `Tab '${tabTitle}' telah kosongkan.` });
      setOpen(false);
      setTyped("");
      onCleared?.();
    } catch (err) {
      setNotice({ kind: "err", text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      {notice ? <NoticeBanner notice={notice} /> : null}
      {!open ? (
        <Button variant="destructive" onClick={() => setOpen(true)} ariaLabel={`Kosongkan seluruh baris dari ${title}`}>
          🗑️ Kosongkan tab {title}
        </Button>
      ) : (
        <div className="rounded-[16px] border border-danger/40 bg-danger/8 p-5 backdrop-blur-[8px]">
          <p className="text-[0.9rem] font-semibold leading-[1.5] text-ink">
            ⚠️ Menghapus seluruh baris dari <span className="font-bold text-danger">{tabTitle}</span>.
            Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="mt-3 flex flex-col gap-3">
            <TextInput
              id={`clear-${tabKey}`}
              label={`Ketik "${tabTitle}" untuk konfirmasi`}
              value={typed}
              onInput={setTyped}
              placeholder={tabTitle}
              autoComplete="off"
            />
            <div className="flex items-center gap-3 justify-end">
              <Button variant="secondary" onClick={() => { setOpen(false); setTyped(""); }}>
                Batal
              </Button>
              <Button variant="destructive" disabled={typed !== tabTitle || busy} onClick={run}>
                {busy ? "Kosongkan…" : "Ya, saya mengerti — kosongkan"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** TikTok / Meta raw-file import (POST /api/import/{key}, multipart). */
function PlatformImport({
  cfg,
  tabTitle,
  canEdit,
  onImported,
}: {
  cfg: AdsTabConfig;
  tabTitle: string;
  canEdit: boolean;
  onImported?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await uploadFile<{ ok: boolean; added: number }>(`/api/import/${cfg.key}`, "file", file);
      setNotice({ kind: "ok", text: `${res.added} baris diimport ke ${cfg.title}.` });
      setFile(null);
      onImported?.();
    } catch (err) {
      setNotice({ kind: "err", text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 backdrop-blur-[8px] shadow-[var(--dm-shadow)]">
      <p className="text-[0.88rem] font-semibold text-muted">Upload file (.csv / .xlsx)</p>
      <input
        type="file"
        id={`file-${cfg.key}`}
        name="file"
        accept=".csv,.xlsx,.xls"
        className="mt-2 block w-full text-sm text-ink"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="mt-3 flex justify-end">
        <Button variant="primary" disabled={!file || busy} onClick={run}>
          {busy ? "Mengimpor…" : `Import ${cfg.title} → Google Sheets`}
        </Button>
      </div>
      {notice ? <NoticeBanner notice={notice} /> : null}
      {canEdit ? <ClearControl tabKey={cfg.key} tabTitle={tabTitle} title={cfg.title} onCleared={onImported} /> : null}
    </div>
  );
}

/** Per-platform KPI + import + clear (V3 _ads_tab). */
function AdsPlatformSection({
  cfg,
  rows,
  wa,
  canEdit,
  onRefresh,
}: {
  cfg: AdsTabConfig;
  rows: Row[];
  wa: Row[];
  canEdit: boolean;
  onRefresh?: () => void;
}) {
  const tabTitle = TAB_SCHEMAS[cfg.key].tab;
  const stats = adsTab(rows, wa, cfg.costKeys, cfg.sourcePat);
  return (
    <>
      <SectionHeader title={`KPI ${cfg.title}`} subtitle="Spend dan hasil per platform." />
      <MetricRow>
        <MetricCard icon="💰" label={`Spend ${cfg.title}`} value={formatRupiah(stats.spend)} />
        <MetricCard icon="👥" label={`Leads ${cfg.title}`} value={String(stats.leads)} />
        <MetricCard icon="✅" label={`Closing ${cfg.title}`} value={String(stats.closing)} />
        <MetricCard icon="📌" label="CPL" value={stats.cpl} />
      </MetricRow>
      <Divider />
      <SectionHeader title={`Import data ${cfg.title}`} subtitle="Upload laporan untuk menyimpan ke Google Sheets." />
      <PlatformImport cfg={cfg} tabTitle={tabTitle} canEdit={canEdit} onImported={onRefresh} />
    </>
  );
}

function MekariSection({
  rows,
  columns,
  canEdit,
  onRefresh,
}: {
  rows: Row[];
  columns: string[];
  canEdit: boolean;
  onRefresh?: () => void;
}) {
  const stats = mekariStats(rows);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const aoa = await parseFileToAoa(file);
      if (!aoa || aoa.length < 2) {
        setNotice({ kind: "err", text: "File tidak dapat dibaca." });
        return;
      }
      const result = buildMekariRow(aoa);
      if (result.warning) {
        setNotice({ kind: "warn", text: result.warning });
        return;
      }
      await postJson("/api/tables/mekari", result.row);
      setNotice({ kind: "ok", text: "Laporan Mekari tersimpan." });
      setFile(null);
      onRefresh?.();
    } catch (err) {
      setNotice({ kind: "err", text: errText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {rows.length ? (
        <>
          <SectionHeader title="KPI Mekari" subtitle="Interaksi dan biaya broadcast." />
          <MetricRow>
            <MetricCard icon="💬" label="Total Interaksi" value={String(stats.total)} />
            <MetricCard icon="💰" label="Total Biaya" value={formatRupiah(stats.biaya)} />
            <MetricCard icon="📌" label="Biaya / Interaksi" value={stats.biayaPer} />
          </MetricRow>
          <Divider />
          <SectionHeader title="Data Mekari" subtitle="Seluruh baris dari REPORT MEKARI." />
          <DataTable rows={rows} columns={columns} emptyTitle="Belum ada data Mekari." />
        </>
      ) : (
        <EmptyState title="Belum ada data Mekari." hint="Import laporan untuk mulai." />
      )}
      <Divider />
      <SectionHeader title="Import laporan Mekari" subtitle="Upload CSV / XLSX untuk laporan." />
      <div className="rounded-[16px] border border-border bg-surface p-5 backdrop-blur-[8px] shadow-[var(--dm-shadow)]">
        <p className="text-[0.88rem] font-semibold text-muted">Upload file</p>
        <input
          type="file"
          id="file-mekari"
          name="file"
          accept=".csv,.xlsx,.xls"
          className="mt-2 block w-full text-sm text-ink"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" disabled={!file || busy} onClick={run}>
            {busy ? "Proses…" : "Proses & simpan Mekari"}
          </Button>
        </div>
        {notice ? <NoticeBanner notice={notice} /> : null}
        {canEdit ? <ClearControl tabKey="mekari" tabTitle={TAB_SCHEMAS.mekari.tab} title="Mekari" onCleared={onRefresh} /> : null}
      </div>
    </>
  );
}

export function AdsDashboard({
  tiktokRows,
  metaRows,
  mekariRows,
  waRows,
  metrics,
  columns,
  role,
  onRefresh,
}: AdsDashboardProps) {
  const [active, setActive] = useState("tiktok");
  const canEdit = role === "editor";

  // ROI Overview — empty (all-zero or not yet loaded) degrades to "—" for every
  // card, mirroring the Overview route's empty handling.
  const m = metrics;
  const emptyRoi = !m || (m.spend === 0 && m.leads === 0 && m.closing === 0);
  const roiSpend = emptyRoi ? "—" : formatRupiah(m!.spend);
  const roiLeads = emptyRoi ? "—" : String(m!.leads);
  const roiClosing = emptyRoi ? "—" : `${m!.closing} siswa`;
  const roiCac = emptyRoi ? "—" : formatRupiah(m!.cac);
  const roiRoas = emptyRoi ? "—" : formatRoas(m!.roas, m!.spend > 0);

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1220px]">
      {/* Page header + primary action (reference anatomy) */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
        <div className="min-w-0">
          <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
          <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
            Ads Performance
          </h1>
          <p className="mt-1 text-[0.92rem] text-muted">
            Spend, CAC/ROAS, dan import laporan TikTok / Meta / Mekari.
          </p>
        </div>
        <Button variant="secondary" onClick={onRefresh} className="shrink-0">
          🔄 Refresh Data
        </Button>
      </header>

      <SectionHeader title="Ringkasan ROI" subtitle="Total spend dan hasil untuk semua kampanye." />
      <MetricRow>
        <MetricCard icon="💵" label="Total Spend" value={roiSpend} />
        <MetricCard icon="👥" label="Leads" value={roiLeads} />
        <MetricCard icon="✅" label="Closing" value={roiClosing} />
        <MetricCard icon="📌" label="CAC" value={roiCac} />
        <MetricCard icon="🚀" label="ROAS" value={roiRoas} />
      </MetricRow>

      <Divider />

      <TabBar active={active} onSelect={setActive} />

      {active === "tiktok" ? (
        <AdsPlatformSection cfg={TIKTOK_TAB} rows={tiktokRows} wa={waRows} canEdit={canEdit} onRefresh={onRefresh} />
      ) : active === "meta" ? (
        <AdsPlatformSection cfg={META_TAB} rows={metaRows} wa={waRows} canEdit={canEdit} onRefresh={onRefresh} />
      ) : (
        <MekariSection rows={mekariRows} columns={columns.mekari} canEdit={canEdit} onRefresh={onRefresh} />
      )}

    </main>
  );
}