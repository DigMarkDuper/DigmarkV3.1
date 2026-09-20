# PHASE E — WORKSPACE 3: INTERVIEW (READ-ONLY) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/8_Interview.py` → `app/(workspaces)/interview/page.tsx` (route `/interview`) preserving candidate tracking, filters, KPI calculations, and follow-up/interview status. **Read-only** (V3 performs no writes here).

## PREREQUISITE — follow the established workspace pattern
Workspaces 1 (Website) and 2 (WA Admin) are done. Read these and mirror structure/conventions EXACTLY:
- `app/(workspaces)/website/page.tsx` and `app/(workspaces)/wa-admin/page.tsx` — route shells (session gate via `/api/auth/me`, data via `useApi`, states, Topbar/WorkspaceNav/Footer/ModuleHero).
- `src/workspaces/waAdmin.ts` — pure derivations module pattern.
- `src/workspaces/waAdmin.test.tsx` — test pattern (component server-render via react-dom/server).

Structure: route shell + `src/workspaces/InterviewDashboard.tsx` + `src/workspaces/interview.ts` (pure derivations) + `src/workspaces/interview.test.tsx`.

## Authoritative sources — READ THESE
1. `D:/digmark-v3/pages/8_Interview.py` — V3 behavior to preserve.
2. `D:/digmarkv3.1/src/server/adapter/schema.ts` — `interview` app key → tab `SCHEDULE INTERVIEW`, declared columns:
   `Tanggal, Nama Calon Siswa, Nomor Whatsapp, Pilihan Program, PIC Interview, Status Follow-Up, Tanggal Interview, Waktu Interview, Tipe Interview, Hasil Interview, Catatan PIC`.
3. `D:/digmarkv3.1/src/lib/api-client.ts` — `useApi`.
4. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` §C — design system.

## Behavior to preserve (V3 8_Interview.py) — READ-ONLY
### KPI metrics (top, before data-load branch)
- **Empty data:** render section "Metrik Kunci" sub "Belum ada data." with a MetricRow of zeroed cards: Total Kandidat=0 👤, Menunggu Follow-up=0 ⏳, Interview Selesai=0 ✅, Lolos Seleksi=0 🏆. Then Footer, stop.
- **Non-empty:** section "Metrik Kunci" sub "Ringkasan kandidat dan hasil seleksi.",
  - Total Kandidat = len(rows)
  - Menunggu Follow-up = count where `Status Follow-Up` contains (regex, case-insensitive) `No Respon|Follow Up|Reschedule|Pending|Belum|Menunggu`. If col missing → 0.
  - Interview Selesai = count where (`Hasil Interview` lowercased ≠ "") OR (`Status Follow-Up` stripped == "Done"). Handle missing cols defensively.
  - Lolos Seleksi = count where `Hasil Interview` (lowered) contains regex `lulus|diterima` AND NOT contains `tidak lulus|tidak `. If col missing → 0.

### Filter Kandidat
- Section "Filter Kandidat" sub "Difilter list per PIC, follow-up, dan hasil."
- Three multiselect filters in a 3-col responsive row, options = sorted distinct non-null values of:
  - `PIC Interview` (col optional; skip if absent)
  - `Status Follow-Up` (col optional)
  - `Hasil Interview` (col optional)
- Apply: when a filter has selections, keep rows whose value is in the selection (for that col). Independent per filter.
- After filtering: MetricRow single card ("Hasil Filter", len(fdf), 🎯) then a DataTable of ALL filtered rows (all declared columns).
- Empty filter result: render DataTable with zero rows / EmptyState appropriately (V3 shows an empty table; use DataTable which should handle empty gracefully — verify).

### Header/branding
- Topbar + ModuleHero(🎤, "Interview", "Progres kandidat per follow-up dan hasil interview.").
- Footer + "🔄 Refresh Data" refetch.

## Design system (REUSE only)
Use Phase D components exactly as prior workspaces. Route at `app/(workspaces)/interview/page.tsx`.

## Implementation gates (run ALL, report REAL results)
1. `npx tsc --noEmit` → 0
2. `npx vitest run` → all existing 230 stay green + new interview tests (derivations + dashboard server-render)
3. `npm run build` → success, `/interview` listed
4. `npm run lint` → no NEW errors (10 Phase A warnings OK)
5. `git -C D:/digmark-v3 status --short` → clean
6. `curl -s http://localhost:3413/interview` → 200 (API 401 without session — expected)

## Deliverable (concise, high-signal)
Files created/modified · API endpoints used · parity notes (esp. empty-state zeroed KPIs, the "Menunggu Follow-up" regex, "Interview Selesai" logic, "Lolos Seleksi" negative-exclusion) · REAL gate results · issues/deviations.