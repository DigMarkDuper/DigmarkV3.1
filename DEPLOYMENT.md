# DIGMARK V3.1 — Production Deployment Guide

This guide walks the full clean install of Digmark V3.1 on an internal
company server. It is written for a **Windows Server** primary with a
**Linux** alternative noted where it matters. Do **not** reuse any development
copy of `.env.local` — create a clean production one.

> **Recommended deployment architecture**
> ```
> Browser ──HTTPS──▶ Reverse Proxy (IIS / Nginx / Caddy) ──▶ next start :3415 ──▶ Google Sheets API
> ```
> **Alternative:** run Digmark directly bound to `:3415` (no proxy) for a
> single-host internal deployment — traffic stays on the LAN. Add TLS only if
> Digmark is exposed beyond the private network.

---

## Phase 1 — Server Preparation

1. Confirm OS: **Windows Server 2019/2022** (or Linux 20.04+/22.04).
2. Install **Node.js 22 LTS**:
   - Windows: download the MSI from nodejs.org, check "Add to PATH".
   - Check both Node and npm are on PATH:
     ```bat
     node -v   REM v22.x
     npm -v    REM v10.x
     ```
3. Confirm the target port **3415** is free:
   ```bat
   netstat -ano | findstr ":3415"
   ```
   (Should return nothing on port 3415. If something is listening there, free
   it or use another port and update the reverse-proxy config.)
4. Create the application directory and give the service account write
   permission to it (especially `data\`):
   ```bat
   mkdir C:\Apps\Digmark
   icacls C:\Apps\Digmark /grant "%USERNAME%:(OI)(CI)F"
   ```

## Phase 2 — Application Installation

```bat
cd C:\Apps
:: transfer Digmark_V3.1_Production.zip to C:\Apps, then:
tar -xf Digmark_V3.1_Production.zip
cd Digmark_V3.1_Production
:: install exact dependency versions from the lockfile
npm ci --no-audit --no-fund
```
> `npm ci` installs exactly what is locked in `package-lock.json` — do **not**
> substitute `npm install` (it may silently change versions).

## Phase 3 — Environment Configuration

```bat
copy .env.example .env.local
notepad .env.local
```
Fill every value — see `CONFIGURATION.md` for the full table. **Minimum
required before the app will work:**
- `GOOGLE_SERVICE_ACCOUNT_*` (12 vars incl. the PEM private key)
- `MASTER_SPREADSHEET_KEY`
- `REGISTRATION_SPREADSHEET_KEY`
- `AUTH_SECRET`
- `AUTH_USERS`

Generate a strong secret and real passwords:
```bat
:: AUTH_SECRET — 64 hex chars, e.g.
openssl rand -hex 32
```
> `.env.local` is git-ignored and **must never** be committed or included in a
> transfer. It is a deployment secret.

## Phase 4 — External API Configuration

1. Put the GCP **service-account JSON/PEM** details into the
   `GOOGLE_SERVICE_ACCOUNT_*` vars.
2. The value of `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` must be the full PEM
   `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----` block. If you
   copy it from a `.json` file the newlines are already escaped (`\\n`) — keep
   them escaped, matching the `.env.example` hint.
3. In the Google Sheet for each spreadsheet (MASTER, REGISTRATION, and, for
   tests, SANDBOX), **share the sheet** with the service account's
   `client_email` with the required permission level.
4. **Firewall / egress:** allow outbound HTTPS to Google (see
   `SERVER_REQUIREMENTS.md`). Inbound is only needed if you run without a
   reverse proxy.
5. **Reverse-proxy TLS** (if a proxy is used): offload TLS there, forward
   plain HTTP to `http://127.0.0.1:3415`.

## Phase 5 — Database / Storage Configuration

There is **no database**. "Storage" is:
1. `data\audit.log.jsonl` — operation audit trail, written by the app.
   Ensure `data\` exists and is writable by the app's OS user. It is created
   empty in this package.
2. Google Sheets (the real data source) — configured in Phase 4.

Backup plan: back up `data\audit.log.jsonl` routinely, and rely on Google
Sheets' own version history for business data.

## Phase 6 — Application Build

```bat
cd C:\Apps\Digmark_V3.1_Production
npm run build
```
Expected tail output: a route table listing `/`, `/login`, the 8 workspaces
(`/ads`, `/crm`, `/dm`, `/insight`, `/interview`, `/sosmed`, `/wa-admin`,
`/website`) and 14 `ƒ /api/...` routes. `build` runs TypeScript type-checking
as part of the process.

## Phase 7 — Application Startup

**Option A — foreground (first test):**
```bat
cd C:\Apps\Digmark_V3.1_Production
set NODE_ENV=production
npx next start -p 3415
```

**Option B — as a Windows background service (recommended):**
```bat
:: install once with NSSM
nssm install Digmark "C:\Program Files\nodejs\node.exe"
nssm set Digmark AppDirectory "C:\Apps\Digmark_V3.1_Production"
nssm set Digmark AppParameters "C:\Apps\Digmark_V3.1_Production\node_modules\next\dist\bin\next start -p 3415"
rem ensure Start > "Automatic"; Environment NODE_ENV=production
nssm start Digmark
```
> On Linux, use a `systemd` unit with `Environment=NODE_ENV=production` and
> `ExecStart=npx next start -p 3415`.

Verify the listener:
```bat
netstat -ano | findstr ":3415"
```

## Phase 8 — Health Check

```bat
curl -s -o NUL -w "%%{http_code}" http://localhost:3415/login
```
Expect `200`. Full checklist (login, dashboards, Sheets read/write, import,
PDF print, error logs) is in **`HEALTHCHECK.md`**.

## Phase 9 — Production Verification

- Sign in as `editor` and `viewer`.
- Open every workspace: `/sosmed`, `/website`, `/insight`, `/wa-admin`,
  `/crm`, `/dm`, `/ads`, `/interview`.
- Confirm the audit log at `data\audit.log.jsonl` records a `login` event.
- Confirm any write (append/edit) lands in the correct row of the MASTER sheet
  and is logged.

## Phase 10 — Rollback

Because the data lives in Google Sheets and the app is read-mostly, rollback
is low-risk:

1. **Stop the new instance:**
   ```bat
   nssm stop Digmark        REM or close the foreground process
   ```
2. **Restore the previous app build / folder** (keep a dated copy of the old
   `Digmark\` or the previous ZIP). `npm ci` + `npm run build` + start again.
3. **Google Sheets:** use the sheet's built-in version history to restore any
   accidental data change. Audit log gives you the operation trail to trace
   what changed and when.
4. Re-run **Phase 8** to confirm the restored instance is healthy and, if a
   reverse proxy is used, that it still routes to `:3415`.

**Pre-flight for a clean switch-back:** keep the previous deployment folder
intact until the new one has passed the full `HEALTHCHECK.md` checklist.