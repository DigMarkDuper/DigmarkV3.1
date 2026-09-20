# DIGMARK V3.1 — UI REDESIGN SPECIFICATION (Phase 1 · Audit + Spec)

**Status:** Code-grounded design spec for a Phase 3 build + Phase 4 rendered review.
**Author:** NEO (Lead Designer) · **Consumer:** REX (implementation) / EVA (synthesis).
**Direction:** **EVOLVE / REFINE** the existing design system — preserve the IKEA blue/yellow + frosted-glass brand, improve **consistency, hierarchy, spacing**. NOT a rebrand.
**Scope:** Phase 1 = **audit + specification only**. No `src/`/`app/` code was modified; no build was run. Every finding is grounded in the actual source read (file : line); claims that cannot be verified from code are marked **UNVERIFIED**.
**Hard constraints honored (no violations proposed):**
1. **Shared-component ban** — `MetricCard`, `MetricRow`, `DataTable`, `ChartContainer`, `Divider`, `Footer`, `Topbar`, `Button`, `WorkspaceNav`, `Field` render on ALL workspaces and must NOT be edited to force one page's polish. Refinements are expressed ONLY as wrapper divs, Tailwind utilities, page-shell edits (`<Key>Dashboard.tsx` / `page.tsx`), or **new optional backward-compatible props** with defaults.
2. **No charting library** — all chart specs extend the existing dependency-free hand-rolled SVG approach using `PALETTE.*` tokens.
3. **Never write the production MASTER spreadsheet** — this is a read-mostly analytics UI; no write-path changes.

---

## 1. Current design system

Source of truth (verified identical values in both files):
- `src/components/ui-common.ts` — JS mirror of the tokens.
- `app/globals.css` (`:root` vars + `@theme inline`) — CSS/Tailwind mirror.

### 1.1 Colour tokens — `PALETTE` (`ui-common.ts:12–29`) / refer to `app/globals.css:22–40` (`--dm-*`)

| Token | Value | Use |
|---|---|---|
| `brand` | `#0058A3` | primary CTA, links, gradients, section accent | 
| `brandHover` | `#0A6FBF` | hover/gradient end, interactive text |
| `accent` | `#FFDB00` | yellow kicker/stat/ball |
| `accentDeep` | `#f4c400` | DM ball radial mid-stop |
| `ink` | `#102A43` | all text/values/headings |
| `muted` | `#5B6B7E` | labels/captions/subtitles |
| `grid` | `#E6EBF2` | chart grid/track, table separators |
| `success` | `#22A06B` | positive delta, status dots |
| `warning` | `#E8930C` | warning states |
| `danger` | `#D64550` | destructive, negative delta |
| `pink` | `#D95FA8` | accent charts (wa-admin "Asal Prospek") |
| `surface` | `rgba(255,255,255,0.72)` | glass card fill |
| `surfaceStrong` | `rgba(255,255,255,0.85)` | hover fill/chips |
| `border` | `rgba(255,255,255,0.9)` | card borders |
| `divider` | `rgba(0,88,163,0.12)` | section/table rules |
| `inkOnBrand` | `#FFFFFF` | text on brand fill |

Tailwind expose (`globals.css:74–93`): `text-ink`, `text-muted`, `bg-surface`, `bg-surface-input`, `border-border`, `border-divider`, `text-success/warning/danger`, `text-accent`, `text-brand`/`brand-hover`, `focus-ring`. 16 CSS vars: `--dm-blue…--dm-ink-on-brand` (`globals.css:22–40`), including glass surfaces `--dm-surface(-input)/(-strong)/--dm-border`. Background = 3-layer fixed gradient (`globals.css:98–107`), light-first only, no dark theme (`globals.css:12–13`).

### 1.2 Radius scale — `RADII` (`ui-common.ts:32–40`) / `--dm-radius-*` (`globals.css:43–49`)

`sm 10px` · `sm6 12px` · `md 14px` · `md16 16px` · `lg 20px` · `panel 22px` · `pill 9999px`.
**Gap found:** `18px` is used in ~6 places via raw `rounded-[18px]` (`ChartContainer.tsx:23`, `QuickInsightStat.tsx:13`, `InsightDashboard.tsx:326`, `WaAdminDashboard.tsx:554,712,882,935,957`) but is **NOT a named RADII token**. Untokenized magic number (violates spec B.2 "no magic numbers in components").

### 1.3 Shadow scale — `SHADOWS` (`ui-common.ts:43–55`) / `--dm-shadow-*` (`globals.css:52–63`)

`xs 0 3px 10px rgba(0,88,163,.08)` · `xsB6 0 4px 12px .10` · `base 0 8px 22px .10` · `hover 0 18px 38px .20` · `lift 0 20px 45px .18` · `cta 0 6px 18px .25` · `ctaHover 0 10px 24px .32` · `panel 0 18px 40px .16` · `mono 0 8px 20px .30` · `arrow 0 2px 6px rgba(255,219,0,.35)` · `ball 0 10px 24px rgba(240,200,0,.40)`. Components reference via `shadow-[var(--dm-shadow)]` etc.

### 1.4 Typography — `TYPE_SCALE` (`ui-common.ts:58–67`)

`displayH1 clamp(2.1rem,4.6vw,3.4rem)/1.06` · `h1 clamp(1.7rem,3.4vw,2.5rem)/1.1` · `h2 1.9rem` · `h3 1.18rem` · `h4 1.08rem` · `body 15px`. Font = Manrope 400/600/700/800 via `next/font/google` (`--font-sans` in `globals.css:68`). Page-header (reference) H1 = `text-[1.7rem] font-extrabold leading-tight tracking-[-0.01em]` (`WebsiteDashboard.tsx:204`).

### 1.5 Spacing / shell

4px-based spacing (`gap-*`/`p-*`). **Two/three competing width bands across workspaces (P0):**
- **Reference band (website, sosmed, insight):** `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` wrapping `<main class="mx-auto w-full max-w-[1220px]">` — 1240 outer / 1220 inner (`WebsiteDashboard.tsx:198–199`, `SosmedDashboard.tsx:312–313`, `InsightDashboard.tsx:292–293`).
- **Legacy double-narrowed band (crm, dm, interview):** `max-w-[1220px] px-4` wrapping `<main class="mx-auto max-w-[1180px]">` — 1220 outer / 1180 inner, **no `sm:px-6`** (`CrmDashboard.tsx:211–212`, `DmDashboard.tsx:149–150`, `InterviewDashboard.tsx:115–116`).
- **Narrowest main (ads):** page shell `max-w-[1220px] px-4`, dashboard `<main class="mx-auto w-full min-w-0 max-w-[1180px]">` → content capped at 1180 (`AdsDashboard.tsx:390`).
- **Wide band (wa-admin):** `max-w-[1720px] px-4 sm:px-6 lg:px-8` wrapping `main max-w-[1700px]` (`WaAdminDashboard.tsx:859–860`) + nav in same `1720` band (`page.tsx:143`).

So the 8 workspaces span **three width bands** (1220 / 1240 / 1720) and the reference 1240 band is used on only **3 of 8** pages.

### 1.6 Reference page shell anatomy (the target pattern, from `/website`)

`WebsiteDashboard.tsx:201–214`:
1. Page header: eyebrow `text-[0.78rem] font-bold uppercase tracking-[0.14em] text-brand` → **Workspace**; H1 `1.7rem extrabold`; subtitle `text-[0.92rem] text-muted`.
2. Header-right **primary action**: `<Button variant="secondary">🔄 Refresh Data</Button>`.
3. Filter card: `rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]` (`WebsiteDashboard.tsx:140`, `SosmedDashboard.tsx:343`).
4. Table card chrome: `overflow-x-auto rounded-[16px] border border-border bg-surface p-2 backdrop-blur-[8px] shadow-[var(--dm-shadow)]` + sticky `bg-white/90 backdrop-blur-[8px]` header (`DataTable.tsx:89–93,109`).

### 1.7 Shared components (anatomy verified)

- **`Topbar.tsx`** sticky `z-40 backdrop-blur-md bg-white/70 border-b border-divider`; inner `max-w-[1220px] px-4`; brand dot 15px+9px + wordmark `1.12rem/800/tracking .05em`; Home pill right.
- **`MetricCard.tsx:25–49`** glass `rounded-[20px] bg-surface backdrop-blur-[10px] saturate-[140%] shadow-(--dm-shadow)`, hover `-translate-y-[2px]`, icon 34px, label `0.82rem/600 muted`, value `1.6rem/800 ink`, delta `text-success/danger`.
- **`MetricRow.tsx`** grid `repeat(auto-fit,minmax(220px,1fr)) gap-6`.
- **`DataTable.tsx:89–142`** wrapper `overflow-x-auto rounded-[16px] border bg-surface backdrop-blur-[8px] shadow--dm-shadow`; `accentColor?` additive prop for a 4px left border + tinted header (wa-admin uses this — good pattern). Empty row → EmptyState; error → ErrorState.
- **`ChartContainer.tsx:23`** frame `rounded-[18px] border bg-surface p-2 backdrop-blur-[8px] saturate-[140%] shadow-[0_6px_18px_rgba(0,88,163,0.08)]`, `heightClass` default `h-72`, empty → EmptyState. Accepts `children` (SVG already wired for all charts).
- **`ModuleHero.tsx:14–27`** kicker chip → 54px icon tile → H1 `clamp(1.7rem,3.4vw,2.5rem)` → desc.
- **`EmptyState.tsx:10–21`** `rounded-[16px] border-dashed border-divider bg-white/60 px-6 py-16`.
- **`SectionHeader.tsx:10–17`** `my-6`, H3 `1.18rem/800` + 4px `border-accent` left bar + optional sub.
- **`Button.tsx`** 4 variants; `className` prop appended (additive-friendly).
- **`Field.tsx`** `FIELD_BASE` radius 12 input/select/checkbox; no external `className` (do not edit — mirror locally in a page if needed).

---

## 2. Per-workspace audit

### 2.1 `/sosmed` — SosmedDashboard.tsx — **REFERENCE-ALIGNED**
Shell + page header + filter card + table chrome all match the reference (1240/1220 band). Uses the eyebrow+H1+Refresh header when data present (`:327–340`), ModuleHero only in the empty guard (`:317`). Strong.
- **Finding (info):** editor + cloud: good role gating. `WorkloadBars` height is content-driven (`chartH = rows*46+24`, `:181`) — no fixed-height dead space. `ProsesBadge`, bool `✅/◦` cells are polished.
- Minor: `Video Selesai` / `Design Selesai` labels use `metrics.videoLabel` (could render `—`). No top-level copy defects found.

### 2.2 `/website` — WebsiteDashboard.tsx — **REFERENCE (target to copy)**
The reference implementation. 1240/1220 shell, eyebrow header + top-right Refresh (`:201–214`), MonthFilter card `rounded-[16px]` (`:140`), `LivePendingDonut` (success/warn, fine — 2-category), `rounded-[18px]` NOT used here → fully token-consistent. Only the tab strip is hand-rolled but matches reference pill style.
- Donut center total is `total - 1` (`:108`) — display quirk: when total==1 shows "0". **P2**: verify intent; likely should show `total` exactly.

### 2.3 `/insight` — InsightDashboard.tsx — **REFERENCE-ALIGNED (feature-rich)**
1240/1220 shell (`:292–293`), eyebrow header + Refresh (`:310–323`), filter card `rounded-[18px]` (`:326`) — the ONE radius divergence from the `/website` reference `md16`. Availability rule ("0 ≠ unavailable" → `N/A`) correctly applied to KPIs/rates. Charts hand-rolled SVG: FunnelChart (`colors[]` = brand, `#3E7CB1`, accentDeep, warning — 4-step categorical, **sequential-ish blue pencil**), TrendChart multi-series. Platform comparison `PLATFORM_COLORS` = `#E1306C` / `#010101`, hardcoded outside PALETTE.
- **Findings:** filter card uses 18px (inconsistent with reference md16). Funnel color array is mix of brand/accent-deep/warning with an inline `#3E7CB1` — not multi-hue-distinct per semantic stage; recommend a named stage palette. `PLATFORM_COLORS` hardcoded — should be a token.

### 2.4 `/wa-admin` — WaAdminDashboard.tsx — **WIDE-BAND + FEATURE-RICH**
Uses the **1720/1700 wide band** (`:859–860`), eyebrow header + Refresh + add/edit controls top-right (`:863–880`), registration command-center bands (0–3) + folded legacy "Analisis WhatsApp Admin" band (§4). Filter cards use `rounded-[18px]` (`:882,935,957`) vs reference md16.
- **P0:** content band (1700) is ~480px wider than every other workspace's 1220 — a horizontal-scroll / alignment risk on narrow viewports and inconsistent nav/content beyond the brand band. Needs an owner decision: keep the deliberate wide grid (document it + harden overflow guards) or align to 1240.
- **P1:** `FunnelPanel` renders 6×40px fork bars ≈ 300px inside `ChartContainer heightClass="h-[380px]"` → **~80px dead space** at card bottom (computed from code `:520`, `:530`; **render-UNVERIFIED**). Reduce `heightClass` to `h-[320px]` or increase bar/gap height.
- **P1:** `TREEMAP_COLORS` (`:75–78`) is already a **multi-hue pastel palette** (blue/green/purple/orange/teal/pink/…10 hues) — the "Tag Asal" treemap is already category-distinct (previous refinement landed). **Recommendation:** promote this exact array into `PALETTE.category*` tokens instead of leaving it inline.
- **P1 copy:** English labels inside Indonesian UI — SectionHeader "Overview Pendaftaran" (`:899`); "Export as PDF (Quick Report)" (`:1088`); `⤡ Collapse` / `⤢ Expand` (`:1061`); "Data detail tersedia dengan klik pada baris." (`:717` → awk "tersedia dengan klik").
- Info: `DONUT_COLORS` (`:63`) is multi-hue for status donut — fine.

### 2.5 `/crm` — CrmDashboard.tsx — **LEGACY SHELL, NOT ALIGNED**
Legacy double-narrow shell `max-w-[1220px]`+`main max-w-[1180px]`, no `sm:px-6` (`:211–212`). `ModuleHero` always (`:213`), **Refresh only at bottom** (`:284,354`), no top-right page action. Empty guard renders sync/import then stops (V3 parity).
- **P0 copy (stale/foreign):** SectionHeader sub `"Tarik prospects en import data baru."` (`:220`) — the **`en` is an Italian/Spanish leftover** for "dan". Must be `"Tarik prospects dan import data baru."`
- Filter area is loose `grid gap-5 md:grid-cols-2` (not a unified filter card) → treats Sync/Import as two large `rounded-[20px]` cards + a bare filter grid. No unified filter card. **P1** for grouping filters into the reference filter-card treatment.
- `MultiSelect` radius `rounded-[12px]` (sosmed uses 10px) — minor variance within same control family.

### 2.6 `/dm` — DmDashboard.tsx — **LEGACY SHELL, NOT ALIGNED**
Legacy `max-w-[1220px]`+`main max-w-[1180px]`, no `sm:px-6` (`:149–150`). `ModuleHero` always (`:151`), Refresh bottom-only (`:280`), no top-right action. Donut `DONUT_COLORS = [brand, accent, success, warning, danger, "#7D8FA3"]` (`:43–45`) — multi-hue but `#7D8FA3` is hardcoded outside PALETTE.
- **P1 copy:** SectionHeader "Recent Update" (`:269`) English heading (sub "15 data terbaru."); "Visualisasi" (`:176`) English heading.
- Note: append form writes via POST only; validation good.

### 2.7 `/ads` — AdsDashboard.tsx — **NARROWEST MAIN, NOT ALIGNED**
Dashboard `<main max-w-[1180px]>` (`:390`), `ModuleHero` always (`:391`), Refresh bottom-only (`:421`), no top-right action. **Narrowest content of all 8 (1180).** Destructive `ClearControl` is **entirely English**.
- **P0 copy:** clear-confirm modal whole dialog English — "Clearing removes all rows from … This cannot be undone." (`:170–171`), `Type "…" to confirm` (`:176`), `Cancel` (`:184`), `I understand, clear` (`:187`); busy label `"Imported…"` (`:242`); `"All rows dari REPORT MEKARI."` (`:336`); fallback `"Operasi gagal. Check kembali file / sesi."` (`:78`).
- P1: tab bar active ring `ring-2 ring-brand/40` beats the reference active-tab style (border pill) — minor variance in `TabBar` (`:115`).

### 2.8 `/interview` — InterviewDashboard.tsx — **LEGACY SHELL, NOT ALIGNED**
Legacy `max-w-[1220px]`+`main max-w-[1180px]`, no `sm:px-6` (`:115–116`). `ModuleHero` always (even with data, `:117`), Refresh bottom-only (`:182`). Empty guard renders a zeroed KPI row (V3 parity).
- **P0 copy:** `MultiSelect` shows `"{N} selected"` and `"— All —"` in **English** (`:70`); empty-state hint `"Difilter masih menegatif — check PIC/follow-up/hasil."` (`:172`) — "menegatif" is a mis-formed/weak phrase; "check" is foreign.
- Filter block is a bare grid of 3 `MultiSelect`s (`:149`), not the reference filter-card treatment (no unified card).

### Cross-workspace summary (the headline findings)
1. **Three width bands**; only 3/8 pages on the reference 1240/1220 band.
2. **Nav misalignment:** `ads`, `crm`, `dm`, `interview` render `<WorkspaceNav>` **bare/full-bleed** in the ready branch (`AdsDashboard page.tsx:118`, `Crm:102`, `Dm:103`, `Interview:102`), while `website`/`sosmed`/`insight`/`wa-admin` wrap it in a capped container — the nav is off-band on 4 pages.
3. **Page-action placement:** 4 pages (`crm`, `dm`, `ads`, `interview`) put Refresh at the **bottom footer**; the 4 reference-aligned pages put it **top-right**. Inconsistent primary-action placement.
4. **Transient-state width jump:** on ALL pages the loading/error/empty branches render `max-w-[1220px]` + inner `main max-w-[1180px]` (`page.tsx`), i.e. ~1180 content, while the ready dashboard is 1220 (or 1700 wa-admin). The page visibly narrows every load/refresh. **P0.**
5. **Foreign/stale copy:** one Italian leftover (`en`), an English confirm dialog, several English button/label strings, and weak "Check kembali" hints scattered across 5 pages.

---

## 3. Design-token + system proposals (evolve, not rebrand)

All additive / backward-compatible; none edits a shared component's existing behaviour.

### 3.1 Colour-usage discipline — categorical charts need MULTI-HUE palettes (top priority)
Current gap: chart colors are hand-inlined per dashboard (wa-admin `DONUT_COLORS`, `TREEMAP_COLORS`; dm `DONUT_COLORS`; insight FunnelChart/`PLATFORM_COLORS`; website `LIVE/PENDING`), mostly single/sequential hues, and none are tokenized.
- **Add a `PALETTE.category*` multi-hue categorical family to `ui-common.ts`** (additive export; value: 8–10 distinct pastel hues at AA-on-ink contrast). Base it on the already-validated `wa-admin TREEMAP_COLORS` (`#BFD9F0, #B5DFC7, #CFC6F0, #F2CDA2, #A9D9E2, #EFC7DC, #C6D3DF, #E0C2A8, #D4BFD9, #B8D8C1`).
- **Propose (suggested tokens):** `PALETTE.catBlue #BFD9F0`, `catGreen #B5DFC7`, `catPurple #cfc6f0`, `catOrange #F2CDA2`, `catTeal #A9D9E2`, `catPink #EFC7DC`, `catSlate #C6D3DF`, `catSand #E0C2A8`, `catLavender #D4BFD9`, `catMint #B8D8C1`.
- **Rule:** a categorical chart (funnel stages, donut categories, treemap blocks, platform comparison) must cycle **distinct hues per category** — never a sequential single-hue ramp. Reserve the brand accent `#0058A3` for the largest/primary category when emphasis is wanted. Keep fills light enough that `PALETTE.ink` text holds AA contrast (already true for the pastels above).
- **Re-point all inline arrays** into these tokens (additive; safe for `#7D8FA3` grey → map to a neutral).

### 3.2 Radius tokenization
`18px` is untokenized (`ChartContainer`, `QuickInsightStat`, insight & wa-admin filter cards).
- **Add `PALETTE`/`RADII` `md18: "18px"`** (additive) and reference it for `ChartContainer` + the 18px filter cards — OR standardize the filter card to `md16` everywhere (simpler parity). Recommend: **one radius for filter cards = `md16`** to match the 3 reference pages; add `md18` only for `ChartContainer`/`QuickInsightStat` where 18px already exists. Decision must be single and consistent.

### 3.3 Elevation / shadow discipline
`SHADOWS` is coherent. No new shadows needed. Rule to state: filter cards use `xs`, content cards `base`, hover `hover`, modals/overlays `panel` — already true; keep it. Do not introduce the `mono/arrow/ball` specials outside their brand-decorative use.

### 3.4 Spacing / shell standardisation (P0)
- **One ready-shell band:** all 8 workspaces → `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` wrapping `main mx-auto w-full max-w-[1220px]` everywhere EXCEPT wa-admin where the 1720 wide band is a deliberate command-center choice — **flag to owner**: keep-and-document (harden `min-w-0`, `overflow` guards + nav container at 1720) OR align to 1240. Do not silently remove wa-admin's width.
- **Transient-state parity:** error/loading/empty branches must render the SAME band as the ready branch (no 1220→1180 shrink). Preserves `min-w-0` and `minmax(0,…)` overflow guards (never remove them — that reintroduces horizontal scroll on wide tables).
- **Nav container:** the ready-branch `<WorkspaceNav>` must always sit inside the same capped `max-w-[…] px-4 pt-5 sm:px-6` container (matches its content — the #1 misalignment).
- **Page action:** Refresh/primary action lives top-right of the page H1 on every workspace, not a lone bottom-footer button.

### 3.5 Hierarchy / typography
- Adopt the reference eyebrow + H1 (`1.7rem/800`) + subtitle header pattern on all pages (crm/dm/ads/interview currently use `ModuleHero` which reads smaller and lacks the top-right action). Keep `ModuleHero` ONLY for the initial empty guard where data is absent.
- Keep `MetricCard` value `1.6rem/800`, section `1.18rem/800`, meta `0.82rem/600`, `0.92rem` subtitles — consistent already.
- Pass Indonesian `deltaLabel` (e.g. insight already uses "vs periode sebelumnya"); `MetricCard`'s default "vs last period" is English — override per-page (additive prop, no shared edit).

### 3.6 Empty / error / loading state consistency
- One EmptyState anatomy (already shared). Standardize empty HEADER: reference eyebrow+H1 header + a contextual message, on every page, so the empty page doesn't suddenly change header chrome.
- Loading/Error shells already shared (`LoadingState` variant, `ErrorState`). The only inconsistency is the width jump in §3.4 — fix that and states are uniform.
- Promote weak hints to clean Indonesian: stop using "Check kembali" as a catch-all; use specific recovery copy ("Perluas rentang tanggal", "Import laporan untuk mulai", etc.) — already largely done on insight/dm; fix the stragglers (ads `errText`, `DataTable` default).

---

## 4. Per-page change list (P0 / P1 / P2) — implementable

Legend: **P0** = must-fix consistency/correctness · **P1** = high polish · **P2** = nice-to-have. Every change is confined to `<Key>Dashboard.tsx` + `app/(workspaces)/<key>/page.tsx` + optional **additive** `PALETTE`/`RADII` token exports. No shared component's existing render changes.

### P0 — 5 items

**P0-1 · Unified ready shell band (all 8)** — convert `crm`, `dm`, `interview` from `max-w-[1220px]`+`main max-w-[1180px]` → the reference `mx-auto w-full min-w-0 max-w-[1240px] px-4 sm:px-6` + `main max-w-[1220px]` (`CrmDashboard.tsx:211–212`, `DmDashboard.tsx:149–150`, `InterviewDashboard.tsx:115–116`). Ads: change `<main max-w-[1180px]>` (`AdsDashboard.tsx:390`) → `max-w-[1220px]`. **Rendered review must confirm NO double-narrowing on any page.**

**P0-2 · Wrap bare WorkspaceNav** — in `ads`/`crm`/`dm`/`interview` page ready branches, wrap `<WorkspaceNav activeUrl>` in `mx-auto w-full max-w-[1220px] px-4 pt-5 sm:px-6` (as done in `website/page.tsx:116`, `sosmed:101`, `insight:117`). Covers the transient branches too so nav never bleeds full-bleed.

**P0-3 · Page action top-right** — add the eyebrow+H1+subtitle header with `<Button variant="secondary">🔄 Refresh Data</Button>` top-right to `crm`, `dm`, `ads`, `interview` when data present; demote the bottom Footer refresh to a keep-if-desired secondary. Matches reference anatomy.

**P0-4 · Copy cleanup (foreign/stale)** —
- `CrmDashboard.tsx:220` `"Tarik prospects en import data baru."` → `"Tarik prospects dan import data baru."` **(Italian `en` leftover)**.
- `AdsDashboard.tsx:170–188` ClearControl modal → Indonesian: "Menghapus seluruh baris dari {tab}… Tindakan ini tidak dapat dibatalkan." / `Ketik "{tab}" untuk konfirmasi` / `Batal` / `Ya, saya mengerti — kosongkan`; busy `"Imported…"` → `"Mengimpor…"` (`:242`); `"All rows dari REPORT MEKARI."` → `"Seluruh baris dari REPORT MEKARI."` (`:336`); `errText` `"Check kembali"` → clearer (`:78`).
- `InterviewDashboard.tsx:70` `"{N} selected"` → `"{N} terpilih"` and `"— All —"` → `"— Semua —"`; `:172` empty hint `"Difilter masih menegatif…"` → `"Filter mengembalikan hasil kosong — periksa PIC/follow-up/hasil."`.

**P0-5 · Transient-state width parity (all 8 page shells)** — make the `ErrorState`/`LoadingState`/empty branches in each `page.tsx` render at the same band as the ready branch (currently `max-w-[1220px]` + `main max-w-[1180px]` everywhere). Result: no width jump on load/refresh.

### P1 — 7 items

**P1-6 · Categorical palette tokens** — add `PALETTE.catBlue…catMint` (multi-hue, §3.1) to `ui-common.ts` (additive export) and re-point: wa-admin `TREEMAP_COLORS` (`:75`) & `DONUT_COLORS` (`:63`, incl. hardcoded `#7D8FA3`/`#8A6FD8`/`#3FA6C9`/`#C96F3F`/`#5C9DA6`/`#B5486B`); dm `DONUT_COLORS` (`:43`, incl. `#7D8FA3`); insight FunnelChart `colors[]` (`:155`, incl. `#3E7CB1`) + `PLATFORM_COLORS` (`:65`); website `LIVE/PENDING` can stay semantic. Ensures categorical charts cycle distinct hues.

**P1-7 · Filter-card radius standardisation** — unify all filter cards to `rounded-[16px]` (reference): insight `:326`, wa-admin `:882,935,957` currently `18px`. Keep `ChartContainer`/`QuickInsightStat` 18px and add a `RADII.md18` token for them (additive), OR add `md18` and use it everywhere; pick ONE value for filter cards.

**P1-8 · wa-admin FunnelPanel dead space** — `ChartContainer heightClass="h-[380px]"` (`:520`) holds ~300px of 6×40px bars → **~80px dead space (computed; render-UNVERIFIED)**. Set `h-[320px]` (or bump bar height to 44 / gap to fill). Keep it same-height as the `NeedsAttention` neighbor for balance.

**P1-9 · Query-state header parity** — convert `interview`, `crm`, `dm`, `ads` from `ModuleHero`-always to the reference eyebrow+H1 header when data present (keep `ModuleHero` only in the empty guard). This co-locates the header action (P0-3) and fixes hierarchy.

**P1-10 · wa-admin band decision** — resolve the 1720 wide band (owner decision): (a) **keep** → harden `min-w-0`/overflow + document it as the command-center-only band, or (b) **align to 1240**. State the decision explicitly in the build ticket; do not silently remove the wide grid.

**P1-11 · Empty-state header + copy standardisation** — ensure every page's empty guard uses the reference header chrome + a clean Indonesian recovery hint (drop "Check kembali" stragglers). `DataTable` default `emptyHint "Check kembali atau import data untuk module ini."` → pages should pass a clearer per-call `emptyHint` (P2-14) rather than editing the shared default.

**P1-12 · KPI/delta Indonesian** — pass `deltaLabel="vs periode sebelumnya"`-style on pages that currently rely on the English default "vs last period" (`MetricCard` default); at minimum on `sosmed`, `website`, `wa-admin`.

### P2 — 5 items

**P2-13 · Remaining English headings/labels → Indonesian** — `wa-admin` "Overview Pendaftaran" → "Ringkasan Pendaftaran" (`:899`); "Export as PDF (Quick Report)" → "Cetak Quick Report (PDF)" (`:1088`); `Collapse/Expand` → "Tutup/Tampilkan Semua" (`:1061`); `RecentTable` hint "Data detail tersedia dengan klik pada baris." → "Klik baris untuk melihat detail data." (`:717`); `dm` "Recent Update" → "Update Terbaru" (`:269`) and "Visualisasi" → "Visualisasi" stays but sub suggests Indonesian; `ads` "ROI Overview" → "Ringkasan ROI" (`:397`).

**P2-14 · `DataTable` default empty-copy** — since the default `emptyHint` is weak/English-ish ("module"), have pages always pass a specific `emptyHint`; optionally (with owner sign-off) relax the shared default later. Do NOT edit `DataTable` now.

**P2-15 · Chart accessibility + numerics** — add `role="img"` + `aria-label` on every hand-rolled SVG (most have it; audit the funnel/treemap/add/mekari ones); use `tabular-nums` on numeric cells in hand-rolled tables (insight platform table already does for detail, not the header-rate rows); ensure focus-visible rings on `details/summary` accordions.

**P2-16 · Website donut center** — `total - 1` (`WebsiteDashboard.tsx:108`) shows `0` when total==1; decide if it should show the true total and fix the display value (verify intent first — **UNVERIFIED**).

**P2-17 · Minor control-radius variance** — `MultiSelect` panel radius differs across pages (sosmed `rounded-[10px]`, crm `rounded-[12px]`); unify to one value (suggest `12px`) inside each page's local control (not shared).

### Suggested P0/P1/P2 tally
**P0: 5 · P1: 7 · P2: 5 · Total: 17.**

---

## 5. Acceptance checklist (Phase-3 build → Phase-4 rendered review)

Verifiable criteria; every "✓" must be checked by re-reading code AND a rendered review (SSR preview recipe) at **1920×1080 and 1024×768**.

**Shell / layout**
- [ ] All 8 workspace ready branches use exactly ONE band, no double-narrowing (`scrollWidth <= innerWidth` at 1920×1080 and 1024×768). wa-admin band resolved by owner (kept-with-guards or aligned).
- [ ] `WorkspaceNav` on every page sits inside the capped nav container (no full-bleed nav), aligned with the Topbar and dashboard gutters.
- [ ] Transient (loading/error/empty) branches render at the SAME width as ready — no width jump on load or refresh.

**Page action / hierarchy**
- [ ] Every workspace has a top-right page action (Refresh Data and any add/edit), NOT a lone bottom-footer button, when data is present.
- [ ] All pages with data use the eyebrow + H1 + subtitle header; ModuleHero appears only in empty guards.

**Copy**
- [ ] Zero foreign-language leftovers (no `en`, no English confirm dialogs, no `"N selected"`, "Check kembali" as a block-ending hint, "Imported…"). All UI copy Indonesian (per spec; EN/ID mix preserved only where it is intentional brand copy).

**Charts / colour**
- [ ] Categorical charts (funnel, donuts, treemap, platform comparison) cycle DISTINCT multi-hue `PALETTE.*` categories, never a sequential single-hue ramp.
- [ ] All chart colour arrays re-pointed to tokens (no hardcoded hex in dashboards except documented brand-decorative cases).
- [ ] No chart card has visible dead space: content fills or card height matches content (e.g. wa-admin funnel ≈ 320px), balanced to siblings.

**Radius / tokens**
- [ ] One filter-card radius value used consistently; `18px` tokenized if retained (or eliminated).
- [ ] `ui-common.ts` gains only additive exports (categorical palette, optional `md18`); no shared component's existing render is altered.

**States / a11y**
- [ ] Loading/empty/error use shared `LoadingState`/`EmptyState`/`ErrorState` consistently across pages.
- [ ] Every SVG chart has `role="img"` + meaningful `aria-label`; numeric table cells use `tabular-nums`; focus rings present on all interactive/accordion elements.

**Verification method**
- [ ] Phase 3: re-run `npx tsc --noEmit`, `npx vitest run`, `npm run build` — no new errors/regressions.
- [ ] Phase 4: RENDERED review via the visual-verification recipe (SSR static render w/ fixture data) at 1920×1080 + 1024×768, plus interaction-driven review of any write-back modal (mock the PATCH/POST). Never write MASTER.

---

## 6. Out-of-scope / future (this pass deliberately defers)

- **Rebrand / tokens renames** — out of scope by direction (EVOLVE only). `brand`/`accent`/glass intact.
- **Dark mode** — explicitly excluded (V3/glass is light-first; `globals.css` already removed the dark block).
- **New charting library** — out of scope; all charts stay dependency-free SVG.
- **Refactoring shared components** (editing `MetricCard`/`DataTable`/`ChartContainer`/etc.) — forbidden by constraint; only additive props are allowed in Phase 3.
- **wa-admin 1720 wide-band VALUE decision** — not made here; flagged P1-10 for the owner. Aligning or keeping is a business/density call, not a design call.
- **A full `/registration` workspace** — there is **no registration page** in `MODULES` (verified: 8 modules only); `registration` exists only as the data source feeding `/wa-admin`. A standalone registration page is future scope.
- **Data-KPI redefinition / metric semantics** — out of scope (this is UI only); Business-logic divergences (e.g. closing exact vs substring) live in the Logic Contract, not here.
- **Interaction animations beyond hover/lift/accordion** — deferred; motion stays `motion-reduce`-safe, no new motion system.
- **Component documentation pass** (`UI_DESIGN_SPEC.md` update to match the new additive tokens) — recommendation, not done in this phase.

---

*End of Phase-1 spec. All findings are code-grounded; items that could not be fully verified without a rendered browser are marked UNVERIFIED inline (P1-8 dead space, P2-16 donut-total, P0-width-jump pixel effect at specific viewports).*