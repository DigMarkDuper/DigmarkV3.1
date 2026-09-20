# PHASE E — WORKSPACE 7: SOSMED (READ + INLINE EDIT) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/2_Sosmed.py` → `app/(workspaces)/sosmed/page.tsx` (route `/sosmed`) preserving the content tracker, date filtering, editable fields (Output, PIC, PROSES, IG, TIKTOK, YT booleans), and inline cell editing → Google Sheets via the existing PATCH API. **This is the highest write-complexity workspace: read-only parity first, THEN enable inline edit.**

## CRITICAL DATA-ACCESS RULES (mandatory, from the migration plan)
- Every editable field must map to a **declared schema column** (`src/server/adapter/schema.ts` `sosmed.key`). Do NOT expose arbitrary spreadsheet coordinates.
- **Boolean fields (IG/TIKTOK/YT) must remain real booleans** when sent to the adapter (`PATCH /api/tables/sosmed` with `value: true|false`). The adapter writes bool→bool (USER_ENTERED). V3's `_truthy` coercion is the read-side model; the WRITE value is a real boolean.
- The UI communicates ONLY through `/api/tables/sosmed` (GET to read, PATCH per-cell to update). Never touch Sheets in the browser.

## PREREQUISITE — follow the established workspace pattern
Workspaces 1–6 done (Website, WA Admin, Interview, DM, Ads, CRM). Mirror structure/conventions EXACTLY (route shell + auth gate + `useApi`; `src/workspaces/*.ts` pure derivations; `*.Dashboard.tsx`; `*.test.tsx`). The CRM workspace already resolved filters/search/selects — reuse those component patterns.

## Authoritative sources — READ THESE
1. `D:/digmark-v3/pages/2_Sosmed.py` — V3 behavior (esp. the inline editor diff-and-save loop).
2. `D:/digmarkv3.1/src/server/adapter/schema.ts` — `sosmed` app key → tab `SOSMED`, declared columns:
   `Kode Konten, Tanggal Deadline, Tanggal Posting, Output, Konten Pillar, Platform, PIC, Judul Konten, Materi Konten, "  CAPTION ", LINK COVER, PROSES, LINK KONTEN JADI, IG, TIKTOK, YT`.
   `IG`/`TIKTOK`/`YT`/`PROSES`/`Output`/`PIC` are the editable fields.
3. `D:/digmarkv3.1/src/server/api/tableControllers.ts` — **PATCH contract**: `PATCH /api/tables/sosmed` body `{rowIndex: number(0-based), column: "<schema col name>", value: scalar}`. Editor-only. Server resolves column by NAME via schema (assertKnownColumn), never positional. Booleans pass through. Audited. Response `{ok, rowIndex, column, affected}`. Errors 400 (unknown column/non-int index/non-scalar), 403 viewer, 401 no session.
4. `D:/digmarkv3.1/src/lib/validation.ts` — `assertScalarValue` (Objects rejected — so you can only send scalar per cell).
5. `D:/digmarkv3.1/src/lib/api-client.ts` — `useApi` + how PATCH is sent (there's `postJson`; check whether a `patchJson` exists or add one, since you'll PATCH many cells).
6. `D:/digmarkv3.1/src/server/utils/helpers.ts` — `monthLabel`/`toDatetime` for date/month handling.
7. `D:/digmarkv3.1/src/config/constants.ts` — `PIC_LIST`, `COLORS`.
8. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` §C — design system.

## MONTH-LABEL IMPORTANT
V3 filters by `Bulan-Date`/`Bulan-Deadline` columns. The declared sosmed schema has `Tanggal Posting` and `Tanggal Deadline` (DD/MM/YYYY, not month labels). Like the Website workspace, derive the month label from `Tanggal Posting` via `monthLabel`/`toDatetime` and present a multiselect of distinct month labels (default all). Filter rows whose posting-month is in the selection. If no date parseable, degrade gracefully (don't filter / treat as in group). Document the exact semantics in parity notes.

## Behavior to preserve (V3 2_Sosmed.py)
### Header
- Topbar + ModuleHero(📱, "Social Media", "Produksi konten, workload per PIC, dan editor langsung ke Google Sheets.").

### Empty guard
- If data empty OR no `PROSES` column → hero + EmptyState "Data sosmed tidak tersedia atau kosong." + stop.

### Filters (before metrics)
- PIC multiselect: options = sorted distinct non-null `PIC` values if `PIC` col present else `PIC_LIST`. **Default = all PICs selected.**
- Month multiselect "Bulan Posting": distinct posting-month labels, **default all selected** (derived; see above).
- Apply: keep rows whose `PIC` ∈ selection; then if month filter active, keep rows whose posting-month ∈ selection.
- If filtered empty after both → EmptyState "Tidak ada data sesuai filter." + stop (no metrics/editor).

### Key metrics (on filtered data)
- `done` = `PROSES` uppercased == "DONE"; `video` = `Output` contains "Video" (case-insensitive); `post_done` per `IG/YT/TIKTOK` where value uppercased+stripped ∈ ("V","TRUE","1","YES","CHECKED").
- Row 1: Total Rencana 📊 (len), Total DONE ✅ (count done), Video Selesai 🎬 (`count(video&done)/count(video)`), Design Selesai 🎨 (`count(~video&done)/count(~video)`).
- Row 2: Hutang Post IG 📸 = `count(done & ~post_done.IG)`, Hutang Post YT ▶️ = `count(done & video & ~post_done.YT)`, Hutang Post TikTok 🎵 = `count(done & ~post_done.TIKTOK)`.

### Workload visualization
- Section "Visualisasi Workload" sub "Tugas selesai vs hutang per PIC."
- For each selected PIC present in filtered data: Selesai = count(PROSES==DONE), Hutang = len - Selesai.
- Stacked bar (Selesai success-green + Hutang warn), x=PIC, legend horizontal, ~300px. Use ChartContainer + dependency-free SVG (like Website/WA Admin). Empty skip.

### Master Production Pipeline — INLINE EDITOR (the write)
- Section "Master Production Pipeline" sub "Edit sel dan klik 'Simpan Perubahan' untuk menyimpan."
- Editable detail columns (in order): `Kode Konten` (READ-ONLY display), posting-date col (READ-ONLY; pick first of `Tanggal Posting`/`Tanggal Deadline`/`Deadline` present), then editable: `Output`, `PIC`, `Judul Konten` (READ-ONLY per V3), `PROSES`, `IG`, `YT`, `TIKTOK`.
- Render as a DataTable where editable cells become inputs/controls:
  - `PIC` → Select of pic_options
  - `PROSES` → Select of ["DONE","PENDING","ON PROGRESS"]
  - `IG`/`YT`/`TIKTOK` → Checkbox (real boolean)
  - `Output` → text input
  - `Kode Konten`/`Judul Konten`/date col → read-only text
- **Editor state:** the user edits cells in the client (a working-draft state). On "💾 Simpan Perubahan" click, DIFF each editable row/cell against the ORIGINAL (fetched) value and send PATCH only where changed (V3 loops `edited.index` × every bool/text col, comparing old vs new). Simplify: for each row, for each editable column, if new != original → PATCH `/api/tables/sosmed` `{rowIndex, column, value}`. sequence:
  - bool cols IG/YT/TIKTOK: original coerced via `_truthy`, new is boolean; if differ → PATCH real `true/false`.
  - text cols PIC/PROSES/Output: if new is null/empty skip; if `.trim()` differs → PATCH trimmed string.
- **Success/error counts:** success `✅ {N} perubahan tersimpan.`; errors `⚠️ {M} perubahan gagal.`; nothing changed `ℹ️ Tidak ada perubahan.`. Refetch data after a save that had updates. Removed V3's `st.rerun`-style reset but mimic post-save refresh.
- **In-flight UX:** disable the Save button + show a spinner/progress while saving; handle concurrent in-flight requests (await sequentially so the pool/sheet stays consistent).
- **Editor-only:** the Save button requires editor role (from `/api/auth/me`). Viewer sees the table read-only with NO save control (server also 403s).
- Edge: value that is an Object must never be sent (server rejects non-scalar).

## Design system (REUSE only)
Phase D components. Route at `app/(workspaces)/sosmed/page.tsx`. Reuse any select/checkbox/MultiSelect built by prior workspaces (Interview/CRM) rather than inventing new primitives.

## WRITE TESTING — SANDBOX/MOCK ONLY (mandatory)
- Inline-edit write tests via mock source (`makeFakeSource`) proving: PATCH editor 200 + audit, value bool stays boolean (assert `updateCell` received `true` not `"true"`), viewer 403, non-scalar value (object) → 400, unknown column → 400, negative rowIndex → 400.
- Reuse/re-run the existing PATCH path tests. NEVER hit production. Confirm no production write in the audit log after your runs.
- Add a component test: the editor diff sends PATCH **only** for changed cells (unchanged cells produce no request) — this is the core behavioral parity.

## Design system / copying
Copy copy strings from V3 exactly (Indonesian mixed): "Simpan Perubahan", "Tidak ada perubahan.", "Master Production Pipeline", etc.

## Implementation gates (run ALL, report REAL results)
1. `npx tsc --noEmit` → 0
2. `npx vitest run` → all existing 313 stay green + new sosmed tests (derivations, editor diff/PATCH, booleans, guards)
3. `npm run build` → success, `/sosmed` listed
4. `npm run lint` → no NEW errors (10 Phase A warnings OK)
5. `git -C D:/digmark-v3 status --short` → clean
6. `curl -s http://localhost:3413/sosmed` → 200 (API 401 without session — expected)
7. Confirm no production spreadsheet write.

## Deliverable (concise, high-signal)
Files created/modified · API endpoints used · parity notes (month derivation, pic/month default-all filter, video/design split, hutang metrics, editor diff-and-save, bool-as-bool writes) · WRITE test results (mock/sandbox only) · REAL gate results · issues/deviations.