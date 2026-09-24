# Digmark V3.1 — /sosmed Split: Landing + Planning + Reporting UI/UX Specification

**Author:** NEO (Designer profile)
**Audience:** REX (implementation engineer)
**Status:** READY FOR IMPLEMENTATION (Phase 1 deliverable)
**Applies to:** `D:/digmarkv3.1` (Next.js 16, Tailwind 4, TypeScript, App Router). Route family `app/(workspaces)/sosmed/`. Bodies under `src/workspaces/`. All derivations live in `src/workspaces/sosmed.ts` (953 lines) — **NOT modified, not touched, not imported-with-changes**. This is a pure UI-split refactor.
**Data sources (unchanged):** `GET /api/tables/sosmed` (tab `SOSMED`) + `GET /api/tables/content_plan` (tab `CONTENT_PLAN`). Writes ONLY via `POST`/`PATCH /api/tables/<key>`.

This spec is the single source of truth for the split. It is written so REX can implement **without making design decisions** — every route, section order, filter dimension, reuse rule, and acceptance criterion is pinned below. It does **not** invent features; every requirement traces to the user brief (prompt_refactor_sosmed.txt).

---

## §0 Scope & hard rules

**Type:** UI-split of the single `/sosmed` page into a landing page + two sub-pages. Logic/data/derivations/status/integration are unchanged — all analytics already exist in `sosmed.ts`.

**Do NOT touch (shared app components):** `MetricCard`, `MetricRow`, `DataTable`, `ChartContainer`, `SectionHeader`, `EmptyState`, `Button`, `Divider`, `Field` (`Select`/`Checkbox`/`TextInput`), `Topbar`, `Footer`, `WorkspaceNav`. They render on every workspace; reuse as-is. `ModuleHero` and `LoadingState`/`ErrorState` are also shared — reuse as-is.

**DO NOT modify `src/workspaces/sosmed.ts`.** Every derivation already exists and stays byte-for-byte. The split only re-wires *which* derivations each sub-page calls and *what* it renders from them.

**NO logic change anywhere.** The buffered-refresh contract, the `diffPatches`/`patchJson` save loop, `buildPlanPayload`/`buildProductionRow`/added-to-production flow, and the `content_plan` POST/PATCH contract are preserved exactly. Only the presentational body is split and re-ordered.

**Allowed file changes (the full list):**
1. `app/(workspaces)/sosmed/page.tsx` — becomes the **landing** route (thin shell → `SosmedLanding`).
2. `app/(workspaces)/sosmed/planning/page.tsx` — **new** sub-page shell → `SosmedPlanningDashboard`.
3. `app/(workspaces)/sosmed/reporting/page.tsx` — **new** sub-page shell → `SosmedReportingDashboard`.
4. `src/workspaces/sosmedUiShared.tsx` — **new** shared presentational module (the ~19 helpers currently local in `SosmedDashboard.tsx`) imported by BOTH sub-dashboards. See §5.
5. `src/workspaces/SosmedLanding.tsx` — **new** landing body.
6. `src/workspaces/SosmedPlanningDashboard.tsx` — **new** planning body (replaces the planning half of `SosmedDashboard.tsx`).
7. `src/workspaces/SosmedReportingDashboard.tsx` — **new** reporting body (replaces the reporting half).
8. `src/workspaces/SosmedDashboard.tsx` — **deleted** after both sub-dashboards + shared module land and the split tests pass (its presentational code is fully relocated; no logic lives in it that isn't duplicated elsewhere).
9. `src/workspaces/sosmed.test.tsx` — layout/render tests rewritten for the split structure. Derivation + PATCH + append tests stay untouched (they are logic-only).
10. Anything under `docs/` and `.planning/2026-09-24-sosmed-split/` (spec + progress).

**Scope-containment guarantee:** nothing outside `app/(workspaces)/sosmed/`, `src/workspaces/`, `docs/`, `.planning/` is modified. No schema change, no route change to other modules, no shared-component edit.

**Non-goals:** no Kanban, no new charting library (charts stay hand-rolled SVG), no dark theme, no per-user persistence beyond component state, no splitting of the derivations file, no new backend connection.

---

## §1 Route schema (`app/(workspaces)/sosmed/`)

Three nested routes, all under the existing `(workspaces)/sosmed/` directory:

| Route | File | Body component | Intent |
|---|---|---|---|
| `/sosmed` | `app/(workspaces)/sosmed/page.tsx` | `SosmedLanding` | **Landing** — 2 choice cards, no data needed |
| `/sosmed/planning` | `app/(workspaces)/sosmed/planning/page.tsx` | `SosmedPlanningDashboard` | **Planning** — content plan/calendar/master |
| `/sosmed/reporting` | `app/(workspaces)/sosmed/reporting/page.tsx` | `SosmedReportingDashboard` | **Reporting** — production/team analysis |

### §1.1 Shared route-shell logic (auth gate + data) — all three routes

All three shells keep the exact same **route-shell contract** as today's `page.tsx`: auth gate (`GET /api/auth/me`), two reads (`GET /api/tables/sosmed` + `GET /api/tables/content_plan` via `useApi`), buffered-refresh (`lastRows`/`lastPlanRows`), `WorkspaceNav activeUrl="sosmed"`, `Topbar`, `Footer`, `LoadingState` only when nothing has loaded, `ErrorState` with retry, `AuthGate` on 401/403, `isEditor = auth.data?.role === "editor"`. **This should not be re-typed three times.**

**Recommendation — extract a workspace-owned shell hook** `useSosmedWorkspace()` into `src/workspaces/` (e.g. `useSosmedWorkspace.ts`). It returns `{ rows, planRows, isEditor, onRefresh, authStatus, gateOpen, lastRows, lastPlanRows }` for any ready branch, encapsulating the buffered-refresh. Each `page.tsx` then is a thin wrapper:

```tsx
// app/(workspaces)/sosmed/planning/page.tsx
"use client";
import { useSosmedWorkspace } from "@/workspaces/useSosmedWorkspace";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { WorkspaceNav } from "@/components/layout/WorkspaceNav";
import { SosmedPlanningDashboard } from "@/workspaces/SosmedPlanningDashboard";
import { GateSkeleton, DataGates } from "@/workspaces/SosmedGates"; // gate + loading/error cluster

export default function PlanningPage() {
  const w = useSosmedWorkspace();
  if (!w.gateReady) return <GateSkeleton .../>;       // loading / AuthGate (see §1.2)
  return (
    <>
      <Topbar />
      <div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">
        <WorkspaceNav activeUrl="sosmed" />
      </div>
      <DataGates {...w}>{(rows, planRows, isEditor, onRefresh) =>
        <SosmedPlanningDashboard rows={rows} planRows={planRows} isEditor={isEditor} onRefresh={onRefresh} />
      }</DataGates>
      <Footer />
    </>
  );
}
```

- `useSosmedWorkspace()` — owns `auth`/`table`/`plan` `useApi` reads, buffered `lastRows`/`lastPlanRows`, and `onRefresh` (refetches both, buffering before refetch). Pure route-shell concern; workspace-owned, so it is allowed and reduces triple-duplication.
- `SosmedGates` (small workspace-owned helper, `src/workspaces/SosmedGates.tsx`) — renders: full-page spinner (session resolving) or `AuthGate` (401/403) as `GateSkeleton`, and `ErrorState`/`LoadingState` when nothing has loaded, then renders the body. If **any** shell needs `planRows` even when `content_plan` is empty (planning does), pass it through; reporting can ignore `planRows`.
- **WorkspaceNav:** every route keeps `activeUrl="sosmed"` so the **Social Media pill stays active** on all three. `WorkspaceNav` itself is untouched.
- **Module registry pill** (`MODULES`, `/sosmed`): unchanged. Its href stays `/sosmed` (the landing). The landing is the module's front door; planning/reporting are reached from the landing cards (and, optionally, from a small in-page sub-nav — see §2).

### §1.2 Landing route data needs

`/sosmed` (landing) shows **only** the two choice cards + module context. Per the brief ("simple landing/overview with 2 choices"), the landing needs **no data fetch** — it is static. Recommendation: the landing shell still runs the auth gate (a workspace must be gated) but does **not** fetch table data, so it stays instant. If Ejak wants a light teaser count on the landing, that would add the two `useApi` reads — **flagged as a decision (see §6 R1)**; default = static, no fetch.

### §1.3 Sub-page in-app navigation

Add a compact 3-item sub-nav **inside the capped body container** on the landing and both sub-pages (sibling of `WorkspaceNav`, workspace-owned markup, no shared component): `Overview` → `/sosmed`, `Planning` → `/sosmed/planning`, `Reporting` → `/sosmed/reporting`. It reuses the `WorkspaceNav` pill styling (`inline-flex items-center gap-1 rounded-[12px] border ...` active = `bg-brand text-white`, inactive = `text-muted hover:text-ink`); the active item matches the current route (`usePathname()`). Each sub-page also keeps its own roles already enforced by the server, so this is purely navigational.

---

## §2 Landing page design (`/sosmed` → `SosmedLanding.tsx`)

A clean, light, centered front door. **Two large choice cards**, nothing else heavy (no metrics on the landing — the brief says "simple landing/overview with 2 choices"). Responsive: 2-across on `md+`, stacked 1-across below.

Layout (`SosmedLanding`):
1. **Page header** (reuse the existing header pattern, `pt-8`, no action cluster — no Refresh needed here):
   ```tsx
   <header className="mb-8 pt-8">
     <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
     <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">Social Media</h1>
     <p className="mt-1 text-[0.92rem] text-muted">Produksi konten, workload per PIC, publishing, dan monitoring operasional.</p>
   </header>
   ```
   (Conventional `ModuleHero` icon+title variant is also acceptable; keep it consistent with the pre-split header copy.)
2. **Two choice cards** in a responsive grid:
   ```tsx
   <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
     <Link href="/sosmed/planning" className="group ...">
       <span icon>📋</span>
       <h3>Planning Social Media</h3>
       <p>+ Content Plan, Content Calendar, Content List, dan Master Content Data.</p>
       <span arrow>→</span>
     </Link>
     <Link href="/sosmed/reporting" className="group ...">
       <span icon>📊</span>
       <h3>Reporting &amp; Production</h3>
       <p>Production Overview, Deadline Monitoring, Workload per PIC, Publishing, dan Output Trend.</p>
       <span arrow>→</span>
     </Link>
   </div>
   ```

**Card treatment (each card is a full-card `<Link>`, exact):**
- Card container: `group relative flex flex-col gap-3 rounded-[16px] border border-border bg-surface p-6 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px] transition-colors hover:border-brand/40 hover:shadow-[var(--dm-shadow)]`.
- Icon: `text-[2rem]` leading emoji (📋 planning / 📊 reporting), as `<span aria-hidden>`.
- Title: `<h3 className="text-[1.25rem] font-extrabold text-ink">`.
- Description: `<p className="text-[0.9rem] text-muted">` — a one-line summary, Indonesian (exact copy in §2 above; the planning desc references the planning scope, reporting desc references the "what happened" focus).
- Arrow affordance: `<span aria-hidden className="ml-auto text-brand transition-transform group-hover:translate-x-1">→</span>` in the card header row so the arrow sits top-right; `group-hover` nudges it right on hover.
- Whole card is clickable via the `<Link>`; add `aria-label` combining title + description on each card for a11y parity.

**Intent statement under the cards (optional, light)**: a single muted line distinguishing the two halves — e.g. *"Perencanaan: konten yang akan dibuat. Reporting: hasil yang sudah terjadi."* This makes the split rationale explicit without adding analytics. (Matches brief: reporting = "what happened", planning = "what will be made".)

No data, no filters, no tables on the landing.

---

## §3 PLANNING sub-page (`/sosmed/planning` → `SosmedPlanningDashboard.tsx`)

**Focus:** planning content + managing the content plan ("what will be made"). **No heavy production analytics.** Master Content Data stays editable; Save Changes works.

### §3.1 Props (identical shape to today)

```tsx
export interface SosmedPlanningDashboardProps {
  rows: Row[];                 // GET /api/tables/sosmed
  planRows?: Row[];            // GET /api/tables/content_plan
  isEditor: boolean;
  onRefresh?: () => void;
}
```

### §3.2 Global/contextual filter (ONE bar at the top — no per-section filters)

A single filter card, structurally identical to today's §1 Filter Data card (multi-select `MultiSelectDropdown`s + active-filter chips + `↩ Reset`), but with **exactly these dimensions (brief): Bulan/Periode · PIC · Platform · Content Pillar · Format**. **NO Status on planning.**

| Filter dim | Source (sosmed.ts) | Default |
|---|---|---|
| Bulan / Periode | `sosmedMonths(rows)` (deadline month) | `latestDeadlineMonthSet(months, rows)` |
| PIC | `picOptions(rows)` | all selected |
| Platform | `distinctValues(rows, "Platform")` | all selected |
| Content Pillar | `distinctValues(rows, "Konten Pillar")` | all selected |
| Format | `distinctValues(rows, "Output")` | all selected |

**Wiring to `filterRows`:** planning passes an explicit **empty `statuses` Set** (so status does not filter) and the four active dims. `filterRows` already treats empty sets as "pass everything," so this is a no-logic-change call:

```tsx
const filtered = useMemo(
  () => filterRows(rows, { pics: picSel, months: monthSel, statuses: EMPTY, platforms: platformSel, pillars: pillarSel, formats: formatSel }),
  [rows, picSel, monthSel, platformSel, pillarSel, formatSel],
);
```

State (`useState` sets + `openMenu`) is **owned by this dashboard**, seeded exactly as today. `activeFilterCount` counts over the 5 dims. This filter drives the calendar, list, light overview, and Master explorer that sit below it.

### §3.3 Section order (exact)

| # | Section | Reused derivation / helper |
|---|---|---|
| Header | Page header + action cluster: `+ Content Plan` (primary → opens `ContentPlannerModal`) + `🔄 Refresh Data` | — |
| 1 | **Global filter bar** (§3.2) | `filterRows`, `sosmedMonths`, `picOptions`, `distinctValues`, `MultiSelectDropdown` |
| 2 | **Light planning overview** (compact) | `productionOverview(filtered, TODAY)` + `sosmedMetrics(filtered)` for format/platform breakdown (see §3.4) |
| 3 | **Content Plan Storage** (plan list + Add-to-Production) | `planRows`, `planIsPushed`, `addToProduction`, `contentKode`, `productionKodeExists`, `PlanStatusBadge` |
| 4 | **Content Calendar** (default TODAY) + **Content List** (tabbed: `Kalender` / `Daftar`) | `calendarCells`, `firstOfToday`, `shiftMonth`, `monthTitleText`, `ProsesBadge`, `RowDetailDrawer` |
| 5 | **Master Content Data (Explorer)** + editor + Save Changes | `ContentExplorer`, `searchContents`, `paginationWindow`, `deadlineBucket`, `filterRows`, `COLUMN_DEFS` |

### §3.4 Light planning overview (compact, not the heavy analytics)

A single compact card — **no** deadlined production panels, **no** funnel/status/action/workload here. Show (both react to the §3.2 filter):
- **Total Planned** = `overview.planned` → `MetricCard icon="📊" label="Total Planned"`.
- **Breakdown by Format and/or Platform** "if relevant": reuse `contentStrategy(filtered)` and render its `formats` + `platforms` slices as two compact horizontal `StrategyBar` lists side-by-side (`md:grid-cols-2`), driven by the live distinct values — never hardcoded. This satisfies the brief's "breakdown by format/platform if relevant" with zero new derivation (Content Strategy already computes `formats`/`platforms`). Show them only when non-empty; otherwise show the Total Planned card alone.
- Keep it to this ONE light strip. **Do not** render the production `overview` overdue/in-progress/completion analytics or the legacy KPI row on planning — that is reporting's job.

**Recommendation flagged (R2, §6):** exactly how much of the `productionOverview`/`sosmedMetrics` signal to surface here. Default = only `Total Planned + formats/platforms` (minimal, matches "light"). Optionally also `Total Done` + `Completion Rate` if Ejak wants a one-glance health read; that winds up heavier than "light" so default keeps them off.

### §3.5 Content Plan Storage (plan management — "managing content plan")

The exact plan-management panel from today's §3 (Content Plan Storage): lists every `planRows` entry with `Judul / Ide Konten`, `PlanStatusBadge`, Priority, `Deadline Produksi`, and the editor-only `＋ Tambah ke Produksi` button on `APPROVED` + not-yet-pushed plans. **This flow is unchanged** (POST `content_plan` builder, `buildProductionRow` POST to sosmed + durable `DIPRODUKSI` PATCH lock, `pushedSet`, kode collision dedupe). Rendered before the Calendar so the management action is immediately visible.

### §3.6 Content Calendar — default TODAY + Content List

- **Calendar default = TODAY directly** (brief explicit). Replace the data-aware `calendarDefaultMonth(filtered, TODAY)` default with `firstOfToday()` (1st of today's month) as the initial `calCursor` — so on first load the calendar shows **the current month / today**. The existing `Hari Ini` button (resets to `firstOfToday()`) and `‹ ›` month switching stay. **Flagged (R3, §6):** this is an intentional override of the current data-aware default; today takes precedence per the brief. Switching months still works.
- Calendar renders `calendarCells(calendarRows, year, month, TODAY)` over the §3.2-filtered rows with a deadline; tone-class cards (overdue/today/done/neutral), `ProsesBadge`, `+N lagi` overflow, click → `RowDetailDrawer`. Unchanged from today.
- **Content List (Daftar)** = today's §4.3 compact list, deadline-ascending, click → `RowDetailDrawer`. Unchanged.
- Tab bar (`Kalender`/`Daftar`) state `tab` owned here; default `"calendar"`.

### §3.7 Master Content Data (Explorer) + editor + Save Changes

Full re-use of `ContentExplorer` (shared, §5) with all explorer state (search, page, visible columns, filters, deadline select, draft, save) owned here, exactly as today. **The inline editor + `💾 Simpan Perubahan` (page-slice `diffPatches` → sequential `patchJson PATCH`, real booleans, `onRefresh` on success) MUST continue to work unchanged.** This is where "Master Content stays editable + Save Changes works" lands on the split. The fullscreen (`↗ Perluas`) overlay reuses the shared `ContentExplorer` too. Viewer (`isEditor === false`) sees the read-only table with no Save control (server 403s viewers) — unchanged.

---

## §4 REPORTING sub-page (`/sosmed/reporting` → `SosmedReportingDashboard.tsx`)

**Focus:** monitoring production + team work analysis ("what happened"). **Production Overview compact. NO Content Planner/calendar here** (brief note).

### §4.1 Props

```tsx
export interface SosmedReportingDashboardProps {
  rows: Row[];                 // GET /api/tables/sosmed
  isEditor: boolean;
  onRefresh?: () => void;
}
```
(No `planRows`, no `content_plan` on reporting — no planner on this page.)

### §4.2 Global/contextual filter (ONE bar — exact dims: Periode · PIC · Platform · Status · Format)

**NO Content Pillar on reporting.** One filter card, identical structure to §3.2, using these dimensions:

| Filter dim | Source | Default |
|---|---|---|
| Periode | `sosmedMonths(rows)` (deadline month) | `latestDeadlineMonthSet(months, rows)` |
| PIC | `picOptions(rows)` | all selected |
| Platform | `distinctValues(rows, "Platform")` | all selected |
| Status | `statusOptions` = `["Belum Dimulai","Dalam Produksi","Review","Revision","Done","Published"]` (via `STAGE_LABELS[stageOf]`) | all selected |
| Format | `distinctValues(rows, "Output")` | all selected |

**Wiring:** pass an explicit **empty `pillars` Set** (no pillar filter) + the five active dims:

```tsx
const filtered = useMemo(
  () => filterRows(rows, { pics: picSel, months: monthSel, statuses: statusSel, platforms: platformSel, pillars: EMPTY, formats: formatSel }),
  [rows, picSel, monthSel, statusSel, platformSel, formatSel],
);
```

`statusSel` default is the full `statusOptions` set. State owned here. This single bar drives every reporting section below (no per-section filters anywhere).

### §4.3 Section order (exact — matches the brief's reporting list, most-monitoring-relevant first)

| # | Section | Reused derivation / helper |
|---|---|---|
| Header | Page header + `🔄 Refresh Data` (no `+ Content Plan` here) | — |
| 1 | **Global filter bar** (§4.2) | `filterRows`, `MultiSelectDropdown` |
| 2 | **Production Overview** (compact) | `productionOverview(filtered, TODAY)` + legacy KPIs as secondary compact row (see §4.4) |
| 3 | **Deadline Monitoring** | `deadlineMonitor(filtered, TODAY)` + `countChip` + `ActionItemRow` |
| 4 | **Production Funnel & Status Breakdown** (50/50) | `productionFunnel(filtered)`, `statusBreakdown(filtered)`, `FunnelBars` |
| 5 | **Action Required** (quad) | `actionRequired(filtered, TODAY)` + `ActionItemRow` |
| 6 | **Workload per PIC** (50/50) | `picWorkload(filtered, TODAY)` + `WorkloadBars` + `PicCapacityRows` |
| 7 | **Publishing Tracker** (compact 5-across) | `publishingTracker(filtered)` + `MetricCard` |
| 8 | **Content Strategy** (actual distribution, 3-across) | `contentStrategy(filtered)` + `StrategyBar` |
| 9 | **Output Trend** | `outputTrend(filtered)` + `InteractiveOutputTrend` |

Each section separated by `Divider`, wrapped in `SectionHeader` (except the filter and the compact KPI strip which use `SectionHeader` too for clarity). This ordering keeps "what happened" monitoring front-and-center and places deep-dives (workload, strategy, trend) progressively lower.

### §4.4 Production Overview — compact

"Should be compact" (brief). Use the **compact 5-across** row (`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3`) for the production overview itself — `Total Planned`, `Total Done`, `In Progress`, `Overdue`, `Completion Rate` (from `productionOverview`), as today's §5.2 row A.

**Legacy KPI row (Video/Design Selesai + Hutang IG/TikTok/YT) — flagged (R1, §6):** the brief's reporting list names only "Production Overview." The current page also shows the legacy KPI row B (`sosmedMetrics` → Video/Design Selesai, Hutang Post). Recommendation: **preserve it** as a second compact `MetricCard` row directly under the overview (same `compactRow`), because the brief also mandates "preserve data/calculations." It stays inside the compact Production Overview region (two compact rows, one region). Alternative (drop it) contradicts "preserve calculations" — so default = keep both compact rows; flag for sign-off so nothing is silently dropped.

### §4.5 No planner, no calendar, no Master explorer, no add-to-production

These are planning-scope; reporting deliberately excludes them. The row-detail drawer is **not** on reporting (no Master explorer/list/calendar surfaces here). `planRows` is not passed to reporting.

---

## §5 Shared components strategy (`src/workspaces/sosmedUiShared.tsx`)

The ~19 presentational helpers currently **local** in `SosmedDashboard.tsx` are workspace-local (not shared app components → safe to extract). Recommendation: a **sosmed-owned shared module** `src/workspaces/sosmedUiShared.tsx`, imported by BOTH `SosmedPlanningDashboard` and `SosmedReportingDashboard` and the shared `SosmedGates`/`SosmedLanding` (where used). This is the single home for cross-dashboard presentational primitives so nothing is copied twice.

### §5.1 Classification table — what goes where

| Helper (current local in `SosmedDashboard.tsx`) | Home | Used by |
|---|---|---|
| `MultiSelectDropdown` | **sosmedUiShared.tsx** | Planning (filter, explorer), Reporting (filter) |
| `ProsesBadge` | **sosmedUiShared.tsx** | Planning (calendar/list/explorer/drawer), Reporting (none directly but keep shared for badges) |
| `PlanStatusBadge` | **sosmedUiShared.tsx** | Planning (plan storage) |
| `ProcessBar` | **sosmedUiShared.tsx** | Planning (explorer "Process" column) |
| `WorkloadBars` | **sosmedUiShared.tsx** | Reporting (Workload) |
| `PicCapacityRows` | **sosmedUiShared.tsx** | Reporting (Workload table) |
| `FunnelBars` | **sosmedUiShared.tsx** | Reporting (Funnel) |
| `InteractiveOutputTrend` | **sosmedUiShared.tsx** | Reporting (Output Trend) |
| `StrategyBar` | **sosmedUiShared.tsx** | Planning (light overview formats/platforms), Reporting (Content Strategy) |
| `countChip` | **sosmedUiShared.tsx** | Reporting (Deadline Monitoring) |
| `ActionItemRow` | **sosmedUiShared.tsx** | Reporting (Deadline, Action Required) |
| `filterCardHeader` | **sosmedUiShared.tsx** | Planning + Reporting (both filter cards) |
| `DateField` | **sosmedUiShared.tsx** | Planning (planner modal) |
| `PlannerField` | **sosmedUiShared.tsx** | Planning (planner modal) |
| `ContentPlannerModal` | **sosmedUiShared.tsx** | Planning (header `+ Content Plan`) |
| `ContentExplorer` | **sosmedUiShared.tsx** | Planning (Master Content Data + fullscreen) |
| `RowDetailDrawer` | **sosmedUiShared.tsx** | Planning (calendar/list/explorer) |
| `selectionSummary` | **sosmedUiShared.tsx** | shared by `MultiSelectDropdown`; also exported for tests |
| `FIELD_BASE` (const) | **sosmedUiShared.tsx** | shared by `DateField`/`PlannerField`/planner form |
| `str`, `compactRow`, `splitRow` (small local helpers/consts) | **sosmedUiShared.tsx** (export `str`) | many sections on both pages |
| `EXPLORER_PAGE_SIZE`, `btnPage`, `btnReset`, `deadlines` list, `DETAIL_FIELDS` | **sosmedUiShared.tsx** (move with `ContentExplorer`/`RowDetailDrawer`) | Planning |
| `monthTitleText`, `firstOfToday`, `shiftMonth`, `WEEKDAYS`, `toneClass`, `isDoneByLocal`, `startOfDayLocal` (calendar/urgency) | **Stay local in `SosmedPlanningDashboard.tsx`** | Planning calendar only — not shared, keep private |

### §5.2 Rule summary

- **ALL presentational primitives → `sosmedUiShared.tsx`** unless they are used by exactly one dashboard AND are tightly coupled to that dashboard's internal state (calendar helpers). Even single-dashboard helpers whose logic is non-trivial (charts, explorer, drawer) go to the shared file because they are large and stable — centralizing avoids duplicate maintenance and matches the finding's "extract to a sosmed-owned shared file."
- **Never move/edit shared app components** (`MetricCard`, `DataTable`, `ChartContainer`, `SectionHeader`, `EmptyState`, `Button`, `Divider`, `Topbar`, `Footer`, `WorkspaceNav`, `Field`). The shared module and both dashboards *import* them unchanged.
- **No logic moves into the shared module.** Props are threaded exactly as today; the module is presentational and stateless (except browser-only UI state like `ContentExplorer`'s own popover state, unchanged from today).
- Existing exports from `sosmed.ts` (`COLUMN_DEFS`, `EXPLORER_DEFAULT_COLS`, `PROSES_OPTIONS`, `SOSMED_*`) continue to feed these helpers; the shared module imports them from `@/workspaces/sosmed` exactly as `SosmedDashboard.tsx` does now.

---

## §6 Build plan — component naming

| New file | Role |
|---|---|
| `src/workspaces/sosmedUiShared.tsx` | All shared presentational helpers (§5) |
| `src/workspaces/SosmedLanding.tsx` | Landing body (§2) |
| `src/workspaces/SosmedPlanningDashboard.tsx` | Planning body (§3), props `{rows, planRows, isEditor, onRefresh}` |
| `src/workspaces/SosmedReportingDashboard.tsx` | Reporting body (§4), props `{rows, isEditor, onRefresh}` |
| `src/workspaces/useSosmedWorkspace.ts` | Shared route-shell data+auth hook (§1.1) |
| `src/workspaces/SosmedGates.tsx` | Gate/loading/error cluster + body render (§1.1) |
| `app/(workspaces)/sosmed/page.tsx` | Landing shell (edit existing) |
| `app/(workspaces)/sosmed/planning/page.tsx` | Planning shell (new) |
| `app/(workspaces)/sosmed/reporting/page.tsx` | Reporting shell (new) |
| `src/workspaces/SosmedDashboard.tsx` | **Deleted** after all the above land + tests green |

**Naming decision:** retire the monolithic `SosmedDashboard` name. Use explicit `SosmedLanding` / `SosmedPlanningDashboard` / `SosmedReportingDashboard` so each route's body is self-describing and the file map is obvious. Each sub-dashboard receives `rows` (+ `planRows` on planning) + `isEditor` + `onRefresh`, exactly the shape today's `SosmedDashboardProps` carries. No prop-shape redesign.

---

## §7 Filter state per sub-page (global/contextual only)

- **Each sub-page owns its own filter state** (`useState` sets for its dims + `openMenu`). No shared filter context, no persisted filter — matches today's local-state model. Planning's state and Reporting's state are fully independent; neither reads the other.
- **Dims per page (§3.2 / §4.2):** Planning = Bulan/PIC/Platform/Pillar/Format (no Status); Reporting = Periode/PIC/Platform/Status/Format (no Pillar). The absent dimension is passed as an **empty Set** to `filterRows` so it does not filter — no logic change (empty set = pass-all in the existing derivation).
- **Only one filter bar per sub-page** (the contextual/global bar). The Master explorer on planning additionally keeps its **own Explorer-internal** filter row (search + 7 dims + Deadline select + Reset) — that is a data-explorer filter, distinct from the page's global filter, and both coexist exactly as the single page does today (Explorer filters are `exp-*` state, independent of the global `*Sel` state). This is not "filter duplication per section" — it is one page-level filter plus the explorer's own scoped search — and matches the current single-page behavior which the brief does not ask to remove.
- Active-filter chip row + `↩ Reset`/`Hapus Semua` per page, identical to today's card.

---

## §8 Acceptance checklist (maps EVERY brief bullet → spec section)

Every row must be satisfiable by a **read** of this spec; REX ticks them off before handoff.

- [ ] **A1. Split `/sosmed` into a landing + two sub-pages so info is not too dense** → §1 (routes), §2 (landing), §3 (planning), §4 (reporting).
- [ ] **A2. `/sosmed` = simple landing/overview with 2 choices: 📋 Planning Social Media / 📊 Reporting & Production** → §2 (two cards, exact labels/desc).
- [ ] **A3. Planning focus = planning content + managing content plan** → §3 (Content Plan Storage, Calendar, List, Master explorer).
- [ ] **A4. Planning includes `+ Content Plan`** → §3.3 (header action → `ContentPlannerModal`).
- [ ] **A5. Planning includes Content Calendar** → §3.6 (calendar, `calendarCells`).
- [ ] **A6. Planning includes Content List** → §3.6 (Daftar).
- [ ] **A7. Planning includes Master Content Data / Master Data** → §3.7 (`ContentExplorer`).
- [ ] **A8. Planning has light overview: total planned + breakdown by format/platform if relevant** → §3.4 (Total Planned + `contentStrategy` formats/platforms).
- [ ] **A9. Calendar default shows TODAY directly, can still switch months** → §3.6 (`firstOfToday()` default, `Hari Ini` + `‹ ›` preserved).
- [ ] **A10. No heavy production analytics on planning** → §3 (explicitly excludes funnel/status/action/workload/publishing/trend).
- [ ] **A11. Planning filter (global/contextual at top): Bulan/Periode · PIC · Platform · Content Pillar · Format** → §3.2 (exact 5 dims, NO Status).
- [ ] **A12. Reporting focus = monitoring production + team work analysis** → §4.
- [ ] **A13. Reporting includes Production Overview** → §4.3/§4.4 (compact).
- [ ] **A14. Reporting includes Deadline Monitoring** → §4.3 (#3, `deadlineMonitor`).
- [ ] **A15. Reporting includes Production Funnel & Status Breakdown** → §4.3 (#4).
- [ ] **A16. Reporting includes Action Required** → §4.3 (#5, quad grid).
- [ ] **A17. Reporting includes Workload per PIC** → §4.3 (#6).
- [ ] **A18. Reporting includes Publishing Tracker** → §4.3 (#7).
- [ ] **A19. Reporting includes Content Strategy (actual distribution)** → §4.3 (#8, `contentStrategy`).
- [ ] **A20. Reporting includes Output Trend** → §4.3 (#9, `InteractiveOutputTrend`).
- [ ] **A21. Reporting filter (global/contextual at top): Periode · PIC · Platform · Status · Format** → §4.2 (exact 5 dims, NO Pillar).
- [ ] **X1. DO NOT duplicate filters per section — ONE global/contextual filter bar at top of each sub-page** → §3.2 / §4.2 (single bar; explorer's own search is its scoped data-explorer filter, not per-section duplication).
- [ ] **X2. Reporting focuses on 'what happened', Planning on 'what will be made'** → §3 (planning) vs §4 (reporting) content separation + landing intent line (§2).
- [ ] **X3. Production Overview should be compact** → §4.4 (compact 5-across row; legacy KPI keep-candidate).
- [ ] **X4. Preserve data, calculations, status, integration** → §0 (no `sosmed.ts` change), §3/§4 reuse exact derivations, §1.1 buffered-refresh preserved.
- [ ] **X5. Master Content stays editable + Save Changes works** → §3.7 (unchanged `diffPatches`/`patchJson`/`runSave` editor contract).
- [ ] **X6. Cleaner/lighter UI** → §2/§3/§4 (landing decoupled, planning stripped of analytics, reporting grouped).
- [ ] **X7. Responsive** → §3/§4 responsive grids (compact rows `xl:grid-cols-5`, split rows, calendar always 7-wide, drawer `max-w-[440px]`, only table containers scroll horizontally — NEVER the page body).
- [ ] **X8. Don't break other pages** → §0 (scope confined to `app/(workspaces)/sosmed/` + `src/workspaces/` + docs; no shared-component edits; `WorkspaceNav`/`MODULES` untouched).
- [ ] **R1. Route wiring: nested `app/(workspaces)/sosmed/` + auth gate + data on each shell** → §1 (all three shells gated + `useSosmedWorkspace`; `WorkspaceNav activeUrl="sosmed"`; module pill href stays `/sosmed`).
- [ ] **N1. Shared component strategy adopted** → §5 (`sosmedUiShared.tsx`; shared app components untouched).
- [ ] **N2. Build plan naming adopted** → §6 (`SosmedLanding` / `SosmedPlanningDashboard` / `SosmedReportingDashboard`; sub-dashboards receive `rows`+`planRows`+`isEditor`+`onRefresh`).
- [ ] **N3. Filter state per sub-page (contextual/global; each owns its own)** → §7.
- [ ] **T1. `sosmed.test.tsx` layout tests rewritten for split** (old "12 listbox popovers / single Deadline Monitoring / xl:grid-cols-5 x3 / one-page structure" assertions replaced by per-route render tests). Derivation/PATCH/append tests untouched.
- [ ] **G-CLOSED. Gates:** `tsc` 0 · `vitest` green · `next build` exit 0 with new routes listed · lint no NEW errors · `GET /sosmed`, `/sosmed/planning`, `/sosmed/reporting` 200 · no master writes (audit log clean).

---

## §6b Requirements flagged for a decision

- **R1 — Legacy KPI row on Reporting (and whether the landing fetches data):** The brief's reporting list names only "Production Overview," and the landing needs no data. To honor "preserve data/calculations," the default keeps the legacy `sosmedMetrics` KPI row (Video/Design Selesai + Hutang IG/TikTok/YT) as a second compact row under Reporting's Production Overview, and keeps the landing static (no fetch). If Ejak prefers a thinner reporting page (drop legacy KPIs to a collapsed/optional strip) or a landing teaser count (which adds the two `useApi` reads to `/sosmed`), confirm.
- **R2 — Planning light-overview depth:** Default = `Total Planned` + live formats/platforms only (matches "light"). Optional = add `Total Done`/`Completion Rate` for a one-glance health read. Confirm if the richer variant is wanted on planning.
- **R3 — Calendar default override:** The brief explicitly requires the calendar to default to **today**; this overrides the current data-aware `calendarDefaultMonth` (which skips to the busiest deadline month when today's month has no rows). Default = `firstOfToday()`. `Hari Ini` + month switching still work. Confirm this override is intended (it changes a current behavior the brief did request).
- **R1b — Where the Master explorer lives:** It is listed under Planning, so it lives ONLY on `/sosmed/planning`; `/sosmed/reporting` has no planner/explorer. Confirm this matches intent (the brief lists it under Planning Social Media).

---

## §9 Implementation sequence (Phase 1 → Phase 2 handoff)

1. Create `sosmedUiShared.tsx` (move the 19 helpers as-is; delete them from `SosmedDashboard.tsx`).
2. Create `useSosmedWorkspace` + `SosmedGates`; refactor `page.tsx` shell onto them.
3. Create `SosmedLanding.tsx` + `page.tsx` (landing route).
4. Create `SosmedPlanningDashboard.tsx` + `planning/page.tsx` (reusing shared helpers).
5. Create `SosmedReportingDashboard.tsx` + `reporting/page.tsx`.
6. Rewrite `sosmed.test.tsx` layout tests for the split; keep derivation/append tests.
7. Run the 4 gates + functional smoke (G-CLOSED). Render review by NEO. Surgical fixes by REX. EVA re-verifies, then prod + push only on Ejak approval.
