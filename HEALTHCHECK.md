# DIGMARK V3.1 — Health Check

Use this to verify a deployed instance is running correctly after installation
or after a change. Run the checks in order.

Base URL (internal): `http://<server>:3415` (through a proxy:
`https://<public-host>`).

---

## 1. Application URLs & expected responses

| Check | URL | Expected |
|-------|-----|----------|
| Home | `/` | **200** — redirects unauth'd users to login |
| Login page | `/login` | **200** — login form |
| Auth check (no session) | `/api/auth/me` | **401** `{"error":{"code":"AUTH_FAILED"}}` |
| Auth check (logged in) | `/api/auth/me` | **200** `{"ok":true,"identity":"...","role":"..."}` |

```bat
curl -s -o NUL -w "%%{http_code}" http://localhost:3415/login
```

## 2. Login test
```bat
curl -s -c cookies.txt -H "Content-Type: application/json" ^
  -d "{\"username\":\"editor\",\"password\":\"<editor-password>\"}" ^
  http://localhost:3415/api/auth/login
```
Expected: `{"ok":true,"identity":"editor","role":"editor"}`.

## 3. Dashboard test
```bat
curl -s -b cookies.txt -o NUL -w "%%{http_code}" http://localhost:3415/wa-admin
```
Expected: **200** (a logged-in session returns the workspace page). Repeat for
each workspace slug: `/sosmed`, `/website`, `/insight`, `/crm`, `/dm`, `/ads`,
`/interview`.

## 4. Google Sheets connection test
```bat
curl -s -b cookies.txt http://localhost:3415/api/meta/tabs
```
Expected: `{"ok":true,"tabs":[...10 tabs...],"drift":false}`. `drift:false`
means all declared tabs are present in the MASTER sheet (schema matches).

## 5. Data read test
```bat
curl -s -b cookies.txt http://localhost:3415/api/overview/metrics
```
Expected: `{"ok":true,"metrics":{...}}` with real numbers (leads, closing,
conversion, spend, cac, roas, omzet). A read from a second spreadsheet:
```bat
curl -s -b cookies.txt http://localhost:3415/api/registration/data
```
Expected: `{"ok":true,"table":"registration","rows":[...]}` — proving the
REGISTRATION spreadsheet is reachable.

## 6. Data write test (editor only — use SANDBOX if possible)
Add a harmless test row then remove it, or perform an **edit to one cell** via
`PATCH /api/tables/<key>`. Verify the change appears in Google Sheets and is
recorded in `data\audit.log.jsonl`, then revert it. `viewer` users must get
**403** here.
```bat
curl -s -b cookies.txt -X POST -H "Content-Type: application/json" -d "{\"key\":\"wa_admin\"}" http://localhost:3415/api/tables/wa_admin
```
> ⚠ Do the write test on the **sandbox** spreadsheet to avoid changing
> production data. The default production instance is read-mostly; verify
> writes only with an explicit go-ahead from the data owner.

## 7. Upload / import test
From a logged-in editor UI, use the WA-Admin import to upload a small CSV/XLSX,
confirm the parsed preview, then cancel/delete the imported rows. Confirm the
event is audit-logged. (No automated single-command path — this exercises the
browser upload.)

## 8. PDF generation test
In any logged-in browser, open **/wa-admin** → **"Export as PDF (Quick
Report)"**. Expected: browser print dialog opens and produces a readable PDF.
There is no server-side PDF library — this uses the browser's native print. If
the button does nothing, the page still renders (print) but output is generated
client-side, so it requires a browser, not curl.

## 9. Ads / Insight functionality test
```bat
curl -s -b cookies.txt http://localhost:3415/api/ads/metrics
```
Expected: `{"ok":true,"metrics":{"spend":...,"leads":...,"closing":...,"cac":...}}`.
Also open `/insight` in the browser and confirm charts/filters render without
errors.

## 10. Error-log verification
- App logs: the foreground/`nssm` console or journal — no stack traces leaked
  to the client (the API returns structured `{error:{code,message}}`).
- Audit trail (server side, primary log):
  ```bat
  findstr /C:"operation" C:\Apps\Digmark_V3.1_Production\data\audit.log.jsonl
  ```
  Every login/write should appear here. A healthy instance shows login events
  and any performed writes — no unexpected failures captured.

---

## Deployment checklist
```
[ ] Server ready (OS, Node 22, port 3415 free)
[ ] Dependencies installed (npm ci)
[ ] Environment configured (.env.local complete)
[ ] Credentials configured (service account + shared sheets)
[ ] Application started (next start :3415)
[ ] Login works
[ ] Dashboard works (all 8 workspaces return 200)
[ ] Google Sheets works (meta/tabs drift=false)
[ ] Upload works (WA import preview)
[ ] PDF generation works (browser print)
[ ] Main features tested (metrics, ads, insight)
[ ] Logs clean (audit.log.jsonl, no leaked stack traces)
[ ] Deployment approved
```