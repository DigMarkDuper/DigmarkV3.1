# DIGMARK V3.1 — Production Deployment Package

> Intended audience: the IT deployment / operations team.
> This package installs Digmark V3.1 on a company server. It does **not**
> contain any real credentials — see `CONFIGURATION.md` for what IT must
> supply.

---

## 1. Project

| Item          | Value |
|---------------|-------|
| Application   | **Digmark V3.1** — internal sales & marketing command center |
| Version       | 3.1.0 (see `VERSION.txt`) |
| Purpose       | Dashboards + data operations for Sosmed, Website, Insight, WA Admin, CRM, DM, Ads (Meta/TikTok), Interview, Registration. View metrics, edit rows, append rows, import/clear tables, export CSV / print PDF. |
| Type          | Server-rendered web application (Next.js App Router) |
| Data storage  | **No local database.** All data lives in **Google Sheets**, read/written with a service account (least-privilege `spreadsheets` scope only). |
| Auth          | First-party username/password sessions (`AUTH_SECRET` HMAC-signed httpOnly cookie, `SameSite=Lax`, `Secure` unless localhost). Roles: `editor`, `viewer`. |

## 2. Architecture

```
Browser
   │  HTTPS
   ▼
Reverse proxy (recommended: IIS / Nginx / Caddy TLS termination)
   │  http://127.0.0.1:3415
   ▼
Digmark V3.1  (Next.js self-hosted server, `next start`)
   │
   ├─▶ Google Sheets API (service account, spreadsheets scope)
   │      • MASTER spreadsheet (read/write — production data)
   │      • REGISTRATION spreadsheet (read-only, "Form Responses 1")
   │      • SANDBOX spreadsheet (write tests only — not used at runtime)
   └─▶ local filesystem: data/audit.log.jsonl (operation audit trail)
```

All heavy/secret work is server-side. The browser only gets rendered UI +
JSON responses; service-account credentials never leave the server.

## 3. Technology stack

| Concern   | Choice |
|-----------|--------|
| Framework | Next.js 16.3.5 (App Router, Turbopack) |
| UI        | React 19.2.8, TypeScript, Tailwind CSS 4 |
| Google    | `googleapis` 181 (Sheets API, service-account JWT) |
| Files     | `xlsx` (Excel import parsing) |
| Env       | `dotenv`; Next.js loads `./.env.local` at runtime |
| Runtime   | Node.js **20.x / 22.x** (verified on Node 22.23.2) |
| Package   | npm (lockfile `package-lock.json`) |

---

## 4. Requirements

### OS & runtime
- **Operating system:** Windows Server 2019/2022 (primary) — the app is a
  self-hosted Node server and runs on Windows, Linux, or macOS.
- **Node.js:** 20.x or 22.x (LTS). `node -v` must be `v20.x` or `v22.x`.
- **npm:** v10+ (bundled with the Node installer).

### System packages
- None required beyond Node.js. No Postgres/MySQL/Redis, no external queue.

### Ports
| Port | Purpose |
|------|---------|
| **3415** | Digmark HTTP listener (default production port) |

If 3415 is taken, change `PORT` — but keep the proxy config in sync.

### Network access (outbound, from the server)
| Destination | Purpose |
|-------------|---------|
| `https://oauth2.googleapis.com` | Service-account token exchange |
| `https://sheets.googleapis.com` | Google Sheets API |
| `https://www.googleapis.com` | Google APIs (generic) |

No inbound public access is required if the reverse proxy runs on the same
host (proxy forwards to `127.0.0.1:3415`).

### External services
1. A **Google Cloud service account** with access to:
   - the MASTER spreadsheet (edit rights),
   - the REGISTRATION spreadsheet (view rights),
   - the SANDBOX spreadsheet (edit rights — only used by tests).
2. The **12 service-account env vars** + `AUTH_SECRET` + `AUTH_USERS`
   (see `CONFIGURATION.md`). IT must obtain/provision these.

---

## 5. Installation (summary)

Full step-by-step: `DEPLOYMENT.md`. Quick start:

```bash
# 1. Extract & enter
cd /path/to/        # extract ZIP here
cd Digmark_V3.1_Production

# 2. Install exact dependency versions
npm ci --no-audit --no-fund

# 3. Create environment file (fill real values — see CONFIGURATION.md)
cp .env.example .env.local
#    ... edit .env.local with real values ...

# 4. Build the production bundle
npm run build

# 5. Start
set NODE_ENV=production
npm run start -- -p 3415
```

Verify: open `http://<server>:3415/login`, sign in, open a workspace.

---

## 6. Key files in this package

| File | Purpose |
|------|---------|
| `app/`, `src/`, `public/` | Application source |
| `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` | Build config |
| `package.json` / `package-lock.json` | Reproducible dependency manifest |
| `.env.example` | Template for `.env.local` (placeholders only) |
| `.gitignore` | Standard ignores |
| `data/` | Runtime audit log directory (created/empty) |
| `README.md` | This overview |
| `DEPLOYMENT.md` | Phase-by-phase production deployment guide |
| `CONFIGURATION.md` | Every environment variable |
| `HEALTHCHECK.md` | How to verify the app is healthy |
| `TROUBLESHOOTING.md` | Symptom → cause → fix → verify |
| `SERVER_REQUIREMENTS.md` | Server sizing, ports, network, firewall |
| `DEPLOYMENT_MANIFEST.md` | What is/isn't in the package |
| `PRODUCTION_AUDIT_REPORT.md` | Pre-deployment audit results |
| `VERSION.txt` | Version & build metadata |

## 7. Roles & default feature access
- **editor** — full access, including write operations (append, edit, clear,
  import, sync).
- **viewer** — read-only; all write endpoints return **403**.

> The bundled `.env.example` contains *placeholder* editor/viewer passwords.
> **IT must generate real passwords and rotate `AUTH_USERS` / `AUTH_SECRET`
> before production.** See `CONFIGURATION.md`.