# /sosmed Filter Bar — Compact Searchable Multi-Select Dropdown — UI/UX Specification

**App:** Digmark V3.1 · **Route:** `/sosmed`
**Status:** Implementation-ready design spec (UI/interaction layer ONLY — no data logic, no server code)
**Designer:** NEO (UI/UX) · **Implementer:** REX (coding)
**Target viewport:** 1920×1080 desktop landscape (primary), responsive downward.
**File under change:** `src/workspaces/SosmedDashboard.tsx` (854 lines) — presentational body. Nothing else.

This document is a written design contract. A developer must be able to implement the
new filter bar without further design decisions. All tokens, classes, labels, and
interactions are defined concretely below.

---

## 0. Scope & invariants (non-negotiable)

- **UI/INTERACTION LAYER ONLY.** The redesign replaces *how* filters are presented and
  toggled. It must **not** change *what* is filtered, *which* data the KPIs see, or the
  public contract between the filter state and the downstream chart/KPI derivations.
- **Do NOT touch** `src/workspaces/sosmed.ts` logic (esp. `filterRows`, `sosmedMonths`,
  `picOptions`, `distinctValues`, `pickDateCol`) — line ~578 `filterRows(rows,{...})`
  and every derived metric (`sosmedMetrics`, `productionOverview`, `productionFunnel`,
  `statusBreakdown`, `deadlineMonitor`, `picWorkload`, `publishingTracker`,
  `contentStrategy`, `outputTrend`, `actionRequired`) consume the single `filtered`
  variable. That contract stays **byte-identical**.
- **Do NOT touch** `app/(workspaces)/sosmed/page.tsx` or any shared component:
  `Field.tsx` (`Select`, `TextInput`, `Input`), `MetricCard`, `MetricRow`,
  `ChartContainer`, `Button`, `Divider`, `Footer`, `Topbar`, `WorkspaceNav`,
  `SectionHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `ModuleHero`.
- **The new dropdowns MUST be LOCAL component(s) declared inside**
  `SosmedDashboard.tsx` only — same file, a new local `MultiSelectDropdown` function.
  The existing local `MultiSelect` (lines 104–149) and `MonthChips` (lines 151–200) are
  the components being replaced; they may be removed, but the new component must not be
  hoisted to a shared file.
- **Six state sets must be preserved unchanged:** `picSel`, `monthSel`, `statusSel`,
  `platformSel`, `pillarSel`, `formatSel` — all `Set<string>`, all default = **ALL
  selected** (mirrors current default). The `activeFilterCount` computation (count of
  dimensions whose `size !== options.length`, lines 513–519) must keep working and drive
  the `Filter Data (N aktif)` header count exactly as today.
- **`toggle` behavior preserved:** toggling a member removes it; toggling it again
  re-adds it. `filterRows` ANDs non-empty dimensions. Empty selection on a dimension =
  AND-wise no-op (all rows pass that dimension), matching today's semantics.
- **No new build dependency.** Search + dropdown are implemented with React state and
  the existing UI utilities (`text-ink`, `text-muted`, `bg-surface`, `bg-surface-input`,
  `bg-surface-strong`, `border-border`, `text-brand`, `text-brand-hover`,
  `text-ink-on-brand`, `accent-brand`, `var(--dm-shadow-xs)`). No UI library, no headless
  combobox, no charting lib.

### Why (design rationale)
Today the filter card expands five permanently-open 160px-tall checkbox columns plus a
month-chip wall — it consumes the first screenful and forces a wall-of-checkbox scan for
dimensions with many members (PIC counts, platforms, pillars). The redesign collapses all
dimensions into a single compact dropdown row so the KPIs surface immediately, while the
search box removes the "hunt through a long checkbox list" cost that the current fixed
column has.

---

## 1. New filter bar — layout & anatomy

The filter card wrapper **shell stays the same** (compact glass card):

```
<div className="mb-6 rounded-[16px] border border-border bg-surface p-4
                shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]">
```

- Header line **unchanged**: `filterCardHeader("Filter Data" + (N aktif))` (same icon,
  same classes). When `activeFilterCount > 0` the ` (N aktif)` suffix appears exactly as today.
- Body **replaces** the `grid gap-5 md:grid-cols-2 lg:grid-cols-4` of five `MultiSelect`
  + `MonthChips` with a **single-row flex/grid of dropdowns**:

```
<div className="flex flex-wrap items-start gap-3 md:grid md:grid-cols-2 xl:grid-cols-6">
  <MultiSelectDropdown label="PIC"      options={pics}           selected={picSel}      onToggle={...} />
  <MultiSelectDropdown label="Bulan Deadline" options={months}   selected={monthSel}   ... />
  <MultiSelectDropdown label="Status"   options={statusOptions}  selected={statusSel}  hint="PROSES" ... />
  <MultiSelectDropdown label="Platform" options={platformOptions} selected={platformSel} ... />
  <MultiSelectDropdown label="Content Pillar" options={pillarOptions} selected={pillarSel} ... />
  <MultiSelectDropdown label="Format"   options={formatOptions}  selected={formatSel}  ... />
</div>
```

### Column mapping & grid behavior
| # | Label (`label` prop) | Backs `option` list | Hint | Grid col (xl) |
|---|---|---|---|---|
| 1 | `PIC` | `pics` | — | 2 |
| 2 | `Bulan Deadline` | `months` | `tugas berdasarkan deadline` | 1 |
| 3 | `Status` | `statusOptions` (static list) | `PROSES` | 1 |
| 4 | `Platform` | `platformOptions` | — | 1 |
| 5 | `Content Pillar` | `pillarOptions` | — | 1 |
| 6 | `Format` | `formatOptions` | — | 1 |

- At `xl` viewport: a 6-column grid (`xl:grid-cols-6`). PIC spans 2 columns (its member
  count is the largest), the rest span 1.
- At `md`–`xl`: `md:grid-cols-2` (three rows of two). Below `md`: single-column flex
  wrap (full-width dropdowns).
- Every column keeps `min-w-0` so the trigger chip shrinks instead of overflowing.
- **`MonthChips` is subsumed** by the `Bulan Deadline` dropdown. This is an intentional
  interaction change: months are now a selectable list inside the same dropdown pattern
  instead of always-visible chips. The behavioral result (`monthSel` Set toggling) and
  the `filterRows` contract are unchanged. The old `MonthChips` function (lines 151–200)
  is removed.

---

## 2. `MultiSelectDropdown` component — interaction spec

A single compact trigger that opens a **popover panel** containing a **search input** and
a **checkbox option list**, with persistent state of what was selected including values
not present in the option list.

### Props
| Prop | Type | Purpose |
|---|---|---|
| `label` | `string` | Static label shown above/on the trigger (Indonesian; e.g. `PIC`, `Status`). |
| `options` | `string[]` | Full option list (same arrays passed today: `pics`, `months`, `statusOptions`, `platformOptions`, `pillarOptions`, `formatOptions`). |
| `selected` | `Set<string>` | The current selection state set (one of the six state sets). |
| `onToggle` | `(value: string) => void` | The existing `toggle(set, v, setter)` callback — pass through unchanged: `onToggle={(v) => toggle(picSel, v, setPicSel)}`. Must mutate a **new** `Set` (never the prop), exactly like the current `toggle`. |
| `hint?` | `string` | Optional parenthetical hint appended to the label (e.g. `PROSES`, `tugas berdasarkan deadline`). |
| `placeholder?` | `string` | Optional search-box placeholder. Default `Cari…`. |

### 2.1 Closed state (the trigger)
- A single control: `<button type="button">` styled like the current chip system —
  `inline-flex items-center gap-2 rounded-[12px] border border-border bg-surface-input
  px-3 py-2 text-[0.82rem] font-semibold text-ink transition-colors hover:border-brand/30
  hover:text-brand-hover`.
- It displays:
  1. the **`label`** (and `hint` in `<span className="text-[0.75rem] text-muted/70">`),
  2. a **summary pill** of current selection: when the dimension is **fully selected**
     (`selected.size === options.length`) show a neutral white/gray chip labeled
     `Semua` (all) — compact and prose-equivalent to today's implicit "everything
     selected" default;
  3. when **partially or minimally selected**, show a count chip `N dipilih`
     (e.g. `2 dipilih`);
  4. a chevron `▾` (inline SVG, `aria-hidden`) that flips to `▴` when open.
- **Accent the trigger** (`border-brand/40 text-brand`) when the dimension has an active
  filter (`selected.size < options.length < ... or active`) so an applied filter is visible
  while closed. Keep it subtle — a tint, not a filled button.
- Reference implementation of the layout uses existing primitives only (spans + the
  SVG chevron pattern already used elsewhere in the file).

### 2.2 Open state (the popover)
- A single centered/anchor-pinned **panel** below the trigger: `absolute z-30 mt-2 w-64
  min-w-0 rounded-[12px] border border-border bg-surface shadow-[var(--dm-shadow-lg)]
  p-2`. (If `--dm-shadow-lg` is undefined in this codebase, fall back to
  `shadow-[var(--dm-shadow-xs)]` and note it.)
- Panel contains, top to bottom:
  1. **Search input:** `w-full rounded-[8px] border border-border bg-surface-input px-2.5
     py-1.5 text-[0.82rem] text-ink placeholder:text-muted focus:border-brand focus:ring-2
     focus:ring-brand`. It filters `options` **case-insensitively, trimmed**, on
     `startsWith`/`includes` of the query. Placeholder `Cari…`.
  2. **Select-all toggle row:** a compact checkbox row at the top of the list labeled
     `Pilih Semua` (select all). When checked it selects **all** option values; when
     the panel is closed with everything selected the trigger shows `Semua`. This is a
     convenience mirroring today's "default = all" state — it must call the same
     `onToggle` semantics per value (or a small `selectAll` helper that constructs a new
     Set of all options and calls the setter via the prop pattern). It is an **addition**,
     not a requirement to change the state contract.
  3. **Scrollable option list:** `max-h-[220px] overflow-y-auto` — a checkbox column
     styled exactly like the current `MultiSelect` rows:
     `label.flex.cursor-pointer.items-center.gap-2.py-0.5.text-[0.82rem].font-medium
     .text-ink` + `<input type="checkbox"> h-[15px] w-[15px] rounded-[4px]
     border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand` + the value.
  4. **Empty-search result:** when the typed query matches no option, show
     `Tidak ada opsi.` (`text-[0.8rem] text-muted`) — reuse the current empty copy.
- **Focus management:** focus lands in the search input on open. `Escape` closes the
  panel and returns focus to the trigger. Clicking outside (`onBlur` delegation or a
  backdrop) closes the panel. Only **one** dropdown open at a time — opening another
  closes the previous.
- **Row count / mining long lists:** when `options.length` is large (PIC, pillar), the
  search box is the primary affordance; the scroll list still renders all values so no
  value is unfindable.

### 2.3 State management rules (must not break the contract)
- The panel's open/closed state and the search query are **local `useState` per
  dropdown** — new component-local state only.
- The **selection** is **never stored locally** — it always round-trips through the
  prop `selected` + `onToggle`, identical to today. No copy of the set may be kept in
  the dropdown; the parent owns the six state sets.
- A value that **is** in `selected` but **not** in `options` (edge case after a refresh
  that changed the live domain) must still render as a checked row so the selection is
  never silently dropped; the choice list is `unique([...options, ...selected])`.

---

## 3. Design tokens & visual language

All tokens are existing V3.1 design-system tokens — **do not introduce new hex values**.

| Element | Class / token |
|---|---|
| Filter card wrapper | `rounded-[16px] border border-border bg-surface p-4 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]` |
| Card header | `filterCardHeader(label)` (unchanged) |
| Trigger (closed) | `inline-flex items-center gap-2 rounded-[12px] border border-border bg-surface-input px-3 py-2 text-[0.82rem] font-semibold text-ink` + hover `hover:border-brand/30 hover:text-brand-hover` |
| Trigger (has active filter) | `border-brand/40 text-brand` added |
| Summary chip | `rounded-full bg-surface-strong px-2.5 py-0.5 text-[0.75rem] font-medium text-muted` (e.g. `Semua`, `2 dipilih`) |
| Popover panel | `absolute z-30 mt-2 w-64 rounded-[12px] border border-border bg-surface p-2 shadow-[...]` |
| Search input | `w-full rounded-[8px] border border-border bg-surface-input px-2.5 py-1.5 text-[0.82rem] text-ink placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand` |
| Option row | `flex cursor-pointer items-center gap-2 py-0.5 text-[0.82rem] font-medium text-ink` |
| Checkbox | `h-[15px] w-[15px] rounded-[4px] border-2 border-brand/40 accent-brand focus:ring-2 focus:ring-brand` |
| Hint | `text-[0.75rem] text-muted/70` (in `(label)` parenthetical) |
| Empty list row | `text-[0.8rem] text-muted` ("Tidak ada opsi.") |
| Scroll container | `max-h-[220px] overflow-y-auto` |

**Hierarchy:** one visible row of triggers at the top of the card ≈ 48px tall vs today's
≈330px. The count chip + accent border are the only "state readout" the user needs at
rest; everything else unfolds on demand.

---

## 4. Accessibility & copy

- **ARIA:** the trigger button gets `aria-haspopup="dialog"` (or `"listbox"`),
  `aria-expanded={open}`; the panel gets `role="listbox"` / `role="dialog"` with an
  `aria-label` carrying the dimension label (e.g. `aria-label="Pilih PIC"`). Each option
  row uses `<label>` + real `<input type="checkbox">` (native semantics, as today — no
  div-based fake checkboxes).
- The search input needs an accessible name (`aria-label={label}` or a
  `<label>`/placeholder pairing).
- **Keyboard:** `Escape` closes + refocuses trigger; `Tab` moves through the option rows;
  checkboxes toggled with Space (native behavior — preserved by keeping real inputs).
- **Copy is Indonesian** (matches page): labels `PIC`, `Status`, `Platform`,
  `Content Pillar`, `Format`, `Bulan Deadline`; hints `PROSES` (Status) and
  `tugas berdasarkan deadline` (Bulan Deadline); empty state `Tidak ada opsi.`; summary
  `Semua` / `N dipilih`; select-all `Pilih Semua`; placeholder `Cari…`.
- UI copy that is currently stale/mismatched nearby (e.g. `Completie %` → `Completion %`,
  `monitoring operasioneel` → `monitoring operasional`) is **out of scope** for this
  brief unless explicitly requested — the filter bar alone owns its copy.

---

## 5. Acceptance checklist (developer, verify before hand-off)

**Functional / data-contract**
- [ ] The `grid ... lg:grid-cols-4` with `MultiSelect`×5 + `MonthChips` is replaced by a
      row of `MultiSelectDropdown` (PIC, Bulan Deadline, Status, Platform, Content Pillar, Format).
- [ ] Same six state sets (`picSel`, `monthSel`, `statusSel`, `platformSel`, `pillarSel`,
      `formatSel`), same `filterRows(rows, {...})` call, same `filtered` variable, same
      derived metrics. `src/workspaces/sosmed.ts` is untouched.
- [ ] Default state = ALL dimensions fully selected → `filtered === rows` behavior,
      identical results to before.
- [ ] Toggling any option produces the exact same filtered set the old checkbox did
      (toggle → `filterRows`). No value added/removed beyond the selection change.
- [ ] All values from each option list are reachable (searchable + scrollable); a
      selected value missing from `options` still renders checked.
- [ ] `activeFilterCount` drives the `Filter Data (N aktif)` suffix exactly as before.
- [ ] Empty selection on any dimension no-ops (all rows pass that dimension) as today.
- [ ] Opening one dropdown closes any other (single-open invariant).

**Visual / interaction**
- [ ] Trigger shows label + hint + `Semua`/`N dipilih` chip + chevron; accent tint when a
      filter is active on that dimension.
- [ ] Popover: search input top, `Pilih Semua` row, scrollable (`max-h-[220px]`) checkbox
      list; search filters by case-insensitive substring; empty query → `Tidak ada opsi.`.
- [ ] `Escape` closes + refocuses; focus lands in search on open; outside click closes;
      focus ring on search input.
- [ ] Grid responsive: 6-col at `xl` (PIC spans 2), 2-col at `md`, single-column flex below.
- [ ] KPI/header/rest of page visually unchanged; no horizontal overflow introduced
      (`min-w-0`, `flex-wrap` on the row).

**Gates (all must pass)**
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npx vitest run` → all pre-existing tests stay green (existing filter contract tests
      must pass unchanged — they assert the `filterRows` result, which the redesign does
      not touch). If the fixture/tests exercised `MultiSelect`/`MonthChips` DOM directly,
      update them to the new component's selectors — do not weaken assertions.
- [ ] `npm run build` → succeeds
- [ ] `npm run lint` → no new errors
- [ ] Functional smoke on dev (`:3413`): open `/sosmed`, change each of the six filters,
      confirm every KPI/chart re-derives from `filtered` and matches the pre-redesign
      numbers for the same selection.
- [ ] `D:/digmark-v3` baseline remains clean (`git -C D:/digmark-v3 status --short` empty).
      No MASTER-sheet writes (`data/audit.log.jsonl` unchanged — this is read-only UI).

---

## 6. Do's and don'ts

**Do**
- Keep all logic changes inside `SosmedDashboard.tsx`; add only a local
  `MultiSelectDropdown`.
- Preserve `selected` as prop-driven; never hold a selection copy in the dropdown.
- Reuse existing design tokens and primitives.
- Keep copy Indonesian.

**Don't**
- Don't touch `sosmed.ts`, `page.tsx`, or shared components.
- Don't add a dependency, headless combobox lib, or charting lib.
- Don't change `filterRows` semantics, the six state sets, or the default-ALL behavior.
- Don't silently drop selected values absent from the current option list.
- Don't remove the `Filter Data (N aktif)` header or the card wrapper styling.