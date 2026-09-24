# UI Design Spec — `/sosmed` Workspace Rework

**Page:** Social Media Command Center (workspace route `/sosmed`)
**Repo:** `D:/digmarkv3.1` (Next.js 16, zero-dependency SVG, NO charting library)
**Author / Designer role:** NEO
**Date:** 2026-09-24
**Status:** Phase-1 design spec (gate artifact). No source code is edited by this document; REX implements, NEO does the rendered review.

---

## 0. Scope & Authority

- **Authoritative brief:** Ejak's 8 numbered requirements (below). This spec reconciles EVERY numbered brief item — nothing silently dropped. Where the brief and this spec could drift, the brief wins.
- **File-edit fence:** REX may touch at most **two** files: `src/workspaces/SosmedDashboard.tsx` and, only if a helper must be shared, the pure-derivations file `src/workspaces/sosmed.ts` (additive exports only — never modify existing exports). The route shell `app/(workspaces)/sosmed/page.tsx` is untouched unless a layout band is broken (none is).
- **Shared-component ban (HARD):** do **NOT** edit `MetricCard`, `MetricRow`, `ChartContainer`, `SectionHeader`, `EmptyState`, `Divider`, `Button`, `Field`. They render on every workspace; an edit for one page breaks all others. Express compaction/layout via wrapper `div`s + Tailwind utilities. The one permitted escape hatch: a backward-compatible **optional prop** on a shared component; none is required by this spec.
- **Data/database:** keep the data source and all existing functions. Do NOT delete features, do NOT change fields/schema, do NOT alter derivations. All numbers follow the active global filter (`filterRows` → `filtered`).
- **Copy:** UI copy is **Indonesian**. Branded/workflow nouns that already function as product terms in the UI (Production Overview, Content Planning, Publishing Tracker, Action Required, Output Trend, Master Content Data Explorer, Content Plan, Overdue, Due Today, Due This Week, Completed) are retained as-is; their **subtitles, instructions, placeholders, empty-hints and interactive `ariaLabel`s must be Indonesian** (see §9 Copy audit).

### Brief requirement traceability (the reviewer gates on this table)

| # | Brief requirement | Spec section |
|----|--------------------|--------------|
| 1 | Default data scope = LATEST deadline period | §4 |
| 2 | Production Overview compact, 5-across, keep ALL metrics | §5.2 |
| 3 | Content Calendar default = "Hari Ini", date nav works | §6 |
| 4 | Funnel + Breakdown side-by-side 2-col | §7 |
| 5 | Workload + PIC table side-by-side 2-col | §8 |
| 6 | Deadline Monitoring moved to VERY TOP | §5.1 |
| 7 | Publishing Tracker compact 5-across, smaller | §8 (tracker) |
| 8 | Output Trend interactive hover/zoom/pan/reset/legend | §10 |

---

## 1. New page structure (top → bottom)

The ready branch of `SosmedDashboard` renders bands in this **exact** order (numbering below is the *new* rendering order, not the old §-labels):

```
Header (+ action cluster: + Content Plan · Refresh Data)
    │
    ├─ [A] Filter Data (global filter card)                      §3  — UNCHANGED placement
    │
    ├─ [B] DEADLINE MONITORING  ◀ PRIMARY band, at very top      §5.1
    │       Overdue · Due Today · Due This Week · Completed   + overdue list
    ├─ [C] Production Overview (2 × compact 5-across rows)       §5.2
    │       all existing metrics retained
    ├─ [D] Content Calendar (Content Planning: Kalender/Daftar +  §6
    │       Content Plan Storage + Planner) — default 'Hari Ini'
    ├─ [E] Production Funnel | Status Breakdown   (2-col 50/50)  §7
    ├─ [F] Action Required   (quad grid, unchanged)               §5.3
    ├─ [G] Workload per PIC | PIC Detail Table   (2-col 50/50)   §8
    ├─ [H] Publishing Tracker   (compact 5-across)               §8 (tracker card)
    ├─ [I] Content Strategy   (3-col, unchanged)                  §5.3
    ├─ [J] Output Trend   (interactive SVG)                      §10
    └─ [K] Master Content Data Explorer   (unchanged)            §5.3
```

- Every band is separated by the existing `<Divider />` **except** where §5.1 mandates a fused primary band.
- No feature is deleted: Content Plan Storage + Planner live inside band [D]; the row-detail drawer, fullscreen explorer, inline editor, and save path are all retained.
- Bands marked *unchanged* keep their current markup and only move position (and/or adopt a shared container utility). Sections that change are specified in detail below.

---

## 2. Container + layout tokens (authoritative)

Current shell/nav/container values **stay** — do not change page width.

| Token | Value (use verbatim) |
|-------|----------------------|
| Page body shell | `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` |
| `<main>` (ready band) | `mx-auto w-full max-w-[1220px]` |
| Nav wrapper (page.tsx ready branch) | `mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6` |
| Filter card | `relative z-20 mb-6 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]` |
| Dropdown popover | `shadow-[var(--dm-shadow-panel)]` (**there is NO `-lg` variant** — verified in `globals.css`; only `-xs/-xs-b6/base/-hover/-lift/-cta/-cta-hover/-panel/-home-hover/-mono/-arrow/-ball`) |
| Table chrome | `overflow-x-auto rounded-[16px] border border-border bg-surface` |
| Chart frame | reuse `ChartContainer` as-is (do not add a `heightClass` that leaves dead space — see §10 for the Output Trend container) |
| Colors | `text-ink`, `text-muted`, `bg-surface`, `border-border`, `text-success`, `text-danger`, `text-brand`, `text-warning`, `bg-success/…`, `bg-warning/…`, `bg-danger/…`, `bg-brand/…` |
| Categorical fills | `PALETTE.catBlue/Green/Purple/Orange/Teal/Pink/Slate/Sand/Lavender/Mint` (`src/components/ui-common.ts`) |

### New **compact 5-across** grid utility (this spec's own token)
Because `MetricRow` auto-fits `minmax(220px,1fr)` (≈4-up on desktop — the "cards too big" complaint), the compact rows **do not use `MetricRow`**. Reproduce the same `MetricCard` chips (unchanged themselves) inside a **dedicated wrapper grid**:

```
grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3
```

- `xl` (≥1280 px viewport) → **5 cards in one row** (the brief's "5 cards per row on desktop").
- `md` → 4, `sm` → 3, base → 2. This satisfies "tablet/mobile drop to 2 or 1 col." A single column (`grid-cols-1`) is **acceptable but optional** on the narrowest phones — the `grid-cols-2` base already avoids excessive height; do not introduce horizontal scroll.
- Use a local alias for clarity, e.g. `const compactRow = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3";`.
- `MetricCard` internals are untouched — its `p-4`, 34px icon tile and `text-[1.6rem]` value remain; compaction comes only from the tighter `gap-3` and denser 5-across grid. The hover lift (`hover:-translate-y-[2px]`) is retained.

### New **50/50 responsive 2-col** grid utility
```
grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]
```
- `xl` places the two children side-by-side at 50/50.
- `minmax(0,1fr)` (not `1fr`) is **mandatory** to guarantee **no horizontal overflow** on wide tables/bars inside a half column.
- Below `xl`, stacks to one column.

### New **primary-band** emphasis utility (Deadline Monitoring)
```
rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)] backdrop-blur-[8px]
```
(base `--dm-shadow`, a step above the filter card's `-xs`, to signal "top-priority info").

---

## 3. Band [A] — Filter Data (placement unchanged, default-scope changed)

Keep the existing filter card markup **as-is** (grid `md:grid-cols-2 xl:grid-cols-7`, `MultiSelectDropdown`, Reset, active-filter chips + "Hapus Semua"). Only the **Bulan Deadline default selection** changes — see §4.

---

## 4. Brief #1 — Default data scope = LATEST deadline period

**Intent:** on open/refresh, `filtered` (and therefore every number on the page) must represent the **latest available deadline period only**, not the whole-period accumulation. Manual filter must still allow viewing other periods.

### 4.1 Where to change (exact spots in `SosmedDashboard.tsx`)

1. **`monthSel` initial state** (currently line ~1000):
   ```ts
   const [monthSel, setMonthSel] = useState<Set<string>>(() => new Set(months));
   ```
   becomes:
   ```ts
   const [monthSel, setMonthSel] = useState<Set<string>>(
     () => latestDeadlineMonthSet(months, rows)
   );
   ```
2. **`resetAll`** (currently ~line 1007): the "Reset" affordance must restore the **default** scope. So the Bulan Deadline reset uses the same latest-period default, not "all months":
   ```ts
   const resetAll = () => {
     setPicSel(new Set(pics));
     setMonthSel(latestDeadlineMonthSet(months, rows));   // ← latest period default
     setStatusSel(new Set(statusOptions));
     setPlatformSel(new Set(platformOptions));
     setPillarSel(new Set(pillarOptions));
     setFormatSel(new Set(formatOptions));
     setOpenMenu(null);
   };
   ```
   All other dimensions keep their current "all selected" default (brief #1 targets the **deadline period** scope; PIC/platform/etc. stay all-in so the page still shows the whole team/portfolio for that latest period).

### 4.2 New pure helper (additive export in `src/workspaces/sosmed.ts`)
Do **not** change `sosmedMonths`/`deleteMonth` semantics. Add:

```ts
/**
 * §1.2 — Default scope for the Bulan Deadline filter: a Set containing ONLY the
 * LATEST deadline month present in `rows` (period with the max deadline date).
 * Falls back to all months when no deadline parses, so the page never opens
 * empty. Manual month selection still works afterwards (filter is just prefilled).
 */
export function latestDeadlineMonthSet(months: string[], rows: Row[]): Set<string> {
  let best: Date | null = null;
  for (const r of rows) {
    const d = deadlineDate(r);
    if (d && (best === null || d > best)) best = d;
  }
  if (best === null) return new Set(months);          // no parseable deadline → all
  const label = monthLabel(best, "%B %Y");
  return label !== "" ? new Set([label]) : new Set(months);
}
```

- `latestDeadlineMonthSet` is **pure and `today`-free** (the latest period is a property of the data, not the clock) — testable without injecting a date.
- `monthLabel` is already imported in `sosmed.ts`; reuse it so the returned label **exactly matches** the keys `months`/`filterRows` use (byte-for-byte, no locale drift).
- The default reflects the **latest available** deadline period as `monthSel`. If the user then opens the Bulan Deadline dropdown they can still select any period (e.g. add earlier months back) — manual filter is unaffected; "Semua" remains reachable via "Pilih Semua".

### 4.3 Consequence / guard
- On first render `monthSel.size === 1`. Every derived metric now reads the latest period.
- If the dataset has exactly one deadline month, behavior is identical to before.
- Empty-data / no-parseable-deadline fallback (`new Set(months)`) prevents a silent empty page.
- Add/update a unit test in `src/workspaces/sosmed.test.tsx` asserting `latestDeadlineMonthSet` returns the max-deadline month and the all-months fallback.

---

## 5. Band [B],[C] — Deadline Monitoring at TOP + compact Production Overview

### 5.1 Band [B] — Deadline Monitoring = primary-priority band (brief #6)
**Move** the current §8 "Deadline Monitoring" so it renders **immediately after the filter card** (band [B] in §1), before Production Overview. It becomes the visual "first thing the user sees" information.

Markup (reusing the **existing** `countChip` helper + `deadlineMonitor` counts + `ActionItemRow` — no new derivation):

```tsx
{/* DEADLINE MONITORING — primary band, right under the filter */}
<SectionHeader
  title="Deadline Monitoring"
  subtitle="Prioritas utama: Overdue, jatuh tempo hari ini/minggu ini, dan selesai."
/>
<div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)] backdrop-blur-[8px]">
  <div className="grid gap-3 md:grid-cols-4">
    {countChip("🚨 Overdue", deadlines.overdueCount, "border-danger/30 bg-danger/10")}
    {countChip("📅 Due Today", deadlines.dueTodayCount, "border-warning/30 bg-warning/10")}
    {countChip("🗓️ Due This Week", deadlines.dueThisWeekCount, "border-brand/30 bg-brand/10")}
    {countChip("✅ Completed", deadlines.completedCount, "border-success/30 bg-success/10")}
  </div>
  {deadlines.overdue.length > 0 ? (
    <div className="mt-2">
      <p className="text-[0.82rem] font-semibold text-muted">
        Overdue-content ({deadlines.overdueCount})
      </p>
      <div className="rounded-[12px] border border-danger/30 bg-surface/70">
        {deadlines.overdue.map((r) => (
          <ActionItemRow key={originalIndex(r)} item={{
            title: str(r["Judul Konten"]), pic: str(r["PIC"]),
            deadline: str(r["Tanggal Deadline"]), platform: "", status: str(r["PROSES"])
          }} />
        ))}
      </div>
    </div>
  ) : null}
</div>
<Divider />
```

- Reuses the **same** `countChip`, `deadlines` (`deadlineMonitor(filtered, TODAY)`), and `ActionItemRow` — zero new derivations, zero shared-component edits.
- The **overdue list** stays inside this band (collapsed to the danger `rounded-[12px]` container from the current markup) so the top band is both a KPI header and a direct action list.
- **Delete the old band [§8] lower on the page** (it is fully relocated, not duplicated).

### 5.2 Band [C] — Production Overview compact (brief #2)
Replace the two `MetricRow` groups with **two** compact 5-across rows via the `compactRow` grid (§2), keeping **all** existing metrics:

Row 1 (overview KPIs) — same order as today:
| Card | icon | label | value |
|------|------|-------|-------|
| 1 | `📊` | Total Planned | `String(overview.planned)` |
| 2 | `✅` | Total Done | `String(overview.done)` |
| 3 | `⏳` | In Progress | `String(overview.inProgress)` |
| 4 | `🚨` | Overdue | `String(overview.overdue)` |
| 5 | `🎯` | Completion Rate | `formatPercent(overview.completionRate ?? 0, overview.completionRate !== null)` |

Row 2 (legacy KPIs) — same order as today:
| Card | icon | label | value |
|------|------|-------|-------|
| 1 | `🎬` | Video Selesai | `metrics.videoLabel` |
| 2 | `🎨` | Design Selesai | `metrics.designLabel` |
| 3 | `📸` | Hutang Post IG | `String(metrics.hutangIg)` |
| 4 | `🎵` | Hutang Post TikTok | `String(metrics.hutangTiktok)` |
| 5 | `▶️` | Hutang Post YT | `String(metrics.hutangYt)` |

```tsx
<SectionHeader title="Production Overview" subtitle="Ringkasan produksi: planned, done, in-progress, overdue, dan completion-rate." />
<div className={compactRow}>
  <MetricCard icon="📊" label="Total Planned" value={String(overview.planned)} />
  <MetricCard icon="✅" label="Total Done" value={String(overview.done)} />
  <MetricCard icon="⏳" label="In Progress" value={String(overview.inProgress)} />
  <MetricCard icon="🚨" label="Overdue" value={String(overview.overdue)} />
  <MetricCard icon="🎯" label="Completion Rate" value={formatPercent(overview.completionRate ?? 0, overview.completionRate !== null)} />
</div>
<div className={`mt-3 ${compactRow}`}>
  <MetricCard icon="🎬" label="Video Selesai" value={metrics.videoLabel} />
  <MetricCard icon="🎨" label="Design Selesai" value={metrics.designLabel} />
  <MetricCard icon="📸" label="Hutang Post IG" value={String(metrics.hutangIg)} />
  <MetricCard icon="🎵" label="Hutang Post TikTok" value={String(metrics.hutangTiktok)} />
  <MetricCard icon="▶️" label="Hutang Post YT" value={String(metrics.hutangYt)} />
</div>
<Divider />
```

- **No metric is dropped** (brief #2 "keep ALL existing metrics").
- `mt-3` between the two rows (the tighter `gap-3` makes rows visually close; a small break keeps them scannable as two groups).

### 5.3 Unchanged bands (position/containers only)
- **[F] Action Required** — keep the current `grid gap-4 md:grid-cols-2` quad-card markup, only re-positioned after band [E].
- **[I] Content Strategy** — keep the current `grid gap-4 md:grid-cols-3` of three `ChartContainer`s.
- **[K] Master Content Data Explorer** — keep the inline `ContentExplorer` + fullscreen overlay entirely as-is (including its `min-w-[920px]` table scroll-guard and `overflow-x-auto` chrome; the horizontal scroll is **contained to the table's own scroll region**, never the page).
- The `ContentPlannerModal`, `RowDetailDrawer`, and editor/save paths are untouched.

---

## 6. Band [D] — Content Calendar default "Hari Ini" (brief #3)

Requirement: **default view must be 'Hari Ini'** (focus today's date) on open/refresh; the date-nav buttons work normally.

### 6.1 Current state
The calendar cursor already initializes via `calendarDefaultMonth(filtered, TODAY)` (§4.2 of derivations), which:
- returns today's month (`firstOfToday`) **iff** today's month holds any parseable-deadline row, else
- returns the deadline month with the most rows, else today.

This **already implements the brief's rule** — "Hari Ini first, data-aware fallback only to avoid an empty grid when today has no rows." The current `useState(() => calendarDefaultMonth(filtered, TODAY))` is exactly the desired behavior.

### 6.2 What REX must do
1. **Keep** `useState(() => calendarDefaultMonth(filtered, TODAY))` as the mount cursor. Do **not** regress it to a hard `firstOfToday()` (that would re-introduce the empty-grid bug when all deadlines live in other months).
2. **Keep** the "Hari Ini" button (`onClick={() => setCalCursor(firstOfToday())}`) and the `‹`/`›` nav buttons unchanged — they already work.
3. Optionally make the default visually obvious: the today highlight already renders via `isTodayCell` (accent ring). Ensure the *default* month also visibly marks today when the cursor is today's month (already true).
4. **Guard (regression test):** add an assertion that with today-month rows present, `calendarDefaultMonth` returns today's month; with today's month empty, it returns a data month rather than a blank grid. This codifies brief #3.

No markup change is otherwise required in band [D].

---

## 7. Band [E] — Production Funnel | Status Breakdown side-by-side (brief #4)

Currently Funnel and Breakdown are two separate stacked sections. Rework into **one 50/50 two-column row**: **Funnel LEFT, Breakdown RIGHT**.

```tsx
<SectionHeader
  title="Production Funnel & Status Breakdown"
  subtitle="Funnel produksi (Planned → Production → Review → Revision → Done → Published) dan berapa konten di setiap fase."
/>
<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  {/* LEFT — funnel */}
  <ChartContainer data={funnel} label="Funnel produksi (berdasarkan PROSES)">
    <FunnelBars stages={funnel} />
  </ChartContainer>

  {/* RIGHT — status breakdown (compact chips, stack inside the half column) */}
  <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
    <p className="mb-3 text-[0.85rem] font-semibold text-muted">Berapa konten di setiap fase</p>
    <div className="grid gap-2 sm:grid-cols-2">
      {breakdown.map((s) => { /* existing tone mapping; compact p-2.5 chips */ })}
    </div>
  </div>
</div>
<Divider />
```

- **LEFT cell:** the existing `FunnelBars` inside a `ChartContainer` (height sized to its 6 bars — see §10.3 note on right-sizing; do not leave a large empty footer).
- **RIGHT cell:** keep the existing tone-color mapping per stage (`published`→brand, `done`→success, `revision`→danger, `inProduction`→warning, else muted). Render as **compact chips** (`rounded-[12px] border … p-2.5`, label left + count right) in a `grid gap-2 sm:grid-cols-2` — two-across *within* the half column so ~6 stages stay readable without vertical growth. Preserve every stage (do not drop Review/Revision, even at count 0 — honest zeros).
- **Responsive:** `xl` → two columns side-by-side; below `xl` → stacked one column (Funnel then Breakdown). `minmax(0,1fr)` prevents any horizontal overflow inside the half column.
- The **old separate** Production Funnel and Status Breakdown sections/sub-sections are **removed** (relocated into this band, not duplicated).

---

## 8. Band [G],[H] — Workload per PIC | PIC Detail Table, + compact Publishing Tracker (brief #5, #7)

### 8.1 Workload + PIC table side-by-side (brief #5)
One 50/50 row: **Workload bars LEFT, PIC Detail Table RIGHT**.

```tsx
<SectionHeader title="Workload per PIC" subtitle="Monitoring dan kapasitas per PIC — bukan ranking." />
<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  {/* LEFT — workload bars */}
  <ChartContainer data={picLoad} label="Done (hijau) vs Pending (kuning) dengan overdue">
    <WorkloadBars items={picLoad.map((p) => ({ pic: p.pic, selesai: p.done, hutang: p.pending }))} />
  </ChartContainer>

  {/* RIGHT — PIC detail table */}
  {picLoad.length > 0
    ? <PicCapacityRows items={picLoad} />
    : <EmptyState title="Belum ada data workload." />}
</div>
<Divider />
```

- The table keeps its **`overflow-x-auto rounded-[12px] border border-border bg-surface/70`** chrome; inside a `minmax(0,1fr)` right cell its wide columns compress without pushing the page (any overflow stays contained in the table's own scroll region).
- `minmax(0,1fr)` on both cells is required so the **table never forces the left bars off-screen**.
- Below `xl`, Workload bars stack above the table (one column). The order LEFT→RIGHT / top→bottom is deliberate: bars (overview) then detail table.

### 8.2 Publishing Tracker compact 5-across (brief #7)
Move the Publishing Tracker **out** of its current `MetricRow` into the `compactRow` grid — 5 cards in one row on `xl`, smaller `gap-3`, keeping **all** metrics:

```tsx
<SectionHeader title="Publishing Tracker" subtitle="IG / TikTok / YT dipublikasi, cross-platform, dan selesai-belum dipublikasi." />
<div className={compactRow}>
  <MetricCard icon="📸" label="Instagram Published" value={String(publishing.ig)} />
  <MetricCard icon="🎵" label="TikTok Published" value={String(publishing.tiktok)} />
  <MetricCard icon="▶️" label="YouTube Published" value={String(publishing.yt)} />
  <MetricCard icon="🔀" label="Cross-platform" value={String(publishing.crossPlatform)} />
  <MetricCard icon="📤" label="Finished, Unpublished" value={String(publishing.finishedNotPublished)} />
</div>
<Divider />
```

- "compact smaller height" comes from the tighter `gap-3` and 5-across density (not from editing `MetricCard`). If a narrower cell wraps a long label ("Finished, Unpublished"), that is acceptable — it stays within the card and does not overflow.

---

## 9. Copy audit (Indonesian) — cross-cutting

While reworking, sweep the bands you touch (and the parent scope) for stale English/Italian and **non-visible** strings:

1. **Buttons / controls** currently English and user-facing — localize to Indonesian:
   - `[Prev]` / `[Next]` → `Sebelumnya` / `Berikutnya` (their `ariaLabel`s are already Indonesian — keep).
   - `Reset Filter` → `Reset Filter` (keep if the sheet-wide convention uses it; otherwise `Atur Ulang Filter`). **Decision:** keep `Reset Filter` if the task's existing `btnReset` string is already used elsewhere on the page; do not introduce a second convention.
   - `⚙ Columns` → `⚙ Kolom`; `↗ Expand` → `↗ Perluas`.
   - `Edit` → `Edit` (keep; existing editor affordance — do not churn).
   - `Save Content Plan` (Planner primary button) → Indonesian instruction copy in its subtitle is already Indonesian; keep the button verb if the rest of the save path ("Simpan Perubahan") uses `Simpan` → align button to `Simpan Content Plan`.
   - `+ Content Plan`, `＋ Tambah ke Produksi`, `💾 Simpan Perubahan`, `Batal`, `Menyimpan...`, `Hari Ini`, `Pilih Semua`, `Semua` are already correct — leave them.
2. **`ariaLabel` attributes introduced/touched:** must be Indonesian. Audit via grep for `ariaLabel=`. The `+ Tambah ke Produksi` button currently passes `ariaLabel="Tambahkan ke pipeline produksi sosmed"` (Indonesian — fine). Any NEW controls (Output Trend legend/zoom/reset, Deadline band) must use Indonesian `ariaLabel`s (see §10).
3. **Empty-hints / placeholders:** current page has no `DataTable` with a shared `emptyHint` default (tables are hand-rolled). Still, audit placeholder strings for English leftovers (e.g. `Cari konten, kode, PIC…` is Indonesian — fine; `Cari kolom…` Indonesian — fine).
4. **Section subtitles** you author in this rework must be Indonesian (the §7 / §5.1 subtitles above are written Indonesian).
5. Do **not** rename the branded workflow nouns listed in §0 (they are product terms, and renaming them is out of scope / risky for the reviewer's parity checks).

---

## 10. Band [J] — Output Trend: interactive dependency-free SVG (brief #8)

The current `TrendBars` is a static grouped-bar SVG that the brief calls "broken/unreadable" and "never truly interactive." REX must replace it with a **hand-rolled SVG** (the repo has NO charting library — adding one is forbidden; keep zero-dependency).

### 10.1 Data / grouping (unchanged logic — keep correct)
- Source: `const trend = useMemo(() => outputTrend(filtered), [filtered]);`
- **Week grouping by DEADLINE week must remain correct** — `outputTrend` already keys each row by `mondayOf(deadlineDate)` and outputs ascending `{ key, label (DD/MM/YYYY), planned, done }`. **Do not change the derivation.** (If the current visual bug is in the math, REX re-derives the identical series for the new component and verifies it against the existing unit test — the derivation file is untouched.)
- Each `TrendPoint` = one week slot. `planned` and `done` are the two series. `planned ≥ done` always holds per point (done ⊆ planned in a week's assignments — the kernel guarantees this by construction).

### 10.2 Axis + interaction model
Render a **time-series** chart on an X-axis indexed by week index (monotonic, not calendar-proportional — weeks are one slot each), Y = count 0..max(planned).

- **Series:** two visual channels, both always drawn when their series has any non-zero value:
  - *Planned* — a **line + area** (`stroke PALETTE.muted`, area `fill PALETTE.grid`, e.g. `stroke-width 2`), so the target/plan is legible at every zoom level.
  - *Done* — a **line + area** (`stroke PALETTE.success`, area `fill PALETTE.success/18`), overlaid on the same axes.
  - When a series is **all zero** for the visible window, render its **legend swatch as disabled/greyed** (still in the legend) and draw nothing for it — never leave a blank or a single stray mark.
- **Dual-series clarity:** the legend must include both swatches with Indonesian labels (`Rencana` = planned, `Selesai` = done) and the current hovered values.

#### Interactivity — every item in the brief, none dropped:
| Control | Behavior |
|---------|----------|
| **Hover tooltip** | On `onMouseMove` over the plot, snap to the nearest week index; render an absolutely-positioned tooltip (HTML `div` inside the chart's `relative` wrapper, `pointer-events-none`, Indonesian) showing: week label (`DD/MM/YYYY`), `Rencana: n`, `Selesai: m`, `Delta: k` (done − planned; tone `text-danger` when negative, `text-success` when ≥ 0). Show crosshair guide lines at the hovered week. |
| **Zoom** | Mouse wheel over the plot **and** a `+`/`−` button pair zoom the X-window around the **hovered/focused** week (or center when none): `scale ∈ [1, 8]`, window width = `ceil(nWeeks / scale)`. Y auto-scales to the visible max(planned). |
| **Pan** | Click-drag on the plot shifts the visible week window left/right; clamped so you cannot pan past the data range (`windowStart ∈ [0, nWeeks − windowWidth]`). A `cursor-grab/grabbing` affordance. |
| **Reset view** | A **`↺ Reset`** button (Indonesian `aria-label="Reset tampilan tren"`) restores `scale=1`, `windowStart=0` — available whenever transform ≠ default. |
| **Legend toggle** | Two clickable legend swatches **show/hide** each series independently. Hiding *Done* leaves the Planned area full-strength; hiding *Planned* leaves Done against the empty-area background. At least one series must remain visible (ignore a "hide both" click; do not blank the chart). |

- **Implementation guardrails:**
  - One source of truth: compute `{ scale, windowStart }` from `useState`; derive the visible slice (`trend.slice(windowStart, windowStart + windowWidth)`) in the component, never mutate `trend`.
  - Use `preserveAspectRatio="none"` on an SVG scaled to its real width so the plot fills its container; the tooltip is HTML (not SVG `<title>`) so it is styled and Indonesian.
  - Debounce/snap hover on `onMouseMove`; no `react-hooks/set-state-in-effect` violations.
  - All interactive controls carry Indonesian `ariaLabel`/`aria-pressed` attributes (e.g. `aria-pressed` on legend toggles).

### 10.3 Container + empty state (never blank / broken)
- **In-band container:** replace the plain `ChartContainer data={trend}` usage with a `relative` wrapper holding the interactive SVG so the tooltip can be absolutely positioned over it:
  ```
  <div className="relative rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
    ...legend row / toolbar (Reset View · + · −)...
    ...<svg> plot ...
    ...tooltip div...
  </div>
  ```
- **Empty-state (no weeks parseable):** when `trend.length === 0`, render `EmptyState title="Belum ada data deadline untuk tren."` inside the same card — never an empty SVG, never a broken frame. This satisfies "never show just one small line/bar or empty area."
- **Card height:** right-size the card to its content — do not use a fixed `h-72`/`h-38` that leaves a large dead footer. Target a plot height ≈ `clamp(180px, 40px × visibleWeeks, 320px)` (scale with content), matching the publishing-tracker row for visual balance.
- **Downgrade path:** the OLD `TrendBars` may be **deleted** (replaced) — it is not a shared component; it is a local helper in `SosmedDashboard.tsx`.

---

## §11. Responsive rules & NO-horizontal-overflow guarantees

| Rule | Guarantee |
|------|-----------|
| 5-across grids (`compactRow`) | `grid-cols-2 sm:3 md:4 xl:5`; base mobile is 2 cols, never a single wide row that would need scroll. |
| 50/50 rows (`§7`, `§8.1`) | `grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`; `minmax(0,1fr)` uses the zero-min to let children truncate/scroll internally. |
| Deadline Monitoring chips | `grid gap-3 md:grid-cols-4` → drops to 2/1 naturally. |
| Tables (PIC detail, Explorer) | retain `overflow-x-auto` so a wide table's scroll is **contained to its own region** — the page `main` never scrolls horizontally. |
| Charts/bars | all SVGs `className="h-full w-full"` (`preserveAspectRatio="none"` for the trend), never wider than their cell. |
| Shell | page width tokens in §2 are unchanged — nothing widens the 1220 body. |
| **Acceptance:** no element on the page may push the `<body>`/`<main>` beyond `max-w-[1220px]`; horizontal scrolling of the PAGE is a failure. Only the PIC/Explorer tables' own inner regions may scroll. |

---

## §12. Acceptance checklist (reviewer gate)

### Visual
1. **[§1 §5.1]** Deadline Monitoring is the first content band under the filter (Overdue · Due Today · Due This Week · Completed + overdue list), rendered with the primary-band shadow; it is NOT duplicated lower on the page.
2. **[§5.2]** Production Overview renders **5 cards in one row on desktop** (`xl`) in each of its two rows, with `gap-3` (noticeably more compact than the old `MetricRow` gap-6), all 10 metrics present in the same order.
3. **[§7]** Funnel appears LEFT, Status Breakdown RIGHT, side-by-side on `xl`, stacked on smaller viewports; both half-columns equal width with no overflow; all 6 funnel stages and all 6 breakdown chips visible (honest zeros kept).
4. **[§8.1]** Workload bars LEFT and PIC Detail Table RIGHT side-by-side on `xl`, stacked below; table fully readable (its own horizontal scroll only if wide).
5. **[§8.2]** Publishing Tracker shows 5 compact cards in one row on desktop.
6. **[§10]** Output Trend is a full-width interactive chart (never a small/blank strip): legend row + toolbar visible; both series drawn with distinct colors; plot fills the card (no large dead footer).
7. **[§3 §9]** Filter card untouched visually; all touched controls/subtitles read Indonesian; no new English/Italian leftovers (incl. `ariaLabel`s).
8. **Viewport sweep:** page renders without horizontal scroll at `≥1600`, `1280`, `1024`, `768`, `390` px; the 5-across grids drop to 4/3/2 correctly; the two 50/50 rows stack to 1 column below `xl`.

### Functional
9. **[§4]** On a fresh load with multi-month data, all headline numbers reflect the **latest deadline period only** (`monthSel` default size 1). Opening Bulan Deadline shows that period pre-selected; adding other periods updates numbers; **Reset** returns to the latest period.
10. **[§4]** With a dataset whose deadlines are all in months other than today, and with today-month data present, the page opens on the **latest deadline period** (not an empty/all-period default); falls back to all-months only when no deadline parses.
11. **[§6]** Calendar opens in **'Hari Ini'** (today's month) when today's month has rows; when today's month is empty it opens on a data-weight month (never a blank grid). `‹`/`›` nav and the Hari Ini button work.
12. **[§10]** Output Trend interactions all work: hover shows the Indonesian tooltip with Rencana/Selesai/Delta + crosshair; wheel and `+`/`−` zoom; drag pans; **Reset** restores defaults; legend toggles hide/show each series independently with at least one always visible.
13. **[§10]** Output Trend never renders blank/broken: zero-data week window shows the Indonesian empty-state; not a single stray bar/line.
14. **[§0]** No shared component (`MetricCard`/`MetricRow`/`ChartContainer`/`SectionHeader`/`EmptyState`/`Divider`/`Button`/`Field`) was edited; no derivation in `sosmed.ts` was modified (only an additive `latestDeadlineMonthSet`); no field/schema/database change.
15. **[§0]** No feature deleted: Content Plan Storage + Planner survive in band [D]; explorer + drawer + inline editor + save path intact.
16. **[§4 §2]** `npx tsc --noEmit` → exit 0; `npx vitest run` → pre-existing + new tests green (incl. `latestDeadlineMonthSet` and the reworked layout regression tests); `npm run build` succeeds; `npm run lint` introduces no NEW errors.

---

*End of spec. Implementing scope: `src/workspaces/SosmedDashboard.tsx` (+ additive `latestDeadlineMonthSet` in `src/workspaces/sosmed.ts` + its test). No other file.*