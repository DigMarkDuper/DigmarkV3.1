# PHASE E — WORKSPACE 4: DM (READ + PROSPECT APPEND) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/6_DM_Sosmed.py` → `app/(workspaces)/dm/page.tsx` (route `/dm`) preserving DM tracking, status/tag reporting, prospect input form, append behavior, validation, and success/error states. **Read-only parity first, then enable prospect append.**

## PREREQUISITE — follow the established workspace pattern
Workspaces 1–3 (Website, WA Admin, Interview) are done. Read these and mirror structure/conventions EXACTLY:
- `app/(workspaces)/website/page.tsx`, `wa-admin/page.tsx`, `interview/page.tsx` — route shells (session gate via `/api/auth/me`, data via `useApi`, states, Topbar/WorkspaceNav/Footer/ModuleHero).
- `src/workspaces/waAdmin.ts` + `waAdmin.test.tsx` — pure derivations module + test pattern.

Structure: route shell + `src/workspaces/DmDashboard.tsx` + `src/workspaces/dm.ts` (pure derivations + payload builder) + `src/workspaces/dm.test.tsx`.

## Authoritative sources — READ THESE
1. `D:/digmark-v3/pages/6_DM_Sosmed.py` — V3 behavior and the append semantics.
2. `D:/digmarkv3.1/src/server/adapter/schema.ts` — `dm_sosmed` app key → tab `SOSMED ADMIN REPORT`, declared columns (what `/api/tables/dm_sosmed` returns AND what accepts as object keys): `No, Platform, Nama / Username, Link Username, No HP/ Whatsapp, Domisili, Status, Tag Prospek, Tanggal Masuk`.
3. `D:/digmarkv3.1/src/server/api/tableControllers.ts` — **append contract**: `POST /api/tables/dm_sosmed` body = a single row-Object OR array of row-Objects, keys MUST be declared schema columns (unknown column → 400 rejected). Server projects into declared column order. Row-index autocomputed server-side. `requireRole('editor')`.
4. `D:/digmarkv3.1/src/lib/validation.ts` — `buildCellRows` (append payload validation: all keys must be known columns; missing keys default `""`).
5. `D:/digmarkv3.1/src/lib/api-client.ts` — `useApi` + request helpers. It has `postJson`. Check whether there's a `patchJson`; if not, add one or use `fetch` directly for PATCH (only PATCH needed for Workspace 6/7; for DM you need POST).
6. `D:/digmarkv3.1/src/config/constants.ts` — `COLORS`.
7. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` §C — design system (MetricRow, SectionHeader, DataTable, EmptyState, Button, Field/TextInput/Select/Checkbox for the form).

## Behavior to preserve (V3 6_DM_Sosmed.py)
### Header
- Topbar + ModuleHero(📣, "Digital Marketing", "Prospek dari DM, distribusi status/kualitas, dan input prospek baru.").

### Key metrics (only when data non-empty)
- Platform col = `Platform` if present else the 2nd column of the row keys (cols[1]) if exists else none.
- Section "Metrik Kunci" sub "Prospek per platform."
- MetricRow: Total Prospek=len(rows) 👥, Instagram=count(platform contains "Instagram" case-insensitive) 📸, TikTok=count("Tiktok") 🎵, Facebook=count("Facebook") 👍.
- If no platform col resolvable → single MetricRow card Total Prospek 👥.

### Visualizations (2-col)
- Section "Visualisasi" sub "Distribusi status dan kualitas."
- Status col = `Status DM` if present else `Status` if present else none. Tag col = `Tag Prospek` if present else `Tag` if present else none. NOTE: the declared dm_sosmed schema col is `Status` (not `Status DM`) — so the status col resolves to `Status`.
- Left: donut (hole 0.5) of status value counts, colors [blue, yellow, success, warn, danger, #7D8FA3], ~300px.
- Right: donut (hole 0.5) of tag value counts — BUT only rows where tag stripped ≠ "" (V3 filters empty tags). Skip if none. Same colors.

### Input Prospek Baru (APPEND — the write)
- Section "Input Prospek Baru" sub "Registrasi prospek baru dari DM."
- Form (design-system Field/Select components; clear on successful submit):
  - Platform: select ["Instagram", "Tiktok", "Facebook"]
  - Nama / Username: text input (required)
  - Domisili: text input
  - No HP / WhatsApp: text input
  - Status DM: select ["No Response","Follow Up","Daftar","Interview","Closing","Move ke Whatsapp"]
  - Tag Prospek: select ["HOT LEAD","WARM LEAD","COLD LEAD","FUTURE PROSPECT","NOT ELIGIBLE"]
- **Validation:** if `username` (trimmed) empty → show warning "⚠️ Nama/username wajib diisi." — do NOT submit.
- **Payload construction (preserve V3 semantics exactly, as an OBJECT keyed by schema columns):**
  - `uname` = username.trim().replace(/^@+/, "").replace(/@/g, "")  (V3 `strip().replace("@","")` removes @)
  - link = platform=="Instagram" → `https://instagram.com/${uname}`; platform=="Tiktok" → `https://tiktok.com/@${uname}`; else → `https://facebook.com/${uname}`
  - hp: strip; if empty → ""; else if starts with "0" → `'` + "62" + hp.slice(1) (single-quote prefix + 62…); else `'` + hp. (V3 writes a leading apostrophe to force text.)
  - seq = len(rows) + 1 if rows non-empty else 1 (this is the `No` column)
  - date = today formatted YYYY-MM-DD (`Tanggal Masuk`)
  - Send object POST `/api/tables/dm_sosmed` with keys: `{ No: seq, Platform: platform, "Nama / Username": username, "Link Username": link, "No HP/ Whatsapp": hp, Domisili: domisili, Status: status_dm, "Tag Prospek": tag_dm, "Tanggal Masuk": date }`. NOTE: map status_dm/tag_dm into the SCHEMA column names (`Status`, `Tag Prospek`).
- **Success/error states:** on 2xx → success message `🔥 Berhasil menyimpan {username}!`, clear the form, refetch data (so the new row appears in Recent + metrics). On non-2xx → surfaced error (use the ApiFailure contract / ErrorState or a per-form inline error). Disable submit while in flight.
- After a successful append, the server appends to the SANDBOX/test spreadsheet in the running environment (dev `getMasterSource` points at master, but write tests must use sandbox — see Write testing note).

### Recent table
- Section "Recent Update" sub "15 data terbaru." Show the 15 most recent rows (reverse order, take 15 — V3 `df.iloc[::-1].head(15)`), full table. Empty → EmptyState "Belum ada data DM." (only if the whole fetch is empty; if data present, recent always renders).

### Refresh
- Footer + "🔄 Refresh Data" refetch `/api/tables/dm_sosmed`.

## WRITE TESTING — SANDBOX ONLY (mandatory)
- ALL write tests must target the sandbox spreadsheet (never production). The dev `.env.local` may point `getMasterSource` at master, but add/keep a test that exercises the append through the real controller/`buildCellRows` against a mock source (see existing `tableControllers.test.ts` pattern) to prove: payload validation (unknown column → 400), projection to schema order, while non-null seq/hp/link/date land correctly. Do NOT hit the live master for append in tests. If you run a live-write smoke, use the sandbox key via `createSandboxSource` (see `src/server/adapter/sheets/sandbox.ts`) — never master.
- Verify the DM append writes to the correct columns by header (the `No`→col1, `Platform`→col2, … layout must match schema order; assert via the parsed row, not positions in the UI).

## Design system (REUSE only)
Use Phase D components exactly as prior workspaces. Route at `app/(workspaces)/dm/page.tsx`.

## Implementation gates (run ALL, report REAL results)
1. `npx tsc --noEmit` → 0
2. `npx vitest run` → all existing 240 stay green + new dm tests (derivations, payload-builder, append-controller/validation, dashboard render)
3. `npm run build` → success, `/dm` listed
4. `npm run lint` → no NEW errors (10 Phase A warnings OK)
5. `git -C D:/digmark-v3 status --short` → clean
6. `curl -s http://localhost:3413/dm` → 200 (API 401 without session — expected)
7. Confirm no production spreadsheet write was performed.

## Deliverable (concise, high-signal)
Files created/modified · API endpoints used · parity notes (platform col resolution, hp apostrophe+62 prefix, link construction, seq computation, append as schema-keyed object) · WRITE test results (sandbox/mock only, never master) · REAL gate results · issues/deviations.