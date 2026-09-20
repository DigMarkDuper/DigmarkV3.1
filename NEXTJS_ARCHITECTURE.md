# DIGMARK V3.1 — Next.js Target Architecture

**Scope:** Architecture ONLY (design). No migration code written. Based on `DIGMARK_V3_1_AUDIT.md` + `DATA_CONTRACT.md`.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · server/API layer · Google Sheets read/write via Data Adapter. **No big-bang rewrite at this phase.**

---

## 1. Design principles (carried from V3's good parts)

1. **Thin UI over a pure domain layer** — metrics/helpers are already Streamlit-free; port them to TS as pure functions with unit tests.
2. **One config source of truth** — `config/settings.py` → `src/config/` (SHEETS map, constants, registry, palette).
3. **Least privilege** — service account, `spreadsheets` scope, server-side only.
4. **Sheet-swap safety** — UI consumes normalized DTOs; only the Data Adapter knows "Sheets".
5. **Minimize churn** — lift validated logic 1:1; do not redesign business rules during migration.

---

## 2. Folder structure (target)

```
digmark-v3.1/
├─ app/                          # UI routes (Next.js App Router)
│  ├─ layout.tsx                 # root layout + globals.css
│  ├─ (auth)/login/page.tsx      # login (if identity auth adopted)
│  ├─ page.tsx                   # Overview / landing
│  ├─ (workspaces)/
│  │  ├─ sosmed/page.tsx
│  │  ├─ website/page.tsx
│  │  ├─ wa-admin/page.tsx
│  │  ├─ crm/page.tsx
│  │  ├─ dm/page.tsx
│  │  ├─ ads/page.tsx
│  │  └─ interview/page.tsx
│  └─ api/                       # server endpoints (or use tRPC)
│     ├─ tables/[key]/route.ts   # GET (normalized rows), POST (append), PATCH (updateCell)
│     ├─ sync/wa-to-crm/route.ts
│     ├─ import/route.ts
│     └─ clear/[key]/route.ts    # server-guarded destructive op
├─ src/
│  ├─ config/                    # port of config/settings.py
│  │  ├─ sheets.ts               # app-key → tab title map
│  │  ├─ constants.ts            # targets, junk tags, done keywords, cost, PIC
│  │  ├─ modules.ts              # route/page registry (from MODULES)
│  │  └─ colors.ts
│  ├─ server/
│  │  ├─ adapter/                # ⭐ Data Adapter (contract in DATA_CONTRACT.md §6)
│  │  │  ├─ sheets/              #   Google Sheets client (Node googleapis)
│  │  │  │  ├─ auth.ts           #   service-account auth (spreadsheets scope)
│  │  │  │  ├─ client.ts         #   workbook bootstrap, title→gid snapshot
│  │  │  │  ├─ read.ts
│  │  │  │  └─ write.ts          #   append (USER_ENTERED) / updateCell / clear (guarded)
│  │  │  ├─ schema.ts            #   app-key → {tab, columns[]}
│  │  │  ├─ normalize.ts         #   phone, IDR, dates, sanitize (port of utils/helpers.py)
│  │  │  └─ source.ts            #   SheetSource interface + Postgres placeholder
│  │  ├─ loaders/                # per-tab fetch + cache (replaces st.cache_data)
│  │  ├─ metrics/                # funnel, monthlySnapshot, roi, pendingCounts (port)
│  │  ├─ writers/                # appendRows, updateCell, clearTable, syncWaToCrm
│  │  └─ utils/                  # pure helpers (port of utils/helpers.py)
│  └─ lib/                       # shared TS: types (DTOs), validation, logging
├─ src/components/               # Tailwind UI components (port of ui/components.py)
│  ├─ layout/ (Topbar, Hero, Footer)
│  ├─ metrics/ (MetricCard, MetricRow, Stat)
│  ├─ charts/ (wrap Recharts/vis: bar, pie, line — Replaces plotly)
│  ├─ grid/ (data table + inline cell editor → replaces st.data_editor)
│  ├─ sections/ (SectionHeader, EmptyState, ErrorState)
│  └─ ui-common.ts (rupiah formatter + palette constants)
├─ public/ / styles/globals.css  # Tailwind theme tokens (design system)
├─ tests/ (Vitest unit + Playwright e2e)
├─ .env.example                  # SPREADSHEET_KEY + Google SA JSON path (server-side)
└─ next.config.*
```

---

## 3. Route structure (mirrors V3 MODULES + stable URL paths)

| V3 route (`url_path`) | Next.js route | Title |
|---|---|---|
| `/` | `app/page.tsx` | Overview / Command Center |
| `/sosmed` | `app/(workspaces)/sosmed/` | Social Media |
| `/website` | `app/(workspaces)/website/` | Website / SEO |
| `/wa-admin` | `app/(workspaces)/wa-admin/` | WhatsApp Admin |
| `/crm` | `app/(workspaces)/crm/` | CRM / Leads |
| `/dm` | `app/(workspaces)/dm/` | Digital Marketing |
| `/ads` | `app/(workspaces)/ads/` | Ads Performance |
| `/interview` | `app/(workspaces)/interview/` | Interview |

All from `settings.MODULES` → `src/config/modules.ts` (single source of truth, same as Streamlit registry).

---

## 4. Component structure (port of `ui/components.py` → Tailwind)

Streamlit widget → Next.js component:

| Streamlit | Next.js |
|---|---|
| `st.markdown(...unsafe_allow_html) + .dm-*` CSS | `components/**` React + Tailwind tokens (one `globals.css` design-token source) |
| `st.metric` / `metric_card` / `metric_row` | `MetricCard` / `MetricRow` |
| `st.plotly_chart` | Chart wrapper (Recharts or a small plotly-compatible lib) |
| `st.dataframe` | `DataTable` (TanStack Table) |
| `st.data_editor` (Sosmed inline edit) | `inline-editable grid` → PATCH per cell + optimistic UI |
| `st.data_editor` checkbox cols | `BooleanEditCell` (write true booleans) |
| `st.tabs` | Tab component |
| `st.download_button` (CSV) | client CSV export via adapter data |
| `st.form` | `<form>` / controlled state |

---

## 5. Data layer (replaces `services/loaders.py` + `st.cache_data`)

- **Cache:** per-tab keyed cache on the **server** (in-memory LRU + optional Redis for multi-instance), default **TTL 300s** to match V3. Invalidate on write (append/update/clear) for that tab only.
- **Fetch:** `adapter.read.table(key)` → normalize → typed DTO. Missing/absent tab → empty result (parity with V3 graceful empty state).
- **DTOs:** one TS interface per domain (SosmedRow, WebsiteRow, WaAdminRow, CrmRow, DmRow, AdsRow, MekariRow, InterviewRow, InsightRow).
- **No rules in the UI** — pages call `metrics.*` use-cases via API; no direct sheet access in components.

---

## 6. API / server layer

Minimal, REST (or tRPC) behind a thin `/api/*` boundary:

| Endpoint | Method | Role |
|---|---|---|
| `GET /api/tables/{key}` | read | return normalized rows (cached) |
| `POST /api/tables/{key}` | write | append rows |
| `PATCH /api/tables/{key}` | write | update one cell (rowIndex, column, value) |
| `POST /api/import/{key}` | write | file upload (csv/xlsx) → append |
| `POST /api/sync/wa-to-crm` | write/atomic | run sync (returns summary) |
| `POST /api/clear/{key}` | write/destructive | **server-guarded** 2-step, audit-logged |
| `GET /api/meta/tabs` | read | adapter bootstrap/drift check |

- **Auth middleware:** applied to all `/api/*` (and to mail-protected pages). Wallet of strategy options in §7.
- **Server-side only:** the Google service account never leaves the server; browser never holds Sheets credentials.

---

## 7. Authentication strategy (V3.1 decision)

V3 = optional shared-password gate (`app.py:31-72`), plaintext compares, session timeout, lockout. V3.1 options (recommend **B**):

| Option | Description | Risk | Fit |
|---|---|---|---|
| **A — Keep parity gate** | shared password, single app password (like V3) | lowest, but no identity | internal-only acceptable |
| **B (recommended)** | **Single sign-on via a lightweight session** — e.g. Google OAuth (the org already trusts Google) or a simple session secret via Vercel/NextAuth; role=viewer/editor on the SA | moderate | best fit: per-user audit, no RBAC build |
| C — Full RBAC/SSO (Okta/Entra) | hard | out of scope for an internal tool | defer |

Minimum for V3.1: **identity + session + server-side audit of destructive ops** (clear) regardless of option.

---

## 8. Environment variables (server-side only)

```dotenv
SPREADSHEET_KEY=1AbC...               # port of secrets.spreadsheet_key
GOOGLE_SERVICE_ACCOUNT_JSON=<path>    # port of secrets.gcp_service_account
AUTH_SECRET=...                       # (if session auth)
# optional:
REDIS_URL=...                         # multi-instance cache
LOG_LEVEL=info
```
None of these reach the browser. `.env.example` committed; real `.env` gitignored (mirrors `.gitignore` hygiene from V3).

---

## 9. Deployment strategy

- **Recommended:** Vercel (Next.js) — static UI + serverless `/api` functions, env vars in dashboard, auto-deploy on push. Sheets SA scope `spreadsheets` only.
- **Alternative:** self-hosted Docker (Node) behind a reverse proxy for full control.
- **Impact of switch:** deployment doc refreshed from `docs/DEPLOYMENT.md`; go-live path = shadow-run new UI against Sheets in read-only mode, then enable writes after DTO parity validation.
- **No big-bang cutover:** see MIGRATION_PLAN.md — run V3 (Streamlit) alongside V3.1 until parity is proven.

---

## 10. Streamlit → Next.js mapping (one-line summary)

| Streamlit concept | Next.js target |
|---|---|
| `app.py` + `st.navigation` | App Router + `src/config/modules.ts` |
| `pages/*.py` (8) | `app/(workspaces)/**` (8) + `/` |
| `ui/components.py` (+ CSS) | `src/components/**` + Tailwind `globals.css` |
| `services/loaders.py` + `st.cache_data` | `src/server/loaders` + server cache (TTL 300) |
| `services/metrics.py` | `src/server/metrics` (pure TS, Vitest) |
| `services/writers.py` | `src/server/writers` + guard rails |
| `services/sheets.py` | `src/server/adapter/sheets` (least-privilege auth) |
| `utils/helpers.py` | `src/server/utils` + `adapter/normalize` |
| `config/settings.py` | `src/config/**` |
| `scripts/smoke_test.py` | `tests/**` (Vitest) + Playwright e2e |
| `.streamlit/secrets.toml` | `.env` (server) + env dashboard |

---

## 11. Explicitly deferred (do NOT build now)

- Actual code migration / rewrite (Phase 4 is only a plan).
- Postgres implementation (adapter interface reserved, not built).
- Multi-tenant / SSO / RBAC build-out (strategy selected in §7, not implemented).
- Re-adding features dropped in V3 (e.g. lead city map) unless requested.