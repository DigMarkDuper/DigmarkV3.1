# PHASE E — WORKSPACE 6: CRM (READ + SYNC/IMPORT/EXPORT) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/5_CRM.py` → `app/(workspaces)/crm/page.tsx` (route `/crm`) preserving WA→CRM sync, CSV/XLSX import, search, filters, CRM data display, export behavior, status handling, and duplicate prevention. Read parity first, then enable sync + import + export.

## CRITICAL — B1 REQUIREMENT (the Phase B fix must remain intact)
CRM `Status` mapping is **header-based** (column-header resolution), NOT positional. Do NOT reintroduce positional column mapping anywhere (V3 used fixed index 17 → the B1 bug). The sync must write `Status` under the literal `Status` header (column 15, 1-based). You MUST include a regression test proving the CRM status is written to the correct `Status` column (assert row cell index === `crm.columns.indexOf("Status")`, not a fixed offset). The existing adapter (`src/server/adapter/sheets/write.ts::buildCrmAppendRows` + `syncWaToCrm`) already does this correctly — REUSE it, do not reimplement.

## PREREQUISITE — follow the established workspace pattern
Workspaces 1–5 done. Mirror structure/conventions EXACTLY (route shell + auth gate + `useApi`; `src/workspaces/*.ts` pure derivations; `*.Dashboard.tsx`; `*.test.tsx`).

## Authoritative sources — READ THESE
1. `D:/digmark-v3/pages/5_CRM.py` — V3 behavior to preserve.
2. `D:/digmarkv3.1/src/server/adapter/schema.ts` — app key `crm` (tab `DATABASE NOMOR`), declared columns (17 effective):
   `No, No Hp, Nama, Domisili, Tanggal Lahir, Usia, Kategori, Keterangan Setelah Isi Form, Tanggal Masuk Database, Mekari Tag (Status Terakhir), Treatment 1, Treatment 2, Tanggal Treatment 1, Tanggal Treatment 2, Status, Updated Status After Treatment, Catatan`. NOTE the `Status` header is at 0-based index 14 (column 15).
   Also `wa_admin` key (for reference). 
3. `D:/digmarkv3.1/src/server/adapter/sheets/write.ts` — `buildCrmAppendRows` (header-based B1-correct CRM build) + `syncWaToCrm`. REUSE via the source; never reimplement.
4. `D:/digmarkv3.1/src/server/api/syncControllers.ts` — **sync contract**: `POST /api/sync/wa-to-crm`, editor-only, calls existing `source.syncWaToCrm()`, returns `{ok, message, added, skipped}`. On business failure → 400 `VALIDATION_FAILED` with the message. Audited.
5. `D:/digmarkv3.1/src/server/api/importControllers.ts` — **import contract**: `POST /api/import/{key}` multipart CSV/XLSX, editor-only, server parses + projects HEADERS to schema columns. BUT: V3 CRM import expects SPECIFIC column names from the file: `full_name`, `customer_name`, `phone_number`, `company`. Read how `buildImportRows` normalizes headers (trim/lower/collapse-ws) — think carefully about whether the V3 field mapping is preserved by header-projection or needs client-side transformation. See Decision below.
6. `D:/digmarkv3.1/src/lib/validation.ts` (buildCellRows / normalizeHeader / rowIsEmpty), `D:/digmarkv3.1/src/lib/api-client.ts` (`useApi`, `postJson`, `uploadFile` added in Workspace 5).
7. `D:/digmarkv3.1/src/server/utils/helpers.ts` — `normalizePhone` (for the Mekari export).
8. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` §C — design system.

## DATA/IMPORT DECISION (important)
V3 CRM import maps a file with columns `full_name`, `customer_name`, `phone_number`, `company` into the CRM A–R layout: it sets No="", No Hp=`'` + phone (apostrophe → text), Nama=full_name (or customer_name when full_name=="nan"), Domisili=company, all other columns empty. The server's `buildImportRows` maps file headers → schema headers by normalized name; `full_name`/`customer_name`/`phone_number`/`company` do NOT match schema headers (`Nama`, `No Hp`, `Domisili`), so a raw `POST /api/import/crm` would drop those columns (bad). Therefore **implement the CRM import as a CLIENT-SIDE transformation + `POST /api/tables/crm` append** (like DM), preserving V3's exact `_import_row` semantics:
- Parse the file client-side (use `xlsx` — it's already a dependency — or a small CSV parser; `src/lib/csv.ts` exists for CSV). Read header row.
- For each data row: nama = full_name (str); if nama.lower() == "nan" → customer_name. Build object with schema keys: `{ "No": "", "No Hp": "'"+String(phone_number), "Nama": nama, "Domisili": String(company), ...rest empty }` (other keys omitted → server defaults ""). Phone prefixed with `'` to keep text form.
- POST `{single object or array}` to `/api/tables/crm` (editor, validates keys, projects declared order).
- Unreadable file → error "File tidak dapat dibaca. Pastikan format .xlsx of .csv.". Info text preserved: "Kolom dikenali: `full_name`, `customer_name`, `phone_number`, `company`." Success → `{n} baris diimport.` + refetch.
- Empty/None rows: V3 imports all rows; preserve (server skips truly empty cells).

## Behavior to preserve (V3 5_CRM.py)
### Header
- Topbar + ModuleHero(🎯, "CRM / Leads", "Sinkronisasi WA→CRM, import/export, dan filter database lead.").

### Sync & Import (2-col)
- Section "Sync & Import" sub "Tarik prospects en import data baru." (Indonesian kept).
- **Sync (left):** caption "Sinkronisasi WA Admin → CRM"; button "Tarik data unik dari WA Admin". On click → `POST /api/sync/wa-to-crm`; success → green message from response.message (+ refetch CRM + show added/skipped); failure → red message (error contract / response message). Spinner "Menyinkronkan..." while in flight. Disable while in flight.
- **Import (right):** caption "Import data baru"; info "Kolom dikenali: `full_name`, `customer_name`, `phone_number`, `company`."; file uploader (xlsx/csv); button "Konfirmasi import" → client-side transform + append per DATA/IMPORT DECISION; success `{n} baris diimport.` + refetch; error surfaced.

### Filters & Search
- Section "Filter & Cari" sub "Cari dan filter database lead."
- **Empty CRM:** EmptyState "Database CRM kosong." + Footer + stop (no filters).
- Search text input "Cari nama / nomor HP": filter rows whose `Nama` (string) contains search case-insensitive OR `No Hp` (string) contains search (V3 uses `.str.contains(search, na=False)`). If neither col present → no name/hp masking.
- Mekari Tag multiselect: sorted distinct non-null values of `Mekari Tag (Status Terakhir)` — the schema column. (V3 uses col `Mekari Tag`; schema is `Mekari Tag (Status Terakhir)` — resolve by the SCHEMA column name since that's what rows carry. Verify against the returned rows' keys.)
- Domisili multiselect: sorted distinct non-null `Domisili`.
- Treatment select: options ["Semua","Sudah T1","Sudah T2","Belum"]:
  - Sudah T1 → `Treatment 1` ≠ ""
  - Sudah T2 → `Treatment 2` ≠ ""
  - Belum → `Treatment 1` == "" AND `Treatment 2` == ""
  - (only when `Treatment 1`/`Treatment 2` cols exist; guard missing cols)
- Metrics row: Hasil Filter 🎯 (len filtered), Total DB 🗄️ (len all), Sudah T1 1️⃣ (count Treatment1 ≠ ""), Sudah T2 2️⃣ (count Treatment2 ≠ "").

### Data table
- DataTable of ALL filtered columns (all 17 declared CRM columns).

### Export — Mekari CSV
- Section "Ekspor" sub "Unduh hasil filter sebagai CSV untuk Mekari."
- Button "⬇️ Unduh hasil filter (CSV Mekari)". Export the FILTERED rows. Format (V3 `_mekari_csv`) — client-side CSV:
  - columns `phone_number,full_name,customer_name,company`
  - phone_number = `normalizePhone(row["No Hp"])` for each row (use the ported `normalizePhone`); full_name=Nama; customer_name=Nama; company=Domisili. Guard missing cols → "".
  - utf-8-sig BOM. Filename `mekari_contacts_YYYYMMDD.csv`.

### Refresh
- Footer + "🔄 Refresh Data" refetch `/api/tables/crm`.

## B1 REGRESSION TEST (mandatory)
Add a test that proves CRM Status is written to the CORRECT `Status` column via the header mapping (`crm.columns.indexOf("Status")`), and NOT to a fixed offset. The existing Phase B `write.test.ts`/`sandbox.write.test.ts` already assert index 14=Status, 17 empty — re-verify those stay green AND add a CRM-workspace-level test if the workspace introduces any Status handling. Keep header-based mapping intact.

## WRITE TESTING — SANDBOX/MOCK ONLY (mandatory)
- Sync + import + append tests use mock source (`makeFakeSource` in testHelpers) or sandbox source only. NEVER hit production/master. Confirm no production write in the audit log after your runs.
- Verify: sync editor 200 + audit; sync viewer 403; import append validation (unknown column → 400); B1 Status column regression; export CSV shape/escaping.

## Design system (REUSE only)
Phase D components. Route at `app/(workspaces)/crm/page.tsx`.

## Implementation gates (run ALL, report REAL results)
1. `npx tsc --noEmit` → 0
2. `npx vitest run` → all existing 291 stay green + new crm tests (incl. B1 Status-column regression)
3. `npm run build` → success, `/crm` listed
4. `npm run lint` → no NEW errors (10 Phase A warnings OK)
5. `git -C D:/digmark-v3 status --short` → clean
6. `curl -s http://localhost:3413/crm` → 200 (API 401 without session — expected)
7. Confirm no production spreadsheet write.

## Deliverable (concise, high-signal)
Files created/modified · API endpoints used · parity notes (sync summary handling, client-side CRM import mapping incl. full_name→customer_name fallback + phone `'` prefix, search/filter semantics, Mekari export mapping) · **B1 regression proof (Status → correct column, index = crm.columns.indexOf("Status"))** · WRITE test results (mock/sandbox only) · REAL gate results · issues/deviations.