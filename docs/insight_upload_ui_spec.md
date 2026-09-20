# /insight — "Upload Insight" Card — UI Design Spec (NEO)

Feature: add an **Upload Insight** card to the Social Media Insight workspace
(`/insight`) so Ejak can upload Instagram/TikTok Insight export files (.csv,
.xlsx), preview the **normalized** rows, review validation + duplicate counts,
then confirm to import into the existing **INSIGHT** spreadsheet tab.

This is the NEO **UI specification**. Backend pipeline (parse → detect → map →
transform → validate → import) lives in `src/insight-import/` behind
`POST /api/insight/import`; this document defines only how the card renders and
behaves. REX implements to this spec; NEO later does a rendered review against it.

Non-goals: no new backend, no changes to shared components, no re-architecting
of the existing page. The card is a UI-layer addition.

---

## 1. Scope & hard constraints

- The dashboard already receives `rows` + `onRefresh` (`onRefresh={table.refetch}`).
  The card reuses `onRefresh` to reload the table after a successful import —
  it must NOT do a full browser reload.
- No write to Sheets happens at upload time. The card is a strict
  **two-step preview-then-confirm** flow in the client, mirrored by the API's
  `confirm` flag (`confirm=false` → preview+counts, no write; `confirm=true` →
  same pipeline then append).
- **Shared-component ban (CRITICAL):** do NOT modify any file under
  `src/components/**` (`Button`, `Field`'s `Select`/`TextInput`, `MetricCard`,
  `MetricRow`, `SectionHeader`, `ChartContainer`, `EmptyState`, `ErrorState`,
  `LoadingState`, `Divider`, `Topbar`, `Footer`, `WorkspaceNav`). The card is
  expressed entirely with these components as-is **plus** local wrapper divs and
  Tailwind utilities, and any new file lives in `src/workspaces/` only.
- UI copy is **Indonesian**. Copy strings are given verbatim in §9.
- Do not touch the read-only analytics render path. When no file is staged, the
  card must not affect any existing metric/filter/chart.

---

## 2. Placement on /insight & shell width

**Where:** inside `InsightDashboard.tsx`, in the **non-empty** (`else`) branch,
as the first section **after the filter card** (`<section …>Tanggal Awal / Tanggal
Akhir / Platform</section>`) and **before** the `DataQualityStrip` + KPI row.
Rationale: importing data is the page's only write action, so it is a primary,
discoverable affordance placed at the top of the content column, not buried after
charts. Because it is the tallest interactive unit when expanded, its **idle**
state is a compact card (title row + upload zone only), so it does not push KPIs
far down the fold when unused.

An explicit **collapse button** on the card header lets the operator fold it away;
the folded card is a single title row (`rounded-[16px] border border-border
bg-surface`). Placement elsewhere (e.g. after the Detail table) was rejected: an
import action at the very bottom reads as secondary and is easy to miss.

**Width:** the card must align to the page's existing single band. It is placed
inside the dashboard's existing shell, so it inherits:
`<main className="mx-auto w-full max-w-[1220px]">` (already wrapping all page
content). Do **not** add a nested narrowing `max-w` wrapper — reuse the one
container exactly as the rest of the page does (width parity, no wasted gutter).
Card body padding `p-5` inside.

**Headless concern:** the card is independent of `model.filtered` — it must
render identically whether or not data matches the active filters. It is gated
only on the dashboard's non-empty branch (i.e. the sheet has *any* data). If the
sheet is fully empty the page shows `ModuleHero` + `EmptyState` + Refresh; the
card is not rendered there (out of scope: enable importing into a brand-new
empty tab is unchanged behavior).

---

## 3. Reuse table (what to import, what to never touch)

| Need | Source | Notes |
|------|--------|-------|
| Page shell / shell width | `app/(workspaces)/insight/page.tsx` (`max-w-[1220px] px-4 pt-5 sm:px-6`) | **Edit allowed**: this route already renders the dashboard; no change required here for the card. |
| Dashboard canvas | `src/workspaces/InsightDashboard.tsx` | **Primary edit target** — add the card component + its idle/expand state here. |
| Refresh | `onRefresh` prop (already threaded) | Call after successful import. |
| Buttons | `@/components/ui/Button` (`variant="primary"|"secondary"|"destructive"|"ghost"`) | Use as-is; `disabled` while in-flight. |
| Dropdown / text | `Select`, `TextInput` from `@/components/ui/Field` | Use as-is for manual platform pick. |
| Numeric formatting | `formatCount` from `@/components/ui-common` | Row counts, progress totals. |
| Avail / N/A pattern | `metricAvailable` semantics, `text-muted` `N/A` | Validation "optional missing" shows `—`/muted, never errors. |
| Section title | Local wrapper using `SectionHeader`-style tokens (eyebrow + title + subtitle) | Match the page's `SectionHeader` look but as a flex row; do NOT modify `SectionHeader` itself. |
| Empty / loading / error | `EmptyState`, `LoadingState`, `ErrorState` semantics + tokens | Card-local equivalents using wrapper divs; do not force these shared components inside the card's live flow (they are page-level). |
| Tokens | `text-ink`, `text-muted`, `bg-surface`, `border-border`, `text-success`, `text-danger`, `text-warning`, `bg-surface-input` | Tailwind utilities; `var(--dm-shadow-xs)`, `var(--dm-shadow)`; radii `rounded-[16px]`/`rounded-[12px]`/`rounded-[20px]`; `backdrop-blur-[8px]`. |
| Palette | `PALETTE` (`src/components/ui-common.ts`) / `COLORS` (`src/config/constants.ts`) | Instagram `#E1306C`, TikTok `#010101` (reuse the existing `PLATFORM_COLORS` map in `InsightDashboard.tsx`). Success `#22A06B`, warn `#E8930C`, danger `#D64550`. |
| API | `postJson` from `@/lib/api-client` | POST `api/insight/import` for preview and confirm. |

**Never touch:** `src/components/**`, `src/server/**`, `src/config/constants.ts`,
`src/workspaces/insight.ts` (read-only derivations), `src/lib/csv.ts`.
Any new renderable file → `src/workspaces/` (e.g. a self-contained
`InsightUploadCard.tsx` imported by `InsightDashboard.tsx`). Keep pure client
helpers (file-read, payload build) in a testable `src/workspaces/insightUpload.ts`
mirroring the `waAdminForm.ts` pattern, with a `.test.tsx`.

---

## 4. Card states (state machine)

The card is a client state machine. States and transitions:

```
idle ───(files chosen)──▶ parsing/detecting ──▶ detected? ─▶ preview
                                                     └─▶ unknown → manual-pick → preview
preview ──(Import ✓)──▶ importing ──▶ result(success|failure)
preview ──(Cancel)──▶ idle
preview ──(back/remove file)──▶ idle
result ──(X close / "Upload lagi")──▶ idle
```

Each state renders one self-contained block (see §5). Transitions are gated by
buttons and never fire automatically except `parsing/detecting → preview`
(server round-trip) and `importing → result`.

---

## 5. Per-state rendering

### 5.1 Idle (no file staged) — compact card
- Card chrome: `className="rounded-[16px] border border-border bg-surface p-5 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]"` inside a wrapper `<section className="mb-6 mt-6">`.
- Header row: title `Upload Insight` (`text-[1.05rem] font-extrabold text-ink`)
  + subtitle `Upload ekspor data Insight (Instagram / TikTok) untuk impor ke sheet INSIGHT.`
  + a `▾/▸` collapse toggle on the right (collapsed by default **only** if the
  workspace already has data; expanded-by-default on first visit is acceptable —
  pick **collapsed by default** so it never pushes KPIs).
- **Upload zone** (the idle body): a dashed drop target
  `rounded-[16px] border-2 border-dashed border-border/70 bg-white/40 px-6 py-10
  text-center text-muted`. Content:
  - Icon `📥`
  - Primary line: `Drag & drop file di sini` (`text-[0.95rem] font-semibold text-ink`)
  - Or divider: `atau`
  - `Button variant="primary"` label `Pilih File` — opens the hidden
    `<input type="file" accept=".csv,.xlsx" multiple hidden>`.
  - Hint line `text-[0.78rem] text-muted`: `Format didukung: .csv, .xlsx · Platform: Instagram / TikTok · Data dinormalisasi sebelum impor.`
- Behaviors:
  - Click anywhere on the dashed zone also triggers the file picker (the zone is
    a `<label>`/button for the hidden input).
  - Drag-over highlights the border (`border-brand`) + `bg-brand/5`; drop/click
    enqueues files.
  - File validation client-side **before** any network call: reject extension
    not in `.csv/.xlsx` and files > 10 MB; show an inline `text-danger` line
    `File "{name}" tidak valid (bukan .csv/.xlsx atau lebih 10MB).` and keep the
    others.

### 5.2 Parsing / detecting (server round-trip for preview)
- Replace upload-zone body with an in-card loading block:
  `LoadingState-style` spinner div + `text-muted` line `Analisis file dan deteksi platform…`.
- Disable all buttons; block double-submit.

### 5.3 Detected platform → preview header
- After the API returns `platformDetected: true`, collapse the upload zone into a
  **selected-file row** + platform badge:
  - Each staged file renders as a compact chip: `📄 name.csv — 1.2 MB`
    (`text-[0.82rem] text-ink`) with a `✕` remove button (`Button variant="ghost"`
    small). Multi-file lists are stacked chips (`flex flex-wrap gap-2`).
  - **Platform status line**: `Platform dideteksi:` followed by a badge using the
    existing `PLATFORM_COLORS` hue
    (`inline-flex items-center gap-1.5 rounded-full bg-white/80 border
    border-[currentColor] …` with a colored dot + `Instagram`/`TikTok`).

### 5.4 Platform unknown → manual selection
- When `platformDetected: false`, replace the badge with an inline instruction +
  a `Select` from `@/components/ui/Field`:
  - `Select label="Platform" hint="Platform tidak dapat dideteksi otomatis. Pilih manual."`
    options `[{value:"", label:"— Pilih platform —"}, {value:"Instagram",
    label:"Instagram"}, {value:"TikTok", label:"TikTok"}]`.
  - The **Import button stays disabled** until a platform is chosen. Choosing a
    platform re-runs the preview (server call with explicit `platform`).
  - Copy: `Pilih manual: Instagram atau TikTok sebelum impor.`

### 5.5 Preview (normalized rows) — the core review surface
Laid out under a sub-title `Preview Data Normalisasi` + trailing row count
(`formatCount(min(served, N)) baris untuk impor`, `text-muted`) where `served` is the
rows actually displayed and `N` the full new-batch size — so it never overstates the
visible table.

**5.5.1 The normalized table** — shows **only the rows being imported** (the
merged batch, one row per date+platform), never the full dataset.
- Columns, exact order: `TANGGAL | PLATFORM | VIEW | REACH | CONTENT
  INTERACTION | PROFILE VISIT | LINK CLICKS | FOLLOWER`.
- Chrome, matched to the page's existing table cards:
  `overflow-x-auto rounded-[16px] border border-border bg-surface`,
  `min-w-[820px]` on the table, right-aligned numeric cells
  (`text-right tabular-nums text-ink`), zebra `bg-white/60`/`bg-white/80`.
- **Sticky, capped-height scroll area:** outer
  `max-h-[320px] overflow-y-auto overflow-x-auto` (so large batches scroll instead of
  stretching the page, and the `min-w-[820px]` table never clips on narrow shells);
  header `<thead>` `sticky top-0 bg-white/90` + `border-b border-divider`
  (matches the app's sticky-header convention). This keeps the column headers
  readable while scrolling a 1000-row batch.
- Header labels: `text-[0.74rem] font-semibold uppercase tracking-[0.02em]
  text-muted`. The six metric headers use the existing
  `INSIGHT_METRIC_LABELS` Indonesian labels already imported by the dashboard.
- Cell values: `TANGGAL` as the sheet's day-first `D/M/YYYY` (already normalized
  by the pipeline); `PLATFORM` verbatim `Instagram`/`TikTok`; numeric metrics via
  `formatCount` (values are normalized numbers, never raw strings). A **missing /
  NaN** metric renders a muted `—` (spec §3 N/A pattern), preserving the
  missing-vs-zero distinction — a real zero renders `0`.
- Row limit guard: when `served < totalRows` (the served `preview` slice is shorter
  than the new batch), show a muted note above the table based on the SAVED count:
  `- Menampilkan {served} baris pertama dari {totalRows}.` The card never hardcodes
  a `200` — it uses the rows actually returned by the backend (`MAX_PREVIEW=50`).

**5.5.2 Validation summary** (rendered as a 2-column compact checklist card
`rounded-[12px] border border-border bg-white/60 p-3`), before the table:
- **✓ detected** list (`text-success`, `✓` prefix): one line each for the fields
  that resolved — `Platform`, `Tanggal (data)`, `Views`,
  `Likes/Comments/Shares`, and each optional metric present
  (`Reach`, `Kunjungan Profil`, `Klik Link`, `Follower`).
- **⚠ missing-optional** list (`text-warning`, `⚠` prefix): the optional metrics
  the file did not provide — `Reach tidak muncul`, `Klik Link tidak muncul`,
  etc. in muted/warning tone. These are informational and never block.
- **Blocking state:** if `validation.blocking` is true (critical fields —
  `TANGGAL` or the primary `VIEW`/CONTENT-INTERACTION source — could not be
  identified), render a `text-danger` banner:
  `Import belum — Kolom kunjukan tidak dapat identifikasi (Tanggal atau metrik views konten).`
  and **disable** the Import buttons entirely (no partial import, matching the
  transaction rule).

**5.5.3 Duplicate summary + choice** (a dedicated action band):
- Line `text-ink font-semibold`: `Baris baru: N` (`text-success`) ·
  `Duplikasi potensial: M` (`text-warning` when M>0, `text-muted` when M=0).
- Sub-hint `text-muted`: `Duplikasi diidentifikasi berdasarkan tanggal + platform (baris yang
  sudah ada di sheet INSIGHT).`
- **Choice** — three actions (only when M > 0; when M = 0 show a single primary
  Import):
  1. `Button variant="primary"` — `Impor hanya baru` (sends `confirm=true` with
     `mode: "new"`).
  2. `Button variant="secondary"` — `Impor semua` (sends `confirm=true` with
     `mode: "all"`).
  3. `Button variant="ghost"` — `Batal`.
  When `M = 0`, collapse to one `Button variant="primary"` `Impor ke Insight`.
- When `M > 0`, a muted notice under the action band tells the operator that
  `Impor semua` imports duplicate rows **not shown** in the preview table
  (the preview is built from `newRows` only):
  `Impor semua juga impor {M} baris duplikasi (tidak tampil di preview).`
- `Button variant="secondary"` `Batal` also always present (resets to idle).

**5.5.4 Primary action buttons** (duplicates handled above): `Impor ke Insight`
(primary, final confirm) + `Batal`. Both disabled while a preview/server call is
in flight.

### 5.6 Importing (in-flight)
- Replace Ctrl area with a progress block (no page reload):
  - Spinner + `text-ink font-semibold`: `Impor sedang proses…`
  - Optional determinate progress when available from the API:
    `Menyimpan baris X dari Y…` (`text-muted`); else indeterminate only.
  - Both Import buttons `disabled`; `Batal` becomes `disabled` too after the
    confirm round-trip begins (partially-written import must not be aborted).

### 5.7 Result banner (terminal)
- Rendered in-card (`rounded-[12px] p-3`), replacing the preview body; card stays
  mounted so `onRefresh` can run behind it.
- **Success** — `bg-success/10 border border-success/30 text-ink`, `✓` icon:
  - Heading `text-success font-bold`: `Impor berhasil`
  - Summary line `text-[0.84rem] text-ink`:
    `Platform: Instagram · File: informa.csv · Baris proses: 12 · Baris impor: 10 · Duplikasi dilewati: 2 · Warning: 0`
  - Optional per-warning sub-list (`text-muted`): any `warnings[]` strings and
    per-file totals if multiple files were uploaded.
  - Actions: `Button variant="primary"` `Upload lagi` (→ **expanded** idle so the
    drop zone is ready for the next upload) and `Batal` (→ expanded idle too). Both
    reset the card to idle; the card calls `onRefresh()` immediately on success so
    the Detail Data table + KPIs reflect the new rows without a reload.
- **Failure** — `bg-danger/10 border border-danger/30`:
  - Heading `text-danger font-bold`: `Import belum — Tidak ada data yang ditulis
    ke spreadsheet.`
  - Reason `text-[0.9rem] text-ink`: `Alasan: {humanError}` where `humanError`
    is the backend's Indonesian, human-readable message. **No raw tracebacks.**
  - `Kanalis lagi` (retry, keeps the preview, re-runs confirm) and `Batal`
    (→ expanded idle).

---

## 6. API contract the card consumes

`postJson` → `POST /api/insight/import` (editor role), body per the brief:
`{ files: [{ name, contentB64 }], platform?, confirm, mode: "new"|"all" }`.

- **Preview** (`confirm=false`): returns the merged/staged view + counts. The card keys
  on this exact shape (implemented backend contract):
  ```json
  {
    "ok": true,
    "platform": "Instagram",
    "platformDetected": true,
    "rowCount": 120,
    "newRows": [{ "TANGGAL": "12/9/2026", "PLATFORM": "Instagram", "VIEW": 1200,
                  "REACH": 900, "CONTENT INTERACTION": 140, "PROFILE VISIT": 60,
                  "LINK CLICKS": 10, "FOLLOWER": 15 }],
    "potentialDuplicates": [...],
    "preview": [...],   // newRows.slice(0, MAX_PREVIEW=50) — served for display
    "validation": { "ok": true, "items": [...], "blockReasons": [] },
    "warnings": []
  }
  ```
  `rowCount` = `newRows.length` (full new-batch size); `preview` is the served,
  capped slice (≤50). The card renders ONLY `preview` and bases the cap note on
  `preview.length < rowCount`.
- **Confirm** (`confirm=true`, `mode:"new"|"all"`): returns a result summary —
  `{ ok: true, platform, rowsProcessed, rowsImported, duplicatesSkipped, warnings[] }`.
- **Error / blocking**: a blocking validation returns
  `{ ok:false, platform, rowCount, blockReasons[], validation, platformDetected }`
  (400) → the card shows the danger banner and disables Import; a genuine error
  returns `{ ok:false, error:{ code, message, status } }`; network/timeout → typed
  `InsightConnectError` mapped to the connectivity copy.
- The handwriting rule: values arrive already **normalized** (numbers as real
  numbers, dates day-first `D/M/YYYY`) — the card only displays, never re-parses.

---

## 7. Empty / error states (all human-readable, no tracebacks)

| Condition | Card behavior |
|-----------|---------------|
| No file selected | Idle §5.1. |
| Unsupported / oversized file | Inline `text-danger` per-file message; blockable, others proceed. |
| Platform unknown | §5.4 manual `Select`; import gated until chosen. |
| Validation blocking (no TANGGAL / no primary metric) | `text-danger` banner, Import disabled (§5.5.2). |
| Missing optional metrics | `⚠` warning lines, informational, non-blocking. |
| Import fail / Sheets / permission / timeout | Failure banner §5.7 with plain reason; retry keeps preview. |
| Server/network down | Same failure banner with connectivity copy. |

No raw exception text, stack trace, or JSON dump is ever shown.

---

## 8. Accessibility & guardrails (collect from the page conventions)

- All interactive affordances are real `<button>`/`<label>`/`<select>` elements
  (the whole dashed zone is a label/button for the hidden file input).
- Focusable elements keep the brand focus ring (Button already ships it).
- Disable + double-submit guard on every network action (preview, manual re-pick,
  both confirms); spinner shown while in-flight.
- Distinct `role`/`aria-label` per state region where helpful:
  `aria-busy` on the card while any server call is in flight.
- Upload NEVER overwrites/deletes existing rows: every confirmed import is an
  append (handled by backend; the card only ever sends `confirm=true` once, and
  `mode: "new"|"all"` is the only duplicate toggle the operator controls).
- `onRefresh` is called **once**, after a successful import, never per-file.

---

## 9. Copy (Indonesian, verbatim)

| Key | String |
|-----|--------|
| Card title | `Upload Insight` |
| Card subtitle | `Upload ekspor data Insight (Instagram / TikTok) untuk impor ke sheet INSIGHT.` |
| Drop zone primary | `Drag & drop file di sini` |
| Drop zone or | `atau` |
| Drop zone button | `Pilih File` |
| Drop hint | `Format didukung: .csv, .xlsx · Platform: Instagram / TikTok · Data dinormalisasi sebelum impor.` |
| Bad file inline | `File "{name}" tidak valid (bukan .csv/.xlsx atau lebih 10MB).` |
| Parsing | `Analisis file dan deteksi platform…` |
| Detected | `Platform dideteksi:` |
| Unknown | `Pilih manual: Instagram atau TikTok sebelum impor.` |
| Select label | `Platform` |
| Select placeholder | `— Pilih platform —` |
| Select hint | `Platform tidak dapat dideteksi otomatis. Pilih manual.` |
| Preview title | `Preview Data Normalisasi` |
| Row count | `{n} baris untuk impor` (n = `min(served, newCount)`) |
| Cap note | `- Menampilkan {served} baris pertama dari {total}.` (shown when served < total) |
| Duplicates line | `Baris baru: {N} · Duplikasi potensial: {M}` |
| Dupe hint | `Duplikasi diidentifikasi berdasarkan tanggal + platform (baris yang sudah ada di sheet INSIGHT).` |
| Dupe notice (F4) | `Impor semua juga impor {M} baris duplikasi (tidak tampil di preview).` |
| Dup choices | `Impor hanya baru` · `Impor semua` · `Impor ke Insight` · `Batal` |
| Importing | `Impor sedang proses…` · `Menyimpan baris {x} dari {y}…` |
| Success heading | `Impor berhasil` |
| Success summary | `Platform: {p} · File: {f} · Baris proses: {a} · Baris impor: {b} · Duplikasi dilewati: {c} · Warning: {d}` |
| Upload again | `Upload lagi` (→ expanded idle) |
| Failure heading | `Import belum — Tidak ada data yang ditulis ke spreadsheet.` |
| Retry | `Kanalis lagi` |
| Connectivity | `Tidak bisa terhubung ke server. Kanalis lagi nanti.` |
| Validation ✓ prefix | `✓` |
| Validation ⚠ prefix | `⚠` |

---

## 10. Acceptance checklist (read by REX at build and by NEO at rendered review)

1. **Idle**: empty card shows the dashed drop zone + `Pilih File`; collapses to a
   single title row and does not shift KPI/metrics layout; picking a valid
   `.csv`/`.xlsx` shows the file chip + detected platform badge.
2. **Manual fallback**: when detection is uncertain, a `Platform` `Select` appears
   and Import stays disabled until Instagram/TikTok is chosen; choosing re-runs
   the preview.
3. **Preview correctness**: the normalized table shows ONLY the merged batch
   (one row per date+platform), 8 columns in exact order, sticky `bg-white/90`
   header under a capped `max-h-[320px]` scroll, numbers right-aligned via
   `formatCount`; when served rows < totalRows the cap note shows the real served
   count.
4. **Validation + duplicates**: `✓` detected and `⚠` missing-optional lists
   render as specified; missing optional never blocks; `Baris baru: N /
   Duplikasi potensial: M` shows the three-way choice when M>0 (Import-new-only /
   Import-all / Cancel) and a single Import when M=0; a blocking critical-field
   failure disables Import and shows the `text-danger` banner.
5. **Two-step write + result**: uploading alone does no Sheets write
   (`data/audit.log.jsonl` shows no MASTER write before confirm); `Impor ke
   Insight` shows the in-flight progress with buttons disabled, then the success
   banner (platform/file/rows/imported/skipped/warnings), calls `onRefresh()`,
   and Collapse/Upload-again resets; failure shows the human-readable banner with
   no traceback and retry keeps the preview. All four gates pass
   (`npx tsc --noEmit`, `npx vitest run`, `npm run build`, `npm run lint`) with no
   new errors and no changes under `src/components/**`.