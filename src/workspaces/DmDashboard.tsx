/**
 * DmDashboard — presentational body of the Digital Marketing workspace +
 * the prospect-append form (the Phase E "first writable workspace").
 *
 * Given normalized rows from GET /api/tables/dm_sosmed, renders the V3
 * 6_DM_Sosmed.py layout with Phase D design-system components:
 *   - Metrik Kunci (only when data non-empty; platform-col resolved V3-style)
 *   - Visualisasi (2-col status + tag donuts, hole 0.5)
 *   - Input Prospek Baru form (client-side validation + POST via postJson) +
 *     success/error states, clear-on-success, refetch after append
 *   - Recent Update (15 most recent rows)
 *   - Refresh footer
 *
 * The route shell owns auth + GET via useApi + refetch. The form writes ONLY
 * through the API (POST /api/tables/dm_sosmed, schema-keyed object); the
 * server adapter decides the backing spreadsheet. Never touches Sheets here.
 */
"use client";
import { useMemo, useState, type FormEvent } from "react";
import type { Row } from "@/server/adapter/source";
import { postJson } from "@/lib/api-client";
import { DataTable } from "@/components/grid/DataTable";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricRow } from "@/components/metrics/MetricRow";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { EmptyState } from "@/components/sections/EmptyState";
import { TextInput, Select } from "@/components/ui/Field";
import { PALETTE } from "@/components/ui-common";
import {
  deriveDmStats,
  buildAppendPayload,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  TAG_OPTIONS,
  type SourceStat,
} from "@/workspaces/dm";

/** V3 donut colors `[blue, yellow, success, warn, danger, "#7D8FA3"]` — hardcoded grey re-pointed to PALETTE. */
const DONUT_COLORS = [
  PALETTE.brand, PALETTE.accent, PALETTE.success, PALETTE.warning, PALETTE.danger, PALETTE.catSlate,
];

export interface DmDashboardProps {
  rows: Row[];
  /** Declared schema columns for the dm_sosmed tab (rendering fallback). */
  columns: string[];
  onRefresh?: () => void;
}

/** Dependency-free SVG donut (hole 0.5) — V3 `px.pie(hole=0.5)`, ~300px. */
function Donut({ dist, label }: { dist: SourceStat[]; label: string }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  const total = dist.reduce((sum, d) => sum + d.n, 0) || 1;
  const segs = dist.reduce<{ d: SourceStat; len: number; offset: number }[]>((acc, d) => {
    const len = (d.n / total) * c;
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ d, len, offset });
    return acc;
  }, []);
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={label}
      className="mx-auto h-full w-full"
    >
      <circle cx="100" cy="100" r={r} fill="none" stroke={PALETTE.grid} strokeWidth="26" />
      {segs.map((seg, i) => (
        <circle
          key={i}
          cx="100" cy="100" r={r} fill="none"
          stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="26"
          strokeDasharray={`${seg.len} ${c - seg.len}`} strokeDashoffset={-seg.offset}
          transform="rotate(-90 100 100)"
        />
      ))}
      <text x="100" y="108" textAnchor="middle" fontSize="38" fontWeight="800" fill={PALETTE.ink}>
        {total}
      </text>
      <text x="100" y="126" textAnchor="middle" fontSize="12" fontWeight="600" fill={PALETTE.muted}>
        {label}
      </text>
    </svg>
  );
}

const option = (v: string) => ({ value: v, label: v });

export function DmDashboard({ rows, columns, onRefresh }: DmDashboardProps) {
  const stats = useMemo(() => deriveDmStats(rows), [rows]);

  // Append form state.
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [username, setUsername] = useState("");
  const [domisili, setDomisili] = useState("");
  const [hp, setHp] = useState("");
  const [statusDm, setStatusDm] = useState(STATUS_OPTIONS[0]);
  const [tagDm, setTagDm] = useState(TAG_OPTIONS[0]);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    if (!username.trim()) {
      setWarning("⚠️ Nama/username wajib diisi.");
      setError(null);
      return;
    }
    setWarning(null);
    setSaving(true);
    setError(null);
    try {
      const payload = buildAppendPayload(
        { platform, username, domisili, hp, statusDm, tagDm },
        rows.length,
      );
      await postJson("/api/tables/dm_sosmed", payload);
      setSuccess(`🔥 Berhasil menyimpan ${username}!`);
      // Clear the form on successful submit (V3 clear_on_submit).
      setUsername("");
      setDomisili("");
      setHp("");
      setPlatform(PLATFORM_OPTIONS[0]);
      setStatusDm(STATUS_OPTIONS[0]);
      setTagDm(TAG_OPTIONS[0]);
      onRefresh?.();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in (err as { message?: string })
          ? (err as { message: string }).message
          : "Gagal menyimpan prospek.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const hasData = stats.total > 0;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {/* Page header + primary action (reference anatomy) */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
          <div className="min-w-0">
            <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
            <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
              Digital Marketing
            </h1>
            <p className="mt-1 text-[0.92rem] text-muted">
              Prospek dari DM, distribusi status/kualitas, dan input prospek baru.
            </p>
          </div>
          <Button variant="secondary" onClick={onRefresh} className="shrink-0">
            🔄 Refresh Data
          </Button>
        </header>

        {/* Key metrics — only when data non-empty */}
        {hasData ? (
          <>
            <SectionHeader title="Metrik Kunci" subtitle="Prospek per platform." />
            {stats.platCol ? (
              <MetricRow>
                <MetricCard icon="👥" label="Total Prospek" value={String(stats.total)} />
                <MetricCard icon="📸" label="Instagram" value={String(stats.instagram)} />
                <MetricCard icon="🎵" label="TikTok" value={String(stats.tiktok)} />
                <MetricCard icon="👍" label="Facebook" value={String(stats.facebook)} />
              </MetricRow>
            ) : (
              <MetricRow>
                <MetricCard icon="👥" label="Total Prospek" value={String(stats.total)} />
              </MetricRow>
            )}
            <Divider />

            {/* Visualizations — 2-col */}
            <SectionHeader title="Visualisasi" subtitle="Distribusi status dan kualitas." />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ChartContainer data={stats.statusDist} heightClass="h-[300px]" label="Status">
                {stats.statusDist.length ? <Donut dist={stats.statusDist} label="status" /> : null}
              </ChartContainer>
              {stats.tagDist.length ? (
                <ChartContainer data={stats.tagDist} heightClass="h-[300px]" label="Tag Prospek">
                  <Donut dist={stats.tagDist} label="tag" />
                </ChartContainer>
              ) : (
                <ChartContainer data={[]} heightClass="h-[300px]" label="Tag Prospek" />
              )}
            </div>
            <Divider />
          </>
        ) : null}

        {/* Input Prospek Baru (APPEND) */}
        <SectionHeader title="Input Prospek Baru" subtitle="Registrasi prospek baru dari DM." />
        <form
          onSubmit={handleSubmit}
          className="rounded-[20px] border border-border bg-surface p-6 backdrop-blur-[10px] saturate-[140%] shadow-[var(--dm-shadow)]"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Select
              id="dm-platform"
              label="Platform"
              value={platform}
              options={PLATFORM_OPTIONS.map(option)}
              onSelect={setPlatform}
            />
            <TextInput
              id="dm-username"
              label="Nama / Username"
              placeholder="@username" 
              value={username}
              onInput={setUsername}
              required
            />
            <TextInput
              id="dm-domisili"
              label="Domisili"
              value={domisili}
              onInput={setDomisili}
            />
            <TextInput
              id="dm-hp"
              label="No HP / WhatsApp"
              value={hp}
              onInput={setHp}
            />
            <Select
              id="dm-status"
              label="Status DM"
              value={statusDm}
              options={STATUS_OPTIONS.map(option)}
              onSelect={setStatusDm}
            />
            <Select
              id="dm-tag"
              label="Tag Prospek"
              value={tagDm}
              options={TAG_OPTIONS.map(option)}
              onSelect={setTagDm}
            />
          </div>

          {warning ? (
            <div role="alert" className="mt-4 rounded-[12px] border border-warning/30 bg-warning/10 px-4 py-3 text-[0.9rem] font-semibold text-warning">
              {warning}
            </div>
          ) : null}
          {error ? (
            <div role="alert" className="mt-4 rounded-[12px] border border-danger/30 bg-danger/10 px-4 py-3 text-[0.9rem] font-semibold text-danger">
              ⚠️ {error}
            </div>
          ) : null}
          {success ? (
            <div role="status" className="mt-4 rounded-[12px] border border-success/30 bg-success/10 px-4 py-3 text-[0.9rem] font-semibold text-success">
              {success}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "💾 Simpan"}
            </Button>
          </div>
        </form>

        <Divider />

        {/* Recent Update */}
        <SectionHeader title="Update Terbaru" subtitle="15 data terbaru." />
        {hasData ? (
          <DataTable rows={stats.recent} columns={columns} emptyTitle="Belum ada data DM." />
        ) : (
          <EmptyState title="Belum ada data DM." hint="Import data untuk mulai." />
        )}
      </main>
    </div>
  );
}