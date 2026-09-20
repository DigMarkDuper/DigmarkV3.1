# PHASE E — WORKSPACE 5: ADS (READ + IMPORT + GUARDED CLEAR) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/7_Ads.py` → `app/(workspaces)/ads/page.tsx` (route `/ads`) preserving TikTok/Meta/Mekari reporting, spend calculations, ROI, imports, filters/charts, and the destructive clear operation — which **must remain server-guarded**. Read-only parity first, then enable import + clear.

## PREREQUISITE — follow the established workspace pattern
Workspaces 1–4 done (Website, WA Admin, Interview, DM). Read and mirror structure/conventions EXACTLY (route shells with auth gate + `useApi`, `src/workspaces/*.ts` pure derivations, `*.Dashboard.tsx` presentational body, `*.test.tsx`).

## Authoritative sources — READ THESE
1. `D:/digmark-v3/pages/7_Ads.py` — V3 behavior to preserve.
2. `D:/digmarkv3.1/src/server/adapter/schema.ts` — app keys `ads_tiktok` (tab `REPORT ADS TIKTOK`), `ads_meta` (tab `REPORT ADS META`), `mekari` (tab `REPORT MEKARI`), `wa_admin` (tab `WA ADMIN REPORT`). Read their declared columns.
3. `D:/digmarkv3.1/src/server/metrics/metrics.ts` — the `roi(wa, tiktok, meta, mekari)` PURE function (Phase A port, already verified). REUSE IT; do not reimplement.
4. `D:/digmarkv3.1/src/server/api/overviewControllers.ts` — the Phase D pattern for a **thin server-side metrics route**. Follow it to add a dedicated Ads metrics route (recommended) OR import the pure `roi` into a shared client-safe module. See Data-access decision below.
5. `D:/digmarkv3.1/src/server/api/importControllers.ts` — **import contract**: `POST /api/import/{key}` multipart (CSV/XLSX), editor-only, parses server-side, projects file headers to schema columns (unknown cols dropped+counted), appends via adapter (USER_ENTERED). Response `{ok, added, skipped, summary:{fileRowCount, addedRows, skippedEmptyRows, skippedUnknownColumns}}`. Errors: unreadable file → 400 `error`, no importable columns → 400.
6. `D:/digmarkv3.1/src/server/api/clearControllers.ts` — **clear contract**: `POST /api/clear/{key}` body `{confirm:true, tabTitle:'<schema.tab>'}`. Requires **editor** role (403 for viewers). Sends `{appKey, tabTitle, confirmed:true, actor}` to the adapter's `clearSheet` which RE-guards (2-step). Audit logged. Errors: no confirm → 400, tabTitle mismatch → 400.
7. `D:/digmarkv3.1/src/lib/api-client.ts` — `useApi`, `requestJson`, and how POST is done (`postJson` for JSON; check if there's multipart/file upload support — if not, implement a small `uploadFile(field, endpoint)` using fetch FormData, or extend api-client). Also need `postJson` for clear.
8. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` §C — design system.

## DATA-ACCESS / METRICS DECISION (critical)
The browser must NOT reimplement `roi()`. Compute ROI **server-side** by adding a thin route mirroring `/api/overview/metrics` (see overviewControllers.ts): `GET /api/ads/metrics` that fetches wa_admin + tiktok + meta + mekari via the source and returns `roi()` final scalars `{spend,leads,closing, cac, roas, omzet}` formatted-ready (or raw numbers + format client-side with ui-common). Route lives in `app/api/ads/metrics/route.ts` + a small controller (`src/server/api/adsControllers.ts`. The per-platform KPIs (spend/leads/closing/CPL for TikTok & Meta, and the Mekari interaction/biaya metrics) are simple derivations mirroring V3's `_spend_of`/`_ads_tab`/`_mekari_tab` — implement these as pure derivations in `src/workspaces/ads.ts` operating on the rows the page already fetched via `GET /api/tables/*` (this mirrors V3 page logic exactly and is allowed; NOT a full reimplementation of `roi`). Never touch Sheets in the browser.

## Behavior to preserve (V3 7_Ads.py)
### Header
- Topbar + ModuleHero(💰, "Ads Performance", "Spend, CAC/ROAS, dan import laporan TikTok / Meta / Mekari.").

### ROI Overview (from the metrics route)
- Section "ROI Overview" sub "Total spend dan hasil untuk semua kampanye."
- MetricRow: Total Spend 💵, Leads 👥, `{closing} siswa` ✅, CAC 📌, `{roas:.1f}x` 🚀.
- Empty/degraded state: mirror the overview route's "—"/empty handling when data absent.

### Three tabs: [TikTok, Meta/IG, Mekari]
**TikTok (`_ads_tab("ads_tiktok", ..., cost_keys=("cost","spent","spend"), source_pat="Tiktok", wa)`)**
- Section "KPI TikTok" sub "Spend dan hasil per platform."
- Per-platform spend = sum of `cleanIdr` over the first column whose lowercase name contains one of the cost keys (`cost`,`spent`,`spend`). Use the ported `cleanIdr` in helpers (already ported — check `src/server/utils/helpers.ts`).
- Leads = count of WA rows whose source column (first col containing "Sumber") contains `source_pat` (case-insensitive). Use `statusCol`/`findCol` semantics from metrics.ts as V3 does.
- Closing = among those lead rows, count whose status col contains "Closing".
- CPL = `spend/leads` formatted rupiah, or "—" when leads 0.
- MetricRow: `Spend TikTok`💰, `Leads TikTok`👥, `Closing TikTok`✅, `CPL 📌`.

**Meta/IG (`_ads_tab("ads_meta", ..., ("spent","spend","cost"), "Instagram|Facebook|IG|FB", wa)`)
- Same structure, cost keys (`spent/spend/cost`), source_pat `Instagram|Facebook|IG|FB`. KPI Meta/IG.

**Mekari (`_mekari_tab(mk)`)**
- If data non-empty: KPI section "KPI Mekari" sub "Interaksi dan biaya broadcast."
  - Total Interaksi = len(rows 💬; biaya col = first col containing "biaya" else col == "cost"; total = sum cleanIdr;
  - `Total Biaya`💰, `Biaya / Interaksi` = total/len rupiah or "—" when empty; then DataTable of all rows.
- Empty → EmptyState "Belum ada data Mekari."

### Import (per-tab upload) — WRITE
**TikTok & Meta tabs: standard file import via `POST /api/import/{key}` (multipart CSV/XLSX). Before uploading, V3 drops rows whose FIRST column lowercased starts with "total" (`df_up[first].str.lower().startswith("total")`). If the UI lets the server handle it: pass the whole file and let the server map/project (it tolerates unknown columns). If you need the "total"-row drop, do it client-side before upload OR note that the server already skips empty rows. Preserve intent: ad-platform exports often have a trailing "Total row — the server's tolerant projection handles it; a file with zero importable columns → 400 which the UI surfaces.
- Success → `{n} baris diimport ke {title}.` + refetch; error → surfaced (readable File tidak dapat dibaca / column warning).

**Mekari import (`_mekari_tab`) — SPECIAL (not a raw file append).**
- V3 reads the file and COMPUTES a summary row depending on headers, then appends ONE row to mekari. Port this as a client-side transformation that then appends via `POST /api/tables/mekari` (an object row with schema keys: `Tanggal Input, Periode, Jenis Laporan, Total Interaksi, Total Biaya (Rp)`). Determine the logic EXACTLY:
  - If file has col "deducted balance" OR "broadcast amount": biaya=first of those, msgs="broadcast amount", jenis="WA Campaign Logs", total_biaya=sum(biaya), total_msg=sum(msgs) else len.
  - elif file has col "credit": biaya="credit", jenis="WA Billing Logs", total_biaya=sum(credit), total_msg=len(file).
  - else: biaya=first col containing "biaya"; if none → warning "Kolom biaya tidak dikenali dalam file ini." and abort; jenis="Manual", total_biaya=sum cleanIdr, total_msg=len(file).
  - row = `[ today "YYYY-MM-DD HH:MM", "periode", jenis, total_msg, `Rp${total_biaya.toLocaleString()}` with . as group separator` ] → as object `{ "Tanggal Input": .., "Periode": "periode", "Jenis Laporan": jenis, "Total Interaksi": total_msg, "Total Biaya (Rp)": "Rp1.234.567" }`. Sum numbers, handle mixed (raw numeric or cleanIdr where V3 uses cleanIdr).
  - Success → "Laporan Mekari tersimpan." + refetch.

### Destructive clear — SERVER-GUARDED ONLY (mandatory)
- For each of TikTok, Meta, Mekari (and exactly as V3's `confirm_and_clear`, which appears in TikTok/Meta upload section + Mekari section): a "🗑️ Kosongkan tab {title}" button that:
  1. Requires an explicit confirmation step in the UI (a confirm dialog/checkbox — "Clearing removes all rows from <tab>. Type the tab name / confirm to continue.").
  2. On confirm + click → `POST /api/clear/{key}` with `{confirm:true, tabTitle:'<schema.tab>'}`, editor-only (server enforces; viewer sees the button disabled/hidden or gets 403).
  3. Success/error surfaced from the API (the server re-guards; the UI NEVER does its own spreadsheet-clearing logic — it only calls the endpoint).
- If session role is viewer (from `/api/auth/me`), the clear action must be hidden/disabled (server still blocks it).

### Refresh
- Footer + "🔄 Refresh Data" refetch all four tables + the metrics route.

## WRITE TESTING — SANDBOX/MOCK ONLY (mandatory)
- Import: unit-test `src/server/api/importControllers` already covered in Phase C. Add tests for: `POST /api/import/{ads_tiktok}` via makeFakeSource (header projection, unknown-column drop, no-matching-headers 400), and the client-side Mekari "Total"-row drop + summary-row build + the special Mekari header logic (deducted balance / credit / manual). NEVER hit production.
- Clear: demonstrate (mock source) editor → clear succeeds + audits; viewer → 403 FORBIDDEN; missing confirm → 400; tabTitle mismatch → 400. These largely exist in Phase C clearControllers.test.ts — re-run and add any missing ADS case (ads_tiktok/mekari keys). NEVER clear production.
- Confirm no production spreadsheet write/clear occurred: none.

## Design system (REUSE only)
Phase D components. Route at `app/(workspaces)/ads/page.tsx`.

## Implementation gates (run ALL, report REAL results)
1. `npx tsc --noEmit` → 0
2. `npx vitest run` → all existing 262 stay green + new ads tests (metrics route, derivations/spend/leads/CPL, Mekari logic, clear/import guard cases)
3. `npm run build` → success, `/ads` listed (adds a new ƒ-/api/ads/metrics route)
4. `npm run lint` → no NEW errors (10 Phase A warnings OK)
5. `git -C D:/digmark-v3 status --short` → clean
6. `curl -s http://localhost:3413/ads` → 200 (API 401 without session — expected)
7. Confirm no production spreadsheet write/clear.

## Deliverable (concise, high-signal)
Files created/modified · API endpoints used (incl. new /api/ads/metrics + confirm its response shape) · parity notes (spend column detection, source/status matching for leads/closing, Mekari summary-row logic, clear guard layering) · WRITE test results (mock/sandbox, never master) · REAL gate results · issues/deviations.