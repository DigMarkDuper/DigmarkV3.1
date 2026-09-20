# DIGMARK V3.1 — Production Audit Report

Audit date: 2026-09-19 · Source: `D:\digmarkv3.1` · Package: `E:\Digmark_V3.1_Production`

## 1. Executive Summary

Digmark V3.1 is **READY WITH CONDITIONS** for production deployment. The
application is a well-structured Next.js system with a clean security posture
(least-privilege Google scope, role-based write access, no secrets in source,
structured errors with no stack-trace leakage). The production build and a
against-live-sheets smoke test **pass** in a clean workspace on drive E:. The
only conditions are the IT-side provisioning items (service-account credentials,
shared sheets, outbound Google access, and credential rotation — the shipped
`.env.example` uses placeholders/change-me values that must be replaced).

## 2. Architecture

```
Browser ──▶ Reverse Proxy (TLS) ──▶ next start :3415 ──▶ Google Sheets API
                                                        └─▶ data/audit.log.jsonl
```
Next.js 16.3.5 App Router, React 19, TypeScript, Tailwind 4. No database; data
in Google Sheets via service account (scope: `spreadsheets` only). Auth:
first-party cookie (`dm_session`, httpOnly, SameSite=Lax, Secure off-loopback).
No background jobs/cron inside the app.

## 3. Audit Results

| Area | Status | Findings |
|------|--------|----------|
| Application | **PASS** | Builds + starts cleanly; 22 routes (8 workspaces + 14 API); smoke-tested against live sheets |
| Dependencies | **PASS** | Lockfile present; `npm ci` reproduces 430 packages; prod/dev separated |
| Security | **PASS** | No real secrets in source; least-privilege scope; 403 for viewer writes; clear/import/sync layered-guarded; no stack-trace leakage |
| Configuration | **PASS** | `.env.example` covers all required vars with placeholders; `.env.local` demanding none missing |
| API Integration | **WARN** | Verified read for master + registration; write path is code-reviewed + editor-gated but write-tested only against sandbox (no destructive write performed on live MASTER) |
| Storage | **PASS** | No DB; Google Sheets + local audit log; `data/` writable |
| Build | **PASS** | `npm run build` succeeds in a clean E: workspace (Next 16, Turbopack, TS ok) |
| Deployment | **PASS** | Clean install validated: `npm ci` → `.env` → build → start → health → login → data |

**Tally:** 7 PASS · 1 WARN · 0 FAIL.

## 4. Critical Issues

None discovered in the code/app itself that block deployment. All conditions to
resolve are **provisioning/ops**, not software:

1. **Real credentials must be created** (`AUTH_SECRET`, `AUTH_USERS`, service
   account key). The package ships placeholders only — the app **will not**
   function until IT provides these.
2. **Shared spreadsheets** — the service account must be granted Editor
   (MASTER/SANDBOX) and Viewer (REGISTRATION) on the actual sheets, or every
   data call 403s.
3. **Outbound egress** to `*.googleapis.com:443` must be open, or no data loads.

## 5. Warnings (non-blocking)

- PDF export is **client-side** (`window.print()`); a headless/curl health check
  cannot verify it — browser required.
- `SANDBOX_SPREADSHEET_KEY` only needed for tests; harmless if absent at runtime.
- eslint reports the bundled `eslint` as outside its supported version range
  (build health); pre-existing ~10 warnings — tooling noise, no runtime impact.
- App has a **single** git baseline commit ("Initial commit") — no rich history;
  packaging was done by direct file copy of vetted content, not `git archive`
  (which would have pulled in the 1.1 GB `.next`).
- Views/edit operate on live MASTER data; wrong input mutates production rows.
  Recommend an explicit data-owner approval workflow for write operations.

## 6. IT Requirements (what IT must prepare)

1. Node.js **22 LTS** on the target server + a free **:3415** port.
2. A GCP **service-account** key (JSON) → 12 env vars.
3. **3 spreadsheet IDs**: MASTER (Editor rw), REGISTRATION (Viewer r), SANDBOX
   (Editor rw for tests), each **shared** with the account `client_email`.
4. An **`AUTH_SECRET`** (`openssl rand -hex 32`) and strong **`AUTH_USERS`**
   passwords (rotate the bundled change-me values).
5. Outbound **HTTPS to Google**; a reverse proxy if public/external access +
   TLS is desired.
6. Writable `data\` directory for the service user.
Full details: `CONFIGURATION.md`, `DEPLOYMENT.md`, `SERVER_REQUIREMENTS.md`.

## 7. Deployment Steps (short version)

`npm ci` → create `.env.local` from `.env.example` → `npm run build` →
`NODE_ENV=production npx next start -p 3415` → run `HEALTHCHECK.md`. Full phases
in `DEPLOYMENT.md`.

## 8. Rollback Plan

Stop the new process → restore the previous app folder/ZIP and `npm run build`
+ restart → use Google Sheets version history to undo any accidental data edit
(traced via `data/audit.log.jsonl`) → re-run the health check. Detailed in
`DEPLOYMENT.md` → Phase 10.

## 9. Final Recommendation

**READY WITH CONDITIONS.**

The software is production-ready and the deployment package is verified to
build, start, and read/write Google Sheets correctly in a clean environment.
Go-live is conditional on IT provisioning the credentials, shared sheets, and
network egress in §4/§6 — these are environmental prerequisites, not software
defects. No critical software issue remains.