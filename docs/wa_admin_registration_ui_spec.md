# WA Admin + Registration Command Center — UI Specification

**Workspace:** Digmark V3.1 · route `/wa-admin`
**Status:** Implementation-ready design spec (UI/UX only — no data logic, no server code)
**Designer:** NEO (UI/UX) · **Implementer:** REX (coding)
**Target viewport:** 1920×1080 desktop landscape (primary), responsive downward.

This document is a written design contract. A developer must be able to implement
the layout without further design decisions. All tokens, classes, labels, and
interactions are defined concretely below.

---

## 0. Scope & invariants

- This page becomes a **WhatsApp Admin + Registration Command Center**. The
  registration data is data-driven and wired by the developer; this spec fixes
  only **layout, placement, hierarchy, tokens, and interactions**.
- **Do NOT modify any shared component** — `MetricCard`, `MetricRow`,
  `DataTable`, `ChartContainer`, `Divider`, `Button`, `Select`, `SectionHeader`,
  `EmptyState`, `ErrorState`, `LoadingState`, `Topbar`, `WorkspaceNav`,
  `Footer`. All of them render on every workspace. They are **imported** and
  used as-is; composition happens **locally inside the dashboard file**
  (`src/workspaces/WaAdminDashboard.tsx` or a new local file in
  `src/workspaces/`).
- **Charts stay dependency-free, hand-rolled SVG** (no charting library).
- **No layout regression:** every existing section (metrik kunci, visualisasi,
  tabel operasional, detail status, ekspor) must remain reachable and
  functional; they move below the command-center bands and are tucked behind
  expand controls so the page stays short. Nothing is deleted.
- **Shared shell width must be widened** so the wide grid has room (see §1).

---

## 1. Shell widening

Two containers render today and both must widen together so they stay aligned:

| Container | Located in | Current | New (v1.1) |
|---|---|---|---|
| Outer shell | `WaAdminDashboard.tsx` → `<div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">` | `max-w-[1240px]` | **`max-w-[1720px]`**, horizontal padding `px-4 sm:px-6 lg:px-8` |
| Inner main | `WaAdminDashboard.tsx` → `<main className="mx-auto w-full max-w-[1220px]">` | `max-w-[1220px]` | **`max-w-[1700px]`** |
| Page shell (Topbar/WorkspaceNav/Footer) | `app/(workspaces)/wa-admin/page.tsx` → `mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6` | `max-w-[1220px]` | **`max-w-[1720px]`**, `px-4 sm:px-6 lg:px-8` |

- Useable column track at 1920×1080: ≈ **1720px − 64px padding ≈ 1656px**.
- **Responsiveness note:** the new width classes only apply as *maximums*; on
  screens narrower than 1720px the containers shrink naturally and the grid
  (below) reflows to stacked single/two-column via its responsive `lg:`/`xl:`
  prefixes. Keep `min-w-0` on every grid child so tables/charts can collapse
  instead of forcing page overflow.

---

## 2. Top-to-bottom band map (1920×1080)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [ Topbar ][ WorkspaceNav ]   (shell, unchanged)                       │
├──────────────────────────────────────────────────────────────────────┤
│ BAND 0  PAGE HEADER + YEAR FILTER + primary action  (full width)     │
├──────────────────────────────────────────────────────────────────────┤
│ BAND 1  KPI PENDAFTARAN  — 6 cards across                            │
├─────────────────────────────────────────────┬────────────────────────┤
│ BAND 2  FUNNEL PENDAFTARAN                  │ NEEDS ATTENTION        │
│          (h-[380px])                        │  (h-[380px])           │
├─────────────────────────────────────────────┼────────────────────────┤
│ BAND 3  SUMBER PENDAFTARAN                  │ PENDAFTAR TERBARU      │
│          (h-[400px])                        │  table + expand (h-[400px])│
├─────────────────────────────────────────────┴────────────────────────┤
│ BAND 4  ANALISIS WA ADMIN (folded section, expandable — no regression)│
│         Metrik Kunci · Visualisasi · Tabel Operasional ·            │
│         Detail Status · Ekspor                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Height budget (1080):** page header + filter ≈ 150px, KPI ≈ 110px, band 2
≈ 380px, band 3 ≈ 400px, container gaps ≈ 40px → the four command-center bands
plus header fit within the first scroll ≈ **first ~1100px**. Everything below
band 3 lives behind the folded "Analisis WA Admin" section, so the screen stays
clean and scrolling is minimal by default.

---

## 3. Band-by-band spec (identity + values are data-driven)

### Band 0 — Page header + Year Filter

Structure: flex-wrap, `gap-4`, `mb-6`, `pt-8`.

- **Left:** Overline `Workspace` (`text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand`),
  then H1 `WhatsApp Admin` (`text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink`),
  then one-line subtitle:
  `WhatsApp Admin + Registrasi Pendaftar — funnel, perlu perhatian, sumber, dan pendaftar terbaru.`
- **Right (action):** `Button variant="secondary"` → `🔄 Refresh Data` (wire
  directly to the existing `onRefresh`).

Immediately below, **Year Filter** bar — reuse the current filter-section
pattern (white rounded card):

```
<section className="mb-8 flex flex-wrap items-end gap-4 rounded-[18px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
```

- **`Select`** (from `@/components/ui/Field`) with **`label="Filter Tahun"`**.
- **Options** = `[{ value: "__all", label: "Semua Tahun" }, ...years]` where
  years are derived **from the `Timestamp` column** of the registration rows
  (distinct years, descending). **Default value = the latest year (2026).**
- `onSelect` sets the global year state; **every band below re-derives** from
  that year — KPI, funnel, needs-attention, source, and Pendaftar Terbaru.
- Helper text (right, `ml-auto`, `text-[0.82rem] text-muted`, `max-w-xs`):
  `Menampilkan data pendaftaran tahun {tahun}.` (or `Semua tahun` when `__all`).
- A matching registration↔WA-Admin indicator line is **not** needed here; it
  lives on rows (see §5).

### Band 1 — KPI Pendaftaran (6 cards)

`SectionHeader title="Overview Pendaftaran" subtitle="Total pendaftar dan progres tiap tahap pada tahun terpilih."`

**6 MetricCards** reused as-is, wrapped in a **local grid** (do NOT use
`MetricRow` — we must control exact column count):

```
<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
  <MetricCard icon="👥" label="Total Pendaftar" value={...} />
  <MetricCard icon="🎫" label="Interview"   value={...} />
  <MetricCard icon="✅" label="Diterima"    value={...} />
  <MetricCard icon="📘" label="Juknis"      value={...} />
  <MetricCard icon="💳" label="Pembayaran"  value={...} />
  <MetricCard icon="👥" label="Grup"        value={...} />
</div>
```

- 2 cols on small phones → 3 on `sm` → 6 across on `xl`+. Each card counts
  registrations that have reached that stage in the selected year.
- After this band, `<Divider />`.

### Band 2 — Funnel (wide) + Needs Attention (narrow)

```
<SectionHeader title="Ringkasan Pendaftaran" subtitle="Alur pendaftaran dan hal yang perlu tindakan admin." />

<div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
  <FunnelPanel    />   {/* col 1 */}
  <NeedsAttention />   {/* col 2 */}
</div>
```

#### 2a — Funnel (`ChartContainer` reused, `heightClass="h-[380px]"`)
- `label="Funnel Pendaftaran"`.
- Render a **horizontal 6-stage funnel** (dependency-free, local SVG or styled
  divs): stages in order
  **Pendaftar → Interview → Diterima → Juknis → Pembayaran → Grup**.
- Each stage row: stage label (left, `text-ink` semibold) + a bar whose width is
  `count / max(stage counts)`, filled with `PALETTE.brand`, plus the absolute
  count and a step-to-step **conversion %** (`PALETTE.muted`, e.g.
  `${(next/cur*100).toFixed(1)}%`). Bars form a descending funnel.
- Reuse the existing `DistBars`-style pattern if lanes are single count; the
  developer may implement the steps as a local list. `EmptyState` when no rows.

#### 2b — Needs Attention (compact panel, fixed height, internal scroll)
`ChartContainer`-style card, `heightClass="h-[380px]"`, local content:
- **Header row** (in card): title `Perlu Perhatian` + total count pill
  (`rounded-full ... text-white`, background `PALETTE.danger`) = number of
  pendaftar needing action.
- **Compact list** (max 5 categories, `divide-y divide-divider`, internal
  `overflow-y-auto`), each category row:
  `color-dot + label + count badge`, and a **chevron `▸/▾`** toggle:

| # | Category (Indonesian) | Dot | Empty hint |
|---|---|---|---|
| 1 | Belum Dijadwalkan Interview | `PALETTE.warning` | — |
| 2 | Interview Belum Diisi Hasil | `PALETTE.warning` | — |
| 3 | Diterima, Juknis Belum Dikirim | `PALETTE.brand` | — |
| 4 | Juknis Dikirim, Belum Pembayaran | `PALETTE.brand` | — |
| 5 | Sudah Pembayaran, Belum Invite Grup | `PALETTE.success` | — |

- **Interaction:** clicking a category **expands inline** (accordion, one open at
  a time, default all collapsed) to a short scrollable list of matching
  pendaftar: `Nama` + `WhatsApp`, each a row; tapping a row opens the same detail
  panel as Band 3 (§5). Empty category shows `Belum ada pendaftar di kategori ini.`
- `EmptyState title="Tidak ada pendaftar yang perlu perhatian."` when the whole
  list is empty.

### Band 3 — Source (narrow) + Pendaftar Terbaru (wide, expandable)

```
<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
  <SourcePanel  />   {/* col 1 */}
  <RecentTable  />   {/* col 2 */}
</div>
```

#### 3a — Sumber Pendaftaran (`ChartContainer`, `heightClass="h-[400px]"`)
- `label="Sumber Pendaftaran"` subtitle `Mengetahui Duta Persada dari …`.
- **Column set:** for each source show three readable numbers —
  `Pendaftar` / `Diterima` / `Pembayaran` — as a 3-column mini table or a
  grouped `DistBars`-style row per source (source name + three inline figures).
  Recommend a compact local list; last column sums to the stage totals.
- `EmptyState` when none.

#### 3b — Pendaftar Terbaru (compact table + per-row expand)
- Card header: `SectionHeader`-style title **`Pendaftar Terbaru`** + count pill +
  helper `Data detail tersedia dengan klik pada baris.` Keep the card at
  `h-[400px]` with an internal `overflow-y-auto`; do **not** grow the page.
- **Summary columns (default, all shown):**
  `Nama` · `WhatsApp` · `Source` · `Interview` · `Hasil` · `Pembayaran` +
  a trailing chevron `▾` affordance. The summary is a **local component** — do
  **not** use `DataTable` for this (rows are expandable; `DataTable` is
  rendering-only). Style it to look like the existing tables (same borders,
  `text-[0.84rem]`, header `text-muted` uppercase).
- **Interaction:** clicking a row (or its chevron) **expands the row inline**
  (accordion, **default collapsed**, one row open at a time). The row expands to
  a detail panel revealing **6 groups**, each rendered as a 2–3 column
  definition grid (`grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5`): label
  `text-[0.72rem] uppercase text-muted`, value `text-[0.84rem] font-semibold text-ink`.

  | Group | Contains (example fields) |
  |---|---|
  | **Data Pribadi** | Nama lengkap, NIK, TTL, jenis kelamin, agama, alamat, kewarganegaraan |
  | **Sekolah** | Nama sekolah, jurusan, angkatan, jenis sekolah |
  | **Kontak** | WhatsApp, email, kontak lain |
  | **Orang Tua** | Nama ayah/ibu, kontak, pekerjaan |
  | **Verifikasi / Dokumen** | dokumen, kelengkapan verifikasi, status dokumen |
  | **Status Proses** | Interview, Hasil, Juknis, Pembayaran, Grup (per-stage) |

  *(Field names are examples; the developer maps the actual columns. NEVER render
  all 35+ columns — only these grouped, labelled fields.)*
- Row matches a WA Admin record (see §5) → render a small inline status chip
  inside the detail panel: `✓ Terdaftar di WhatsApp Admin` using `PALETTE.success`.
- `EmptyState`/`LoadingState` as with other bands.

### Band 4 — Analisis WhatsApp Admin (folded, no regression)

Wrap the **existing** wa-admin content so nothing is lost but the page stays short.

```
<Divider />
<section className="mb-8 rounded-[18px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
  <button class="...flex justify-between...">
    <span class="...font-extrabold text-ink">📊 Analisis WhatsApp Admin</span>
    <span class="text-muted">▾ / ▸</span>
  </button>

  {open && (
    <div className="mt-4 space-y-8">
      {/* 1. Metrik Kunci  — existing MetricRow (4 cards) unchanged */}
      {/* 2. Visualisasi    — existing ChartContainer grid + treemap, unchanged */}
      {/* 3. Tabel Operasional — existing OperationalTable grid (CLOSING / SALES
           PROGRESS / PENDING FORM - L1 / FUTURE PROSPECT), unchanged */}
      {/* 4. Detail Status  — existing Select + DataTable + Expand, unchanged */}
      {/* 5. Ekspor         — existing CSV + PDF Quick Report buttons + preview, unchanged */}
    </div>
  )}
</section>
```

- Default state: **collapsed**. First open expands to the full existing content.
- A count badge may be shown (e.g. total WA leads) but is optional.
- All existing filters/states inside (Sel Bulan, Sel Status, expand toggles,
  CSV/PDF) continue to work exactly as today — do not alter their logic.

---

## 4. Component reuse summary

| Need | Reuse as-is | Compose locally (in dashboard file) |
|---|---|---|
| KPI cards | `MetricCard` | local `grid grid-cols-2 ... xl:grid-cols-6` wrapper |
| Year filter | `Select` | filter `<section>` bar |
| Band titles | `SectionHeader` | — |
| Funnel / Source cards | `ChartContainer` | local SVG funnel + local source rows |
| Needs Attention | — | local compact list + accordion |
| Pendaftar Terbaru | — | local expandable row table (NOT `DataTable`) |
| Detail Status / Operational full tables | `DataTable` | — |
| Section dividers / buttons | `Divider`, `Button` | — |
| Empty / loading / error | `EmptyState`, `LoadingState`, `ErrorState` | — |

**Golden rule:** any new presentational block that needs per-row state or custom
markup (funnel, needs-attention, expandable rows, source breakdown) is **a local
function inside the dashboard file**, styled only with Tailwind utilities and
tokens from `@/components/ui-common` (`PALETTE`, `RADII`, `SHADOWS`,
`formatCount`, `formatPercent`). Do not extend shared components.

---

## 5. Registration ↔ WA Admin matching indicator

When a registration row **matches a WA Admin record**, priority order for the
match key: **`Whatsapp` → `Handphone` → `Email` → `Nama`** (first non-empty
field that hits). On the matched surface, render a compact read-only status
chip so the operator can see the registration stage at a glance:

- On a Pendaftar Terbaru detail panel (→ §3b) and inside the WA Admin contact
  listing detail, render: `✓` + stage label, background
  `rgba(34,160,107,0.12)` (`PALETTE.success` at ~12%), text `PALETTE.success`,
  `rounded-full px-2.5 py-0.5 text-[0.78rem] font-bold`.
- Example labels: `✓ Terdaftar: Diterima`, `✓ Terdaftar: Sudah Pembayaran`,
  `✓ Terdaftar: Juknis`.

This is a **visual status chip only** — no writes, no cross-table updates.

---

## 6. Visual consistency rules

- **Palette:** brand blue `PALETTE.brand` `#0058A3`, yellow accent
  `PALETTE.accent` (decorative only), `PALETTE.ink` text, `PALETTE.muted`
  secondary, `PALETTE.success` progress/positive, `PALETTE.warning` needs-action,
  `PALETTE.danger` total-needs-attention, `PALETTE.pink` categorical. Never hard-code
  hex except through `PALETTE`.
- **Cards:** `rounded-[20px] border border-border bg-surface p-4 shadow-[var(--dm-shadow)]`
  matched exactly to existing dashboard cards; inner filter bar uses
  `shadow-[var(--dm-shadow-xs)]`. Dividers on white panels: `border-divider`.
- **Spacing rhythm:** vertical gaps between element clusters = `gap-6` to `gap-8`
  (parity with existing `/website` rhythm); within grids `gap-4` (cards) /
  `gap-1.5` (lists). Section spacing after a band: `mb-8`.
- **Type:** H1 `text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink`;
  section titles `text-[1.02rem] font-extrabold tracking-[-0.01em] text-ink`;
  overlines/labels `text-[0.78–0.82rem] font-bold uppercase tracking-[0.04em] text-muted`
  (or `text-brand` for overline `Workspace`); body/labels `text-[0.84rem]`.
- **Icons:** emoji on metric cards and band icons, matching current usage.
- **Numbers:** use `formatCount()` / `formatPercent()` from `ui-common`
  (id-ID grouping `1.234`, `37,5 %`).
- **All copy is Indonesian** (labels/headers/empty/errors/hints) exactly as
  listed in §3. Button/action verbs keep current style (`Unduh Data (CSV)`,
  `Export as PDF (Quick Report)`, `Refresh Data`).
- **Empty, loading, error** map 1:1 to `EmptyState`, `LoadingState`,
  `ErrorState` so the page degrades gracefully with no layout shift.

---

## 7. Acceptance checklist (for REX)

- [ ] 1920×1080 shows header + year filter + KPI + band 2 + band 3 with minimal
      scrolling; band 4 collapsed by default.
- [ ] Shell widened to 1720/1700px in BOTH dashboard and page shell; full
      existing content still renders.
- [ ] 6 KPI cards respect year filter; 6-count funnel correct order.
- [ ] Needs-attention 5 categories, compact, accordion expand.
- [ ] Source breakdown shows Pendaftar / Diterima / Pembayaran per source.
- [ ] Pendaftar Terbaru summary = 6 columns; row expand reveals 6 detail groups;
      default collapsed; one open at a time.
- [ ] Registration↔WA-Admin match shows status chip (Whatsapp→Handphone→Email→Nama).
- [ ] Existing Metrik Kunci / Visualisasi / Tabel Operasional / Detail Status /
      Ekspor present and functional inside folded band.
- [ ] All copy Indonesian; tokens from `ui-common`; no shared component edited.