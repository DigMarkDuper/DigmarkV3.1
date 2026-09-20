# DIGMARK V3.1 — AUDIT of `D:\digmark-v3`

**Date:** 2026-09-15 · **Auditor:** EVA (read-only; no files changed, no spreadsheet writes, working tree untouched)
**Verification:** 100% of source read · live master schema confirmed via gspread metadata (read-only) · `scripts/smoke_test.py` passes (all 7 module pages + entrypoint render without exceptions).

---

## 1. Headline

Digmark V3 is a **small, clean, well-factored Streamlit app (~2,532 LOC Python across 22 files)** built directly on Google Sheets as the database. Its architecture is genuinely good: a thin presentation layer over a **pure, testable domain layer** (`services/metrics.py`, `utils/helpers.py`), a single config source of truth (`config/settings.py`), least-privilege auth, and 5-minute cached reads with cache-invalidation on writes. **It is an excellent candidate for migration to Next.js** because the domain logic is already matrixed, testable, and free of Streamlit widgets — it can be lifted to a TypeScript service layer almost 1:1.

The migration risk is not the logic — it is **fidelity of the write-back behaviors, the fuzzy column-name matching conventions, and offline/local parity**.

---

## 2. Current architecture condition

| Aspect | Status |
|---|---|
| Entry point & routing | ✅ Native `st.navigation` multipage, `position="hidden"`, URL-addressable routes (`/sosmed`, `/crm`, …). Simple, works. |
| Layer separation | ✅ Excellent: `pages/*` (UI) → `services/*` (data + logic) → `config/*`, `utils/*`. Metrics/helpers are pure. |
| Data layer | ✅ Per-tab cached loaders (`st.cache_data ttl=300`), graceful empty states, write→cache-clear. |
| Auth | ⚠️ Optional shared-password gate (plaintext compare, session timeout, lockout). Not real auth. |
| Frontend styling | ⚠️ A single ~400-line glassmorphism CSS blob injected via `unsafe_allow_html` (473 LOC `ui/components.py`). Works, but is the least portable piece. |
| Tests | ✅ `scripts/smoke_test.py` (fake data), `scripts/live_smoke.py` (real creds), `scripts/audit_live_sheets.py` (public gviz). No CI. |
| Docs | ✅ Good (README, DEPLOYMENT, DEVELOPMENT, SPREADSHEET_SCHEMA, TROUBLESHOOTING), with some drift (see Findings). |
| Git hygiene | ✅ Clean tree; `.gitignore` covers secrets; `secrets.toml.example` committed. |

**Health: GOOD.** No critical runtime bug present in the *current* code against the *live* spreadsheet (tab titles verified). Code is Ponytail-consistent (minimal, no dead frameworks).

---

## 3. File-by-file mapping → target Next.js

Legend — **Coupling column:** `st` = uses Streamlit runtime (not portable as-is); `—` = pure / portable 1:1 to TypeScript.

| Existing file | Function / role | Key deps | `st`? | Target Next.js |
|---|---|---|---|---|
| `app.py` | Entry: page config, optional login, connectivity guard, `st.navigation` build | streamlit, config, services, ui | yes | **`app/layout.tsx`** + App Router route group; auth middleware; nav registry |
| `config/settings.py` | SHEETS title map, business constants (targets, junk tags, cost, PIC), MODULES registry, COLORS palette | pure | no | **`src/config/`** (TypeScript constants; move secrets→env) |
| `services/sheets.py` | Service-account auth, `open_master()` (least-privilege, by key) | gspread, google-auth, streamlit(st.secrets) | partial | **`src/server/sheets/`** client (Node: `googleapis`/`gspread`-style) |
| `services/loaders.py` | Per-tab cached readers + date/empty normalization | pandas, streamlit(st.cache_data) | yes | **`src/server/loaders/`** + HTTP cache; Date-fns normalization |
| `services/metrics.py` | `funnel`, `monthly_snapshot`, `pending_counts`, `roi` (spend/leads/closing/cac/roas/omzet) | pandas, config, utils | **no (pure)** | **`src/server/metrics/`** — near 1:1 TS port; **unit-test target** |
| `services/writers.py` | `append_rows`, `update_cell`, `confirm_and_clear`, `sync_wa_to_crm` | gspread, streamlit(st.error), pandas | partial | **`src/server/writers/`** (Sheet write service + `sync` job) |
| `ui/components.py` | Global CSS design system + metric/section/topbar helpers | streamlit, pandas | yes | **`src/components/`** (Tailwind) + `app/globals.css` |
| `utils/helpers.py` | `normalize_phone`, `clean_idr`, `clean_text`, `to_datetime`, `sanitize_mixed`, `month_label`, `is_done` | pandas, (re) | **no (pure)** | **`src/server/utils/`** — 1:1 TS port; **unit-test target** |
| `pages/1_Overview.py` | Landing: hero, "Explore Workspace" nav cards, Quick Insight KPIs | streamlit, services | yes | **`app/page.tsx`** |
| `pages/2_Sosmed.py` | Production tracker + **live cell editor** (writes IG/YT/TIKTOK booleans + PIC/PROSES/Output) | streamlit(data_editor), plotly, writers | yes | **`app/(workspaces)/sosmed/page.tsx`** + data-grid component |
| `pages/3_Website.py` | Content fulfilment, pillar pending audit, charts | streamlit, plotly | yes | **`app/(workspaces)/website/page.tsx`** |
| `pages/4_WA_Admin.py` | Lead trend, closing funnel, status breakdown, source bar, CSV export | streamlit, plotly, pandas | yes | **`app/(workspaces)/wa-admin/page.tsx`** |
| `pages/5_CRM.py` | WA→CRM sync, import (xlsx/csv), search + filters, Mekari CSV export | streamlit, writers, helpers | yes | **`app/(workspaces)/crm/page.tsx`** |
| `pages/6_DM_Sosmed.py` | DM tracker, status/tag charts, prospect input form (append) | streamlit, plotly, writers | yes | **`app/(workspaces)/dm/page.tsx`** |
| `pages/7_Ads.py` | TikTok/Meta/Mekari spend, ROI, file import, destructive "clear tab" | streamlit, metrics, writers, helpers | yes | **`app/(workspaces)/ads/page.tsx`** |
| `pages/8_Interview.py` | Candidate tracking, KPIs, filters | streamlit | yes | **`app/(workspaces)/interview/page.tsx`** |
| `scripts/smoke_test.py` | Fake-data unit + AppTest page-boot suite | streamlit.testing, pandas | partial | **`tests/`** (Vitest) + Playwright |
| `scripts/live_smoke.py` | Live-data page-boot | streamlit.testing | partial | CI e2e (Playwright, scoped creds) |
| `scripts/audit_live_sheets.py` | Schema introspection via public gviz feed | urllib, json | no | Fold into data-contract tests |
| `requirements.txt` / `.streamlit/*` / `docs/*` | Dependencies, runtime config, deployment docs | — | — | Replace, not migrate |

---

## 4. Findings

### 🔴 BLOCKER (must verify before migration starts)
- **B1 — CRM sync writes Status to the wrong column (probable mapping bug).**
  Evidence: live `DATABASE NOMOR` header places `Status` at **column 15** (`No,No Hp,Nama,Domisili,…,Status(15),Updated Status After Treatment(16),Catatan(17),18+ empty` — gviz + gspread metadata). `services/writers.py:149-162` `_build_crm_rows` builds a fixed 18-cell row with `v("Status")` at **0-based index 17 → column 18** (a spare/empty column). Result: WA lead status is likely appended into a header-less column instead of `Status`.
  **Action:** confirm on a real synced row before migrating the sync logic; fix the target column in the adaptor. Not a spreadsheet change — a code-offset fix.

### 🟠 HIGH
- **H1 — Fuzzy column-name matching is pervasive and fragile.** The app deliberately locates columns by substring keywords (`_status_col` metrics.py:16-19; `_find_col` metrics.py:22-28; `Sumber`/`Kategori`/`biaya`/`cost`/`spent` in pages & writers). Any header rename silently breaks a metric. **Must be codified into the DATA CONTRACT** so the Next.js adaptor maps columns declaratively, once.
- **H2 — Spreadsheet title resolves at runtime via `settings.SHEETS` (by title, not tab id).** gspread `worksheet(title)` is **exact & case-sensitive** (verified in venv source). This works today, but is the single point where a rename breaks reads *and* writes. The adaptor should snapshot title→id at bootstrap and warn on drift.
- **H3 — Destructive `clear` on Ads/Mekari tabs** (`writers.confirm_and_clear`; wired in `pages/7_Ads.py`) wipes an entire source tab permanently after a 1-step confirm. Unchanged here, but in Next.js it must stay behind a server-side guard + audit log (no new scope, no accidental convenience).

### 🟡 MEDIUM
- **M1 — Dead / unwired scaffolding.** `load_insight` (loaders.py:53), `monthly_snapshot` (metrics.py:45), `pending_counts` (metrics.py:64), `helpers.is_done`/`month_label`, and `setting.ANNUAL_TARGETS` / `WEBSITE_TARGETS` are **defined but never called by any page** (verified by grep). The README/docs describe annual-target gauges that the Overview no longer renders. Decide: implement in V3.1 or drop deliberately — either way, don't carry it blindly.
- **M2 — Docs drift:** `docs/SPREADSHEET_SCHEMA.md` tab titles (`Sosmed Tracker`, `WA Admin Report`, `Database Nomor`, …) do **not** match the live master (verified: actual titles are `SOSMED`, `WEBSITE`, `INSIGHT`, `WA ADMIN REPORT`, `DATABASE NOMOR`, … — the **code is correct**, the doc is stale). Column listings are accurate. Refresh the doc to the verified titles.
- **M3 — Auth is a shared-password gate, not identity.** `app.py:31-72`: plaintext compare (`creds[user] == pwd`) in an in-code dict, 12h session, 5-attempt/60s lockout. No RBAC, no hashing, no per-user logs. Acceptable for an internal tool; define V3.1 auth target (see architecture).

### 🟢 LOW
- **L1 — No CI**; tests only run locally. Add a GitHub Action (lint + Vitest + Playwright smoke) during migration.
- **L2 — `requirements.txt` not pinned** (`streamlit>=…`); reproducible installs rely on lock. Pin for V3.1 parity testing.
- **L3 — 5-minute stale cache** (`st.cache_data ttl=300`) — fine for a dashboard; document the staleness contract in the Next.js cache so behavior parity is explicit.
- **L4 — `safe HTML` global CSS** (`ui/components.py`) is single-souce today (good) but heavy; migrate to Tailwind tokens, keep one source of truth.

---

## 5. Streamlit-specific pain points (why migrate)

1. **Session model** — Streamlit reruns the whole script per interaction; state must live in `session_state`/st.cache. In Next.js, cache moves server-side and becomes explicit.
2. **`unsafe_allow_html` styling** — powerful but brittle, hard to theme-test, and not the React way.
3. **Widgets couple logic to render** (`st.data_editor` diffing, `st.columns` layout, `st.stop()` flow control) — fine here, but each is a bespoke migration item.
4. **Deployment/credentialing** — Streamlit Cloud + `st.secrets` is simple today but limits to a single process and Python-only stack.
5. **Testing realism** — AppTest is framework-specific; a JS/TS service layer gets standard tooling (Vitest, Playwright).

---

## 6. Migration readiness (for Next.js)

| Criterion | Readiness |
|---|---|
| Pure domain logic reusable | ✅ metrics.py + helpers.py fully portable (~90% of business logic) |
| Data contract documented | 🟠 Exists implicitly (fuzzy matching); must be made explicit |
| Write-side behaviors understood | 🟠 Sync offset (B1) + clear (H3) + append semantics need care |
| Frontend components mapped | ✅ All 8 pages → clean route/component map (table above) |
| Auth/deploy path defined | 🟡 Needs explicit V3.1 decision |

**Overall: READY to plan, not yet to execute.** Do the contract + architecture + plan (Phases 2–4) and validate before any code is ported. Per instructions, **no migration code has been written** and none should be until this audit and its blockers are accepted.

---

## 7. BLOCKERS / ASSUMPTIONS

- **BLOCKER** B1 (CRM sync column offset) — confirm against a live synced row before porting sync.
- **ASSUMPTION** A1 — Google Sheets must remain the **single write-target (READ‑ONLY is not enough: the app writes cells/rows)**. So the V3.1 contract must preserve write-back parity (edits, appends, cache invalidation), not just reads. Pending Ejak confirmation of a future Postgres switch-back date.
- **ASSUMPTION** A2 — Auth: internal tool, single-team. V3.1 default = simple session/identity; full SSO/RBAC out of scope unless requested.
- **ASSUMPTION** A3 — Target deployment: a Vercel/Node static + serverless (or self-hosted Docker) with the service account held server-side only.
- **ASSUMPTION** A4 — Multi-user concurrency is small (internal team); last-write-wins cell edits are acceptable (same as today).