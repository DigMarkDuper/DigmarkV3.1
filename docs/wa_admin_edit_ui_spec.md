# Edit Data WA Admin — UI/Design Implementation Spec

**Feature:** "Edit Data WA Admin" — edit a single EXISTING row in the live **WA ADMIN REPORT** spreadsheet from the `/wa-admin` page.
**Design author:** @Neo (Designer)
**Build specialist:** REX (implements from this spec verbatim)
**Workspace:** Digmark V3.1 Next.js 16 — `D:/digmarkv3.1` (dev :3413, prod :3415)
**Scope of this doc:** design/direction ONLY. No application code lives here; REX writes the code. Deviations must be flagged back to @Neo before landing.

> **Read-along order for REX:** this spec reuses three live files first — read
> `src/components/ops/WaAdminDataForm.tsx`, `src/workspaces/waAdminForm.ts`, and the
> header-action block of `src/workspaces/WaAdminDashboard.tsx` (lines ~861–878)
> before touching anything, then return here.

---

## 1. Feature goals

Complement the existing **"+ Tambah Data"** append modal (`WaAdminDataForm`) with an
**"Edit Data"** edit modal. The operator can:

1. Open a **search modal**, pick a criterion and enter a free-text value, hit **Cari**.
2. See the **matching rows** in a results list (when more than one, pick which record to edit).
3. Edit a **12-field form** pre-filled from the selected row's EXISTING cell values.
4. **Simpan Perubahan** → confirmation dialog → on confirm, write back to the **exact original spreadsheet row**, then success toast + auto-refresh.

### Non-negotiables (data integrity is priority #1)

- **NEVER rely on `Nama` (or anything non-unique) as the identity of a row.** The true
  row identity is the **server-provided `__rowIndex`** threaded from GET
  `/api/tables/wa_admin` rows, carried through the search results and into every PATCH.
  Array position, array index in filtered arrays, and any field value are **never**
  used as the row handle.
- Editing must **update the EXISTING row in place**: no duplicate row, no new record,
  no accidental write to another lead's row.
- Only **changed fields are written** (a `diff` against the pre-fill). Fields the user
  did not touch are left byte-for-byte untouched on the server.
- **No new Google Sheets connection, no new schema, no new database/table.** The edit
  reuses the existing, fully-wired backend: `PATCH /api/tables/wa_admin`
  (`updateCellController`), one cell per call with `{ rowIndex, column, value }`, via
  the existing `patchJson` helper.

---

## 2. Component architecture

Mirror the existing separation exactly as `WaAdminDataForm.tsx` + `waAdminForm.ts` do:
**thin client component wiring state + API**, **pure unit-testable module** holding all
predicates, mappings, diff, and validation.

### 2.1 Files to create

| File | Kind | Responsibility |
|------|------|----------------|
| `src/components/ops/WaAdminEditData.tsx` | `"use client"` component | Header button + all modal screens, state machine, API calls (`patchJson`), toasts. Imports pure helpers from `waAdminEdit.ts`. |
| `src/workspaces/waAdminEdit.ts` | PURE module (no I/O, no React) | Search predicate, row→form-value mapping, changed-fields diff, edit validation. Unit-tested in `waAdminEdit.test.ts`. |

### 2.2 File to modify (one line only)

- `src/workspaces/WaAdminDashboard.tsx` — import `WaAdminEditData` and render it in the
  header-action row next to the existing `WaAdminDataForm` (see §4).

### 2.3 Sidecar unit test

- `src/workspaces/waAdminEdit.test.ts` — vitest coverage of the pure functions (follow
  the convention in `src/workspaces/waAdminForm.test.ts`).

### 2.4 Constraint — do NOT modify shared components

Do NOT touch `src/components/ui/*`, `src/components/grid/DataTable.tsx`, `Topbar`,
`Footer`, `WorkspaceNav`, `src/lib/api-client.ts`, `src/lib/validation.ts`. Reuse them
as-is. The backend (`tableControllers`, source adapter, Sheets layer) is **already
complete** for PATCH — do not design or build any new backend.

### 2.5 Server-renderability / client boundary

- `WaAdminEditData.tsx` is the ONLY client file. Everything it renders lives inside it
  (a single `"use client"` boundary).
- Keep the page/route **server-renderable**: no `useSearchParams` in any server
  component, no client-only reads at render time that break SSR.
- The pure module `src/workspaces/waAdminEdit.ts` stays **server-safe** (no browser
  globals) so it can be unit-tested under node and reused by any renderer.

---

## 3. Data model & identity

### 3.1 Row type

Rows are the normalized `Row` DTOs from GET `/api/tables/wa_admin`
(`type Row = Record<string, unknown>`, see `src/server/adapter/source.ts`). The server
includes a **numeric `__rowIndex`** per row — the 0-based index into the ORIGINAL
spreadsheet rows (the same index the PATCH backend's `assertRowIndex` expects). It is
the only row handle.

> If REX finds the live GET response does NOT currently include `__rowIndex`, this is a
> **blocker to raise back to @Neo** — do not silently derive an index from array
> position. The existing `sosmed` workspace already carves the same "original rowIndex
> survives filtering" rule; the WA admin GET must expose the same handle for edit
> integrity.

### 3.2 Field set & column mapping

Form field name → exact schema header. Reuse `WA_ADMIN_PAYLOAD_KEYS` from
`waAdminForm.ts` **as-is** (the KEYS hold a literal `\n\n` in the `Status` header —
never "repair" it). UI label for the Kategori field is **"Kategori"** (NOT "Kebutuhan").

| Field | UI label | Control | Column (payload key) | Notes |
|-------|----------|---------|----------------------|-------|
| `tanggalMasuk` | Tanggal Masuk | `<input type="date">` | `Tanggal Masuk` | required |
| `noHp` | No Hp | `<input type="text">` | `No Hp` | required; normalized 62-form; **preserve format** of stored value into pre-fill |
| `jamChatMasuk` | Jam Chat Masuk | `<input type="time">` → stored `HH.MM` | `Jam Chat Masuk` | required; `timeHmToDotted` |
| `pic` | PIC | dropdown | `PIC` | required; live domain then fallback |
| `nama` | Nama | `<input type="text">` | `Nama` | required |
| `asal` | Asal | `<input type="text">` | `Asal` | non-required |
| `sumber` | Sumber | dropdown | `Sumber (Ads/Organik/Sales)` | required; live domain first then fallback |
| `pertanyaan` | Pertanyaan | `<textarea>` | `Pertanyaan` | non-required |
| `kategori` | Kategori | dropdown | `Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)` | required; live domain first then fallback |
| `mekariTag` | Mekari Tag | dropdown from `MEKARI_TAG_OPTIONS` | `Mekari Tag` | optional |
| `status` | Status | dropdown | `Status \n\n(...)` | required; live domain first then fallback |
| `keteranganAdmin` | Keterangan Admin | `<textarea>` | `Keterangan Admin` | non-required |

- **Dropdown vs text:** dropdowns for the BOUNDED domains (PIC, Sumber, Kategori,
  Status, Mekari Tag); free text for the free fields (Nama, Asal, No Hp) and the two
  textareas (Pertanyaan, Keterangan Admin). Date/time keep native pickers.
- **Dropdown value-domain rule:** **live distinct values first, verified fallback
  second** — identical to the existing `DROPDOWNS` + `distinctCellValues(...fallback)`
  pattern in `WaAdminDataForm.tsx` and the domains exported from `waAdminForm.ts`:
  `PIC_FALLBACK`, `SUMBER_FALLBACK`, `KATEGORI_FALLBACK`, `STATUS_FALLBACK`,
  `MEKARI_TAG_OPTIONS`. Import and reuse these EXACT lists — do not re-declare them.
- **Pre-fill:** every field starts at the selected row's stored value `(row[column])`,
  so the edit form shows the CURRENT live state, not blanks.

---

## 4. Header button placement

In `WaAdminDashboard.tsx`, header-action row (now at lines ~872–877):

```tsx
<div className="flex flex-wrap items-center gap-3">
  <WaAdminDataForm rows={rows} onRefresh={onRefresh} />
  <WaAdminEditData rows={rows} onRefresh={onRefresh} />   {/* NEW — this line */}
  <Button variant="secondary" onClick={onRefresh} className="shrink-0">
    🔄 Refresh Data
  </Button>
</div>
```

- **Order:** `+ Tambah Data` (primary) → `Edit Data` (secondary) → `🔄 Refresh Data` (secondary).
- **Trigger button visual:** `variant="secondary"`, label **"✏️ Edit Data"**,
  `shrink-0 px-4 py-2 text-[0.92rem]` (same token set as the existing secondary Refresh
  button so the three sit on one visual rail).

---

## 5. Modal chrome & shared primitives (REUSE)

Reuse the ENTIRE modal chrome, field primitives, and copy conventions from
`WaAdminDataForm.tsx` — do not invent new ones.

### 5.1 Modal chrome (search, results, edit, confirmation all use it)

- Outer handler `div` `role="dialog"`, `aria-modal="true"`, `data-hermes-no-print`,
  `className="z-[70]"`, `onKeyDown` Escape → close (disabled while saving).
- Backdrop: `fixed inset-0 bg-ink/40 backdrop-blur-sm` onClick close.
- Panel: `fixed left-1/2 top-1/2 z-10 flex max-h-[92vh] w-[96%] max-w-2xl
  -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] border
  border-border bg-surface shadow-[var(--dm-shadow)]`.
- Header: `flex flex-wrap items-center gap-3 border-b border-divider px-5 py-3.5`, with
  a brand-tinted icon tile (`h-8 w-8 rounded-[10px] bg-brand/10`), an `<h3>` title, and
  a `<Button variant="ghost">✕</Button>` close at `ml-auto`.
- Body: `min-h-0 flex-1 overflow-y-auto px-5 py-4`.

### 5.2 Field primitives — reuse the local `FIELD_BASE` + `FIELD_ERROR` + `FieldWrap` helpers

These live in `WaAdminDataForm.tsx`: `FIELD_BASE` (identical tokens to the shared
`FIELD_BASE` in `@/components/ui/Field`), `FIELD_ERROR` (red border), `ErrText`,
`FieldWrap`, `TextField` (with `type="text"|"date"|"time"` and `minH` → textarea rows=3),
`SelectField` (local `appearance-none pr-9` + `▾` caret). The edit form **copies these
primitives verbatim** (a local copy is allowed and preferred — the same rationale as the
existing component: per-field red error + date/time types). Do NOT import the shared
`TextInput` for error/date/time reasons.

### 5.3 Buttons

`Button` from `@/components/ui/Button`, variants `primary` / `secondary` / `ghost`.

---

## 6. UX flow — screens & exact copy

State machine living in `WaAdminEditData.tsx`:
`screens: "closed" → "search" → "results" → "edit" → "confirm" → ("success" toast | error) → "closed" + refresh`.

### 6.0 Trigger button
Label "✏️ Edit Data" (§4). `onClick` resets search state (clear results/pre-fill) and opens `screen="search"`.

### 6.1 Screen SEARCH — "Cari Data"
Title: **"Cari Data WA Admin"** · icon: `🔍`
Helper line: `Cari baris yang ingin Anda ubah. Data dicocokkan per kolom; pilihlah baris yang sesuai dari hasil.`

Layout (single row, responsive, wrapped in a `<form onSubmit>`):
- **Kriteria** dropdown (`SelectField`): options — `No Hp` (DEFAULT, first),
  `Tanggal Masuk`, `Jam Chat Masuk`, `PIC`, `Nama`, `Asal`, `Sumber`, `Kategori`,
  `Mekari Tag`, `Status` — in that user-friendly label order (mapped to the schema column
  for the predicate).
- **Kata kunci** free text (`TextField`), placeholder: `Ketik kata kunci…`.
- **[Cari]** primary button.

Behavior:
- Default criterion `No Hp` (promoted: top of list, preselected).
- `Cari` runs a **contains, case-insensitive, whitespace-trimmed** match on the chosen
  criterion's source column across ALL rows (pre-junk, pre-month-filter — the operator
  searches the WHOLE table, not the filtered view).
- Enter in the free field also submits (the `<form onSubmit>`).
- Empty keyword → inline validation under the field: `Masukkan kata kunci dahulu.`

### 6.2 Screen RESULTS — "Hasil Pencarian"
Title: **"Hasil Pencarian"** · icon: `📋`
Helper line (when results exist): `Ditemukan {n} baris yang cocok dengan "{query}". Pilih baris untuk diedit.`
Empty-state copy: `Tidak ada data yang cocok dengan "{query}". Coba kriteria atau kata kunci lain.` + **[Cari Lagi]** secondary (back to search, keep criteria).

Each result row (a selectable card):
- `role="button"` `tabIndex={0}`, `onKeyDown` Enter/Space → select.
- Displays, left-aligned, up to ~4 distinguishing cells: **Tanggal Masuk · Nama · No Hp · Asal** (fall back to `—` for empties). If `Asal` is empty, show `Sumber` or `PIC` in its place.
- **Right-aligned status pill**: the resolved `Status` value.
- on `onClick` → `screen="edit"`, seed `rowIndex = row.__rowIndex`,
  `editValues = rowToFormValue(row)`. Never auto-edit on a single match — always show it
  as one selectable row (explicit choice).

> **Data-integrity guard — row identity:** results list key is `row.__rowIndex`
> (`key={row.__rowIndex}`), NEVER index-in-array. Selection stores `__rowIndex`. Two rows
> can share identical Nama but MUST remain distinct selectable rows.

### 6.3 Screen EDIT — "Ubah Data WA Admin"
Title: **"Ubah Data WA Admin"** · icon: `✏️`
Read-only identity strip (muted chip) under the title: `Baris #{__rowIndex + 1} · WA ADMIN REPORT`.
Helper line: `Ubah nilai yang ingin diubah. Kolom bertanda * wajib diisi. Nilai yang tidak diubah tidak akan dikirim.`

Form: the 12-field grid from §3.2, two-column `md:grid-cols-2` (same as Tambah Data).
Pre-fill = selected row, converted:
- `tanggalMasuk`: stored string → if parseable, `YYYY-MM-DD` for the date picker.
- `noHp`: **preserve the stored format** into the pre-fill verbatim (do NOT re-normalize
  into view); only on SAVE is it re-normalized via `normalizePhone`.
- `jamChatMasuk`: stored `HH.MM` → `HH:MM` for the time picker.
- dropdowns: the stored value MUST be present. If it is NOT in the live-distinct set or
  fallback, **unconditionally keep it as an extra `<option>`** (§7) so a legacy value can
  be saved back unchanged — never silently drop it.
- textareas/text: verbatim stored string; `""` → empty with placeholder `(opsional)`.

Bottom action bar: **[Batal]** `secondary` → back to results (discard edits) ·
**[Simpan Perubahan]** `primary` → validate then `screen="confirm"`.

### 6.4 Screen CONFIRM — "Konfirmasi Perubahan"
Reuse the same modal chrome as a compact dialog.
Content:
- Title: **"Konfirmasi Perubahan"** · icon: `⚠️`
- Body text (verbatim): `Apakah Anda yakin ingin menyimpan perubahan data ini?`
- Fine-grained line: `Perubahan akan diterapkan pada baris #{__rowIndex + 1} dari tabel WA ADMIN REPORT.`
- Buttons: **[Batal]** `secondary` → back to edit (keep edits). **[Simpan Perubahan]** `primary` → run save.

### 6.5 Save flow + toasts
On confirm [`Simpan Perubahan`]:
1. Compute `changedFields = changedFieldValues(preFill, currentValues)` (§8.3).
2. If `changedFields` is **empty** → close with the SUCCESS toast below and NO fetch
   (nothing changed — avoid an unnecessary PATCH). Treat as success, auto-refresh.
3. Else `saving=true`, disable both buttons, then **sequentially**:
   `await patchJson("/api/tables/wa_admin", { rowIndex, column, value })` for **each**
   changed field (one cell per call — matches the PATCH contract; a 400 on any call fails
   loudly). `noHp` value = `normalizePhone(...)`, `jamChatMasuk` = `timeHmToDotted(...)`.
4. On ALL succeed: close all screens, `onRefresh?.()`, SUCCESS toast.
5. On ANY failure: keep the edit screen open (values intact for retry), ERROR toast,
   `saving=false`.

**Success toast** — reuse the exact pattern (fixed bottom-right `z-[80]`, `role="status"`, ✓ icon + bold text):
`Data berhasil diperbarui.` (verbatim).

**Error toast** — same chrome, `text-danger`, `❌` icon:
`Data gagal diperbarui. Silakan coba lagi.` (verbatim).

**Console:** log fine-grained error details (`err`, `status`, `code`, `message`, the
failed `{rowIndex, column, value}` sans sensitive data) to `console.error` ONLY.
**Never log credentials.**

---

## 7. Edge cases & validation

| Case | Behavior |
|------|----------|
| Empty keyword on SEARCH | inline `Masukkan kata kunci dahulu.` under field; block submit. |
| No matches | empty-state copy, offer **[Cari Lagi]**. |
| Multiple matches | results list; operator picks. Never auto-edit on single match (still show it as one selectable row — explicit choice). |
| Dropdown value missing from options | **Retain stored value as an extra `<option>`** so legacy/adhoc values round-trip; stored empty renders `— Pilih —`. |
| Required field emptied on EDIT | `validateWaAdminEdit` → per-field inline error, block save; error copy mirrors Tambah Data (e.g. `Nama wajib diisi.`). |
| NoHp invalid on EDIT | `Nomor HP tidak valid.` When valid, surface the normalized `62` form back into the field (same as Tambah Data). |
| Nothing changed | close + success + refresh, NO PATCH fired. |
| Another operator changed the sheet meanwhile | PATCH writes the SAME `__rowIndex` cell definitively (row-address, last-writer-wins). Log the row only. |
| PATCH 400/500 | keep edits, ERROR toast, `console.error` fine-grained. |
| Malformed stored date/time | pre-fill picker left empty; user must re-enter (validation enforces). |

---

## 8. Pure module — `src/workspaces/waAdminEdit.ts` (REX spec)

All pure / unit-testable. Reuse `WA_ADMIN_PAYLOAD_KEYS`, `timeHmToDotted`,
`normalizePhone`, `distinctCellValues`, and the `*_FALLBACK` / `MEKARI_TAG_OPTIONS` lists
imported from `waAdminForm.ts` — do NOT re-declare them.

### 8.1 Search predicate
`export function searchRows(rows: Row[], col: string, keyword: string): Row[]`
- `col` = the schema column for the selected criterion.
- Match: `String(row[col] ?? "").trim().toLowerCase().includes(keyword.trim().toLowerCase())`.
- Returns the matched rows **with `__rowIndex` attached/carried** (if the GET did not
  attach it, REX raises the §3.1 blocker). Empty `keyword.trim()` → `[]` (caller enforces
  the "Masukkan..." message).
- Order: source order preserved.

### 8.2 Row → form values
`export function rowToFormValue(row: Row): WaAdminEditFormValues` (same 12-field shape as `WaAdminFormValues`)
- Maps each schema column → field string (§3.2), converting date to `YYYY-MM-DD` and
  `HH.MM` → `HH:MM` for pickers; free fields verbatim; empty → `""`.

### 8.3 Changed-fields diff
`export function changedFieldValues(preFill, current): { column: string; value: string }[]`
- For each of the 12 fields: compare **trimmed-normalized** current vs pre-fill (ignore
  trailing spaces); a difference → `{ column: KEYS[field], value: fmt(current[field]) }`
  where `noHp → normalizePhone`, `jamChatMasuk → timeHmToDotted`, all others `trim()`.
- Returns `[]` when nothing changed (caller skips PATCH).

### 8.4 Edit validation
`export function validateWaAdminEdit(values): WaAdminFieldErrors`
- Same required set as Tambah Data (`REQUIRED_FIELDS`) + NoHp via `normalizePhone`, Jam
  non-empty. Error copy mirrors `waAdminForm.ts`.

---

## 9. Accessibility & states

- Every screen: `role="dialog"` + `aria-modal="true"` + `aria-label` (screen title);
  non-modal state wrapped in `<form>` where a primary action submits.
- All focusables get the brand focus ring (Button `focus-visible`; TextField/SelectField
  inputs rely on `focus:ring-2 focus:ring-brand`).
- `saving=true` → freeze close, Batal, and primary buttons; primary label → `Menyimpan…`.
- Reduce-motion respected via existing `motion-reduce` utilities (no new JS animation).

---

## 10. Acceptance checklist (maps to the 21 acceptance tests in the brief)

| # | Criterion | How verified |
|---|-----------|--------------|
| 1 | Header shows `+ Tambah Data`, `Edit Data`, `🔄 Refresh Data` side-by-side in that order | static render / DOM assert |
| 2 | `Edit Data` opens SEARCH with `No Hp` preselected | open + DOM label assert |
| 3 | Criterion dropdown lists all 10 criteria, `No Hp` first | DOM options assert |
| 4 | SEARCH matches contains, case-insensitive, trimmed | `searchRows` unit test |
| 5 | Empty keyword blocks with `Masukkan kata kunci dahulu.` | unit + DOM |
| 6 | No matches → empty-state copy + `[Cari Lagi]` | DOM |
| 7 | Multiple matches → all shown; each row `key={__rowIndex}`; same-Nama rows stay distinct | DOM + unit |
| 8 | Result row shows `TanggalMasuk · Nama · NoHp · Asal(⊥fallback)` + Status pill | DOM |
| 9 | Selecting a row opens EDIT pre-filled from that EXACT row (`__rowIndex` threaded) | unit `rowToFormValue` + DOM |
| 10 | 12 fields render in §3.2 order/types | DOM |
| 11 | Dropdowns populated live-distinct-then-fallback; `MEKARI_TAG_OPTIONS` fixed | unit + DOM |
| 12 | Legacy dropdown value retained as extra `<option>` | DOM |
| 13 | EDIT validation blocks empty required + invalid NoHp with per-field errors | `validateWaAdminEdit` unit + DOM |
| 14 | `[Simpan Perubahan]` opens CONFIRM with exact copy | DOM text assert |
| 15 | CONFIRM `[Batal]` returns to edit, form unchanged | DOM + state assert |
| 16 | Confirm → PATCH fired **once per changed field** with `{rowIndex:.__rowIndex,column,value}`; nothing PATCHed when nothing changed | mock `patchJson` assert count + bodies |
| 17 | NoHp sent `62`-form; Jam sent `HH.MM` | unit `changedFieldValues` + mock body assert |
| 18 | Success → close modal, SUCCESS toast `Data berhasil diperbarui.` AND `onRefresh` called | DOM toast + spy |
| 19 | Error → modal stays, ERROR toast `Data gagal diperbarui. Silakan coba lagi.` | mock rejection + DOM |
| 20 | `saving=true` disables close/Batal/primary, label `Menyimpan…` | DOM during pending promise |
| 21 | No duplicate/no new row/no wrong-row write: every PATCH address = the user-elected `__rowIndex` | test on `WaAdminEditData` (all `changedFieldValues` outputs + save loop share one `__rowIndex`) |

**Integrity test (mandatory, mirrors sosmed):** PATCH `rowIndex` must equal the ORIGINAL
spreadsheet row, never the filtered/result-array position (`searchRows` must carry
`__rowIndex`; a test asserts two same-Nama matches produce distinct PATCH `rowIndex`es).

---

## 11. Out of scope / no-new-backend note

- **NO new Google Sheets connection, schema, database, or table** is created. The write
  path is `PATCH /api/tables/wa_admin` (`updateCellController` → `updateCell` →
  `updateCellInSheet`) and already exists.
- **NO modification** to `src/components/ui/*`, `DataTable.tsx`, Topbar/Footer/Nav, or the backend.
- The only existing-file change is the single header line in `WaAdminDashboard.tsx` (§4).
- Dedup in this feature means "edit the exact existing row" via `__rowIndex`; it does
  NOT add global duplicate detection or row-tagging.

---

## 12. Upgrade — Multi-criteria SEARCH (up to 3 criteria, AND)

**Author:** @Neo · **Status:** approved direction · **Scope:** SEARCH screen (§6.1) and
the pure search predicate (§8.1) ONLY. The results screen (§6.2), edit form (§6.3),
confirm (§6.4), save/PATCH flow (§6.5), identity threading (`__rowIndex`), the
`SEARCH_CRITERIA` list, and `waAdminForm.ts` are all UNTOUCHED. No shared-component,
no `/wa-admin` page.tsx, no backend change.

This section **overrides** §6.1 (Layout/Behavior) and §8.1 (`searchRows`) for the SEARCH
step only; everything else in this spec stands as-is.

### 12.1 What changes

The single criterion row (1 dropdown + 1 keyword + Cari) becomes **three stacked
criterion rows**. Criteria #2 and #3 are **totally optional**; criterion #1 is
**required**. Semantics across the filled rows are **AND** (more filled rows = fewer,
more-targeted results). At least one keyword must be non-empty to search.

### 12.2 Layout (exact)

Keep the existing `<form onSubmit={handleSearch} noValidate className="flex flex-col">`
wrapper. Replace the current single inner grid
`md:grid-cols-[170px_1fr_auto]` with a **vertically-stacked stack of three rows**, each
row an identical 2-column group:

```tsx
<div className="flex flex-col gap-4">            {/* outer stack */}
  {/* Row 1 — required */}
  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr]">
    <SelectField label={"Kriteria 1"} … />        {/* id wa-edit-kriteria-1 */}
    <div className="flex flex-col gap-1">
      <TextField label="Kata kunci 1" … />        {/* id wa-edit-keyword-1 */}
    </div>
  </div>

  {/* Row 2 — optional */}
  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr]">
    <SelectField label="Kriteria 2 (opsional)" … />  {/* id wa-edit-kriteria-2 */}
    <div className="flex flex-col gap-1">
      <TextField label="Kata kunci 2 (opsional)" … /> {/* id wa-edit-keyword-2; placeholder "Ketik kata kunci… (opsional)" */}
    </div>
  </div>

  {/* Row 3 — optional */}
  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[170px_1fr]">
    <SelectField label="Kriteria 3 (opsional)" … />  {/* id wa-edit-kriteria-3 */}
    <div className="flex flex-col gap-1">
      <TextField label="Kata kunci 3 (opsional)" … /> {/* id wa-edit-keyword-3 */}
    </div>
  </div>

  {/* single shared Cari button */}
  <div className="flex justify-end">
    <Button variant="primary" type="submit" disabled={saving}
            className="shrink-0 px-4 py-2 text-[0.92rem]">Cari</Button>
  </div>
</div>
```

Layout rules REX must follow exactly:

- **Three rows are ALWAYS visible** (never hide/collapse #2/#3). #1 is always usable;
  #2/#3 start empty with a chosen default criterion = simply left at whatever default
  they need; simplest: leave the criterion at `SEARCH_CRITERIA[0].label` (`No Hp`) and
  keyword `""`. Empty rows are silently ignored by the predicate — showing them as
  pre-set-but-empty reads as "optional", which is the point.
- Per row: **dropdown `w-full` at `170px`, keyword `1fr`; vertical gap `gap-3`; aligned
  `items-end`** so the dropdown label sits level with the keyword label (identical to
  today's row). Keep `Field`, `SelectField`, `TextField`, `FIELD_BASE` primitives from
  §5.2 verbatim — **no new shared components**.
- Outer stack `flex flex-col gap-4` (slightly larger than the old `gap-5` inline) gives
  breathing room between the three rows inside the existing modal body (`px-5 py-4`,
  panel `max-w-2xl`).
- **While a keyword has no parent gap-1 box in today's code, note the error span sits
  inside the keyword's `flex flex-col gap-1` div** (as today) — see §12.5.
- **Responsiveness:** the two-column `sm:grid-cols-[170px_1fr]` is present from `sm`
  breakpoint; below `sm` each row stacks to a single column (dropdown above keyword), so
  `No Hp` → `Tanggal Masuk` → `Nama` at ~1366 and 1920 both stay a clean, non-overflowing
  2-col grid. The `170px` dropdown never shrinks because it's a fixed grid column; the
  keyword's `1fr` absorbs all horizontal slack. No new width/overflow handling needed —
  the modal is already `w-[96%] max-w-2xl` and the body scrolls if the height overflows
  (`max-h-[92vh]` + `overflow-y-auto`).

### 12.3 Copy (exact)

- Fields: `Kriteria 1` / `Kata kunci 1` are the **labels** (the "1" is enough — #1 is
  required, just like every other required field on the page that already carries no
  asterisk-legend; do NOT add a `*` text). `Kriteria 2 (opsional)`, `Kata kunci 2
  (opsional)`, `Kriteria 3 (opsional)`, `Kata kunci 3 (opsional)`.
- Keyword placeholders: row 1 `Ketik kata kunci…`; rows 2 & 3 `Ketik kata kunci…
  (opsional)`.
- **Optionality helper line** (muted, `text-[0.80rem] text-muted`, mb-1, replaces nothing
  — add directly under the `form` header helper from §6.1):
  > `Kriteria berikut bersifat opsional: isi baris 2 dan/atau 3 untuk mempersempit hasil
  > (minimal satu kata kunci harus diisi).`

### 12.4 Cari button + Enter

- **Single shared [Cari] button**, right-aligned on its own full-width `flex justify-end`
  row under row 3 (matches the edit screen's bottom-aligned secondary action bar
  convention). It is `type="submit"`.
- **Enter in ANY of the three keyword inputs submits** (single `<form onSubmit>`) — same
  as today's Enter-to-submit behavior, now from any row.
- On submit the filled rows are ANDed; empty rows are ignored (see §12.6).

### 12.5 Empty-state validation (error only when ALL three empty)

- Error lives in the **row-1 keyword box** (same `flex flex-col gap-1` div, same
  `span data-error text-[0.78rem] font-semibold text-danger`), because #1 is the
  required criterion.
- Trigger: **only when ALL THREE keywords are empty** (`trim()` of each → all `""`).
  If any one is non-empty, no error fires (rows 2/3 may legitimately be empty = ignored).
- Exact copy: keep the existing string byte-for-byte — **`Masukkan kata kunci dahulu.`**
  (unchanged; do not reword it).
- **Per-row behavior:** a user MAY select a criterion in #2/#3 and leave its keyword
  empty — that row is simply ignored (no error, no partial-block). Selecting a criterion
  but typing nothing is the normal "I'm thinking about using this but not yet" case and
  must not nag.
- `searchError` for "all empty" clears on the next successful submit (set `null` in
  `handleSearch` after it runs — today's code already clears it on success; keep that).
- On "Cari Lagi" (`goSearch`) keep the current criteria but clear all three keywords
  (today's `setKeyword("")` becomes `setKeyword1/2/3("")`).

### 12.6 Pure-logic contract — replace `searchRows` with `searchRowsMulti`

Add to `src/workspaces/waAdminEdit.ts`, **replacing** the single-clause `searchRows`
(drop it — its only caller was `handleSearch`, so keeping it is dead code; do NOT leave
both):

```ts
/** A single AND-clause: a column + a lifted keyword clause. */
export interface SearchClause {
  /** EXACT schema column for the criterion (see SEARCH_CRITERIA.column). */
  column: string;
  /** Trimmed, non-empty keyword; a clause whose keyword is empty is IGNORED. */
  keyword: string;
}

/**
 * Multi-criterion search: AND (intersection) of every NON-empty clause, in order.
 * Each clause = contains, case-insensitive, whitespace-trimmed match against its
 * client column across ALL rows (whole table, not the filtered view).
 * AND across the filled rows = a row must match EVERY non-empty clause.
 * Clauses with empty keyword.trim() are skipped (the caller already guarantees at
 * least one is non-empty). Returns matched rows, same source order, __rowIndex
 * carried through untouched. All-empty clauses → [].
 */
export function searchRowsMulti(
  rows: Row[],
  clauses: SearchClause[],
): Row[] {
  const active = clauses.filter((c) => c.keyword.trim().length > 0);
  if (active.length === 0) return [];
  return rows.filter((r) =>
    active.every((c) =>
      String(r[c.column] ?? "").trim().toLowerCase().includes(
        c.keyword.trim().toLowerCase(),
      ),
    ),
  );
}
```

Contract (REX must implement verbatim):

- **Input:** `rows` (with `__rowIndex`), `clauses: {column, keyword}[]` — up to 3, in
  display order (row 1 → row 3).
- **Filter:** a row is returned **iff it matches EVERY clause whose `keyword.trim()` is
  non-empty**; empty-keyword clauses are skipped. Per clause: contains / case-insensitive
  / trimmed (identical predicate semantics to the old `searchRows`).
- **All-empty:** return `[]` (caller enforces the "Masukkan kata kunci dahulu." msg).
- **Order:** source order preserved; `__rowIndex` carried through untouched
  (integrity guard from §3.1 / §10 #21 unchanged).
- **Replace, don't keep:** delete `searchRows( )`. Update the acceptance test at §10 #4
  to exercise `searchRowsMulti`: add cases for (a) one filled clause behaves exactly like
  old single-criterion, (b) two/three filled clauses AND correctly (only rows matching
  all remain), (c) an empty clause (e.g. row-2 empty) is ignored, (d) all-empty → `[]`.
  Extend the §10 integrity test note to say `searchRowsMulti` carries `__rowIndex`.

### 12.7 Caller (`handleSearch`) change

Replace the current single `(criterion, keyword)` search state with a small array, e.g.:

```ts
type SearchRowState = { criterion: string; keyword: string };
const [rowsState, setRowsState] = useState<SearchRowState[]>([
  { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
  { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
  { criterion: SEARCH_CRITERIA[0].label, keyword: "" },
]);
```

`handleSearch`:
1. `const clauses = searchRowsState.map(s => ({ column: s.criterion === SEARCH_CRITERIA[0].label ? SEARCH_CRITERIA[0].column : (SEARCH_CRITERIA.find(c=>c.label===s.criterion)?.column ?? s.criterion), keyword: s.keyword });`
2. If **every** `clause.keyword.trim()` is empty → `setSearchError("Masukkan kata kunci dahulu.")` (unchanged string) and return — **do
  not** block partial fills; a single filled row runs.
3. Else `const hits = searchRowsMulti(rows, clauses); setResults(hits); setLastQuery(<active-clause summary>); setSearchError(null); setScreen("results");`.

(`setLastQuery` now stores the summary string from §12.8, not a single raw keyword.)

### 12.8 Results-screen copy — multi-criteria aware

Because the query may now span up to three filled fields, swap the single-query string
for a **description of the active criteria**. Reuse a small pure helper (add to
`waAdminEdit.ts`, or inline) that builds the summary from `active` clauses:

```ts
/** "No Hp: 08123", "No Hp: 08123 · Nama: Budi", etc. */
export function formatActiveCriteria(clauses: SearchClause[]): string {
  const active = clauses.filter((c) => c.keyword.trim().length > 0);
  return active
    .map((c) => `${labelFor(c.column)}: ${c.keyword.trim()}`)
    .join(" · ");
}
```

Exact copy changes in §6.2 (results screen):

- **Found** (was `Ditemukan {n} baris yang cocok dengan "{query}".`):
  > `Ditemukan {n} baris yang cocok dengan kriteria: {criteriaSummary}. Pilih baris untuk diedit.`
  where `{criteriaSummary}` = `formatActiveCriteria(activeClauses)`, e.g.
  `No Hp: 08123 · Nama: Budi · Status: HOT`.
- **Empty state** (was `Tidak ada data yang cocok dengan "{query}".`):
  > `Tidak ada data yang cocok dengan kriteria: {criteriaSummary}. Coba kriteria atau kata kunci lain.`
- `[Cari Lagi]` back to search (keeps criteria, clears keywords) unchanged.

Do NOT try to re-insert a literal `"{query}"` single string anywhere in §6.2 — the
summary line replaces it entirely.

### 12.9 Acceptance-checklist deltas (§10)

- #4 changes → unit-test `searchRowsMulti` (multi-clause AND, single-clause passthru,
  ignore-empty, all-empty → `[]`).
- #5 `Empty keyword` → re-word: "error triggers **only when all three keywords are
  empty**" (same inline string); unit + DOM assert.
- #6 / result copy → assert the new `kriteria:` summary wording, not the old `"{query}"`.
- #7 unchanged (`__rowIndex` key). #1–#3, #8–#21 unchanged (search screen only).

### 12.10 Out of scope (reaffirmed for this upgrade)

Search screen ONLY. The results cards (§6.2), edit form (§6.3), confirm (§6.4), the
entire save/PATCH path (§6.5), `rowToFormValue`, `changedFieldValues`,
`validateWaAdminEdit`, `SEARCH_CRITERIA`, ALL shared `@/components/ui/*`, `DataTable`,
page.tsx / routing, and the backend are **NOT** touched by this change.