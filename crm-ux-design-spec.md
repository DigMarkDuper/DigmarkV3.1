# Digmark V3.1 CRM / Leads — UX & Design Specification
**Page:** `/crm` (route `app/(workspaces)/crm/page.tsx`) · **Dashboard:** `src/workspaces/CrmDashboard.tsx` · **Logic:** `src/workspaces/crm.ts` · **Schema:** `src/server/adapter/schema.ts` · **Const:** `src/config/constants.ts`
**Status:** SPEC (implementation-ready) · **Version:** 3.1.0-ux · **Author:** Subagent · **Date:** 2026-10-10

---

## 0. Scope & Constraints
- **In scope:** Filter bar, table columns, computed "Latest Treatment Status" field, bulk selection UX, floating action bar, phone-validation summary, 3 export actions, visual polish.
- **Out of scope:** New DB tables, new Google Sheets sync logic, auth changes, new routes, non-CRM pages.
- **Constraints:** Existing `normalizePhone()` (`src/server/utils/helpers.ts`) kept; `MultiSelect` (inline) kept; `DataTable`, `Button`, `Select`, `TextInput`, `MetricRow`, `MetricCard`, `Divider`, `SectionHeader`, `EmptyState` reused; design tokens `--dm-*` preserved; brand Indigo `#3E7BFA`; Inter-like sans; light slate gray muted text.

---

## 1. Improved Filter Bar Layout

### 1.1 Layout structure
Compact two-row grid (responsive collapses to single stacked column `< md`).
- **Row 1 (primary filters):** `Kategori` dropdown · `Mekari Tag` multi-select · `Domisili` multi-select · `Treatment` quick-chip row.
- **Row 2 (secondary / meta):** `Search Nama / No Hp` text input · `Select All Filtered` button · clear filters link (`× Reset semua`).
- **Height:** ~72px row-1 + ~48px row-2 = 120px max, sticky below header (`sticky top-[header-height] z-30`).

### 1.2 Kategori dropdown (NEW)
- **Source:** `schema.ts` column `Kategori` (free-text / enum from form).
- **Control:** `Select` (single) with `placeholder="Semua Kategori"`; options from unique values in loaded dataset (`useMemo`, sorted A-Z).
- **State:** `filter.kategori: string | null`.
- **Visual:** same height (h-9 / 36px), border `border-dm-surface-200`, focus ring `focus:ring-2 focus:ring-[#3E7BFA]/30`, rounded `rounded-lg`.

### 1.3 Mekari Tag & Domisili (existing, preserved)
- Both remain `MultiSelect` inline (per `CrmDashboard.tsx` current implementation — chip-based multi with `×` removals).
- **Mekari Tag` options:** derived from `Mekari Tag (Status Terakhir)` column values.
- **Domisili` options:** derived from `Domisili` column.
- No change to selection state shapes (`string[]`).

### 1.4 Treatment quick-access chips (ENHANCED Select → chip group)
Replace the existing `Treatment` `Select` with a compact horizontal chip row + a hidden `Select` fallback for small screens.

| Chip | Condition (derived from T1 / T2 columns) | Color token / CSS |
|---|---|---|
| **Belum Treated** | T1 == null/empty AND T2 == null/empty | `bg-red-50 text-red-700 border-red-200` (red highlight) |
| **Only T1** | T1 present, T2 empty | `bg-blue-50 text-blue-700 border-blue-200` (orange-equivalent via `#F59E0B`) |
| **Only T2** | T2 present, T1 empty | `bg-amber-50 text-amber-700 border-amber-200` |
| **Both T1+T2** | Both present | `bg-emerald-50 text-emerald-700 border-emerald-200` |

- **Behavior:** Click chip → set `filter.treatmentMode: 'none' | 't1' | 't2' | 'both'` (mutually exclusive; click active chip → clear to `null`).
- **Small screen (`< sm`):** chips wrap to 2×2 grid; `Select` fallback shows text only (`"Belum Treated" / "Only T1" ...`).
- **Match logic (in `crm.ts`):** filter function compares `treatmentMode` against derived status of each row (see §3).

### 1.5 Responsive grid specification
```css
/* Filter bar container */
.filter-bar {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--dm-spacing-3, 0.75rem);
  background: var(--dm-bg-surface, #ffffff);
  border-bottom: 1px solid var(--dm-border-subtle, #e5e7eb);
  padding: 0.75rem 1rem;
  position: sticky; top: [header-height]; z-index: 30;
}
/* Chip row */
.treatment-chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.treatment-chips > button { height: 28px; padding: 0 10px; font-size: 11px; border-radius: 999px; font-weight: 500; }
```

---

## 2. Simplified Table Columns

### 2.1 Visible columns (8 total, sticky header)
| # | Column key | Type | Width | Content / Notes |
|---|---|---|---|---|
| 1 | `checkbox` | boolean (bulk) | 40px | Header = master checkbox; row = `input[type="checkbox"]` |
| 2 | `#` | number | 48px | Row index in **filtered** view (1-based) |
| 3 | `noHp` | string | 140px | `No Hp`; normalize on hover thumbnail? No — keep raw; show `normalizePhone()` result on export only |
| 4 | `nama` | string | min 200px, flexible | `Nama`; bold `text-slate-900`, truncate with `title` tooltip full name |
| 5 | `mekariTag` | string / chip | 130px | `Mekari Tag (Status Terakhir)`; pill `bg-indigo-50 text-[#3E7BFA]` |
| 6 | `kategori` | string | 120px | `Kategori`; muted `text-slate-600` |
| 7 | `domisili` | string | 120px | `Domisili`; muted |
| 8 | `latestTreatmentStatus` | derived string | 140px | **NEW** — computed (§3); pill with color (§3) |

- **Sticky header:** `position: sticky; top: 0; z-index: 20; background: rgba(255,255,255,0.95); backdrop-filter: blur(6px);` aligns with `DataTable` existing sticky behavior.
- **Row height:** 52px; hover `bg-slate-50`; selected (checked) `bg-[#3E7BFA]/5`.
- **Font:** Inter / system-ui, `text-sm` (14px) body, `text-xs` (12px) meta.

### 2.2 Hidden columns (moved to expandable detail row)
These were visible in full table; now hidden from main view but fully present in expanded detail pane.

| Hidden column | Where shown |
|---|---|
| `tanggalLahir` | Detail row, "Info Pribadi" block |
| `usia` | Detail row (computed from `tanggalLahir` or stored) |
| `keteranganSetelahIsiForm` | Detail row, full text block |
| `tanggalMasukDatabase` | Detail row, meta line |
| `treatment1` | Detail row, "Treatment" block |
| `treatment2` | Detail row, "Treatment" block |
| `tanggalTreatment1` | Detail row, paired with `treatment1` |
| `tanggalTreatment2` | Detail row, paired with `treatment2` |
| `status` | Detail row, "Status Sistem" |
| `updatedStatusAfterTreatment` | Detail row, "Status Update Post-Treatment" |
| `catatan` | Detail row, full-width text area |

### 2.3 Expandable detail row
- **Trigger:** Click anywhere on row except checkbox or action buttons (or an `›` expand chevron at far right, 24px).
- **Animation:** `max-height` 0 → auto with `overflow: hidden; transition: max-height 0.25s ease-out` (CSS-only; no JS animation library needed).
- **Content layout (2 columns on `md+`, stacked `< md`):**
  - **Left:** Profile info (No Hp, Nama, Tanggal Lahir, Usia, Domisili, Kategori, Tanggal Masuk Database).
  - **Right:** Treatments (T1 name + date, T2 name + date, Status, Updated Status After Treatment, Keterangan Setelah Isi Form, Catatan).
- **Visual:** `bg-slate-50/60` background, 1px top border `border-slate-200`, 16px padding, rounded `rounded-b-xl` only when expanded (parent row keeps `rounded-t` if top of group).

---

## 3. Latest Treatment Status Computation (NEW FIELD)

### 3.1 Derivation rule (implemented in `crm.ts` as `computeLatestTreatmentStatus(row)`)
```ts
function computeLatestTreatmentStatus(r: LeadRow): LatestTreatmentStatus {
  const t1 = r.treatment1?.trim();
  const t2 = r.treatment2?.trim();
  const hasT1 = !!t1;
  const hasT2 = !!t2;
  if (!hasT1 && !hasT2) return { label: 'Belum treated', color: 'red',   cssClass: 'bg-red-50 text-red-700 border-red-200' };
  if (hasT1 && !hasT2) return { label: 'T1 selesai',     color: 'orange', cssClass: 'bg-orange-50 text-orange-700 border-orange-200' };
  if (!hasT1 && hasT2) return { label: 'T2 saja',        color: 'amber',  cssClass: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'T1+T2 selesai', color: 'green', cssClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}
```
- **Source columns:** `Treatment 1`, `Treatment 2` (may be null/empty string).
- **No DB change:** pure compute on load / filter / render.
- **Memoized:** per-row `useMemo` or computed once on dataset load (`crm.ts` `map()` over fetched rows).

### 3.2 Visual rendering in table (column 8)
- Pill shape (`rounded-full`, `px-2.5 py-0.5`, `text-xs font-medium`, `border`).
- **Color mapping (exact):**
  - Belum treated → `bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]` (red-100/700/200 equiv.)
  - T1 selesai → `bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]` (orange-100/700/200)
  - T2 saja → `bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]` (amber-100/700/200)
  - T1+T2 selesai → `bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]` (emerald-100/700/200)
- **Accessibility:** color is supplemental; label text always present; `aria-label="Status: {label}"`.

---

## 4. Bulk Selection UX

### 4.1 Row checkbox
- Per-row: `input[type="checkbox"]` (not custom-styled to avoid accessibility loss); size `w-4 h-4`; accent color `accent-[#3E7BFA]` (native checkbox accent via CSS `accent-color` where supported; fallback `custom` via hidden input + styled `div` if required).
- **State tracking:** `selectedIds: Set<string>` (keyed by row `id` / `noHp` + timestamp to avoid collisions — use existing row identifier from DB / `normalizePhone()` result as stable key).
- **Row checked state:** applies `bg-[#3E7BFA]/[0.05]` to row background for visibility.

### 4.2 Header checkbox (master)
- **Behavior:**
  - All filtered rows selected → checked + `indeterminate` false.
  - Partial selection → `indeterminate` true, checkbox checked visually (native `indeterminate` property set via ref).
  - None selected → unchecked.
- **Click action:** toggle all currently filtered (visible) rows — NOT entire database, only matching current filter bar settings.
- **Implementation:** `useRef<HTMLInputElement>`; update `.indeterminate = (partial)`; state change triggers `setSelectedIds(newSet)`.

### 4.3 Floating Action Bar (FAB-style, appears on selection > 0)
- **Position:** fixed bottom of table viewport (`bottom: 0; left: 0; right: 0; z-index: 40`) or floating card above footer (`position: sticky; bottom: 16px; z-index: 40; max-width: 640px; margin: 0 auto;`). Recommended: floating card centered above page bottom for visibility without covering table.
- **Appearance (only when `selectedIds.size > 0`):**
  - Background: `bg-white/95 backdrop-blur-md border border-dm-border-subtle shadow-xl rounded-2xl`
  - Padding: `1rem 1.25rem`
  - Layout (flex, gap-3):
    - Left: **Counter** `"{n} terpilih"` (`font-semibold text-slate-900`)
    - Right buttons (horizontal, gap-2):
      - `[Export Selected]` — primary (`bg-[#3E7BFA] text-white`); triggers §6.1
      - `[Copy Phone Numbers]` — secondary (outline `border-slate-300 text-slate-700`); triggers §6.3
      - `[Clear]` — subtle (`text-slate-500 hover:text-slate-700`); clears `selectedIds`
- **Animation:** `translate-y` from 20px → 0, opacity 0 → 1, `duration-200 ease-out` (CSS transition on `.fab-bar` with class `.visible`).
- **Keyboard:** `Escape` clears selection (global listener when bar visible).

### 4.4 "Select All Filtered" link (top of table)
- Placement: above table header, aligned left with filter bar (same x-margin) or inside filter bar row-2, right-aligned.
- **Text:** `"Pilih semua {count} hasil filter"` where `count = filteredRows.length`.
- **Behavior:** one click selects all currently filtered rows (sets `selectedIds` = all filtered IDs); second click (if all selected) deselects all.
- **Visual:** text-link style (`text-[#3E7BFA] hover:underline font-medium text-sm`) — not a button, avoids double-confusion with FAB primary.

---

## 5. Phone Number Validation Panel (NEW — pre-export / during export)

### 5.1 Placement
Inline above the floating action bar (when selection > 0) OR as a collapsible card at top of export dropdown. Recommended: collapsible `MetricCard` / `SectionHeader` panel that auto-expands when export action clicked, collapses after 3s or on manual close.

### 5.2 Card content (Summary Card — `MetricRow` / custom `div` with grid)
```
+-----------------------------------------------------------+
|  Validasi Nomor Telepon        [×]                        |
|  Total: 124   •   Valid 62-format: 98   •   Invalid: 18   •   Duplikat dihapus: 6  |
|  [⚠] 3 nomor tidak normal: 0812... (warna merah)          |
+-----------------------------------------------------------+
```
- **Metrics (4 columns, responsive 2×2 on mobile):**
  1. `Total N` — count of selected / filtered rows (whichever export target is active).
  2. `Valid 62-format` — `normalizePhone()` returned value starts with `62` and length ≥ 10; count.
  3. `Invalid / Missing` — empty `noHp`, `normalizePhone()` returned null/empty, or result doesn't start with `62`; count.
  4. `Duplicates removed` — unique count after dedup (by normalized value); `duplicates = inputCount - uniqueCount`.

### 5.3 Flagging logic
- For each selected / filtered `noHp`: run `normalizePhone(raw)` (existing helper).
- **Invalid conditions:**
  - `normalizePhone` returns `null` / `undefined` / `""`
  - Return value does NOT start with `"62"`
  - Length < 8 (after normalization)
- **Flag display:** in panel, list of first 3 invalid (red text `text-red-600`) with tooltip full number; `"+ {n} lainnya..."` if more.
- **Duplicate removal:** before CSV/clipboard, deduplicate by `normalized` value (first occurrence kept, rest skipped). Report `duplicatesRemoved`.
- **Export prep:** validation runs synchronously (< 100ms for < 5,000 rows); no blocking UI.

---

## 6. Export Actions (3 Clear Buttons)

All actions trigger validation panel (§5) briefly, then proceed.

### 6.1 Export Selected (CSV Mekari format)
- **Button:** in FAB (§4.3) as primary; also available in top toolbar near filter bar (`TextInput` area).
- **Target:** `selectedIds` rows (not all database, not all filtered unless selection covers all).
- **Format:** CSV with Mekari column mapping (same order as visible + hidden fields needed by Mekari):
  - Columns: `No`, `No Hp`, `Nama`, `Kategori`, `Domisili`, `Mekari Tag`, `Latest Treatment Status`, `Tanggal Masuk Database`, `Status`, `Treatment 1`, `Treatment 2`, `Tanggal Treatment 1`, `Tanggal Treatment 2`, `Catatan` (hidden fields included for Mekari compatibility even though hidden from UI).
- **File name:** `leads-selected-{YYYYMMDD-HHmm}.csv`
- **Encoding:** UTF-8 BOM (Excel-friendly via `"\ufeff"` prepended).
- **Pre-export:** run §5 validation; if `invalid > 0`, show confirmation dialog: `"{invalid} nomor tidak valid. Tetap export?"` with `[Lanjut] [Batal]`.
- **Implementation:** `exportToCsv(rows: LeadRow[])` in `crm.ts`; no server round-trip (client-side from already-loaded data to keep sync logic intact).

### 6.2 Export Filtered (all matching current filters)
- **Button:** secondary in top toolbar (`bg-white border border-dm-border-subtle text-slate-700 hover:bg-slate-50`).
- **Target:** all rows where `filter` conditions match (ignores selection).
- **File name:** `leads-filtered-{YYYYMMDD-HHmm}.csv`
- **Same format & validation** as §6.1; validation runs against full filtered set.
- **Visual:** icon `⬇️`; tooltip on hover `"Export semua {count} hasil filter"`.

### 6.3 Copy Phone Numbers (clipboard)
- **Button:** in FAB (§4.3) secondary; also in toolbar.
- **Target:** `normalizePhone()` results of either selected (if selection > 0) or filtered (if selection == 0) — **prefer selected when available**, else filtered, matching user's current focus.
- **Format:** one per line, `62`-formatted, deduplicated, sorted ascending.
- **Example output clipboard:**
  ```
  6281234567890
  6289876543210
  ```
- **Feedback:** after copy, button text briefly changes to `"Copied!"` (2s), then reverts; or a toast `"{n} nomor disalin"` using existing notification mechanism if available; else simple `window.navigator.clipboard.writeText()` with `alert()` fallback only if clipboard unavailable (minimize intrusion — prefer silent success).
- **Validation note:** invalid/missing numbers excluded from clipboard; if excluded > 0, brief note `"({excluded} tidak valid, tidak disalin)"` shown in validation panel.

---

## 7. Visual Design Specification

### 7.1 Design tokens (use existing `--dm-*` variables)
| Token usage | Value / Fallback |
|---|---|
| Brand / primary | `#3E7BFA` (Indigo) |
| Surface bg (cards, filter) | `var(--dm-bg-surface, #f8fafc)` / `#ffffff` |
| Page bg | `var(--dm-bg-canvas, #f1f5f9)` |
| Border subtle | `var(--dm-border-subtle, #e2e8f0)` |
| Text primary | `var(--dm-text-primary, #0f172a)` (slate-900) |
| Text muted | `var(--dm-text-muted, #64748b)` (slate-500) |
| Text secondary | `#475569` (slate-600) |
| Font family | `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (Inter-like) |
| Radius base | `10px` / `0.625rem` (`rounded-xl`) for cards; `9999px` for pills |
| Shadow card | `0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.06)` |
| Shadow floating bar | `0 10px 30px -5px rgba(15,23,42,0.12), 0 4px 6px -2px rgba(15,23,42,0.08)` |

### 7.2 Color semantics (consistent across components)
- **Indigo `#3E7BFA`:** primary actions, checkboxes, links, header accent bars.
- **Red `#EF4444`:** "Belum Treated", invalid numbers, errors.
- **Orange `#F97316`:** "T1 selesai", moderate warnings.
- **Amber `#F59E0B`:** "T2 saja", caution.
- **Green `#10B981`:** "T1+T2 selesai", valid/success states.
- **Slate `#64748b`:** muted meta, secondary labels.

### 7.3 Typography hierarchy
- Page title (`CrmDashboard.tsx` `SectionHeader`): `text-2xl font-bold tracking-tight text-slate-900`.
- Filter labels (`Select` labels): `text-xs font-medium uppercase tracking-wider text-slate-500`.
- Table header: `text-xs font-semibold text-slate-600 uppercase tracking-wide`.
- Table body: `text-sm font-normal text-slate-900` (name), `text-sm text-slate-500` (meta).
- FOB counter: `text-sm font-semibold`.
- Chip labels: `text-xs font-semibold`.

### 7.4 Responsive behavior
- **Desktop (`≥ lg`):** 2-row filter grid; table 8 columns; detail 2-column; FAB floating card centered.
- **Tablet (`md`–`lg`):** filter wraps to 2 columns; table scrolls horizontally (`overflow-x-auto`) with sticky first 3 columns; detail stacks; FAB full-width bottom bar.
- **Mobile (`< md`):** filter single stack; table card-style rows (each row = card with key fields + expand); detail full-width; FAB bottom full-width with icon-only buttons + tooltip.

---

## 8. Component Architecture (Create vs Modify)

### 8.1 Existing structure reference (`CrmDashboard.tsx`)
```
CrmDashboard.tsx
├── SectionHeader          (existing — reuse)
├── MetricRow / MetricCard (existing — reuse for validation panel)
├── Filter bar (inline MultiSelect, Select, TextInput) — ENHANCE → FilterBar (new component)
├── DataTable              (existing — ENHANCE: add checkbox col, latestTreatmentStatus col, expandable row)
├── MultiSelect (inline)   (existing — keep as-is for Mekari Tag, Domisili)
├── Button / Select / TextInput / Divider / EmptyState (reuse)
└── New: BulkSelectionBar (FAB) + PhoneValidationPanel + ExportToolbar + TreatmentChipRow
```

### 8.2 Components to MODIFY (existing files)

| File | Component / Area | Change |
|---|---|---|
| `src/workspaces/CrmDashboard.tsx` | Main layout / state | Add `selectedIds`, `filter.treatmentMode`, `filter.kategori`; wire new subcomponents; add `useMemo` for computed `latestTreatmentStatus`; integrate export handlers |
| `src/workspaces/CrmDashboard.tsx` | `DataTable` usage | Pass `showCheckbox`, `expandableRows`, `visibleColumns`, `hiddenColumns` props; add master checkbox logic |
| `src/workspaces/crm.ts` | Filter / compute | Add `computeLatestTreatmentStatus()`; add `filterByTreatmentMode()`; add `normalizeAndValidate()` for §5; add `exportToCsv()`; add `copyToClipboard()` |
| `src/config/constants.ts` | Export config | Add `EXPORT_FILENAME_PREFIX = "leads-"`; `CSV_COLUMNS_MEKARI = [...]` |
| `src/server/adapter/schema.ts` | Types (optional) | Add `LatestTreatmentStatus = 'Belum treated' \| 'T1 selesai' \| 'T2 saja' \| 'T1+T2 selesai'`; extend `LeadRow` interface with computed field (not DB) |
| `app/(workspaces)/crm/page.tsx` | Page wrapper | No structural change; only ensures new context providers (if needed for clipboard / toasts) are present |

### 8.3 Components to CREATE (new files / new components inside `CrmDashboard.tsx` or `src/components/`)

| Component | File | Purpose |
|---|---|---|
| **FilterBar** | `src/components/crm/FilterBar.tsx` (new) | Two-row filter grid: Kategori `Select`, Mekari `MultiSelect`, Domisili `MultiSelect`, Treatment chip row, Search `TextInput`, Reset link, "Select All Filtered" button |
| **TreatmentChipRow** | `src/components/crm/TreatmentChipRow.tsx` (new / inline in FilterBar) | 4 chips (Belum Treated / Only T1 / Only T2 / Both) with active state, colors, click-to-toggle, wrap responsive |
| **BulkSelectionBar** | `src/components/crm/BulkSelectionBar.tsx` (new) | Floating action card: counter + Export Selected + Copy Phone Numbers + Clear; visible only when `selectedIds.size > 0`; animation via CSS |
| **PhoneValidationPanel** | `src/components/crm/PhoneValidationPanel.tsx` (new) | Collapsible summary card (MetricCard style): 4 metrics + invalid flags; auto-triggers on export click |
| **ExportToolbar** | `src/components/crm/ExportToolbar.tsx` (new / inline in FilterBar row-2) | 3 buttons: Export Selected, Export Filtered, Copy Phone Numbers; icons `⬇️` / `📋` |
| **DetailRowPane** | `src/components/crm/DetailRowPane.tsx` (new) | Expandable 2-column detail for hidden fields; animation `max-height` |
| **DataTable enhancement props** | `src/components/DataTable.tsx` (modify if exists, or wrap) | Add `checkboxColumn`, `expandableRows` props; if `DataTable` is generic, create wrapper `CrmDataTable` |

**Note:** If `DataTable` is a generic shared component (likely, given design-system listing), do NOT modify its core — create `CrmDataTable = DataTable + checkbox/expandable features` or pass feature flags via props.

---

## 9. Implementation Sequence (recommended order — no dependency breaks)

1. **Schema / types** (`schema.ts`): add computed type only.
2. **Logic** (`crm.ts`): `computeLatestTreatmentStatus()`; filter updates; validation; export functions.
3. **Constants** (`constants.ts`): export filenames, CSV column list.
4. **New components** (FilterBar, TreatmentChipRow, BulkSelectionBar, PhoneValidationPanel, DetailRowPane) — build with static props first.
5. **Modify `CrmDashboard.tsx`**: wire state (`selectedIds`, filters); integrate new components; add master checkbox; add expand handlers.
6. **Enhance `DataTable` / create `CrmDataTable`**: checkbox + expandable.
7. **Responsive / visual polish:** token colors, pill styles, animations.
8. **Test scenarios:** (a) select all filtered, (b) filter + select partial, (c) export selected with invalid phones, (d) copy clipboard, (e) detail expand/collapse, (f) clear all filters reset.

---

## 10. Verification Checklist (pre-merge)
- [ ] `normalizePhone()` still used; no new normalization logic invented.
- [ ] Database / Google Sheets sync untouched (`crm.ts` sync functions unchanged except filter wrapper).
- [ ] All 11 hidden columns viewable in detail pane; none accidentally remain visible.
- [ ] `Latest Treatment Status` matches derivation rules (4 states) exactly.
- [ ] Filter `Kategori` dropdown loads unique values; no hard-coding.
- [ ] Treatment chips mutually exclusive; clear-able; responsive wrap.
- [ ] Bulk selection: header checkbox reflects partial/full; selects filtered only; FAB appears/disappears correctly.
- [ ] Phone validation: shows 4 metrics; flags first 3 invalid; counts duplicates removed; runs pre-export (not blocking if >0, just warns).
- [ ] Export Selected: CSV Mekari format; filename dated; UTF-8 BOM; includes hidden fields.
- [ ] Export Filtered: uses current filter state, ignores selection.
- [ ] Copy Phone Numbers: clipboard write; deduplicated; `62`-format; excludes invalid; brief feedback.
- [ ] Design tokens (`--dm-*`) referenced; Indigo `#3E7BFA` primary; light backgrounds; Inter-like font.
- [ ] No breaking changes to existing `MultiSelect` behavior for Mekari Tag / Domisili.
- [ ] Responsive: desktop 2-row filter, tablet scroll, mobile card-style.

---

## Appendix: CSV Mekari Column Order (for §6.1 / §6.2)
(Used by `constants.ts` `CSV_COLUMNS_MEKARI` — preserved to match existing Mekari ingestion.)

| CSV col index | Source column | Note |
|---|---|---|
| A | No (row #) | 1-based in filtered view |
| B | No Hp | raw or normalized per config; spec: raw for audit, `normalizePhone()` for clipboard |
| C | Nama | |
| D | Kategori | |
| E | Domisili | |
| F | Mekari Tag (Status Terakhir) | |
| G | Latest Treatment Status | NEW — computed |
| H | Tanggal Masuk Database | hidden from UI |
| I | Status | hidden |
| J | Treatment 1 | hidden |
| K | Treatment 2 | hidden |
| L | Tanggal Treatment 1 | hidden |
| M | Tanggal Treatment 2 | hidden |
| N | Catatan | hidden |
| O | Updated Status After Treatment | hidden |

---

*End of specification. Deliverable is this markdown file; implementation requires edits to `CrmDashboard.tsx`, `crm.ts`, `constants.ts`, `schema.ts`, plus creation of 5–6 new component files under `src/components/crm/` and possible `DataTable` prop enhancement.*
