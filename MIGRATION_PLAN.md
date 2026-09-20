# DIGMARK V3.1 — Migration Plan (Streamlit → Next.js)

**Phase 4 deliverable.** Sequencing by risk + dependency. **No code has been migrated** (this is the plan; execution starts only after audit + contract + architecture are validated by Ejak).

Principles: never break Digmark V3 in production · never change the spreadsheet · no big-bang rewrite · move verified logic 1:1, design only what must change.

---

## 0. Gate before any execution

1. ✅ Audit accepted (DIGMARK_V3_1_AUDIT.md).
2. ✅ Data Contract accepted (DATA_CONTRACT.md) + **B1 (CRM sync Status offset) confirmed/fixed in the adapter spec**.
3. ✅ Architecture accepted (NEXTJS_ARCHITECTURE.md), incl. auth option (recommended B).
4. Decision recorded on unwired features (M1: `INSIGHT`/targets) — implement or drop.

---

## 1. Work classification

| Category | Items |
|---|---|
| **Move 1:1 (port, no redesign)** | `utils/helpers.py` → TS utils · `services/metrics.py` (funnel, roi, monthlySnapshot, pendingCounts) · `services/sheets.py` auth pattern · `config/settings.py → config/*` · per-tab loaders (cache TTL 300) |
| **Rewrite (framework-bound)** | All 8 `pages/*.py` + `app.py` routing → App Router + components · `ui/components.py` CSS + widgets → Tailwind components · `st.data_editor`/`st.plotly_chart`/`st.download_button`/`st.form` → React components |
| **Preserve (carry, do not change)** | Business constants, junk tags, done keywords, targets, brand palette · normalization semantics (phone/IDR/date/sanitize) · write semantics (`USER_ENTERED`, booleans as real booleans) · graceful empty states · 300s cache + write-invalidate |
| **Refactor (safe, motivated)** | Replace fuzzy column-name matching (H1) with a **declarative schema map** in the adapter · append CRM by **column header** not fixed offsets (fixes B1) · title→gid bootstrap with drift warning (H2) · pin dependencies (L2) |
| **Defer** | Postgres source (interface only) · SSO/RBAC build · multi-tenant · city map · annual-target gauges unless requested |

---

## 2. Suggested order (lowest risk first)

Phases are cumulative; each ends with parity verification against V3.

### Phase A — Foundation & parity harness (highest safety)
- [ ] Scaffold Next.js repo + Tailwind + Vitest + Playwright.
- [ ] Port pure logic: `utils/helpers.py` + `services/metrics.py` to TS with **unit tests** (port the smoke_test assertions verbatim — they encode verified expected values, e.g. `spend=1,254,245`, phone `0813-000→62813000`).
- [ ] Port `config/settings.py` → `src/config/*`.
- [ ] Build **adapter interface + schema map** (declarative columns; fixes B1/H1).
- **Exit:** all pure-logic tests pass; no UI yet; V3 untouched.

### Phase B — Google Sheets adapter (server-side, read/write)
- [ ] Sheets client (least-privilege, service account) + title→gid bootstrap + drift check.
- [ ] `read.table(key)` + normalize → typed DTOs + server cache (TTL 300) + write-invalidate.
- [ ] `write`: append (`USER_ENTERED`) / updateCell / clear (server-guarded, audit-logged).
- [ ] `syncWaToCrm` port with **Status column fix** and dedupe/junk-filter parity.
- **Exit:** adapter e2e test hits a **sandbox copy** of the master (never the live master) and round-trips append/update/clear; V3 still live.

### Phase C — Server API + auth
- [ ] `/api/tables/{key}` (GET/POST/PATCH), `/api/import`, `/api/sync/wa-to-crm`, `/api/clear/{key}`.
- [ ] Auth middleware (option B: session identity) + audit logging on writes/clears.
- **Exit:** all endpoints pass contract tests; no UI yet.

### Phase D — UI shell + components
- [ ] Root layout + `globals.css` design tokens; Topbar/Hero/Footer/MetricCard/MetricRow; charts/grid/inline-editor components.
- [ ] Overview (`/`) rendered read-only from adapter.
- **Exit:** Overview matches V3 on a sandbox dataset.

### Phase E — Workspace pages (in dependency order)
1. `website` (read-only, simple) → 2. `wa-admin` (read, charts, CSV) → 3. `interview` (read-only) →
4. `dm` (append form) → 5. `ads` (import, spend, clear) → 6. `crm` (sync, import, export) →
7. `sosmed` (**inline cell editor last** — highest write complexity).

Each: render from adapter (read-only first) → parity check vs V3 → then enable writes.

### Phase F — Cutover & decommission
- [ ] Shadow-run V3.1 (read-only) alongside V3 against live master; compare derived metrics.
- [ ] Enable writes after parity sign-off.
- [ ] Route traffic to V3.1; keep V3 on a branch/URL fallback for 1 release cycle.
- [ ] Update docs; delete/replace Streamlit scaffold only after full validation.

---

## 3. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **B1 CRM sync offset** shipped to new code | High | Medium | Fix in adapter schema map (column-header based) in Phase B; test in sandbox |
| R2 | Fuzzy column matching silently wrong after header drift | Medium | High | Declarative schema map + bootstrap drift check (H1/H2) |
| R3 | Write semantics drift (formulas, formatting, booleans) | Medium | High | Preserve `USER_ENTERED` + real boolean writes; parity tests in sandbox |
| R4 | Destructive `clear` misbehaves in new UI | Low | High | Server-guarded 2-step + audit log + confirm parity |
| R5 | Parity gaps (derived metrics differ) | Medium | Medium | Port smoke_test assertions + read-only shadow run before writes |
| R6 | Cache/refetch mismatch (V3 300s) surprises users | Low | Low | Match TTL + write-invalidate; document |
| R7 | Auth not decided → scope creep | Medium | Medium | Lock auth option in Architecture before Phase C |
| R8 | Unwired features (INSIGHT/targets) ported by mistake | Medium | Low | Decide + drop or implement explicitly (M1) |

---

## 4. Explicitly NOT done in this phase
- No file deleted, no spreadsheet modified, no production behavior changed.
- No migration code written. Only 4 planning docs produced (this + Audit + Data Contract + Next.js Architecture).
- **Stop condition met by design:** audit → data contract → architecture → migration plan are complete; **full migration waits for Ejak's validation of these docs** (and the B1 confirmation).