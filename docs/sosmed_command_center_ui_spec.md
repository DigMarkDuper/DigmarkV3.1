# Digmark V3.1 — /sosmed “Social Media Command Center” UI/UX Specification

**Author:** NEO (Designer profile)
**Audience:** REX (implementation engineer)
**Status:** READY FOR IMPLEMENTATION
**Applies to:** `D:/digmarkv3.1` (Next.js 16), route `app/(workspaces)/sosmed/page.tsx`, body `src/workspaces/SosmedDashboard.tsx`
**Data source (unchanged):** `GET /api/tables/sosmed` → Google Sheets tab `SOSMED`. Writes only via `POST /api/tables/sosmed` (append) and `PATCH /api/tables/sosmed` (edit one cell by declared column). New write path appended to the SAME workbook: tab `CONTENT_PLAN`, schema key `content_plan`.

This spec is the single source of truth for this redesign. It is written so REX can build 1:1 **without making design decisions** — every copy string, class, token, state variable, and interaction rule is pinned below. Where the existing `SosmedDashboard.tsx` already implements a proven pattern, this spec reuses and repoints it rather than reinventing.

---

## §0 How to build this (scope & reuse rules)

**Do NOT modify shared components** — `MetricCard`, `MetricRow`, `SectionHeader`, `ChartContainer`, `Divider`, `Button`, `Field`, `Topbar`, `Footer`, `WorkspaceNav`. They render on every workspace; reuse as-is. All new UI is expressed with wrapper divs + existing Tailwind utilities, or copied into `SosmedDashboard.tsx` / small private helper components inside that file.

**Allowed file changes (the full list):**
1. `app/(workspaces)/sosmed/page.tsx` — shell only: banner an appended `content_plan` fetch (below), pass to Dashboard.
2. `src/workspaces/SosmedDashboard.tsx` — the bulk of the redesign (this spec).
3. `src/workspaces/sosmed.ts` — add derivations that the design needs (deadline classifier for the Explorer, Kode generator, search predicate). **Do not touch existing exports.**
4. `src/server/adapter/schema.ts` — **add** the `content_plan` entry (append only; do not reorder/modify `sosmed`).
5. `src/config/constants.ts` — **only if** a `SHEETS.content_plan` mapping and/or `MODULES` entry is required for the data access to be reachable. Audit first; the append API path may already be generic over declared tabs.
6. `src/workspaces/sosmed.test.tsx` — add tests for new derivations.

**Write-back audit before coding:** confirm `POST /api/tables/content_plan` and `PATCH /api/tables/content_plan` exist generically (the append/edit controllers key off declared `TAB_SCHEMAS`). If the route is generic, this redesign is UI-layer-only plus the schema/constants additions — do not create a new route or connection.

**Band (do not change):** the page stays on the standard reference band. Outer shell `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` wrapping `<main className="mx-auto w-full max-w-[1220px]">`. The `/sosmed` workspace does **not** get the wide 1700-band; a data *explorer* scrolls its table container horizontally — the page body never scrolls horizontally.

**Copy language:** everything user-visible is **Indonesian**. §7 lists the Dutch/Italian leftovers currently in `SosmedDashboard.tsx` and the exact Indonesian replacement (Rex must also fix the interactive `ariaLabel` strings there, e.g. the existing `aria-label` on filters).

---

## §1 Data model additions (authoritative)

### §1.1 New schema `content_plan` → tab `CONTENT_PLAN`

Append to `TAB_SCHEMAS` in `src/server/adapter/schema.ts`. Column headers exactly (ordered):

```
Judul / Ide Konten, Tanggal Publish, Deadline Produksi, Content Pillar, Format, Platform, PIC, Brief, Reference Link, Priority, Status Plan
```

11 columns. **Leave the `sosmed` schema untouched.**

- `Status Plan` value domain: `IDEA | PLANNED | APPROVED`, plus a transient lock value `DIPRODUKSI` used by Add-to-Production (§6.3) to prevent double-push. A plan is pushable **iff** `Status Plan === "APPROVED"`.
- `Priority` free-text (values like `High/Medium/Low` — do not hard-restrict the domain; surface whatever lives in the sheet).
- Dates (`Tanggal Publish`, `Deadline Produksi`) are day-first `DD/MM/YYYY`, consistent with `sosmed.Tanggal Deadline`.

### §1.2 `content_plan` data access in the page shell

`page.tsx` adds a second read alongside the existing `table`:

```tsx
const plan = useApi<TableApi>("/api/tables/content_plan", (d) => d.rows.length === 0);
```

Ready branch passes `planRows={plan.data?.rows ?? []}` to `<SosmedDashboard>`. The Dashboard must read the plan once per `rows`/`planRows` change and keeps an in-memory `pushedSet` (see §6). No other shell change; the existing auth gate, banding, and ready/non-ready branch behavior are unchanged.

---

## §2 Page layout — 11 sections, exact order

The command-center page is ONE vertical document (no internal page nav), exactly 11 body sections after the page header, in this order:

| # | Section | Designer intent |
|---|---------|-----------------|
| 1 | **Filter Data** (global multi-dimension filter card) | reuse the existing filter card unchanged |
| 2 | **Production Overview + KPI row(s)** | KPI preservation — see §3 |
| 3 | **Content Planning — Calendar & List** (tabbed) | **the most prominent new section** — see §4 |
| 4 | **Production Funnel** | existing, copy cleaned (§7) |
| 5 | **Status Breakdown** | existing, copy cleaned |
| 6 | **Action Required** | **RESTORED per user brief §13/§17** — a distinct standalone section; see §2.1A |
| 7 | **Workload per PIC** | existing, copy cleaned |
| 8 | **Deadline Monitoring** | existing, copy cleaned; the overdue list also folds the Action-Required Overdue data |
| 9 | **Publishing Tracker** | existing, copy cleaned |
| 10 | **Content Strategy** | existing, copy cleaned |
| 11 | **Output Trend** | existing, copy cleaned |
| 12 | **Master Content Data EXPLORER** (renamed from “Master Production Pipeline”) | the data explorer + inline edit + Save Changes — see §5 |

**Layout decision (EVA reconciliation, overrides NEO §2):** the user brief (§13 list ~#6, §17 existing-functionality list) REQUIRES a standalone **Action Required** quad grid with the four exact buckets (Overdue / Waiting for Review / In Revision / Finished but not Published). It is **NOT** consolidated away. The page has 12 body sections after the header (the brief's "11" counts the header as item 1). The existing Action-Required grid (§ existing in `SosmedDashboard.tsx`) is preserved as §6 with its copy cleaned to Indonesian per §7.

### §2.1A Action Required (restored standalone section — brief §13, §17)
Placed as §6 (between Status Breakdown and Workload per PIC). **Keep the existing Action-Required quad grid** from the current `SosmedDashboard.tsx` (4 panels: `🚨 Overdue`, `👀 Waiting for Review`, `🔁 In Revision`, `📤 Finished, not published`), each with its `ActionItemRow` list. It consumes the existing `actionRequired(filtered, TODAY)` derivation unchanged. Only copy cleanup applies (see §7 — exact Indonesian headers and the `Tidak ada (status tidak tersedia di data).` string). Do not remove or merge this section.

**Section separators:** `Divider` between sections; each section wrapped in `SectionHeader` except §1 (filter) and §3 (which has its own tabbed header).

**Page header (unchanged structure; copy updated):**

```tsx
<header className="mb-8 flex flex-wrap items-center justify-between gap-4 pt-8">
  <div className="min-w-0">
    <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
    <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">Social Media</h1>
    <p className="mt-1 text-[0.92rem] text-muted">Produksi konten, workload per PIC, publishing, dan monitoring operasional.</p>
  </div>
  <div className="flex flex-wrap items-center gap-3"> {/* NEW action cluster, §2.1 */}
```

### §2.1 Header action cluster (top-right)

Two buttons sit to the right of the title, ordered right-to-left exactly:

1. **`+ Content Plan`** — primary action, brand button. `Button variant="primary"`. Opens the Content Planner (large modal/drawer, §4.1). Positioned **closest to the right edge** (beside / after Refresh Data).
2. **`🔄 Refresh Data`** — existing `Button variant="secondary"` → `onRefresh`.

No navigation is triggered by `+ Content Plan`; it is a pure in-page modal. Labels exact: `+ Content Plan` and `🔄 Refresh Data`.

---

## §3 KPI row preservation (Production Overview + legacy KPIs)

Requirement: all existing KPIs keep rendering and keep reacting to the global §1 filter. Two `MetricRow`s, order preserved.

**Row A — Production Overview (existing):**

```tsx
<MetricRow>
  <MetricCard icon="📊" label="Total Planned" value={String(overview.planned)} />
  <MetricCard icon="✅" label="Total Done" value={String(overview.done)} />
  <MetricCard icon="⏳" label="In Progress" value={String(overview.inProgress)} />
  <MetricCard icon="🚨" label="Overdue" value={String(overview.overdue)} />
  <MetricCard icon="🎯" label="Completion Rate" value={formatPercent(overview.completionRate ?? 0, overview.completionRate !== null)} />
</MetricRow>
```

**Row B — legacy KPI cards (existing):**

```tsx
<div className="mt-4"><MetricRow>
  <MetricCard icon="🎬" label="Video Selesai" value={metrics.videoLabel} />
  <MetricCard icon="🎨" label="Design Selesai" value={metrics.designLabel} />
  <MetricCard icon="📸" label="Hutang Post IG" value={String(metrics.hutangIg)} />
  <MetricCard icon="🎵" label="Hutang Post TikTok" value={String(metrics.hutangTiktok)} />
  <MetricCard icon="▶️" label="Hutang Post YT" value={String(metrics.hutangYt)} />
</MetricRow></div>
```

Both rows use `MetricCard`/`MetricRow` untouched. `overview`/`metrics` come from the existing `productionOverview(filtered, TODAY)` and `sosmedMetrics(filtered)` on the §1-filtered rows — no change to that wiring.

---

## §4 Content Planning — Calendar & List (new, prominent)

Placed immediately after the KPIs so planning is visible without scrolling deep. A tabbed card with two tabs: **Kalender** and **Daftar**. Tabs drive which view renders; both operate on the same row set (§1-filtered `sosmed` rows) and both open the same row-detail drawer on click.

Also draws in the **Content Planner** modal (the `+ Content Plan` action) appended to this section's component — the modal is a child of §3, opened from the header button.

### §4.0 Tab bar (shared chrome)

```tsx
<div className="mb-4 inline-flex items-center gap-1 rounded-[12px] border border-border bg-surface p-1 shadow-[var(--dm-shadow-xs)]">
  <button type="button" aria-pressed={tab==="calendar"}
    onClick={() => setTab("calendar")}
    className={"rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors "
      + (tab==="calendar" ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink")}>
    📅 Kalender
  </button>
  <button type="button" aria-pressed={tab==="list"}
    onClick={() => setTab("list")}
    className={"rounded-[10px] px-4 py-1.5 text-[0.85rem] font-semibold transition-colors "
      + (tab==="list" ? "bg-brand text-white shadow-[var(--dm-shadow-xs)]" : "text-muted hover:text-ink")}>
    📋 Daftar
  </button>
</div>
```

State: `const [tab, setTab] = useState<"calendar" | "list">("calendar")`.

Kanban is **NOT** built (explicitly optional in the brief). Tabs required: Calendar + List.

### §4.1 Content Planner modal (+ Content Plan)

**Trigger:** header `+ Content Plan` button → `const [plannerOpen, setPlannerOpen] = useState(false)`.

**Treatment:** a **large centered modal** (not a drawer — the form is tall and benefits from center focus). Overlay + panel reuse the proven modal chrome:

```tsx
{plannerOpen ? (
  <div role="dialog" aria-modal="true" aria-label="Content Plan Baru"
       className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/60 backdrop-blur-md px-4 py-10">
    <div className="w-full max-w-3xl rounded-[20px] border border-border bg-surface p-6 shadow-[var(--dm-shadow-panel)]">
      {/* header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-[1.25rem] font-extrabold text-ink">Content Plan Baru</h2>
          <p className="text-[0.85rem] text-muted">Rencanakan konten; jadwal produksi Anda akan otomatis dibuat saat disimpan atau ditambahkan ke produksi.</p>
        </div>
        <button type="button" aria-label="Tutup" onClick={() => setPlannerOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-muted hover:text-ink">✕</button>
      </div>
      {/* form body — see fields below */}
      {/* footer */}
      <div className="mt-6 flex items-center justify-end gap-3 border-t border-divider pt-4">
        <Button variant="secondary" onClick={() => setPlannerOpen(false)} disabled={savingPlan}>Batal</Button>
        <Button variant="primary" onClick={saveContentPlan} disabled={savingPlan || !planFormValid}>
          {savingPlan ? "Menyimpan..." : "Save Content Plan"}
        </Button>
      </div>
    </div>
  </div>
) : null}
```

**Form fields (exact, in visual order; 2-column grid on `sm+`, 1-column below):**

Grid: `grid gap-4 sm:grid-cols-2`. Full-width rows use `sm:col-span-2`.

| Field | Control | Col span | Notes |
|---|---|---|---|
| Judul / Ide Konten | `TextInput` | 2 | required, placeholder `Tulis judul atau ide konten…` |
| Tanggal Publish | date input (see §4.1.1) | 1 | required, day-first |
| Deadline Produksi | date input (§4.1.1) | 1 | required, day-first |
| Content Pillar | `Select` from live distinct `Konten Pillar` | 1 | §5.6 live-domain rule |
| Format | `Select` from live distinct `Output` | 1 | |
| Platform | `Select` from live distinct `Platform` | 1 | |
| PIC | `Select` from `picOptions(rows)` | 1 | live distinct `PIC` |
| Brief | `TextInput` (multiline) | 2 | optional textarea `rows={3}`, placeholder `Deskripsi singkat / brief konten…` |
| Reference Link | `TextInput` type `url` | 2 | optional `https://…` |
| Priority | `Select` from live distinct Priority (fallback `High`,`Medium`,`Low`) | 1 | |
| Status Plan | `Select` — options `IDEA`,`PLANNED`,`APPROVED`; defaults `IDEA` | 1 | |

**§4.1.1 Date inputs:** the shared `Field` `TextInput` has no `type="date"`. Use local primitives copied from `Field.tsx`'s `FIELD_BASE` with `type="date"` (same class string), exactly as the wa–admin/append-modal pattern. On write, send ISO `YYYY-MM-DD` (the sheet stores a date value; the read round-trips as `DD/MM/YYYY`). Do not touch shared `Field.tsx`.

**Save Content Plan → `saveContentPlan`:**

1. Validate: `Judul / Ide Konten` non-empty + both dates parse OR keep per-field red state (`border-danger`) blocking submit before any network call. Disable while `savingPlan`.
2. POST append **one** row to `POST /api/tables/content_plan` with a payload whose keys EXACTLY match the §1.1 declared columns (11 keys). `Status Plan` = the selected value; `Priority` etc. sent as-is; empty optional fields sent as `""`.
3. On success: `setSavingPlan(false)` → close modal → `onRefresh?.()` (both sosmed and plan refresh — see §6.1 buffered-refresh note) → success toast `✅ Content plan tersimpan.`. On failure: keep form values, show inline error `⚠️ Gagal menyimpan. Coba lagi.`; do NOT close and never duplicate on retry.
4. Reuse `postJson` from `@/lib/api-client` for the POST.

`planFormValid` = Judul non-empty + both dates present + valid parse.

### §4.2 Calendar view

A month grid; each `sosmed` row is placed on the day of its **deadline date** (`toDatetime(Tanggal Deadline)` via the existing `deadlineDate` in `src/workspaces/sosmed.ts`). Rows with no parseable deadline are omitted from the grid (they remain reachable via Daftar/Explorer).

**State:** `const [calCursor, setCalCursor] = useState(() => first day of current month)`; view shows the month of `calCursor`. **Controls row** above the grid:

```tsx
<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
  <Button variant="secondary" onClick={() => setCalCursor(firstOfToday())}>Hari Ini</Button>
  <div className="flex items-center gap-2">
    <button type="button" aria-label="Bulan sebelumnya" onClick={prevMonth} className="btn-chevron">‹</button>
    <span className="min-w-[9rem] text-center text-[1rem] font-extrabold text-ink">{monthTitle}</span> {/* e.g. "September 2026" */}
    <button type="button" aria-label="Bulan berikutnya" onClick={nextMonth} className="btn-chevron">›</button>
  </div>
</div>
```

`btn-chevron` = `flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-surface-input text-ink hover:border-brand/40`. `monthTitle` = Indonesian month label of `calCursor` (derive from the existing `monthLabel` helper with `"%B %Y"`; January → "Januari", … as the helper locale produces).

**Grid:**

```tsx
<div className="grid grid-cols-7 gap-1.5">
  {weekdayHeaders /* Sen, Sel, Rab, Kam, Jum, Sab, Min — sticky top row */}
  {dayCells}
</div>
```

- 7 columns, 7 rows max (leading blanks for first-day offset from Monday). Each cell: `min-h-[92px]` rounded-`12px` `border border-border bg-surface/70 p-1.5`. Outside-current-month cells render `bg-transparent border-border/40 opacity-50`.
- Cell top row: day number (`text-[0.8rem] font-bold text-ink`, or `text-muted` for today) + a `⇤`/"hari ini" ring when it's today (`border-[1.5px] border-accent` on the number chip).
- **Content cards** in the cell body (stack, `flex flex-col gap-1`, `overflow-hidden`, `max-h` clips + a `+N lagi` overflow chip when >3):

**Content card (exact):**

```tsx
<button type="button" onClick={() => openDetail(row)}
  className="group w-full rounded-[8px] border p-1.5 text-left transition-colors
             group-hover:border-brand/40
             {toneClass}">
  <span className="block truncate text-[0.72rem] font-semibold text-ink" title={judul}>{judul}</span>
  <span className="mt-0.5 flex items-center gap-1 text-[0.65rem] text-muted">
    <span className="truncate">{format}</span>
    {platform ? <span className="text-brand-hover/80">· {platform}</span> : null}
  </span>
  <span className="mt-1 flex items-center gap-1.5 text-[0.68rem]">
    <span className="truncate text-muted">{pic}</span>
    <ProsesBadge status={proses} />   {/* existing ProsesBadge, compacted */}
  </span>
</button>
```

- Card fields required by the brief: **title (Judul), format (Output), platform (Platform), PIC, status (PROSES badge)** — exactly these five, in this order.
- `toneClass` by deadline urgency against `TODAY`: overdue → `border-danger/30 bg-danger/5`; due today → `border-warning/40 bg-warning/5`; done (`PROSES==DONE`) → `border-success/30 bg-success/5`; else neutral `border-border bg-surface`. The existing `ProsesBadge` renders the status; tone provides the urgency cue.
- Clicking any card → `openDetail(row)` → same row-detail drawer as every other surface (§5.8). `tooltip`/`title` shows the full Judul on truncation.

**Month navigation math:** pure — `prevMonth`/`nextMonth`/`firstOfToday` shift the 1st-of-month cursor; day cells computed from the week Monday offset. All derived in testable helpers (add to `sosmed.ts`, §5.7) so the calendar is deterministic.

### §4.3 List (Daftar) view

A compact vertical list of §1-filtered rows, one `ActionItemRow`-style row per content:

```tsx
<div className="divide-y divide-divider rounded-[16px] border border-border bg-surface">
  {listRows.map((row) => (
    <button type="button" key={originalIndex(row)} onClick={() => openDetail(row)}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-brand/[0.03]">
      <span className="min-w-0 flex-1 truncate text-[0.9rem] font-semibold text-ink" title={judul}>{judul}</span>
      <span className="hidden text-[0.8rem] text-muted sm:inline">{format}</span>
      {platform ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.72rem] font-semibold text-brand-hover">📲 {platform}</span> : null}
      <span className="shrink-0 text-[0.8rem] text-muted">{pic}</span>
      <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-[0.72rem] font-medium text-muted">⏰ {deadline}</span>
      <ProsesBadge status={proses} />
    </button>
  ))}
</div>
```

Sort: deadline ascending (missing deadlines last). Empty → `EmptyState title="Tidak ada konten."`. Row count header `menampilkan {listRows.length} konten` above the list (small `text-[0.8rem] text-muted`). Clicking a row → row-detail drawer.

---

## §5 Master Content Data EXPLORER (new; replaces “Master Production Pipeline”)

This is the centerpiece. It must feel like a **data explorer**, not a spreadsheet. One reusable `ContentExplorer` subcomponent (private to `SosmedDashboard.tsx`) rendered twice: once embedded inline (the §11 section body) and once inside the fullscreen overlay (§5.5) — pass `embedded: boolean` to toggle chrome. The inline section keeps the existing inline-editor/save behavior (§5.10) for edit parity.

### §5.1 Section header + toolbar

```tsx
<SectionHeader title="Master Content Data Explorer"
               subtitle="Jelajahi, cari, dan kelola seluruh konten. Edit sel dan klik 'Simpan Perubahan' untuk menyimpan." />
```

**Toolbar row** (one flex-wrap bar inside the table card, above the table):

```tsx
<div className="flex flex-wrap items-center gap-2 border-b border-divider px-3 py-2.5">
  {/* Search input — flexible width */}
  <div className="relative min-w-[220px] flex-1">
    <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">🔎</span>
    <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
      placeholder="Cari konten, kode, PIC…" aria-label="Cari konten"
      className="w-full h-9 rounded-[10px] border border-border bg-surface-input pl-8 pr-3 text-[0.82rem] text-ink placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand focus:outline-none" />
  </div>
  {/* Column visibility */}
  <button type="button" onClick={() => setColMenuOpen(!colMenuOpen)} aria-expanded={colMenuOpen} aria-haspopup="menu"
    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-surface-input px-3 text-[0.82rem] font-semibold text-ink hover:border-brand/40">
    ⚙ Columns
  </button>
  {/* Fullscreen */}
  <button type="button" onClick={() => setFullscreen(true)} aria-label="Perluas ke layar penuh"
    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-surface-input px-3 text-[0.82rem] font-semibold text-ink hover:border-brand/40">
    ↗ Expand
  </button>
</div>
```

**Exact toolbar controls & order:** search box (`🔎 Cari konten, kode, PIC…`), `⚙ Columns`, `↗ Expand`. The Refresh/Simpan controls live in §5.10 below the table, not in the toolbar (except fullscreen reuses the same two toolbar buttons).

### §5.2 Search (debounced, reactive, client-side)

- State `const [query, setQuery] = useState("")`; debounce with a `useEffect` + 200ms timer into `debouncedQ`. Pure predicate `searchContents(rows, debouncedQ)` added to `sosmed.ts`:

```
Return rows where any of these columns contain `q` (case-insensitive substring on the trimmed string):
KODE → Kode Konten
TITLE → Judul Konten
PILLAR → Konten Pillar
PLATFORM → Platform
FORMAT → Output
PIC → PIC
```
  Empty/whitespace `q` → return all rows unchanged. Any change to `debouncedQ` also resets pagination to page 1 (§5.3).

### §5.3 Pagination precision

- `const PAGE_SIZE = 15` (15 satisfies the “10–15 rows” brief; exposes a responsive count `Showing X–Y of Z`).
- Derived over the **search+filtered** set `explorerRows`: `const totalPages = Math.max(1, Math.ceil(explorerRows.length / PAGE_SIZE));`
- `const [page, setPage] = useState(1)`; clamp `page` into `[1, totalPages]` whenever `explorerRows`/`totalPages` change (effect) so a filter shrink never leaves an out-of-range page.
- Slice: `explorerRows.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)`.
- **Count line (exact, Indonesian):** `Menampilkan {start}–{end} dari {explorerRows.length} konten` where `start = (page-1)*PAGE_SIZE+1` and `end = Math.min(page*PAGE_SIZE, explorerRows.length)`. (Brief example “Showing 15 of 287 contents” ⇒ renders `Menampilkan 1–15 dari 287 konten`.) When `explorerRows.length === 0`, render `Menampilkan 0 konten`. Place this line above the table, right-aligned: `text-[0.8rem] text-muted`.
- **Pager (exact):** a `.pagination` row below the table:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
  <span className="text-[0.8rem] text-muted">Menampilkan {start}–{end} dari {explorerRows.length} konten</span>
  <nav aria-label="Navigasi halaman" className="flex items-center gap-1">
    <button type="button" disabled={page===1} onClick={() => setPage(page-1)}
      className="btn-page" aria-label="Sebelumnya">[Prev]</button>
    {/* page buttons with ellipsis window */}
    {pageWindow.map((p) => p === "…" ? <span key={p} className="px-1 text-muted">…</span>
      : <button key={p} type="button" aria-current={p===page ? "page" : undefined}
          className={"btn-page " + (p===page ? "bg-brand text-white border-brand" : "")}>{p}</button>)}
    <button type="button" disabled={page===totalPages} onClick={() => setPage(page+1)}
      className="btn-page" aria-label="Berikutnya">[Next]</button>
  </nav>
</div>
```

`btn-page` = `h-8 min-w-8 rounded-[8px] border border-border bg-surface-input px-2 text-[0.8rem] font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:border-brand/40`. **Page-window algorithm** (page labels are literal `[1]`,`[2]`,… per the brief `[Prev][1][2]...`): show `1`, `totalPages`, the current page, and one page on each side of current; collapse gaps to `…`. **Add to `sosmed.ts` as a pure `paginationWindow(page, totalPages)` returning `(number | "…")[]`** and unit-test it.

### §5.4 Filters (inline, with Reset Filter)

Inside the table card, directly under the toolbar (before the table), a compact filter row:

```tsx
<div className="flex flex-wrap items-end gap-3 border-b border-divider px-3 py-3">
  { /* 7 dropdowns, grid on xl: grid grid-cols-2 xl:grid-cols-4 gap-3 */ }
  <MultiSelectDropdown>PIC</MultiSelectDropdown>        {/* picOptions(rows) */}
  <MultiSelectDropdown>Bulan</MultiSelectDropdown>      {/* sosmedMonths(rows) — deadline month */}
  <MultiSelectDropdown>Status</MultiSelectDropdown>     {/* existing statusOptions [Belum Dimulai…Published] via stageOf */}
  <MultiSelectDropdown>Platform</MultiSelectDropdown>   {/* distinctValues(Platform) */}
  <MultiSelectDropdown>Format</MultiSelectDropdown>     {/* distinctValues(Output) */}
  <MultiSelectDropdown>Content Pillar</MultiSelectDropdown> {/* distinctValues(Konten Pillar) */}
  <DeadlineSelect/>                                     {/* single-select, §5.4.1 */}
  <button type="button" onClick={resetExplorerFilters} className="btn-reset">Reset Filter</button>
</div>
```

Reuse the existing `MultiSelectDropdown` component **as-is** from `SosmedDashboard.tsx` (same single-open `openMenu` state pattern, right-edge anchoring already handled). A **seventh** control is the Deadline single-select (below). **`Reset Filter`** (exact label) resets all seven to full/All state and clears the query? — No: Reset Filter resets *only the 7 dropdowns* to default (all-selected / Deadline=All) and keeps the search text; `↺ Reset` semantics spelled out in §5.10.

Filter application: `explorerRows = searchContents(filterRows(rows, explorerFilter), debouncedQ)` where `filterRows` already ANDs the six multiselect dimensions and Deadline is applied as an extra predicate (add `deadlineBucket` to the derivation, §5.7). Default = everything selected / Deadline `All` ⇒ no filter active.

**§5.4.1 Deadline single-select options (exact list):**

| Value | Meaning (predicate on `deadlineDate` + `isDone`, against `TODAY`) |
|---|---|
| `Semua` | no deadline predicate |
| `Overdue` | `deadlineDate < today` and **not** done |
| `Due Today` | `sameDay(deadlineDate, today)` and not done |
| `Due This Week` | `today ≤ deadlineDate ≤ today+7d` and not done |
| `Future` | `deadlineDate > today+7d` |
| `Completed` | `isDone(row)` |

These mirror the existing `deadlineMonitor` buckets one-to-one; implement as a pure `deadlineBucket(row, today)` classifier in `sosmed.ts` returning `"ALL" | "overdue" | "dueToday" | "dueThisWeek" | "future" | "completed"` and reuse it (single source of truth with §7). Control: a native `<select>` using `FIELD_BASE` classes labeled `Deadline`, value bound to `dlSel`.

### §5.5 Column management (⚙ Columns)

- State `const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(DEFAULT_COLS)` (persisted to component state only; no localStorage required by brief).
- `⚙ Columns` button opens a small popover (reuse the `MultiSelectDropdown` panel chrome: `absolute z-30 ... w-64 rounded-[12px] border border-border bg-surface p-2 shadow-[var(--dm-shadow-panel)]`) anchored within the toolbar container; outside-click closes.
- Popover = a checkbox list (same row/checkbox classes as `MultiSelectDropdown`), each toggling a column in `visibleCols`, plus a top row "Pilih Semua" toggling all. **The default set can never be empty** — if the user deselects the last visible default column, keep at least one column visible (guard).
- **Column catalog (key → header | source):**

```
DEFAULT (7, always on, order pinned):
  code      → "Kode"        | Kode Konten
  title     → "Content Title" | Judul Konten
  deadline  → "Deadline"    | Tanggal Deadline
  pic       → "PIC"         | PIC
  format    → "Format"      | Output
  status    → "Status"      | PROSES (rendered as ProsesBadge)
  platform  → "Platform"    | Platform

EXTRA (selectable, default OFF, append in this order):
  pillar    → "Content Pillar" | Konten Pillar (text)
  process   → "Process"      | PROSES rendered as a mini progress bar (DONE=100% bar, ON PROGRESS="Dalam Produksi" 60%, PENDING/empty 10%)
  ig        → "IG"           | IG bool (✅ / ◦, reused from editor)
  tiktok    → "TikTok"       | TIKTOK bool (✅ / ◦)
  yt        → "YouTube"      | YT bool (✅ / ◦)
  reference → "Reference"    | LINK COVER (ellipsized link text)
  notes     → "Notes"        | Materi Konten (ellipsized)
```

**Column rendering rules:** header `th` uses the existing editor style (`px-3 py-2 text-left text-[0.8rem] font-semibold uppercase tracking-[0.02em] text-muted`). Long text (`title`, `reference`, `notes`) is `truncate` with a `max-w-[16rem]` and a `title` tooltip; row height ≥ `py-2.5`. `process` bar: `w-20 h-1.5 rounded-full bg-surface-strong` with inner `h-full rounded-full` filled `bg-brand` width % + `aria-label`. Ellipsis (brief requirement) applies to `title`, `reference`, `notes`.

### §5.6 Table

Container (only the table scrolls horizontally on narrow widths — never the page):

```tsx
<div className="overflow-x-auto rounded-[16px] border border-border bg-surface shadow-[var(--dm-shadow)]">
  <table className="w-full min-w-[920px] border-collapse text-left">
    <thead className="sticky top-0 z-10 border-b border-divider bg-white/90 backdrop-blur-[8px]">
      <tr>{/* visibleCols headers per §5.5 */}</tr>
    </thead>
    <tbody>
      {pageRows.map((row, i) => (
        <tr key={originalIndex(row)} onClick={() => openDetail(row)}
           className={"cursor-pointer transition-colors hover:bg-brand/[0.03] " + (i % 2 === 0 ? "bg-white/70" : "bg-white/85")}>
          {/* cells per §5.5; Kode shown as monospace-ish; PROSES as badge; bools as ✅/◦ */}
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

- `min-w-[920px]` on the table keeps the sticky header + wide content; the wrapper scrolls horizontally on tablet/mobile.
- **Row click → `openDetail(row)`** opens the row-detail drawer (§5.8). Add `onClick` to the `<tr>`; rely on button-like semantics via `role="button"`? — keep `<tr>` clickable with `tabIndex={-1}`; accessible path is the drawer header close + the column-management/save controls.
- Empty after search+filter → `EmptyState title="Tidak ada konten sesuai pencarian/filter."`.
- Zebra + `hover:bg-brand/[0.03]` preserves the editor table feel (already in the file).

### §5.7 New pure derivations to add to `src/workspaces/sosmed.ts`

Add (each unit-testable; do not modify existing exports):
1. `searchContents(rows, q)` — §5.2 predicate.
2. `deadlineBucket(row, today)` — §5.4.1 classifier.
3. `paginationWindow(page, totalPages)` — §5.3.
4. `calendarCells(rows, year, month, today)` → weekday-offset'd day cells with `{day, isToday, isOutside, rows[]}` — §4.2.
5. `contentKode(planRowIndex)` — §6.3 Kode generator.
6. `explorerColumns`/`COLUMN_DEFS` constant (key → header/source/cell-render kind) — §5.5 catalog as data, so the table maps over it and fullscreen reuses it.

All date math already uses `toDatetime`/`monthLabel` from `@/server/utils/helpers`.

### §5.8 Row-detail drawer

Opened by `openDetail(row)` from Calendar cards, List rows, Explorer rows, and fullscreen rows. State `const [detailRow, setDetailRow] = useState<Row | null>(null)`.

Right-side drawer (overlay + panel):

```tsx
{detailRow ? (
  <>
    <div aria-hidden className="fixed inset-0 z-40 bg-white/40 backdrop-blur-sm" onClick={() => setDetailRow(null)} />
    <aside role="dialog" aria-modal="true" aria-label="Detail Konten"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col border-l border-border bg-surface shadow-[var(--dm-shadow-lift)]">
      <header className="flex items-start justify-between gap-3 border-b border-divider px-5 py-4">
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-brand">Detail Konten</p>
          <h3 className="truncate text-[1.1rem] font-extrabold text-ink">{judul}</h3>
        </div>
        <button type="button" aria-label="Tutup" onClick={() => setDetailRow(null)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface-input text-muted hover:text-ink">✕</button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Field grid, §5.8.1 */}
        {/* Edit controls (editor-only), §5.8.2 */}
      </div>
      <footer className="border-t border-divider p-4">
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={toggleEditSave} disabled={saving || detailInFlight}>
            {editingDetail ? (saving ? "Menyimpan..." : "💾 Simpan Perubahan") : "Edit"}
          </Button>
          {saveMsg ? <p role="status" className={saveMsgClass}>{saveMsg.text}</p> : null}
        </div>
      </footer>
    </aside>
  </>
) : null}
```

- `saveMsg` reuse: the existing `{kind, text}` state in the file ($5.10) — the drawer uses the same message + save flow.

**§5.8.1 Field grid (read-only, all 16 sosmed columns)** — `grid grid-cols-2 gap-3`; each `dl`: `dt` label (`text-[0.7rem] font-semibold uppercase tracking-wide text-muted`) + `dd` value (`text-[0.85rem] text-ink`, `break-words`). Order: `Kode Konten` (mono), `Tanggal Deadline`, `Tanggal Posting`, `Output`, `Konten Pillar`, `Platform`, `PIC`, `Judul Konten`, `Materi Konten`, `  CAPTION `, `LINK COVER` (as link `title` attr if URL), `PROSES` (as `ProsesBadge`), `LINK KONTEN JADI`, and boolean `IG`/`TIKTOK`/`YT` as `✅ Sudah` / `◦ Belum`.

**§5.8.2 Edit (editor-only `isEditor`):** toggle `const [editingDetail, setEditingDetail] = useState(false)`. When editing, the six editable fields swap to the existing controls, initialized from the row:
- `PIC` → `Select` (options `pics`)
- `PROSES` → `Select` (options `PROSES_OPTIONS`)
- `Output` → `TextInput`
- `IG`/`YT`/`TIKTOK` → `Checkbox` (real boolean)

Footer button label changes from `Edit` → `💾 Simpan Perubahan` while editing. **Save** reuses the exact existing diff+patch path: build a `draft` for `detailRow` keyed by `originalIndex(detailRow)`, call `diffPatches` → sequentially `patchJson` (PATCH per changed cell, bools real) → on success `onRefresh?.()`, close drawer, `✅ {N} perubahan tersimpan.`; errors `⚠️ {M} perubahan gagal.`; nothing `ℹ️ Tidak ada perubahan.` (keep drawer open with values intact on failure). Viewer sees the read-only grid with **no** Edit control.

### §5.9 Fullscreen explorer (↗ Expand)

`const [fullscreen, setFullscreen] = useState(false)`. Fullscreen overlay:

```tsx
{fullscreen ? (
  <div role="dialog" aria-modal="true" aria-label="Explorer konten — layar penuh"
       className="fixed inset-0 z-50 flex flex-col bg-surface-strong/95 backdrop-blur-md">
    <header className="flex items-center justify-between gap-3 border-b border-divider bg-white/80 px-5 py-3">
      <h2 className="text-[1.1rem] font-extrabold text-ink">Master Content Data Explorer</h2>
      <div className="flex items-center gap-2">
        <button type="button" onClick={resetExplorerFilters} className="btn-reset">Reset Filter</button>
        <Button variant="secondary" onClick={() => setFullscreen(false)} className="shrink-0">✕ Tutup</Button>
      </div>
    </header>
    <div className="mx-auto w-full max-w-[1500px] flex-1 min-h-0 overflow-y-auto px-6 py-4">
      {/* The SAME ContentExplorer body: toolbar(search/columns) + filters + count
          + table(sticky header, horizontal scroll) + pagination + Save Changes */}
    </div>
  </div>
) : null}
```

- Reuses the identical `ContentExplorer` render (search + filters + column visibility + pagination + sticky-header scrolling table). Only chrome differs: title row + `✕ Tutup` (exact label) replace the section header, and `Reset Filter` (exact label) sits in the fullscreen header.
- Feed `sosmed` rows (the §1-filtered `filtered` set) — fullscreen explores the global-filtered data, same as inline. Its own search+dashboard filtering/pagination state is shared with the inline explorer (extract one state + one `ContentExplorer` so inline/fullscreen never diverge).
- Close resets `fullscreen=false` keeping search/filter/page state.

### §5.10 Editor + Save Changes (parity preserved)

- **Viewer vs editor:** `isEditor` (existing derivation). Editors get the Save control(s); viewers see the table read-only with NO save control (server also 403s). Row-detail drawer: viewer read-only (§5.8.2).
- Inline editable control types are unchanged from the current file: `PIC`→Select, `PROSES`→Select(`PROSES_OPTIONS`), `Output`→TextInput, `IG/YT/TIKTOK`→Checkbox(real bool); `Kode Konten`/date cols/`Judul Konten` read-only text. **The Explorer replaces the monolithic render but keeps these exact cell controls** for the 7 default columns (and `PIC` honored wherever shown).
- **Save row (below the table, editor-only):** the existing

```tsx
{isEditing ? (
  <div className="mt-4 flex items-center gap-4">
    <Button variant="primary" onClick={runSave} disabled={saving || editableRows.length === 0}>
      {saving ? "Menyimpan..." : "💾 Simpan Perubahan"}
    </Button>
    {saveMsg ? <p role="status" className={saveMsgClass}>{saveMsg.text}</p> : null}
  </div>
) : null}
```

  — same `runSave`/`diffPatches`/sequential-`patchJson`/`onRefresh` loop already in the file. **Do not change the save contract.** The only allowed change: the editable working-draft grid now iterates the Explorer's **page slice** (rows actually visible) rather than all filtered rows, so edits apply to what the user sees on the current page. `originalIndex(row)` (existing) still maps page rows back to the unfiltered `__rowIndex` for PATCH.
- In-flight: `saving` disables the button + shows `Menyimpan...`; sequential awaits keep the sheet consistent.

---

## §6 Add-to-Production (plan → sosmed)

Trigger: on the Content Planner **list/calendar of plans** (the plans rendered inside §3's block, below/near the tabs — see §6.0) and on every APPROVED plan row.

### §6.0 Plans panel placement

The Content Planning section (§4) shows the plan list under the tab bar. Because the brief's section list is dominated by content monitoring, the **plans live in a compact collapsible panel** at the top of the §3 card, labeled **`Content Plan Storage`** (always visible; `collapsed` state optional but default expanded), listing every plan row from `content_plan` with: Judul/Ide Konten, Status Plan badge (IDEA/PLANNED/APPROVED → `ProsesBadge`-like tones: APPROVED=`bg-brand/10 text-brand-hover`, PLANNED=`bg-warning/10 text-warning`, IDEA=`bg-muted/10 text-muted`), Priority, Deadline Produksi, and a **`＋ Tambah ke Produksi`** button.

### §6.1 Data & refresh wiring

The Dashboard keeps plan rows in state `const [plans, setPlans] = useState<Row[]>(planRows)` synced from the `planRows` prop and a session `const [pushedSet, setPushedSet] = useState<Set<number>>(new Set())` (§6.3). **Refresh note (page-layer):** mirror the proven buffered-`lastRows` pattern from the skill so a `plan.refetch` that flips to `loading` does not unmount the modal/drawer/toast mid-save — buffer last-loaded `sosmed` rows and last-loaded `plan` rows in `page.tsx` and keep the Dashboard mounted when a refetch momentarily reports loading. `onRefresh` passed to the Dashboard triggers BOTH the sosmed restructure and a plan refresh.

### §6.2 ACTION — how the button appears

- **Visibility:** the `＋ Tambah ke Produksi` button renders **only** when `isEditor` is true AND `plan.Status Plan === "APPROVED"` AND the plan is not already pushed (§6.3). Everyone sees the plan row; only eligible editors see the push button.
- **Element:** `Button variant="primary"` compact `＋ Tambah ke Produksi`, with `title="Tambahkan ke pipeline produksi sosmed"`.

### §6.3 What the action does + duplicate-prevention (authoritative)

On click for plan at `planRowIndex`:

1. **Guard (client, fast-path):** if `pushedSet.has(planRowIndex)` → no-op + toast `ℹ️ Sudah ditambahkan ke produksi.`
2. **Guard (dedupe, durable):** build `kode = contentKode(planRowIndex)` and scan the **current sosmed rows**; if any `Kode Konten === kode` exists, treat as already pushed (disable/hide button + add to `pushedSet`) and no-op. This survives page reloads because the collision is self-evident in the data.
3. **Build the appended sosmed row** (one POST, keys = exact `sosmed` schema columns; empty strings for unset):

```ts
const kode = contentKode(planRowIndex);      // e.g. `CT-20260921-0042`
POST /api/tables/sosmed payload {
  "Kode Konten":    kode,                              // gen §below
  "Tanggal Deadline": plan["Deadline Produksi"],       // day-first passthrough
  "Tanggal Posting":  "",                              // set later during production
  "Output":           plan["Format"],
  "Konten Pillar":    plan["Content Pillar"],
  "Platform":         plan["Platform"],
  "PIC":              plan["PIC"],
  "Judul Konten":     plan["Judul / Ide Konten"],
  "Materi Konten":    plan["Brief"],                   // creative brief → materials
  "  CAPTION ":       "",
  "LINK COVER":       plan["Reference Link"],
  "PROSES":           "PENDING",                       // initial production state
  "LINK KONTEN JADI": "",
  "IG": false, "TIKTOK": false, "YT": false           // real booleans
}
```

   **Kode generator `contentKode(planRowIndex)`:** `CT-<YYYYMMDD from today>-<planRowIndex.toString().padStart(4,"0")>`. Deterministic per plan → re-push yields the same Kode → the §6.3.2 dedupe scan catches it (irreversible double-append impossible). Add to `sosmed.ts` (pure, takes a `Date` and `planRowIndex`).
4. **POST** via `postJson`. On success: `setPushedSet(prev => new Set(prev).add(planRowIndex))`, `onRefresh?.()` (both sources), toast `✅ Ditambahkan ke produksi: {judul}.`, **disable the button** for this plan for the session.
5. **Persist the lock** (durable across sessions): `PATCH /api/tables/content_plan` on the plan row — `{ rowIndex: planRowIndex, column: "Status Plan", value: "DIPRODUKSI" }` — so on a fresh reload the plan no longer reads `APPROVED` and the push button stays hidden. (Server resolves `column` by declared name; `rowIndex` = the plan row's numeric `__rowIndex`, never array position — reuse the existing edit contract.)
6. On failure: keep the plan unanswered, inline error `⚠️ Gagal menambahkan ke produksi.`, no duplicate.

**Resulting user-visible rule:** after a successful push the plan shows Status `DIPRODUKSI` (badge `bg-success/10 text-success`), the button disappears, and a re-push would collide on `Kode Konten` anyway. Two independent mechanisms guarantee no duplicate production rows.

---

## §7 Copy cleanup — Dutch/Italian leftovers → Indonesian (in `SosmedDashboard.tsx`)

Replace all strings below with the exact Indonesian (grep the file for each; also fix matching `ariaLabel`/`title` attributes):

| Current | Replacement |
|---|---|
| `en monitoring operasioneel.` (header subtitle) | `dan monitoring operasional.` |
| `Content production, workload, publishing, en monitoring operasioneel.` | `Produksi konten, workload per PIC, publishing, dan monitoring operasional.` |
| `Hoeveel konten staan er in elke fase.` | `Berapa konten di setiap fase.` |
| `Verdeling per Content Pillar, Format en Platform (op basis van actuele waarden).` | `Distribusi per Content Pillar, Format dan Platform (berdasarkan nilai aktual).` |
| `Edit cellen en klik 'Simpan Perubahan' om te bewaren.` | `Edit sel dan klik 'Simpan Perubahan' untuk menyimpan.` |
| `Overdue, due today, due deze week, en completed.` | `Overdue, jatuh tempo hari ini, minggu ini, dan selesai.` |
| `Funnel productie (PROSES-gestuurd)` (ChartContainer `label`) | `Funnel produksi (berdasarkan PROSES)` |
| `Monitoring en capaciteit per PIC — geen ranking.` | `Monitoring dan kapasitas per PIC — bukan ranking.` |
| `Done (groen) vs Pending (geel), met overdue` (Workload `label`) | `Done (hijau) vs Pending (kuning) dengan overdue` |
| `Nog geen workload-data.` | `Belum ada data workload.` |
| `Operationele to-do's: … rev-productie…` (Action Required subtitle) | `Tugas operasional: overdue, menunggu review, dalam revisi, dan selesai-belum diposting.` |
| `Tidak ada (status niet aanwezig in data).` | `Tidak ada (status tidak tersedia di data).` |
| `Planned (grijs) vs Done (groen) per week` (Trend `label`) | `Planned (abu) vs Done (hijau) per minggu` |
| `Tidak ada data deadline voor een trend.` | `Belum ada data deadline untuk tren.` |
| `Completie %` (PicCapacityRows header) | `Completion %` |
| `Gepost` / `Belum gepost` (`title` attrs on ✅/◦) | `Sudah diposting` / `Belum diposting` |
| `• Finished, not published` (Action quad header) | `📤 Selesai, belum dipublikasi` |
| `• Overdue` / `• Waiting for Review` / `• In Revision` (quad headers) | `🚨 Overdue` / `👀 Menunggu Review` / `🔁 Dalam Revisi` |

**§3/§4/§5 have already been specified with Indonesian copy** (subtitle in §5.1 pin the "Menampilkan …" / button labels). Note the redesign also **renames** the section title per §5.1 and **adds** the subtitle in §4.2 Controls and §4.3 count line.

---

## §8 Responsiveness (Desktop / Laptop / Tablet)

- Page stays on the standard band (§0); the `main` never scrolls horizontally.
- **Only table/overflow containers scroll horizontally:** the Explorer table wrapper (`overflow-x-auto`, `min-w-[920px]` table), the PicCapacityRows table, Deadline/Strategy bars as present. Never the whole page body.
- Filter card grid already collapses `md:grid-cols-2 xl:grid-cols-7` → keep; add `grid-cols-2 xl:grid-cols-4` to the Explorer filter row; `sm:grid-cols-2` on the Planner form.
- Calendar grid is always 7 wide (it is a calendar); cells shrink via `min-h` + `truncate` card chips + `+N lagi` overflow chip (no horizontal scroll).
- Drawer `max-w-[440px]` full-height right rail; on very narrow screens it can go `w-full` (keep ≤ 440px on ≥`sm`).
- Modal `max-w-3xl` centers with `overflow-y-auto` on overlay for short screens.
- Fullscreen overlay is full-viewport by definition; its inner content uses `mx-auto max-w-[1500px]` so very wide screens don't stretch rows (and it scrolls vertically internally, never the page).

---

## §9 Acceptance checklist (maps every brief requirement → spec section)

Every row must be satisfiable by a **read** of the spec; REX ticks them off before handoff.

- [ ] **1. Page layout reorder into exactly 11 sections** → §2 (order table) — all eleven present in the pinned order.
- [ ] **2. `+ Content Plan` top-right button next to Refresh Data, opens large modal, no page nav** → §2.1 + §4.1.
- [ ] **3. Content Planning Calendar + List tabs (Kanban optional)** → §4.0 (§4 tabs; §4 Kanban explicitly skipped).
- [ ] **4. Calendar view; card shows title/format/platform/PIC/status; click → detail** → §4.2 (fields listed) + §5.8.
- [ ] **5. List view** → §4.3.
- [ ] **6. Master Content Data EXPLORER: pagination 10–15 rows, “Showing X–Y of Z” + [Prev][1]…[Next]** → §5.1/§5.3 (PAGE_SIZE=15, count line Indonesian, `paginationWindow`).
- [ ] **7. Search 🔎 across Kode/Judul/Pillar/Platform/Format/PIC, debounced, reactive** → §5.2 (`searchContents`, 200ms debounce).
- [ ] **8. Filter dropdowns Month/PIC/Status/Platform/Format/Content Pillar/Deadline + Reset Filter** → §5.4 (§5.4.1 deadline options).
- [ ] **9. Deadline filter options All/Overdue/Due Today/Due This Week/Future/Completed** → §5.4.1 (exact list + predicates) + `deadlineBucket`.
- [ ] **10. Column management ⚙ Columns; default CODE/TITLE/DEADLINE/PIC/FORMAT/STATUS/PLATFORM; extra Pillar/Process/IG/TikTok/YouTube/Reference/Notes** → §5.5 (catalog + defaults + guard).
- [ ] **11. Fullscreen expand ↗ Expand with search+filter+columns+pagination+horizontal scroll+sticky header+close** → §5.9 + §5.1 toolbar.
- [ ] **12. Row-detail drawer on click** → §5.8 (reached from Calendar/List/Explorer/Fullscreen).
- [ ] **13. KPI preservation: Total Planned/Done/In Progress/Overdue/Completion Rate/Video Selesai/Design Selesai/Hutang Post IG/TikTok/YT** → §3 (both rows preserved, react to §1 filter).
- [ ] **14. Existing editing + Save Changes keep working** → §5.10 (+§5.8.2 drawer save), same `diffPatches`/`patchJson` contract.
- [ ] **15. Responsive Desktop/Laptop/Tablet; only the table container scrolls horizontally, never whole page** → §8.
- [ ] **16. Content Planner form fields + buttons (Cancel / Save Content Plan)** → §4.1 (field table + footer buttons exact).
- [ ] **16b. Planner validation + write (POST append to `content_plan`) + success/failure UX** → §4.1 saveContentPlan + §1.1 schema.
- [ ] **17. Add-to-Production on APPROVED plans; what the button does + duplicate-prevention** → §6 (appearance §6.2, mapping §6.3, two dedupe mechanisms §6.3.2/.5).
- [ ] **18. Copy Indonesian; no Dutch/Italian leftovers** → §7 table + §5/§4/§3 pinned copy.
- [ ] **Extras:** `content_plan` schema + shell wiring → §1; pure derivations centralized/testable → §5.7; shared-component ban respected → §0; band/reuse rules → §0.

---

## §10 Out of scope / explicit non-goals

- No Kanban view (§4). No dark theme. No charting library (charts stay hand-rolled SVG). No per-user column persistence beyond component state. No changes to the shared components listed in §0. No modification of the existing `sosmed` schema or its PATCH contract. No new backend connection — `content_plan` appends to the same workbook via the generic declared-tab API.