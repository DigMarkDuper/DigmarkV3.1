# DIGMARK V3.1 — Configuration Guide

All environment variables are read from **`.env.local`** in the application
root (Next.js loads it automatically at runtime). `.env*` is git-ignored.

**Security rule:** never commit, zip, or email `.env.local` or a service
account key. Only this template (`.env.example`) with placeholders may be
distributed.

Copy the template and fill real values:
```bat
copy .env.example .env.local
```

---

## Environment variables

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_TYPE` | Yes | `service_account` | Credential type (fixed value). |
| `GOOGLE_SERVICE_ACCOUNT_PROJECT_ID` | Yes | `digmark-prod` | GCP project that owns the service account. |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID` | Yes | `a1b2c3...` | Key fingerprint from the service-account key. |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL` | Yes | `digmark-sa@digmark-prod.iam.gserviceaccount.com` | The service-account email you share sheets with. |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_ID` | Yes | `112233445566...` | Client ID for the key. |
| `GOOGLE_SERVICE_ACCOUNT_AUTH_URI` | Yes | `https://accounts.google.com/o/oauth2/auth` | Standard OAuth endpoint (fixed). |
| `GOOGLE_SERVICE_ACCOUNT_TOKEN_URI` | Yes | `https://oauth2.googleapis.com/token` | Token endpoint (fixed). |
| `GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL` | Yes | `https://www.googleapis.com/oauth2/v1/certs` | Provider cert (fixed). |
| `GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL` | Yes | `https://www.googleapis.com/robot/v1/metadata/x509/digmark-sa%40digmark-prod.iam.gserviceaccount.com` | Client cert URL (fixed). |
| `GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN` | Yes | `googleapis.com` | Universe (fixed). |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Yes | `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` | The PEM private key. Keep `\n` escaped (as in the JSON export). |
| `MASTER_SPREADSHEET_KEY` | Yes | `1pmHKT4...` | ID of the **production master** spreadsheet (read/write — the real data). Never written by tests. |
| `REGISTRATION_SPREADSHEET_KEY` | Yes | `1abcXYZ...` | ID of the **second** spreadsheet ("Form Pendaftaran", tab `Form Responses 1») — read-only command center. |
| `SANDBOX_SPREADSHEET_KEY` | No¹ | `1sandbox...` | ID of the sandbox spreadsheet used only by write/integration tests. Not needed at production runtime. |
| `AUTH_SECRET` | Yes | `e3e3f4...64 hex chars` | HMAC signing secret for the session cookie. **≥ 16 chars, generate fresh:** `openssl rand -hex 32`. |
| `AUTH_USERS` | Yes | `editor:Str0ngPass!:editor,viewer:Str0ngPass!:viewer` | Comma-separated `username:password:role`. Role optional (default `viewer`). **Rotate before production.** |

> ¹ `SANDBOX_SPREADSHEET_KEY` is only consumed by the Vitest write suite. The
> production server reads `MASTER_SPREADSHEET_KEY`, `REGISTRATION_SPREADSHEET_KEY`,
> the 12 `GOOGLE_SERVICE_ACCOUNT_*` vars, `AUTH_SECRET`, and `AUTH_USERS`.

---

## Auth model & roles

| Role | Capabilities |
|------|--------------|
| `editor` | Full access incl. write operations: append row, edit row, clear table, import file, sync WA→CRM. |
| `viewer` | Read-only dashboards. All write endpoints return **403**. |

Session: single httpOnly cookie `dm_session` (HMAC-signed via `AUTH_SECRET`),
`SameSite=Lax`, 8-hour lifetime (`Max-Age=28800`), `Secure` flag active unless
the request host is `localhost`/loopback.

### Generating credentials
```bat
REM AUTH_SECRET (64 hex chars):
openssl rand -hex 32

REM AUTH_USERS — pick strong passwords:
REM   editor:<strong-editor-password>:editor
REM   viewer:<strong-viewer-password>:viewer
REM Combine with commas into the single AUTH_USERS value.
```

---

## Google service account checklist (IT must provide)
1. A GCP **service account** with **only** the Sheets scope
   (`https://www.googleapis.com/auth/spreadsheets`) — packaged app uses
   least-privilege; no Drive scope.
2. A **key** for that service account (JSON), from which the 12
   `GOOGLE_SERVICE_ACCOUNT_*` vars are filled.
3. The **3 spreadsheet IDs** (master, registration, sandbox) shared with the
   service account `client_email`:
   - MASTER — **Editor** rights,
   - REGISTRATION — **Viewer** rights,
   - SANDBOX — **Editor** rights.

If any required variable is missing at startup, the app fails fast at first
use with a clear env error (e.g. `MASTER_SPREADSHEET_KEY is not set in env` or
`missing private key — set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`).

## Placeholders in `.env.example`
Every non-fixed value ships as `<placeholder>` or `<project...>`/`<your-...>`.
**Fill all of them** — there are no usable defaults.