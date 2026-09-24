"use client";
/**
 * SosmedPlanningDashboard — planning body for /sosmed/planning
 * (docs/sosmed_split_ui_spec.md §3). Focus: planning content + managing the
 * content plan ("what will be made"). NO heavy production analytics here.
 *
 * Props { rows, planRows, isEditor, onRefresh } — identical shape to the
 * pre-split dashboard. Master Content Data stays editable (Save Changes works);
 * the buffered-refresh contract + add-to-production flow are unchanged.
 *
 * Uses the shared presentational module (sosmedUiShared) + `sosmed.ts` pure
 * derivations. Calendar-only helpers stay local here.
 */
import { useEffect, useMemo, useState } from "react";
import type { Row } from "@/server/adapter/source";
import { patchJson, postJson } from "@/lib/api-client";
import { Divider } from "@/components/ui/Divider";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/sections/SectionHeader";
import { MetricCard } from "@/components/metrics/MetricCard";
import { ModuleHero } from "@/components/layout/ModuleHero";
import { EmptyState } from "@/components/sections/EmptyState";
import { PALETTE } from "@/components/ui-common";
import {
  PROSES_OPTIONS,
  buildPlanPayload,
  buildProductionRow,
  calendarCells,
  contentKode,
  contentStrategy,
  deadlineBucket,
  deadlineDate,
  diffPatches,
  distinctValues,
  filterRows,
  latestDeadlineMonthSet,
  picOptions,
  productionKodeExists,
  productionOverview,
  searchContents,
  sosmedMonths,
  truthy,
  type SosmedPatch,
  type DeadlineBucket,
  EXPLORER_DEFAULT_COLS,
  SOSMED_BOOL_COLS,
  SOSMED_TEXT_COLS,
} from "@/workspaces/sosmed";
import {
  str,
  compactRow,
  ProsesBadge,
  PlanStatusBadge,
  MultiSelectDropdown,
  StrategyBar,
  ContentPlannerModal,
  ContentExplorer,
  RowDetailDrawer,
  type ExplorerFilterDim,
  SosmedSubNav,
  EXPLORER_PAGE_SIZE,
  btnReset,
} from "@/workspaces/sosmedUiShared";

export interface SosmedPlanningDashboardProps {
  rows: Row[];
  planRows?: Row[];
  isEditor: boolean;
  onRefresh?: () => void;
}

/** Today, resolved once per mount — passed to derivations for deterministic date math. */
const TODAY = new Date();

/* Calendar-only helpers stay local in this dashboard (spec §5.1). ---------- */

/** Indonesian month title for the calendar cursor. */
function monthTitleText(d: Date): string {
  const months = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** First day of the current month (calendar cursor initial state). */
function firstOfToday(): Date {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
}

/** Immutable month shift of a 1st-of-month cursor. */
function shiftMonth(c: Date, delta: number): Date {
  return new Date(c.getFullYear(), c.getMonth() + delta, 1);
}

function isDoneByLocal(r: Row): boolean { return str(r["PROSES"]).toUpperCase() === "DONE"; }
function startOfDayLocal(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

export function SosmedPlanningDashboard({ rows, planRows = [], isEditor, onRefresh }: SosmedPlanningDashboardProps) {
  const months = useMemo(() => sosmedMonths(rows), [rows]);
  const pics = useMemo(() => picOptions(rows), [rows]);
  const platformOptions = useMemo(() => distinctValues(rows, "Platform"), [rows]);
  const pillarOptions = useMemo(() => distinctValues(rows, "Konten Pillar"), [rows]);
  const formatOptions = useMemo(() => distinctValues(rows, "Output"), [rows]);
  const planOptions = useMemo(() => {
    const collect = (col: string) => distinctValues(planRows.length ? planRows : [], col);
    const priority = distinctValues(planRows, "Priority");
    return {
      pillar: collect("Content Pillar"), format: collect("Format"), platform: collect("Platform"), pic: collect("PIC"),
      priority: priority.length ? priority : ["High", "Medium", "Low"],
    };
  }, [planRows]);

  // --- §3.2 global filter (dims: Bulan/PIC/Platform/Pillar/Format — NO Status) ---
  const [picSel, setPicSel] = useState<Set<string>>(() => new Set(pics));
  const [monthSel, setMonthSel] = useState<Set<string>>(() => latestDeadlineMonthSet(months, rows));
  const [platformSel, setPlatformSel] = useState<Set<string>>(() => new Set(platformOptions));
  const [pillarSel, setPillarSel] = useState<Set<string>>(() => new Set(pillarOptions));
  const [formatSel, setFormatSel] = useState<Set<string>>(() => new Set(formatOptions));
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const resetAll = () => {
    setPicSel(new Set(pics)); setMonthSel(latestDeadlineMonthSet(months, rows));
    setPlatformSel(new Set(platformOptions)); setPillarSel(new Set(pillarOptions)); setFormatSel(new Set(formatOptions));
    setOpenMenu(null);
  };

  const filterDims: {
    name: string; label: string; hint?: string; className?: string; options: string[]; selected: Set<string>; set: (s: Set<string>) => void;
  }[] = [
    { name: "pic", label: "PIC", className: "md:col-span-1 xl:col-span-2", options: pics, selected: picSel, set: setPicSel },
    { name: "month", label: "Bulan Deadline", hint: "tugas berdasarkan deadline", options: months, selected: monthSel, set: setMonthSel },
    { name: "platform", label: "Platform", options: platformOptions, selected: platformSel, set: setPlatformSel },
    { name: "pillar", label: "Content Pillar", options: pillarOptions, selected: pillarSel, set: setPillarSel },
    { name: "format", label: "Format", options: formatOptions, selected: formatSel, set: setFormatSel },
  ];
  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const filtered = useMemo(
    () => filterRows(rows, { pics: picSel, months: monthSel, statuses: new Set(), platforms: platformSel, pillars: pillarSel, formats: formatSel }),
    [rows, picSel, monthSel, platformSel, pillarSel, formatSel],
  );
  const overview = useMemo(() => productionOverview(filtered, TODAY), [filtered]);
  const strategy = useMemo(() => contentStrategy(filtered), [filtered]);

  // Map a row back to its ORIGINAL index in the UNFILTERED `rows` array.
  const originalIndex = (r: Row): number => {
    const i = rows.indexOf(r);
    if (i >= 0) return i;
    return typeof r.__rowIndex === "number" ? r.__rowIndex : -1;
  };

  // --- shared editor draft + save (Explorer + detail drawer) ---
  type Draft = Record<number, Record<string, string | boolean>>;
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);

  const setCell = (rowIndex: number, col: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [rowIndex]: { ...(d[rowIndex] ?? {}), [col]: value } }));
    setSaveMsg(null);
  };
  const cellValue = (row: Row, col: string): unknown => {
    const idx = originalIndex(row);
    if (idx >= 0 && draft[idx] && draft[idx][col] !== undefined) return draft[idx][col];
    return row[col];
  };

  /** Save iterates the CURRENT page slice (rows the user can see). */
  const runSaveFor = async (targetRows: Row[]) => {
    setSaveMsg(null);
    const fullDraft: Draft = {};
    for (const row of targetRows) {
      const idx = originalIndex(row);
      if (idx < 0) continue;
      const edited = draft[idx] ?? {};
      fullDraft[idx] = {
        ...Object.fromEntries(SOSMED_BOOL_COLS.map((c) => [c, truthy(row[c])])),
        ...Object.fromEntries(SOSMED_TEXT_COLS.map((c) => [c, str(row[c])])),
        ...edited,
      };
    }
    const patches = diffPatches(rows, fullDraft);
    if (patches.length === 0) { setSaveMsg({ kind: "info", text: "Tidak ada perubahan." }); return; }
    setSaving(true);
    let ok = 0, err = 0;
    for (const p of patches) {
      try { await patchJson<SosmedPatch>("/api/tables/sosmed", p); ok++; }
      catch { err++; }
    }
    if (ok > 0) onRefresh?.();
    setSaving(false);
    if (err > 0) setSaveMsg({ kind: "err", text: `⚠️ ${err} perubahan gagal.` });
    else if (ok > 0) setSaveMsg({ kind: "ok", text: `✅ ${ok} perubahan tersimpan.` });
    else setSaveMsg({ kind: "ok", text: "✅ 0 perubahan tersimpan." });
  };

  // --- content_plan (+ Add-to-Production) state ---
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [planForm, setPlanForm] = useState<Record<string, string>>({ judul: "", publish: "", deadlineProduksi: "", pillar: "", format: "", platform: "", pic: "", brief: "", reference: "", priority: "", statusPlan: "IDEA" });
  const setPlanField = (k: string, v: string) => setPlanForm((f) => ({ ...f, [k]: v }));
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [pushedSet, setPushedSet] = useState<Set<number>>(new Set());

  const planFormValid = planForm.judul.trim() !== "" && planForm.publish.trim() !== "" && planForm.deadlineProduksi.trim() !== "";

  const saveContentPlan = async () => {
    setPlanError(null);
    if (!planFormValid) { setPlanError("⚠️ Isi judul dan tanggal sebelum menyimpan."); return; }
    setSavingPlan(true);
    try {
      await postJson("/api/tables/content_plan", buildPlanPayload({
        judul: planForm.judul, publish: planForm.publish, deadlineProduksi: planForm.deadlineProduksi,
        pillar: planForm.pillar, format: planForm.format, platform: planForm.platform, pic: planForm.pic,
        brief: planForm.brief, reference: planForm.reference, priority: planForm.priority, statusPlan: planForm.statusPlan,
      }));
      setSavingPlan(false);
      setPlannerOpen(false);
      setPlanForm({ judul: "", publish: "", deadlineProduksi: "", pillar: "", format: "", platform: "", pic: "", brief: "", reference: "", priority: "", statusPlan: "IDEA" });
      onRefresh?.();
      setSaveMsg({ kind: "ok", text: "✅ Content plan tersimpan." });
    } catch {
      setSavingPlan(false);
      setPlanError("⚠️ Gagal menyimpan. Coba lagi.");
    }
  };

  /** §3.5 — is this plan row already pushed (session OR durable data)? */
  const planIsPushed = (plan: Row, rowIndex: number): boolean => {
    if (pushedSet.has(rowIndex)) return true;
    const kode = contentKode(TODAY, rowIndex);
    if (productionKodeExists(rows, kode)) return true;
    return str(plan["Status Plan"]).trim().toUpperCase() === "DIPRODUKSI";
  };

  const addToProduction = async (plan: Row, rowIndex: number) => {
    if (planIsPushed(plan, rowIndex)) { setSaveMsg({ kind: "info", text: "ℹ️ Sudah ditambahkan ke produksi." }); return; }
    const kode = contentKode(TODAY, rowIndex);
    try {
      await postJson("/api/tables/sosmed", buildProductionRow(plan, TODAY, kode));
      setPushedSet((prev) => new Set(prev).add(rowIndex));
      // Durable lock: flip Status Plan -> DIPRODUKSI so a fresh reload hides the button.
      try { await patchJson<SosmedPatch>("/api/tables/content_plan", { rowIndex, column: "Status Plan", value: "DIPRODUKSI" }); } catch { /* lock persisted best-effort; kode collision also guards */ }
      onRefresh?.();
      setSaveMsg({ kind: "ok", text: `✅ Ditambahkan ke produksi: ${str(plan["Judul / Ide Konten"] || plan["Judul Konten"])}.` });
    } catch {
      setSaveMsg({ kind: "err", text: "⚠️ Gagal menambahkan ke produksi." });
    }
  };

  // --- §3.6 Content Calendar / List tabs + cursor + detail drawer ---
  const [tab, setTab] = useState<"calendar" | "list">("calendar");
  // Calendar default = TODAY directly (brief explicit; overrides the data-aware default).
  const [calCursor, setCalCursor] = useState(() => firstOfToday());
  const [detailRow, setDetailRow] = useState<Row | null>(null);
  const [editingDetail, setEditingDetail] = useState(false);
  const detailOpen = (row: Row) => { setEditingDetail(false); setSaveMsg(null); setDetailRow(row); };

  const calendarRows = useMemo(
    () => filtered.filter((r) => deadlineDate(r) !== null),
    [filtered],
  );
  const cells = useMemo(() => calendarCells(calendarRows, calCursor.getFullYear(), calCursor.getMonth(), TODAY), [calendarRows, calCursor]);

  // --- §3.7 explorer state (shared between inline + fullscreen) ---
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 200);
    return () => clearTimeout(t);
  }, [query]);
  const handleQuery = (v: string) => { if (v !== query) setPage(1); setQuery(v); };
  const [visibleCols, setVisibleCols] = useState<string[]>(() => [...EXPLORER_DEFAULT_COLS]);
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [explPics, setExplPics] = useState<Set<string>>(() => new Set(pics));
  const [explMonths, setExplMonths] = useState<Set<string>>(() => new Set(months));
  const [explStatuses, setExplStatuses] = useState<Set<string>>(() => new Set(["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"]));
  const [explPlatforms, setExplPlatforms] = useState<Set<string>>(() => new Set(platformOptions));
  const [explPillars, setExplPillars] = useState<Set<string>>(() => new Set(pillarOptions));
  const [explFormats, setExplFormats] = useState<Set<string>>(() => new Set(formatOptions));
  const [dlSel, setDlSel] = useState<string>("ALL");

  const explorerFiltered = useMemo(
    () => filterRows(rows, { pics: explPics, months: explMonths, statuses: explStatuses, platforms: explPlatforms, pillars: explPillars, formats: explFormats }),
    [rows, explPics, explMonths, explStatuses, explPlatforms, explPillars, explFormats],
  );
  const deadlinePredicated = useMemo(() => {
    if (dlSel === "ALL") return explorerFiltered;
    return explorerFiltered.filter((r) => deadlineBucket(r, TODAY) === (dlSel as DeadlineBucket));
  }, [explorerFiltered, dlSel]);
  const explorerRows = useMemo(() => searchContents(deadlinePredicated, debouncedQ), [deadlinePredicated, debouncedQ]);
  const totalPages = Math.max(1, Math.ceil(explorerRows.length / EXPLORER_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const explorerFilterDims: ExplorerFilterDim[] = [
    { name: "exp-pic", label: "PIC", options: pics, selected: explPics, onToggle: (v) => toggle(explPics, v, setExplPics), onReplace: (vals) => setExplPics(new Set(vals)) },
    { name: "exp-month", label: "Bulan", options: months, selected: explMonths, onToggle: (v) => toggle(explMonths, v, setExplMonths), onReplace: (vals) => setExplMonths(new Set(vals)) },
    { name: "exp-status", label: "Status", options: ["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"], selected: explStatuses, onToggle: (v) => toggle(explStatuses, v, setExplStatuses), onReplace: (vals) => setExplStatuses(new Set(vals)) },
    { name: "exp-platform", label: "Platform", options: platformOptions, selected: explPlatforms, onToggle: (v) => toggle(explPlatforms, v, setExplPlatforms), onReplace: (vals) => setExplPlatforms(new Set(vals)) },
    { name: "exp-pillar", label: "Content Pillar", options: pillarOptions, selected: explPillars, onToggle: (v) => toggle(explPillars, v, setExplPillars), onReplace: (vals) => setExplPillars(new Set(vals)) },
    { name: "exp-format", label: "Format", options: formatOptions, selected: explFormats, onToggle: (v) => toggle(explFormats, v, setExplFormats), onReplace: (vals) => setExplFormats(new Set(vals)) },
  ];
  const resetExplorerFilters = () => {
    setExplPics(new Set(pics)); setExplMonths(new Set(months)); setExplStatuses(new Set(["Belum Dimulai", "Dalam Produksi", "Review", "Revision", "Done", "Published"]));
    setExplPlatforms(new Set(platformOptions)); setExplPillars(new Set(pillarOptions)); setExplFormats(new Set(formatOptions));
    setDlSel("ALL"); setPage(1); setColMenuOpen(false);
  };
  const inlineSave = () => runSaveFor(explorerRows.slice((currentPage - 1) * EXPLORER_PAGE_SIZE, currentPage * EXPLORER_PAGE_SIZE));
  const detailSave = () => { if (detailRow) { runSaveFor([detailRow]); setEditingDetail(false); } };

  const hasProses = useMemo(() => {
    if (rows.length === 0) return false;
    return Object.prototype.hasOwnProperty.call(rows[0], "PROSES");
  }, [rows]);
  const empty = rows.length === 0 || !hasProses;
  const activeFilterCount =
    (picSel.size !== pics.length ? 1 : 0) + (monthSel.size !== months.length ? 1 : 0) +
    (platformSel.size !== platformOptions.length ? 1 : 0) + (pillarSel.size !== pillarOptions.length ? 1 : 0) +
    (formatSel.size !== formatOptions.length ? 1 : 0);

  const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const toneClass = (r: Row): string => {
    if (isDoneByLocal(r)) return "border-success/30 bg-success/5";
    const d = deadlineDate(r);
    if (d) {
      const ts = startOfDayLocal(TODAY);
      if (d < ts) return "border-danger/30 bg-danger/5";
      if (d.getDate() === ts.getDate() && d.getMonth() === ts.getMonth() && d.getFullYear() === ts.getFullYear()) return "border-warning/40 bg-warning/5";
    }
    return "border-border bg-surface";
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
      <main className="mx-auto w-full max-w-[1220px]">
        {empty ? (
          <>
            <ModuleHero icon="📱" title="Social Media"
              desc="Produksi konten, workload per PIC, publishing, dan monitoring operasional." />
            <EmptyState title="Data sosmed tidak tersedia atau kosong." />
          </>
        ) : (
          <>
            <SosmedSubNav />

            {/* Page header + action cluster */}
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
              <div className="min-w-0">
                <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
                <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">Social Media · Planning</h1>
                <p className="mt-1 text-[0.92rem] text-muted">Perencanaan konten: content plan, calendar, list, dan master content data.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => { setPlannerOpen(true); }} className="shrink-0">+ Content Plan</Button>
                <Button variant="secondary" onClick={() => onRefresh?.()} className="shrink-0">🔄 Refresh Data</Button>
              </div>
            </header>

            {/* §1 Global filter bar (Bulan/PIC/Platform/Pillar/Format — NO Status) */}
            <div className="relative z-20 mb-6 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="mb-2 flex items-center gap-2 text-[0.82rem] font-semibold text-muted">
                  <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 3h8M14 3v2M4 9h8M14 9v2M4 15a2 2 0 0 1 1 3h7" />
                  </svg>
                  <span>Filter Data{activeFilterCount > 0 ? ` (${activeFilterCount} aktif)` : ""}</span>
                </span>
                <button type="button" onClick={resetAll} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-input px-3 py-1.5 text-[0.82rem] font-semibold text-brand transition-colors hover:border-brand/40 hover:text-brand-hover">↩ Reset</button>
              </div>
              <div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-2 xl:grid-cols-5 md:gap-4">
                {filterDims.map((d) => (
                  <MultiSelectDropdown key={d.name} name={d.name} label={d.label} hint={d.hint} className={d.className ?? "md:col-span-1"}
                    options={d.options} selected={d.selected} onToggle={(v) => toggle(d.selected, v, d.set)} onReplace={(vals) => d.set(new Set(vals))}
                    openMenu={openMenu} setOpenMenu={setOpenMenu} />
                ))}
              </div>
              {activeFilterCount > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-divider pt-3">
                  <span className="text-[0.82rem] font-semibold text-muted">Filter Aktif:</span>
                  {filterDims.map((d) =>
                    d.options.length > 0 && d.selected.size !== d.options.length
                      ? d.options.filter((o) => !d.selected.has(o)).map((o) => (
                          <button key={`${d.name}:${o}`} type="button" onClick={() => toggle(d.selected, o, d.set)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-surface-strong px-2.5 py-1 text-[0.8rem] font-semibold text-ink transition-colors hover:border-brand/40 hover:text-brand-hover">
                            {o}<span aria-hidden className="text-[0.95rem] leading-none text-muted">×</span>
                          </button>
                        ))
                      : null)}
                  <button type="button" onClick={resetAll} className="text-[0.82rem] font-semibold text-brand hover:text-brand-hover hover:underline">Hapus Semua</button>
                </div>
              ) : null}
            </div>

            {/* §2 Light planning overview — compact (Total Planned + formats/platforms) */}
            <SectionHeader title="Planning Overview" subtitle="Total konten direncanakan dan breakdown per format / platform." />
            <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className={compactRow}>
                <MetricCard icon="📊" label="Total Planned" value={String(overview.planned)} />
              </div>
              {(strategy.formats.length > 0 || strategy.platforms.length > 0) ? (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {strategy.formats.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[0.85rem] font-semibold text-muted">Breakdown per Format</p>
                      <div className="flex flex-col gap-2">
                        {strategy.formats.map((b, i) => (
                          <StrategyBar key={b.value} value={b.value} count={b.count} sharePct={b.sharePct} fill={[PALETTE.catGreen, PALETTE.catBlue, PALETTE.catOrange][i % 3]} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {strategy.platforms.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[0.85rem] font-semibold text-muted">Breakdown per Platform</p>
                      <div className="flex flex-col gap-2">
                        {strategy.platforms.map((b, i) => (
                          <StrategyBar key={b.value} value={b.value} count={b.count} sharePct={b.sharePct} fill={[PALETTE.catOrange, PALETTE.catTeal, PALETTE.catPurple][i % 3]} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <Divider />

            {/* §3 Content Plan Storage (plan management) */}
            <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[1.1rem] font-extrabold text-ink">Content Plan Storage</h2>
              </div>
              <div className="mb-4 rounded-[14px] border border-divider bg-surface/60 p-3">
                <p className="mb-2 text-[0.85rem] font-bold text-muted">Rencana ({planRows.length})</p>
                {planRows.length === 0 ? (
                  <p className="text-[0.85rem] text-muted">Belum ada rencana. Klik <span className="font-semibold text-brand">+ Content Plan</span> untuk membuat.</p>
                ) : (
                  <div className="divide-y divide-divider">
                    {planRows.map((p) => {
                      const pi = typeof p.__rowIndex === "number" ? p.__rowIndex : planRows.indexOf(p);
                      const pushed = planIsPushed(p, pi);
                      return (
                        <div key={pi} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                          <span className="min-w-0 flex-1 truncate text-[0.88rem] font-semibold text-ink" title={str(p["Judul / Ide Konten"])}>{str(p["Judul / Ide Konten"]) || "—"}</span>
                          <PlanStatusBadge status={str(p["Status Plan"])} />
                          {str(p["Priority"]).trim() ? <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[0.72rem] font-medium text-muted">{str(p["Priority"])}</span> : null}
                          {str(p["Deadline Produksi"]).trim() ? <span className="shrink-0 text-[0.78rem] text-muted">⏰ {str(p["Deadline Produksi"])}</span> : null}
                          {isEditor && str(p["Status Plan"]).trim().toUpperCase() === "APPROVED" && !pushed ? (
                            <Button variant="primary" onClick={() => addToProduction(p, pi)} ariaLabel="Tambahkan ke pipeline produksi sosmed" className="!px-3 !py-1 !text-[0.78rem]">＋ Tambah ke Produksi</Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <Divider />

            {/* §4 Content Calendar (default TODAY) + Content List (Kalender/Daftar) */}
            <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[1.1rem] font-extrabold text-ink">Content Calendar</h2>
              </div>

              {/* Tab bar */}
              <div className="mb-4 inline-flex items-center gap-1 rounded-[12px] border border-border bg-surface p-1 shadow-[var(--dm-shadow-xs)]">
                <button type="button" aria-pressed={tab === "calendar"} onClick={() => setTab("calendar")}
                  className={`rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors ${tab === "calendar" ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink"}`}>📅 Kalender</button>
                <button type="button" aria-pressed={tab === "list"} onClick={() => setTab("list")}
                  className={`rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors ${tab === "list" ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink"}`}>📋 Daftar</button>
              </div>

              {/* Calendar view */}
              {tab === "calendar" ? (
                <div>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <Button variant="secondary" onClick={() => setCalCursor(firstOfToday())}>Hari Ini</Button>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label="Bulan sebelumnya" onClick={() => setCalCursor(shiftMonth(calCursor, -1))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-ink hover:border-brand/40">‹</button>
                      <span className="min-w-[9rem] text-center text-[1rem] font-extrabold text-ink">{monthTitleText(calCursor)}</span>
                      <button type="button" aria-label="Bulan berikutnya" onClick={() => setCalCursor(shiftMonth(calCursor, 1))} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-ink hover:border-brand/40">›</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((w) => (
                      <div key={w} className="sticky top-0 z-10 bg-surface/90 backdrop-blur-[4px] pb-1 text-center text-[0.72rem] font-bold uppercase tracking-wide text-muted">{w}</div>
                    ))}
                    {cells.map((c, i) => {
                      const todayNum = TODAY.getDate();
                      const isTodayCell = !c.isOutside && c.day === todayNum && calCursor.getMonth() === TODAY.getMonth() && calCursor.getFullYear() === TODAY.getFullYear();
                      return (
                        <div key={i} className={`min-h-[92px] rounded-[12px] border p-1.5 ${c.isOutside ? "bg-transparent border-border/40 opacity-50" : "border-border bg-surface/70"}`}>
                          <div className="flex items-center justify-between">
                            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-[8px] text-[0.8rem] font-bold ${isTodayCell ? "border-[1.5px] border-accent text-accent" : "text-ink"}`}>{c.day}</span>
                          </div>
                          <div className="mt-1 flex flex-col gap-1 overflow-hidden">
                            {c.rows.slice(0, 3).map((r) => {
                              const jx = originalIndex(r);
                              return (
                                <button key={jx} type="button" onClick={() => detailOpen(r)}
                                  className={`group w-full rounded-[8px] border p-1.5 text-left transition-colors group-hover:border-brand/40 ${toneClass(r)}`}>
                                  <span className="block truncate text-[0.72rem] font-semibold text-ink" title={str(r["Judul Konten"])}>{str(r["Judul Konten"]) || "—"}</span>
                                  <span className="mt-0.5 flex items-center gap-1 text-[0.65rem] text-muted">
                                    <span className="truncate">{str(r["Output"])}</span>
                                    {str(r["Platform"]).trim() ? <span className="text-brand-hover/80">· {str(r["Platform"])}</span> : null}
                                  </span>
                                  <span className="mt-1 flex items-center gap-1.5 text-[0.68rem]">
                                    <span className="truncate text-muted">{str(r["PIC"]) || "—"}</span>
                                    <ProsesBadge status={str(r["PROSES"])} />
                                  </span>
                                </button>
                              );
                            })}
                            {c.rows.length > 3 ? <span className="px-0.5 text-[0.68rem] font-semibold text-brand-hover">+{c.rows.length - 3} lagi</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* List view (Daftar) */
                <div>
                  <p className="mb-2 text-[0.8rem] text-muted">menampilkan {filtered.length} konten</p>
                  <div className="divide-y divide-divider rounded-[16px] border border-border bg-surface">
                    {filtered.length === 0 ? (
                      <EmptyState title="Tidak ada konten." />
                    ) : (
                      [...filtered].sort((a, b) => {
                        const da = deadlineDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
                        const db = deadlineDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
                        return da - db;
                      }).map((row) => (
                        <button type="button" key={originalIndex(row)} onClick={() => detailOpen(row)}
                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-brand/[0.03]">
                          <span className="min-w-0 flex-1 truncate text-[0.9rem] font-semibold text-ink" title={str(row["Judul Konten"])}>{str(row["Judul Konten"]) || "—"}</span>
                          <span className="hidden text-[0.8rem] text-muted sm:inline">{str(row["Output"])}</span>
                          {str(row["Platform"]).trim() ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.72rem] font-semibold text-brand-hover">📲 {str(row["Platform"])}</span> : null}
                          <span className="shrink-0 text-[0.8rem] text-muted">{str(row["PIC"]) || "—"}</span>
                          <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[0.72rem] font-medium text-muted">⏰ {str(row["Tanggal Deadline"]) || "—"}</span>
                          <ProsesBadge status={str(row["PROSES"])} />
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Divider />

            {/* §5 Master Content Data EXPLORER (inline) + editor + Save Changes */}
            <SectionHeader title="Master Content Data Explorer" subtitle="Jelajahi, cari, dan kelola seluruh konten. Edit sel dan klik 'Simpan Perubahan' untuk menyimpan." />
            <ContentExplorer
              rows={explorerRows} isEditor={isEditor} embedded originalIndex={originalIndex} onOpenDetail={detailOpen}
              query={query} setQuery={handleQuery} page={currentPage} setPage={setPage} totalPages={totalPages}
              visibleCols={visibleCols} setVisibleCols={setVisibleCols} colMenuOpen={colMenuOpen} setColMenuOpen={setColMenuOpen}
              openMenu={openMenu} setOpenMenu={setOpenMenu} filterDims={explorerFilterDims}
              dlSel={dlSel} setDlSel={setDlSel} onResetFilters={resetExplorerFilters}
              saving={saving} setCell={setCell} cellValue={cellValue} pics={pics} statusOptions={PROSES_OPTIONS as unknown as string[]}
              runSave={inlineSave} saveMsg={saveMsg} onExpand={() => setFullscreen(true)}
            />
          </>
        )}
      </main>

      {/* Content Planner modal */}
      <ContentPlannerModal open={plannerOpen} options={planOptions} form={planForm} setForm={setPlanField}
        planFormValid={planFormValid} saving={savingPlan} planError={planError} onSave={saveContentPlan} onClose={() => setPlannerOpen(false)} />

      {/* Row-detail drawer */}
      {detailRow ? (
        <RowDetailDrawer row={detailRow} rowIndex={originalIndex(detailRow)} onClose={() => setDetailRow(null)}
          isEditor={isEditor} editing={editingDetail} setEditing={setEditingDetail} pics={pics}
          draft={draft} setCell={setCell} saving={saving} runSave={detailSave} saveMsg={saveMsg} />
      ) : null}

      {/* Fullscreen explorer overlay */}
      {fullscreen ? (
        <div role="dialog" aria-modal="true" aria-label="Explorer konten — layar penuh"
          className="fixed inset-0 z-50 flex flex-col bg-surface-strong/95 backdrop-blur-md">
          <header className="flex items-center justify-between gap-3 border-b border-divider bg-white/80 px-5 py-3">
            <h2 className="text-[1.1rem] font-extrabold text-ink">Master Content Data Explorer</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={resetExplorerFilters} className={btnReset}>Reset Filter</button>
              <Button variant="secondary" onClick={() => setFullscreen(false)}>✕ Tutup</Button>
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1500px] flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <ContentExplorer
              rows={explorerRows} isEditor={isEditor} embedded={false} originalIndex={originalIndex} onOpenDetail={detailOpen}
              query={query} setQuery={handleQuery} page={currentPage} setPage={setPage} totalPages={totalPages}
              visibleCols={visibleCols} setVisibleCols={setVisibleCols} colMenuOpen={colMenuOpen} setColMenuOpen={setColMenuOpen}
              openMenu={openMenu} setOpenMenu={setOpenMenu} filterDims={explorerFilterDims}
              dlSel={dlSel} setDlSel={setDlSel} onResetFilters={resetExplorerFilters}
              saving={saving} setCell={setCell} cellValue={cellValue} pics={pics} statusOptions={PROSES_OPTIONS as unknown as string[]}
              runSave={inlineSave} saveMsg={saveMsg} onExpand={() => {}}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
