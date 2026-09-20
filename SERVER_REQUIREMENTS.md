# DIGMARK V3.1 — Server Requirements

Sizing is modest because Digmark holds **no local database** — the heavy data
lives in Google Sheets, and the app load is dashboard rendering + a handful of
Sheets API calls per page. The numbers below reflect the verified app behavior
(measured: a production build completes in ~25–50 s on a normal developer
laptop; a single process handles the workload).

---

## Minimum

| Resource | Requirement |
|----------|-------------|
| CPU      | 2 vCPU |
| RAM      | 2 GB (4 GB recommended headroom for the Node process + OS + reverse proxy) |
| Storage  | 1 GB free (app source + `node_modules` + build output; audit log grows slowly) |
| OS       | Windows Server 2019/2022 (primary) or Linux 20.04+/22.04 |
| Runtime  | Node.js 20.x / 22.x |
| Network  | Outbound HTTPS to Google (see below); LAN or internal-only access |

## Recommended

| Resource | Requirement |
|----------|-------------|
| CPU      | 4 vCPU |
| RAM      | 4 GB |
| Storage  | 5 GB free (room for future builds, logs, backups) |
| OS       | Windows Server 2022 or Ubuntu 22.04 LTS |
| Runtime  | Node.js 22 LTS |
| Network  | Gigabit LAN; TLS via reverse proxy if exposed beyond the private network |

> Concurrency: single `next start` process is sufficient for an internal team
> app. You would only scale out (rebuild behind a load balancer) if dozens of
> concurrent heavy dashboard sessions are expected — not the default case.

---

## Ports

### Required inbound
| Port | Service | Notes |
|------|---------|-------|
| 3415 | Digmark HTTP | Usually **bind to 127.0.0.1** behind a reverse proxy |
| 80/443 | Reverse proxy (IIS/Nginx/Caddy) | Only if a proxy terminates public traffic |

Only the reverse-proxy port needs to be reachable from clients (via firewall)
if you use the recommended proxy architecture. Direct `:3415` is fine on a
private LAN-only deployment.

### Required outbound
| Destination | Port | Purpose |
|-------------|------|---------|
| `*.googleapis.com` | 443 (TLS) | Service-account token + Sheets API |
| `ogs.google.com` / `accounts.google.com` | 443 | OAuth endpoints |

---

## Network / firewall requirements

- **Egress:** allow outbound HTTPS (443) to `googleapis.com` and Google auth
  domains. Without this, the app fails on **every** data fetch.
- **Ingress (proxy mode):** allow client traffic only on 80/443; keep 3415
  host-only.
- **Ingress (LAN-only mode):** allow 3415 from the team LAN/subnet only.
- **No inbound internet exposure of :3415** unless TLS and auth are confirmed.

## DNS
- Internal DNS name (e.g. `digmark.company.local`) → server IP if using a
  reverse proxy / HTTPS cert.
- A hostname is required only if you configure a TLS certificate (the session
  cookie uses `SameSite=Lax`; an httpOnly cookie is domain/top-level compatible,
  but a real hostname keeps browser behavior consistent).

## Proxy requirements (if used)
- Forward `http(s)://<host>` → `http://127.0.0.1:3415`.
- Offload TLS at the proxy.
- Set a reasonable request/body size limit for the upload route
  (`/api/import/[key]` — Excel imports) and
  `/api/insight/import` (Instagram/TikTok exports). Defaults are usually fine;
  raise the upload cap if large export files are used.

## What is intentionally NOT required
- No database engine (Postgres/MySQL/Mongo).
- No Redis / message queue.
- No Docker/Hyper-V host (optional — you can containerize, but it's not
  required; the app is a single Node process).
- No SMTP / email service.
- No GPU.