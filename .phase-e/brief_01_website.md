# PHASE E — WORKSPACE 1: WEBSITE (READ-ONLY) — REX IMPLEMENTATION BRIEF

You are REX, implementation engineer. Produce a working, verified implementation. Do NOT modify anything under `D:\digmark-v3` (read-only source). Work only in `D:\digmarkv3.1`.

## Objective
Migrate V3 page `pages/3_Website.py` → `app/(workspaces)/website/page.tsx` as a **read-only** workspace, preserving business behavior, data semantics, and the Phase D design system.

## Authoritative sources — READ THESE FIRST (in this order)
1. `D:/digmark-v3/pages/3_Website.py` — the V3 behavior you are migrating.
2. `D:/digmarkv3.1/MIGRATION_PLAN.md` (Phase E section) + `D:/digmarkv3.1/DATA_CONTRACT.md` + `D:/digmarkv3.1/DIGMARK_V3_1_AUDIT.md` + `D:/digmarkv3.1/NEXTJS_ARCHITECTURE.md`.
3. `D:/digmarkv3.1/docs/UI_DESIGN_SPEC.md` — the Phase D design system (NEO's authoritative spec). Pay attention to §C.1 Topbar, §C.4 ModuleHero, §C.5/C.6 MetricCard/MetricRow, §C.9 SectionHeader, §C.10 DataTable, §C.11-13 EmptyState/ErrorState/LoadingState, §C.16 Field, §C.17 ChartContainer, §C.2 WorkspaceNav.
4. `D:/digmarkv3.1/src/server/adapter/schema.ts` — the `website` app key maps to tab `WEBSITE` with these declared columns (this is what the API returns as row keys):
   `Kode Konten, Deadline, Tanggal Posting, Content Pillar, SEO Rekomendasi, Judul, Status Check, Bahan Upload, LinkFolder Design, Designer, Status Writting, Status Design, Status Post, Link Live`.
5. `D:/digmarkv3.1/src/lib/api-client.ts` — the `useApi` hook + request helpers you MUST use. Rows come from `GET /api/tables/website`.
6. `D:/digmarkv3.1/src/config/constants.ts` — `DONE_KEYWORDS`, `COLORS`, module registry.
7. `D:/digmarkv3.1/app/page.tsx` — the reference pattern for auth gate, data access, states, and design-system usage.

## DATA ACCESS RULE (mandatory)
- Browser consumes ONLY `GET /api/tables/website` (via `useApi`). NEVER import Sheets libs in the UI, never hardcode spreadsheet columns that aren't the declared schema columns, never compute business metrics in the browser where the pattern is to receive them (Overview computes none; workspace pages may compute simple derived counts ONLY if that mirrors V3 page logic and uses the declared columns — for Website this is: total/live/pending counts and per-pillar remaining counts, which are pure derivations from returned rows, mirroring the V3 page exactly).

## Behavior to preserve (from 3_Website.py) — READ-ONLY ONLY
- Empty state: if no rows → render Topbar + ModuleHero(🌐, "Website / SEO", "Fulfilment konten per pilar & audit pending.") + EmptyState "Data website tidak tersedia." Stop.
- Non-empty: Topbar + ModuleHero(🌐, "Website / SEO", "Progres fulfilment konten per pilar & audit pending.").
- **Filter:** a month filter on the deadline-month. V3 reads `Bulan-Deadline` (a derived month label from `Deadline`). The schema column is `Deadline` (DD/MM/YYYY string). Derive the month label from `Deadline` (see `src/server/utils/helpers.ts` `monthLabel` / `toDatetime` for exact month derivation used by V3.1 metrics) and present a multiselect of distinct month labels, defaulting to all selected; filter rows to those whose deadline-month is in the selection. NOTE: in V3, if the column is absent the filter is skipped (no filtering). Preserve that: only apply the filter if we can derive a month.
- **Key metrics row (MetricRow, 3 cards):** Total Task = len(filtered), Live Pages = count where "Status Post" matches DONE_KEYWORDS (upper/strip), Pending = count where NOT done.
- **Main viz:** a donut/pie (Live vs Pending) using the brand colors success/warn — use ChartContainer + an SVG donut OR a chart. Per spec §C.17 ChartContainer is the empty frame REX wires. Prefer a lightweight dependency-free SVG donut inside ChartContainer (no new charting dependency unless necessary). Plus a "Sisa tugas per pilar" group: counts of remaining (not-done) rows per pillar, matching V3's pillar regex categories:
  - Artikel → Content Pillar contains "Article" (case-insensitive)
  - News → contains "News|Berita" (regex)
  - Galeri → contains "Galery|Gallery|Album"
  - LinkedIn → contains "Linkedin"
  (Remaining = not-done AND pillar matches; count per category; mirror the V3 semantics.)
- **Detailed data (two tabs):** Tab 1 "Audit Pending": if all done → success "Semua tugas clear! 🎉"; else group remaining rows by `Content Pillar` (sorted), each expander shows table of `Kode Konten, Judul, Deadline`. Tab 2 "Master Database": full filtered table (`DataTable`) of all declared columns.
- **Footer + Refresh** button that refetches the data (mirror V3 refresh_button → refetch).

## Design system (REUSE, do not invent)
- Use only the Phase D components. Route must live at `/website` under `app/(workspaces)/website/page.tsx`. You may need to create `app/(workspaces)/` route group and a shared layout/shell if not present. See how `WorkspaceNav`/`ModuleHero` are meant to be used (they were built Phase D, ready).
- New components ONLY if genuinely workspace-specific; prefer composition.

## Implementation gates (run and report ALL)
1. `npx tsc --noEmit` → exit 0
2. `npx vitest run` → all existing (206) tests still pass + add a component test for the Website page (render via react-dom/server per the existing `components.test.tsx` pattern) asserting key derived counts.
3. `npm run build` → success
4. `npm run lint` → no NEW errors (10 pre-existing Phase A unused-param warnings are acceptable)
5. Verify `D:\digmark-v3` git status is still clean (untouched).

## Collaboration protocol
- Produce the page + any shared workspace shell under `app/(workspaces)/`. Add tests. Run all gates. Report: files created/modified, API endpoints used, parity notes, test results, and any issue you could not resolve.

## Deliverable
Report back (concise, high-signal):
- Files created/modified (exact paths)
- API endpoints used
- Derived-count parity notes vs V3
- Gate results (tsc / vitest / build / lint / v3-clean) — REAL numbers
- Any deviations or issues
- Confirm the page renders (if you can run a browser, note the route loads; otherwise say code-verified only)
