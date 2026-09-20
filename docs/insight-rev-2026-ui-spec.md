# /insight UI/UX Revision Spec — Visual Parity with /wa-admin (More Compact)

**Author:** NEO (Senior UI/UX Designer) · **Owner:** EVA · **Implementer:** REX
**Status:** Ready for implementation · **Scope:** DESIGN ONLY (UI/UX spec; no logic/data changes, no new dependencies)
**Date:** 2026-09-17 · **UI copy language:** Indonesian

---

## 0. Scope & ground rules

### 0.1 What this spec covers
Make the **/insight** workspace visually consistent with **/wa-admin** (the *reference* visual system) at the level of: **global navigation**, **shell/container**, **page header**, **hierarchy**, **spacing**, and **compactness**. All metrics/data/logic stay identical — this is a presentational parity pass plus a "more compact" restructuring of the long, fully-expanded page.

### 0.2 Reference system (taken verbatim from `WaAdminDashboard.tsx` + `app/(workspaces)/wa-admin/page.tsx`)
- Outer shell: `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` wrapping `<main className="mx-auto w-full max-w-[1220px]">` (band ≈ 1220–1240px, single narrow).
- Ready-state nav wrapper (page.tsx): `<div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6"><WorkspaceNav activeUrl="wa-admin" /></div>`.
- Page header block (dashboard.tsx, data-present state): header with eyebrow + h1 + subtitle, Refresh Data **top-right**.
- Filter card: `rounded-[18px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]`.
- Section rhythm: `<SectionHeader>` (yellow accent bar) + `<MetricRow>`/`<MetricCard>` + `<ChartContainer>` + `<Divider>` (`my-8`).

### 0.3 Constraints (MANDATORY — business brief)
- **Do not touch** any `/wa-admin` files.
- **Do not** change source data, mock data, or add dependencies.
- **Do not edit any shared component**: `MetricRow`, `MetricCard`, `DataTable`, `ChartContainer`, `Divider`, `Topbar`, `Button`, `WorkspaceNav`, `SectionHeader`, `Field` components, `EmptyState`, `ModuleHero`. Reuse as-is. All refinements via **wrapper divs**, Tailwind utilities, or **new private local components inside `InsightDashboard.tsx`**.
- **REX may only edit** (inform the spec): `app/(workspaces)/insight/page.tsx`, `src/workspaces/InsightDashboard.tsx`, `src/workspaces/insight.ts`, `src/workspaces/insight.test.tsx`.
- No over-engineering. Stick to the mandatory list. Charts remain hand-rolled dependency-free SVG.
- No git baseline — never rely on `git diff`.

### 0.4 Design tokens (single source: `src/components/ui-common.ts`)
| Token | Hex | Use |
|---|---|---|
| `brand` | `#0058A3` | primary, navy-blue |
| `accent` | `#FFDB00` | section accent bar |
| `accentDeep` | `#f4c400` | Reach line / secondary chart |
| `ink` | `#102A43` | headings / body text |
| `muted` | `#5B6B7E` | secondary text |
| `grid` | `#E6EBF2` | chart gridlines |
| `success` | `#22A06B` | positive delta |
| `warning` | `#E8930C` | data-quality, warning |
| `danger` | `#D64550` | negative delta |
| `pink` | `#D95FA8` | spare |
| `border` | `rgba(255,255,255,0.9)` | card borders |
| `divider` | `rgba(0,88,163,0.12)` | hr rules |

Formatters: `formatCount` (id-ID grouping), `formatPercent(pct, hasBase)` (returns `—` when no base).

---

## 1. Audit findings (concrete /insight vs /wa-admin diffs)

| # | Area | Current /insight | /wa-admin reference | Severity |
|---|---|---|---|---|
| A1 | Global nav | `WorkspaceNav` rendered **bare** (full-bleed, un-aligned) in ready branch | Wrapped + capped in `mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6` | **High** |
| A2 | Shell | **Double-narrowed**: outer `max-w-[1220px]` + inner `max-w-[1180px]` → wastes ~40px | Single band: outer `max-w-[1240px]` wrapper → `main max-w-[1220px]` | **High** |
| A3 | Page header | Uses `<ModuleHero>` even with data present; no Refresh at top-right | Eyebrow + h1 + subtitle + Refresh **top-right**; `ModuleHero` only for empty | **High** |
| A4 | Filters | Bare grid, not in a card | `rounded-[18px] ... bg-surface p-4 shadow-[var(--dm-shadow-xs)]` card | Med |
| A5 | Data Quality | Tall expanded `<ul>` of **all** messages, always open | (n/a — must be compact + collapsed) | Med |
| A6 | Ringkasan Periode | **3 full tables** expanded side-by-side | Must be collapsible, collapsed by default | **High** |
| A7 | Detail Data | Full raw table always expanded | Must be collapsible, collapsed by default | **High** |
| A8 | Trend chart | Small (`h-[300px]`), labels `DD/MM` non-Indonesian, no legend, tooltips only implicit | (n/a) — enlarge, add legend + `<title>` tooltip + Indonesian `01 Jan` labels | Med |
| A9 | Platform Comparison | Colors inconsistent / not applied; N/A not visually distinctive | Consistent platform brand colors + clear N/A | Med |
| A10 | Funnel | Stages only; **no conversion % between stages** | Must show conversion rate between stages | Med |
| A11 | Performance Summary | **Missing** | Must add, from real derived data | High |
| A12 | KPI labels | Long labels ("Total Interaksi Konten", "Klik Link") | Short labels: Views, Reach, Interaksi, Profile Visit, Link Click, Net Follower | Med |
| A13 | Compactness | Lots of expanded tables → very long page | Collapsibles + parity rhythm → much shorter | **High** |

---

## 2. Global navigation spec (#1 fix)

**Ready branch** of `app/(workspaces)/insight/page.tsx` — wrap the nav exactly like wa-admin:

```tsx
<Topbar />
<div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">
  <WorkspaceNav activeUrl="insight" />
</div>
<InsightDashboard rows={rows} onRefresh={table.refetch} />
<Footer />
```

Canonical **nav wrapper string** (copy verbatim):
```
mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6
```
This caps the nav at 1220px, aligns it with the content band, and adds the `pt-5` top breathing room so it sits below the Topbar without crowding.

The **error / loading branches** keep their current wrapper (`mx-auto max-w-[1220px] px-4`) and keep the inner `main max-w-[1180px]` **only for those transient states** — they never render the Extended dashboard. (Optional: normalize them to the same single band for consistency; not blocking.)

---

## 3. Shell + container spec (kill double-narrowing)

Replace the current nested shell in `InsightDashboard.tsx`:

**Current (WRONG):**
```tsx
<div className="mx-auto w-full min-w-0 max-w-[1220px] px-4">
  <main className="mx-auto max-w-[1180px]">
```

**Target (PARITY, copy verbatim from WaAdminDashboard):**
```tsx
<div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6">
  <main className="mx-auto w-full max-w-[1220px]">
```

- **Container string** (outer): `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6`
- **Main band string** (inner): `mx-auto w-full max-w-[1220px]`
- Result: a single ~1220px content band, nav and body perfectly aligned, ~40px of reclaimed width vs current.
- Add `sm:px-6` (was bare `px-4`) for parity side padding.

### Whitespace reduction rules (compactness)
- Keep the **wa-admin rhythm verbatim** — it reads compact already and is the reference: `<SectionHeader>` (`my-6`) per section, `<Divider>` (`my-8`) *between* sections, `gap-6` inside `MetricRow`. Do **not** inflate with extra `my-*` wrappers.
- **The main compactness lever is collapsing the three period tables + the detail table** (spec §7). This removes ~90% of vertical bulk without touching the light section rhythm.
- Remove the `mt-2 ... text-[0.8rem]` footnote block that only repeats what the filter caption already implies — fold any *remaining* essential note into the filter card caption (`text-[0.82rem] leading-snug text-muted`), matching wa-admin's filter-card hint style.

---

## 4. Page header spec

Replace `<ModuleHero>` with the parity page header **when data/model is present**. `ModuleHero` stays **only** for the `empty` (rows.length === 0) branch.

**Data-present header** (copy the wa-admin structure; change the title/copy):
```tsx
<header className="mb-6 flex flex-wrap items-center justify-between gap-4 pt-8">
  <div className="min-w-0">
    <p className="text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand">Workspace</p>
    <h1 className="mt-1 text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink">
      Insight Sosial Media
    </h1>
    <p className="mt-1 text-[0.92rem] text-muted">
      KPIs, funnel, tren waktu, dan perbandingan platform dari Master Data INSIGHT.
    </p>
  </div>
  <Button variant="secondary" onClick={onRefresh} className="shrink-0">
    🔄 Refresh Data
  </Button>
</header>
```
- **Eyebrow:** `text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand`
- **h1:** `text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink`
- **Subtitle:** `text-[0.92rem] text-muted`
- **Refresh Data** button: `variant="secondary"`, `shrink-0`, top-right above the header.

Remove the now-redundant bottom-of-page `🔄 Refresh Data` buttons (they duplicate the top-right action). Keep a bottom Refresh **only** if the reviewer wants it — recommended: drop for compactness and single-action clarity.

**Empty branch** (`rows.length === 0`): keep `<ModuleHero icon="📈" title="Social Media Insight" desc="…" />` + `<EmptyState …/>` + a `Divider` + one right-aligned `🔄 Refresh Data` — unchanged except it no longer also renders when data is present.

---

## 5. Filter + data-quality spec

### 5.1 Filter controls (wrap in the wa-admin filter card)
Wrap the 3 controls (Tanggal Awal, Tanggal Akhir, Platform) in the reference **filter card** treatment:
```tsx
<section className="mb-8 flex flex-wrap items-end gap-4 rounded-[18px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]">
  <div className="min-w-52">
    {/* Tanggal Awal date input (keep current styling) */}
  </div>
  <div className="min-w-52">
    {/* Tanggal Akhir date input (keep current styling) */}
  </div>
  <Select label="Platform" ... />
</section>
```
- Card token: `rounded-[18px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]`.
- `flex-wrap items-end gap-4` so inputs align on one row, wrap cleanly on mobile.
- Keep existing date-input classes unchanged: `w-full h-10 px-3 rounded-[12px] bg-surface-input border border-border text-ink focus:border-brand focus:ring-2 focus:ring-brand focus:ring-offset-2`, labels `text-[0.82rem] font-semibold text-muted`.
- Remove the old `<SectionHeader title="Filter" …/>` — the card **is** the filter affordance (parity). A one-line caption (`text-[0.82rem] leading-snug text-muted`, placed `ml-auto` in the card) can carry the previous-vs-current period hint instead of the standalone footnote.

### 5.2 Data Quality Issues — compact + collapsed by default
Replace the tall expanded `<ul>` with a **slim warning strip + expandable list** (local private component):

```tsx
<DataQualityStrip count={model.quality.count} issues={model.quality.issues} />
```

Behavior/visual (private component inside `InsightDashboard.tsx`):
- Collapsed default: a single row `role="alert"`, `mt-5 rounded-[12px] border border-warning/30 bg-warning/10 px-3 py-2 text-[0.84rem] text-ink`, reading `⚠ Data Quality Issues: {count}` + a `▾`/`▸` toggle affordance on the right (button, `aria-expanded`).
- Expanded: reveals an `mt-2 space-y-1` list of the issue messages, `text-[0.84rem] text-muted`, each with a small `•` marker — compact list, no `list-disc pl-5` bulk.
- Only render at all when `model.quality.count > 0` (unchanged logic).
- Toggle is pure `useState<boolean>`.

---

## 6. Layout, hierarchy & spacing per section (data-present order)

Top-down order (matches current priority + adds Performance Summary):
1. **Metrik Kunci** (KPI row — 6 cards)
2. **Performance Summary** (NEW)
3. **Sosial Media Funnel**
4. **Perbandingan Platform**
5. **Tren Performa**
6. **Ringkasan Periode** (collapsible, collapsed)
7. **Detail Data** (collapsible, collapsed)

Spacing: `<SectionHeader>` for each, `<Divider/>` between sections, `gap-6`/`gap-8` inside card clusters.

### 6.1 KPI row — 6 balanced cards, short labels
- Reuse `<MetricRow>` + `<MetricCard>` unchanged.
- Update `KPI_ITEMS` labels to the **short** set:
  - 👁️ **Views** — VIEW
  - 📶 **Reach** — REACH
  - 💬 **Interaksi** — CONTENT INTERACTION
  - 👤 **Profile Visit** — PROFILE VISIT
  - 🔗 **Link Click** — LINK CLICKS
  - 👥 **Net Follower** — FOLLOWER
- `MetricRow` is `auto-fit minmax(220px,1fr)` gap-6 → 6 cards give ~4-up on lg, 2-up md, 1-up mobile. Balanced, no manual grid.
- Remove the standalone `mt-2` period-comparison footnote (handled by filter caption + delta labels).

### 6.2 Performance Summary (NEW — from real derived data)
New section sourced **entirely from `model.metrics`** (type `InsightDerived`) — no invented figures:
```tsx
<SectionHeader title="Ringkasan Performa" subtitle="Rasio turunan dari total metrik pada periode aktif." />
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {PERF_ITEMS.map(...)}   {/* 4 derived-rate tiles */}
</div>
```
4 tiles (label + value using **formatPercent(value, hasBase)** so a null base shows `—`, never a fake %):
| Label | Value source | HasBase |
|---|---|---|
| Engagement Rate | `model.metrics.engagement` (Interaksi → Reach) | `model.metrics.reach > 0` |
| Profile Visit Rate | `model.metrics.profileVisitRate` | `reach > 0` |
| Link CTR (Click-to-Reach) | `model.metrics.linkCtr` | `reach > 0` |
| Profile → Click | `model.metrics.profileToClick` | `model.metrics.profileVisit > 0` |

Tile style (local, mirrors the compact metric tile in wa-admin's QuickReport):
```tsx
<div className="rounded-[16px] border border-border bg-white/70 p-4">
  <div className="text-[0.74rem] font-bold uppercase tracking-[0.04em] text-muted">{label}</div>
  <div className="mt-1 text-[1.35rem] font-extrabold text-ink">{value}</div>
</div>
```
Add one `text-[0.74rem] leading-snug text-muted` caption noting "Denominator nol → ditampilkan —". Place BEFORE the funnel so decision-makers see rates first.

### 6.3 Funnel — add conversion % between stages
`FunnelChart` is a **local private component** (already inside InsightDashboard.tsx) — REX edits it freely (no shared-component rule). Add conversion-rate labels between stages:
- For each adjacent pair `(prev, cur)`: `conversion = prev.value > 0 ? (cur.value / prev.value) * 100 : null`.
- Render a centered `↳` / `↓` caret between the two bars with `formatPercent(conversion, prev.value > 0)` right beside it, `fontSize=12, fontWeight=700, fill=muted` (`"N/A"` / `"—"` when null base — consistent with the rest of the app's "never fake a %" rule).
- Increase row pitch if needed (`H = stages.length * 56 + 12`) to fit the inter-stage labels without crowding.
- Keep existing 4 colors `[brand, #3E7CB1, accentDeep, warning]` for bar fills; conversion labels align to a left gutter.
- Container: reuse `<ChartContainer data={model.funnelStages} heightClass="h-[200px]" label="Funnel dari data INSIGHT (tanpa CRM/Lead)">`.

### 6.4 Platform Comparison — consistent colors + correct N/A
- Keep the table structure and N/A correctness (`rateStr` → `"N/A"` on null denominator — leave as-is, it is already correct).
- Apply **platform identity colors**:
  - Header cells + the platform column labels: tint each platform.
  - **Instagram** token: `#E1306C` (brand).
  - **TikTok** token: `#010101` (brand near-black).
- Color application (visual only):
  - `<th>` platform headers: render the platform name with a small color-dot swatch (`inline-block h-2 w-2 rounded-full`, `backgroundColor: <token>`) + `text-ink` bold, OR a 4px left border-tint on the header cell. Keep at least an AA-friendly `brand`/`ink` text color — the dot carries the hue.
  - Any bar/legend in this section uses the same two tokens.
- Derived-rate rows (`Engagement Rate`, `Profile Visit Rate`, `Link CTR`, `Profile → Click`): `rateStr` already yields `"N/A"` when a platform has no reach/visits — do **not** invent a baseline. Optionally style `N/A` as `text-muted` (italic not required) to visually de-emphasize.
- Card token stays parity: `rounded-[16px] border border-border bg-surface p-2 backdrop-blur-[8px] shadow-[var(--dm-shadow)]` (keep; it already matches wa-admin chart card shell).

### 6.5 Trend — enlarge, legend, tooltips, Indonesian dates
- **Calculator-level prework** (REX in `insight.ts`, allowed): change `dayLabel` to Indonesian short format **`D MMM`** → `01 Jan`, `05 Jun`, `31 Des`. Keep the sortable `key` (`YYYY-MM-DD`) untouched. (This touches `dayLabel` only; labels/keys still aligned via `multiTrend`.)
- **Chart (`TrendChart`, local)**:
  - Enlarge: bump container `heightClass` (e.g. `h-72` = 288px, or `h-[320px]` for extra legibility) and widen `viewBox` spacing as needed.
  - **Legend row** (above the SVG, inside the card): one swatch + name per series, e.g. `● Views (brand #0058A3)`, `● Reach (accentDeep #f4c400)`; single-metric view shows one legend entry with its current color (`#0058A3`).
  - **Tooltips**: add a native `<title>` on each data `<circle>`/`<polyline>` point: `Views: {formatCount(v)}` / `Reach: {formatCount(v)}` (or the metric name) — dependency-free, matches wa-admin's `<title>` tooltip pattern.
  - X-axis labels use the new `D MMM` format automatically via `label`s.
  - Sample rule (keep current `every` spacing) to avoid clutter.
- Container: `<ChartContainer data={trendData.labels} heightClass="h-72" label={`Tren harian — ${trendTitle}`}>`.
- Keep the `Metrik Tren` `<Select>` above the chart (compact, `max-w-xs`).

### 6.6 Ringkasan Periode + Detail Data — collapsible, collapsed by default
Replace the always-expanded tables with a local **`<CollapsibleSection>`** private component that:
- Renders a slim header bar (button) with title + `▸`/`▾` caret + a trailing count for context.
- **Default collapsed** for both sections (Flip from "all expanded" → "all collapsed" is the core compactness change).
- Header bar style (local): `flex items-center justify-between w-full rounded-[14px] border border-border bg-surface px-4 py-3 text-left`, title `text-[0.92rem] font-extrabold text-ink`, caret `text-muted`, `aria-expanded` + `aria-controls`, `useState(false)`.
- Content reveals below the bar with `mt-3`, keeping the existing table styling.

Two instances:
1. **Ringkasan Periode** — one `CollapsibleSection` titled `Ringkasan Periode`, containing the daily/weekly/monthly groups as **three child collapsibles** (each a mini header: `▸ Ringkasan Per Hari` / `▸ Ringkasan Per Minggu` / `▸ Ringkasan Per Bulan`, also collapsed by default, revealing its table when opened). This collapses the three side-by-side tables into a tidy accordion.
   - Keep the existing table markup/scrolling (`overflow-x-auto`, `min-w-[300px]`) inside each.
2. **Detail Data** — one `CollapsibleSection` titled `▸ Detail Data INSIGHT` (subtitle carries row count), collapsed by default, revealing the raw table (`min-w-[760px]`, zebra rows) when opened.

Both keep their `<SectionHeader>`? Recommend: **replace** the SectionHeader for these two with the collapsible header itself (they ARE the header strip) — the collapsible bar replaces the heading, removing redundancy and bulk. (If the reviewer prefers keeping SectionHeader, nest the collapsible under it; default recommendation: collapsible-as-header.)

---

## 7. Responsive behavior (BREAKPOINTS: sm 640 / md 768 / lg 1024 / xl 1280)

| Element | < sm (mobile) | sm–md | lg+ |
|---|---|---|---|
| Nav wrapper | `px-4` — nav wraps full width, capped 1220px | `sm:px-6` | unchanged |
| Page header | stacks; Refresh full-width-ish (`shrink-0`, wraps under title) | flex-wrap; Refresh top-right | title left, Refresh right |
| Filter card | one column, `items-stretch`, each input full-width | `flex-wrap items-end gap-4` | 2 date inputs + platform on one row |
| KPI `MetricRow` | 1-up | 2-up (md) | ~4-up (lg) |
| Performance Summary | 1 col (`grid-cols-1`) | 2 col (`sm:grid-cols-2`) | 4 col (`lg:grid-cols-4`) |
| Funnel / Trend SVG | `viewBox` scales to width (`h-w-full`), no horizontal scroll | same | same |
| Platform Comp table | `overflow-x-auto min-w-[520px]` scrolls horizontally | same | fits |
| Period / Detail collapsibles | full-width accordion rows | same | same (compact by default) |
| Divider / SectionHeader rhythm | unchanged (my-8 / my-6) | unchanged | unchanged |

All collapsibles are safe on touch (whole bar is the tap target, `min-h` padding for ~44px hit area).

---

## 8. Component reuse map

### Shared components — REUSE AS-IS (no edits):
| Component | Where used | Props to pass |
|---|---|---|
| `WorkspaceNav` | page.tsx ready branch (wrapped, §2) | `activeUrl="insight"` |
| `Topbar` / `Footer` | page.tsx | unchanged |
| `Button` | page header Refresh (top-right) + empty-state Refresh | `variant="secondary"`, `onClick`, `shrink-0` |
| `Select` (Field) | Filter Platform + Metrik Tren | existing usage |
| `SectionHeader` | Metrik Kunci, Performance Summary, Funnel, Platform, Trend | `title` + `subtitle` |
| `MetricRow` + `MetricCard` | KPI row (6 cards) | label/value/delta/deltaLabel |
| `ChartContainer` | Funnel + Trend | `data`, `heightClass`, `label` |
| `Divider` | between every major section | — |
| `EmptyState` | empty + filtered-empty + ModuleHero branch | title/hint |
| `ModuleHero` | **only** `rows.length === 0` empty branch | icon/title/desc |
| Inputs (date) | Filter card — plain `<input type="date">`, keep current classes | — |

### Local private components — NEW, defined INSIDE `InsightDashboard.tsx`:
| Component | Purpose | Files touched |
|---|---|---|
| `DataQualityStrip` | compact warning strip + expandable issues list (§5.2) | InsightDashboard.tsx |
| `CollapsibleSection` | generic `▸/▾` accordion wrapper (used for Ringkasan + Detail + the 3 period subgroups) (§6.6) | InsightDashboard.tsx |
| `PerfTile` (inline) | Performance Summary rate tile (§6.2) | InsightDashboard.tsx |
| `FunnelChart` (edited) | already local — add inter-stage conversion labels (§6.3) | InsightDashboard.tsx |
| `TrendChart` (edited) | already local — legend prop + `<title>` tooltips; alias rendering for `D MMM` labels (§6.5) | InsightDashboard.tsx |

No shared file edited anywhere.

---

## 9. Numbered implementation checklist for REX (UI-only)

**File A — `app/(workspaces)/insight/page.tsx`**
1. Wrap the ready-branch `WorkspaceNav` in `<div className="mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6">` (nav parity; §2).
2. (Optional parity) Normalize the error/loading `main` to the single-band width; not blocking.

**File B — `src/workspaces/insight.ts`** (presentational label only — no logic change)
3. Change `dayLabel` to Indonesian short format `D MMM` (e.g. `01 Jan`) while keeping the sortable `key` unchanged (§6.5). Update `insight.test.tsx` expectations accordingly (File D).

**File C — `src/workspaces/InsightDashboard.tsx` (bulk of the work)**
4. Replace outer/inner shell double-narrowing with the parity single band: outer `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6`, main `mx-auto w-full max-w-[1220px]` (§3).
5. Replace the data-present `<ModuleHero>` with the parity page header (eyebrow + `text-[1.7rem]` h1 + subtitle + `🔄 Refresh Data` top-right). Keep `<ModuleHero>` **only** in the `rows.length === 0` empty branch (§4). Remove bottom-of-page duplicate Refresh buttons.
6. Wrap the 3 filters in the wa-admin filter card (`rounded-[18px] ... p-4 shadow-[var(--dm-shadow-xs)]`, `flex-wrap items-end gap-4`); drop the `Filter` SectionHeader; fold the period-comparison footnote into a card caption (§5.1).
7. Add `DataQualityStrip` — warning strip collapsed by default, `▸/▾` toggle reveals a compact `space-y-1` list (§5.2).
8. Shorten KPI labels to Views / Reach / Interaksi / Profile Visit / Link Click / Net Follower (§6.1). Remove the standalone period footnote.
9. Add **Performance Summary** section (before Funnel) with 4 derived-rate tiles using `formatPercent(value, hasBase)` from `model.metrics`; null base → `—`; caption on zero-denominator rule (§6.2).
10. Add inter-stage **conversion %** labels to local `FunnelChart`; null base → `N/A`; bump row pitch as needed (§6.3).
11. In Platform Comparison table, apply **Instagram `#E1306C`** and **TikTok `#010101`** identity hues (color-dot swatches in header/platform cells); keep `rateStr` `"N/A"` behavior; style `N/A` muted (§6.4).
12. Enlarge trend chart (`h-72`+); add a legend row (per-series swatch+name) above the SVG; add native `<title>` tooltips on data points cleaning `Views: …`/`Reach: …`; X labels now `D MMM` (§6.5).
13. Replace always-open Ringkasan Periode + Detail Data tables with `CollapsibleSection` accordions, **collapsed by default**: `▸ Ringkasan Per Hari/Minggu/Bulan` (3 child collapsibles) + `▸ Detail Data INSIGHT` (§6.6). Collapsible bar doubles as the section header.
14. Verify responsive behavior at 640/768/1024 (§7).

**File D — `src/workspaces/insight.test.tsx`**
15. Update any assertions on trend labels to the `D MMM` format (§6.5); symbols only — no data assertions change.

**Definition of done (REX):**
- No shared component edited; no `/wa-admin` file touched; no data/logic change; no new dependency.
- `/insight` nav + shell + header visually match `/wa-admin`; page body measurably shorter (all tables collapsed by default).
- Indonesian copy throughout (`01 Jan`, `Ringkasan »`, `N/A`/`—` never fake).

---

## 10. Key chosen tokens (quick reference)

| Item | Value |
|---|---|
| **Nav wrapper** | `mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6` |
| **Container (outer)** | `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` |
| **Main band (inner)** | `mx-auto w-full max-w-[1220px]` |
| **Filter card** | `rounded-[18px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)]` |
| **Platform: Instagram** | `#E1306C` |
| **Platform: TikTok** | `#010101` |
| **Trend series** | Views `#0058A3` (brand) · Reach `#f4c400` (accentDeep) |
| **Page header** | eyebrow `text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand` · h1 `text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em] text-ink` · subtitle `text-[0.92rem] text-muted` |
| **Trend X-label format** | `D MMM` Indonesian, e.g. `01 Jan`, `05 Jun` |