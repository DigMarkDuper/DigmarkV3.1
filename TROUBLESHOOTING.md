# DIGMARK V3.1 — Troubleshooting Guide

Each entry follows **Symptom → Possible Cause → Solution → Verification**.

---

## 1. Application won't start
- **Symptom:** `next start` exits immediately or shows an error.
- **Causes:**
  - `PORT` in use → see #2.
  - Missing/invalid `.env.local` (app fails fast when env is consumed).
  - Build output missing/stale → run `npm run build` first.
- **Solution:** make sure `npm run build` succeeded, then start with
  `set NODE_ENV=production` and `npx next start -p 3415`. Check `.env.local`
  has all required vars (item #4).
- **Verification:** process stays up; `netstat -ano | findstr ":3415"` shows
  LISTENING; `curl http://localhost:3415/login` → 200.

## 2. Port already in use
- **Symptom:** `EADDRINUSE` / "port 3415 is already in use".
- **Cause:** another process (e.g. a stale/orphaned Digmark, or another app) is
  bound to 3415.
- **Solution:** find the owner and free it, or move Digmark to another port and
  update the proxy. On Windows:
  ```bat
  netstat -ano | findstr ":3415"
  taskkill /PID <PID> /F
  ```
  Or run on a different port: `npx next start -p 3420` (update the proxy
  target too).
- **Verification:** `netstat -ano | findstr ":3415"` returns empty (or only
  your new port) and the app responds.

## 3. Dependency installation failure
- **Symptom:** `npm ci` errors out (network, peer, registry).
- **Cause:** offline registry / corporate proxy blocking npm / lockfile vs
  version mismatch.
- **Solution:** ensure outbound access to `registry.npmjs.org` (or configure
  the corporate npm registry), then retry `npm ci --no-audit --no-fund`. Do
  **not** switch to `npm install` casually — the lockfile pins versions.
- **Verification:** `npm ci` completes with `added N packages` and `npm ls`
  reports no missing/invalid packages.

## 4. Environment variable missing
- **Symptom:** runtime error like `MASTER_SPREADSHEET_KEY is not set in env` or
  `missing private key — set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
- **Cause:** `.env.local` absent or incomplete.
- **Solution:** `copy .env.example .env.local`, fill all `Yes`-required vars
  (see `CONFIGURATION.md`), restart the app.
- **Verification:** app starts and `/api/meta/tabs` returns tabs with
  `drift:false`.

## 5. Google API authentication failure
- **Symptom:** API returns a Google auth error (invalid_grant / permission
  denied) on data calls.
- **Cause:** wrong/expired service-account private key, or
  `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL` mismatch with the key, or clock skew.
- **Solution:** re-create/re-download the service-account **key JSON** and
  copy the fields exactly into `.env.local` (preserve `\n` in the PEM).
  Confirm server clock is correct (JaWT is time-sensitive).
- **Verification:** `/api/meta/tabs` returns `ok:true` instead of an auth
  error.

## 6. Google Sheets permission error
- **Symptom:** "The caller does not have permission" when reading/writing a
  specific sheet.
- **Cause:** the sheet is not shared with the service account
  `client_email`, or granted the wrong role.
- **Solution:** in each spreadsheet → Share → add the service-account
  `client_email` with **Editor** (MASTER/SANDBOX) or **Viewer** (REGISTRATION).
- **Verification:** the affected endpoint returns `ok:true` with data.

## 7. File permission error (local data dir)
- **Symptom:** audit log write failure; app can't create/append
  `data\audit.log.jsonl`.
- **Cause:** the OS user running `next start` lacks write access to `data\`.
- **Solution:** `icacls C:\Apps\Digmark...\data /grant "<svc-user>:(OI)(CI)F"`.
- **Verification:** a login event appears in `data\audit.log.jsonl`.

## 8. Upload failure
- **Symptom:** file import returns an error / no rows parsed.
- **Cause:** wrong file format/headers, file too large, or permission denied.
- **Solution:** check `xlsx`/CSV format matches the import spec
  (`INSIGHT` expects Instagram/TikTok export headers — see app docs); raise the
  upload limit at the proxy if large; confirm editor role.
- **Verification:** the import preview shows the parsed rows correctly.

## 9. PDF generation failure
- **Symptom:** "Export as PDF" produces nothing / blank print.
- **Cause:** PDF is generated client-side via `window.print()`; a headless/curl
  context or browser print-blocking (no printer, pop-up blocked) prevents it.
- **Solution:** use a real browser with print enabled; allow pop-ups from the
  app origin; ensure a PDF printer (e.g. "Microsoft Print to PDF") exists on
  the client machine.
- **Verification:** a valid PDF is saved from the print dialog.

## 10. Frontend/backend connection failure
- **Symptom:** UI loads but data calls fail; network errors in DevTools.
- **Cause:** wrong proxy path (proxy targets wrong port), or app bound to
  `127.0.0.1` while the client reaches the host by IP.
- **Solution:** confirm proxy forwards to `http://127.0.0.1:3415` and the
  base URL you visit is correct. If clients reach by LAN IP and the app is
  host-only, run with the IP/0.0.0.0 bound or keep the reverse proxy.
- **Verification:** `/api/auth/me` from the client returns `ok:true` when
  logged in.

## 11. CORS error
- **Symptom:** browser console blocks a same-origin API call with a CORS error.
- **Cause:** uncommon for this app (it is same-origin SPA-less), unless you put
  the frontend and API on different origins manually.
- **Solution:** access everything through the same host/origin (recommended),
  or configure the proxy to set `Access-Control-Allow-Origin` for the exact
  frontend origin. Never broadcast `*` with credentials.
- **Verification:** network requests complete and return app JSON.

## 12. Server cannot access external API
- **Symptom:** all Sheets calls time out / connection refused; data empty.
- **Cause:** egress blocked by firewall/proxy — port 443 to `*.googleapis.com`
  not allowed.
- **Solution:** allow outbound HTTPS to Google (see `SERVER_REQUIREMENTS.md`),
  incl. any corporate proxy allow-list.
- **Verification:** `/api/meta/tabs` and `/api/overview/metrics` return real
  data.