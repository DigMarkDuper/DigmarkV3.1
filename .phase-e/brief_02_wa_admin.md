# PHASE E — WORKSPACE 2: WA ADMIN (READ-ONLY + CSV EXPORT) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/4_WA_Admin.py` → `app/(workspaces)/wa-admin/page.tsx` (route `/wa-admin`) preserving lead trend, closing funnel, status breakdown, source breakdown, CSV export, filters, and KPI calculations. **Read-only** (V3 performs no writes on this page).

## PREREQUISITE — read Workspace 1 pattern first
The Website workspace was just built as the reference pattern. READ these to match structure/conventions EXACTLY:
- `app/(workspaces)/website/page.tsx` — route shell (session gate, data via useApi, states, Topbar/WorkspaceNav/Footer/ModuleHero).
- `src/workspaces/WebsiteDashboard.tsx` — presentational body.
- `src/workspaces/website.ts` — pure derivations module.
- `src/workspaces/website.test.tsx` — test pattern.

Follow the SAME structure for wa-admin: route shell + `src/workspaces/WaAdminDashboard.tsx` + `src/workspaces/waAdmin.ts` (pure derivations) + `src/workspaces/waAdmin.test.tsx`.

## Authoritative sources — READ THESE
1. `D:/digmark-v3/pages/4_WA_Admin.py` — V3 behavior to preserve.
2. `D:/digmarkv3.1/src/server/adapter/schema.ts` — `wa_admin` app key → tab `WA ADMIN REPORT`, declared columns (this is what `/api/tables/wa_admin` returns as row keys). NOTE the exact strings:
   `f, Tanggal Masuk, No Hp, Jam Chat Masuk, PIC, Nama, Asal, Sumber (Ads/Organik/Sales), Pertanyaan, Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll), Mekari Tag, Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing), Keterangan Admin, Database`.
3. `D:/digmarkv3.1/src/server/metrics/metrics.ts` — `statusCol()` (last col containing "Status" excl. "mekari") — USE THIS, mirroring V3's `_status_col`. The junk filter and KPI calcs in V3 operate on the normalized row objects.
4. `D:/digmarkv3.1/src/config/constants.ts` — `JUNK_TAGS`, `CLOSING_TARGET`, `COLORS`.
5. `D:/digmarkv3.1/src/lib/api-client.ts` — `useApi`.
6. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` §C — design system components.

## Behavior to preserve (V3 4_WA_Admin.py) — READ-ONLY
### Junk filter (order matters — apply BEFORE everything)
- Build regex from `JUNK_TAGS` joined by `|`. For columns named exactly `"Mekari Tag"` and `"Kategori"` that exist in rows, drop rows where that cell (lowercased string) contains the junk pattern. NOTE: the declared wa_admin schema has `"Mekari Tag"` and a `Kategori (...)`-suffixed column, so like V3 the junk filter effectively fires on `"Mekari Tag"` only (Phase B parity finding). Match V3 behavior: operate on the exact column names that exist in the returned rows.
- After junk filter: if empty → hero + EmptyState "Semua data berisi kategori yang dikecualikan." stop.

### Empty state (before junk, if raw data empty)
- hero(💬, "WhatsApp Admin", "Leads masuk, funnel closing, dan distribusi status.") + EmptyState "Data WA Admin tidak tersedia." stop.

### Status normalization
- Resolve status col via `statusCol(rows)` semantics (last col containing "Status", excl "mekari"). Null/"" → strip → fill "Belum Terupdate".

### Key metrics (V3 exact)
- Total Leads = len(rows)
- Closing = count where status contains "Closing" (case-insensitive)
- Conversion = `(closing / len) * 100` formatted `1 decimal + "%"`, or "—" when empty
- Closing / Target = `closing / CLOSING_TARGET` → display as `${closing}/${CLOSING_TARGET}`

### Visualization (2-col: line trend [2fr] + status pie [1fr])
- **Trend leads per month:** filter rows with non-empty `Tanggal Masuk`; period = month string `YYYY-MM`; count per period sorted; keep only periods starting with the CURRENT YEAR (`datetime.now().year`); label = `MMM YYYY` from `YYYY-MM-01`; line chart markers, blue. Use ChartContainer + dependency-free SVG/HTML (no new chart lib; prefer an inline SVG line chart component or a lightweight bar/line; match Website's no-dependency approach).
- **Status distribution:** pie/donut (hole 0.55) of status value counts, colors cycle [blue, success, warn, danger, #7D8FA3].

### Source breakdown (Asal Prospek)
- Resolve source col: first column containing "Sumber". Values stripped; exclude empty and "nan". Horizontal bar of value counts, blue, 300px. Skip section if no matching column.

### Detail Status
- Options = unique statuses (excluding "", "nan"); select "Semua status" (default) + sorted options. Show `Jumlah` metric + DataTable of columns present among: `Tanggal Masuk, Nama, No Hp, Asal, Sumber, <status_col>`. Empty → EmptyState "Tidak ada data untuk status ini."

### Export (CSV)
- Button "⬇️ Unduh Data (CSV)" downloading the JUNK-FILTERED full dataset (all rows) as CSV. Filename `wa_admin_YYYYMMDD.csv`. Use `utf-8-sig` BOM (Excel-compatible) — same as V3 `to_csv(index=False).encode("utf-8-sig")`. Implement client-side CSV generation from the fetched rows (they are plain objects). OR reuse `src/lib/csv.ts` if it helps. V3 exports the whole junk-filtered df (not a filtered subset).

### Refresh
- Footer + "🔄 Refresh Data" button refetching `/api/tables/wa_admin`.

## Design system (REUSE only)
Use Phase D components exactly as Workspace 1 does. Route lives at `app/(workspaces)/wa-admin/page.tsx`.

## Implementation gates (run and report ALL — REAL numbers)
1. `npx tsc --noEmit` → 0
2. `npx vitest run` → all 215 existing must stay green + new waAdmin tests (derivations + dashboard server-render)
3. `npm run build` → success, `/wa-admin` route listed
4. `npm run lint` → no NEW errors (10 Phase A warnings OK)
5. `git -C D:/digmark-v3 status --short` → clean/empty
6. Optionally `curl -s http://localhost:3413/wa-admin` → 200 (page loads; API will 401 without session — expected)

## Deliverable (concise, high-signal)
Files created/modified · API endpoints used · parity notes vs V3 (esp. junk filter, status col resolution, current-year trend filter, CSV BOM) · REAL gate results · issues/deviations.