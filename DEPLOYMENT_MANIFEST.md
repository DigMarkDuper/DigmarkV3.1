# DIGMARK V3.1 — Deployment Manifest

## Identity
| Field | Value |
|-------|-------|
| Application | Digmark V3.1 |
| Source project | `D:\digmarkv3.1` (development workspace) |
| Deployment package version | 1.0.0 |
| Digmark version | 3.1.0 |
| Build date | 2026-09-19 |
| Environment | Production |
| Package base dir | `Digmark_V3.1_Production\` |

> Note: this package is **source + config + docs**. The production bundle
> (`node_modules`, `.next`) is intentionally **not** shipped; it is rebuilt on
> the target via `npm ci` + `npm run build` to guarantee reproducibility and
> avoid shipping build artifacts/OS-specific binaries.

## Included components
- `app/` — App Router pages (home, login, 8 workspaces) + 14 API routes
- `src/` — components, config, server adapter (Google Sheets), API controllers,
  metrics, workspaces, auth, audit, insights-import
- `public/` — static assets (favicon, stock SVGs)
- Build/config: `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`,
  `next-env.d.ts`, `eslint.config.mjs`
- Dependency manifest: `package.json`, `package-lock.json`
- `.env.example` (placeholders only), `.gitignore`
- `data/` — empty runtime audit-log directory
- Documentation: `README.md`, `DEPLOYMENT.md`, `CONFIGURATION.md`,
  `HEALTHCHECK.md`, `TROUBLESHOOTING.md`, `SERVER_REQUIREMENTS.md`,
  `DEPLOYMENT_MANIFEST.md`, `PRODUCTION_AUDIT_REPORT.md`, `VERSION.txt`

## Excluded development files (intentionally)
- `.git/`, `.gitignore` internals, `.planning/`, `.phase-e/`
- `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`, `nextdbg.log`
- `docs/*.md` — UI design specs (dev artifacts)
- `e2e/`, `scripts/` (empty in source), Vitest/Playwright config (`vitest.*`,
  `vitest.setup.ts`, `playwright.config.ts`)
- `src/**/*.test.ts(x)`, `src/**/__fixtures__/` — unit tests & fixtures
- All top-level legacy/analysis markdown (`AGENTS.md`, `CLAUDE.md`,
  `DATA_CONTRACT.md`, `DIGMARK_V3_1_AUDIT.md`, `DIGMARK_V3_1_LOGIC_CONTRACT.md`,
  `MIGRATION_LOG.md`, `MIGRATION_PLAN.md`, `NEXTJS_ARCHITECTURE.md`,
  `INSIGHT_UPLOAD_SPEC.md`, `README.md` from source)
- **No real credentials anywhere** — no `.env.local`, no service-acct JSON.

## Required external configuration (IT provides)
1. `.env.local` created from `.env.example` with real values:
   - 12× `GOOGLE_SERVICE_ACCOUNT_*` vars (from a GCP service-account JSON key)
   - `MASTER_SPREADSHEET_KEY`, `REGISTRATION_SPREADSHEET_KEY`
     (+ `SANDBOX_SPREADSHEET_KEY` for tests)
   - `AUTH_SECRET`, `AUTH_USERS`
2. Master/Registration (and Sandbox) spreadsheets shared with the account.
3. Outbound HTTPS to `*.googleapis.com` allowed from the server.

Full table: `CONFIGURATION.md`.

## Known limitations
- **No local database / no offline mode.** All data requires live Google Sheets
  connectivity. If Google is unreachable, dashboards fail to load data.
- **PDF export is client-side** (browser `window.print()`); no server-side PDF;
  requires a browser with a PDF printer.
- Auth is first-party; no SSO/LDAP/OAuth login.
- Single-process by design; extremely high concurrent dashboard load is
  unverified.
- `SANDBOX_SPREADSHEET_KEY` is required only for write/integration tests (not
  production runtime).

## Known issues (pre-existing, non-blocking)
- eslint flags ~10 pre-existing warnings (none blockers) and reports the `eslint`
  version as outside the supported range (tooling only, not shipped logic).
- The read-mostly design intentionally exposes **no destructive UI without
  confirmation**; any write requires an `editor` session (403 for `viewer`).

## Database / storage requirements
- None (no DB). Storage = Google Sheets + local `data/audit.log.jsonl`.
- `data/` must be writable by the service user.

## External integrations
| Integration | Direction | Purpose |
|-------------|-----------|---------|
| Google Sheets (master) | RW | All business data + write operations |
| Google Sheets (registration) | R | Read-only command center (Form Pendaftaran) |
| Google Sheets (sandbox) | RW | Write tests only |
| Google OAuth/service account | — | Auth for all the above |