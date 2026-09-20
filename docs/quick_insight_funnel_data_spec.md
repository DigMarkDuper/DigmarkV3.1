# Quick Insight → Sales Funnel — Data & Mapping Spec (Home)

Source of truth for the Home "Quick Insight" sales-funnel revision.
Scope fence: **ONLY** the Quick Insight section on `app/page.tsx` (+ its data
feed). Do NOT touch Hero, Command Center, "Explore Your Workspace", navbar,
layout, spacing, other routes, or any shared component.

## Objective
Replace the 4-KPI Quick Insight grid with a horizontal **Sales Funnel** card
that tells the journey: Awareness → Intent → Lead → Daftar → Closing, with
linear conversion rates and small supporting metrics. Ad Spend stays as a
supporting KPI. Live data only — no hardcoded business numbers.

## Ground truth (verified against live master, 2026-09-17)
All values below were pulled from the running prod server (`:3415`) via the
real API and cross-checked against `/admin-wa` / `/insight` derivations.

### Insight (all-time sums, matches unfiltered /insight page)
| Metric | Column | Live value |
|---|---|---|
| Reach | `REACH` | 2,841,036 |
| Views | `VIEW` | 7,363,486 |
| Link Click | `LINK CLICKS` | 25,550 |
| Interaksi (supporting) | `CONTENT INTERACTION` | 74,954 |
| Profile Visit (supporting) | `PROFILE VISIT` | 133,314 |

### WA Admin (`wa_admin`)
| Funnel stage | Definition (MUST match /admin-wa exactly) | Live value |
|---|---|---|
| **Lead** | junk-filtered total = /admin-wa "Total Pesan" (`deriveWaAdminStats.total`, post-junk) | 1,436 |
| **Closing** | STATUS col L == "closing" (case-insens, trimmed), measured PRE-junk over source rows (`closingCount`) | 70 |

- Status col L header: `Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)`.
- Closing MUST come from `closingCount`/`STATUS=="closing"`; NEVER hardcode, NEVER
  use the legacy `funnel()` substring proxy from `metrics.ts`.
- Lead MUST equal the /admin-wa "Total Pesan" KPI (post-junk total), NOT raw rowcount.

### Daftar (registration, SECOND spreadsheet via `/api/registration/data`)
Owner decision (Ejak): **Daftar = "Total Pendaftar" of the latest year (2026) = 184**,
exactly matching the WA Admin Command Center top card default. Count via
`countPendaftar(filterByYear(rows, latestYear))` where latestYear = max
`registrationYears`. Do NOT use all-time (1043).

## Linear conversion rates (only these — all linear stages)
| Rate | Formula | Value |
|---|---|---|
| Reach → Click | linkClick / reach × 100 | 0.90% |
| Click → Lead | lead / linkClick × 100 | 5.62% |
| Lead → Daftar | daftar / lead × 100 | 12.81% |
| Daftar → Closing | closing / daftar × 100 | 38.04% |
| Overall Lead → Closing | closing / lead × 100 | 4.87% |

NEVER compute non-linear pairs (e.g. Interaction → Profile Visit). If a
denominator is 0 → show "—" (never NaN/Infinity). Loading → skeleton. Error →
"Data unavailable".

## Data-access architecture (server renders, browser never computes)
Follow the existing Home pattern: the browser must NOT compute business metrics
or touch Sheets. Deliver the funnel scalars server-side.

### Option A (RECOMMENDED): extend `GET /api/overview/metrics`
- Add `insight`, `wa_admin` already present, and the registration `countPendaftar`
  to the payload. Compute funnel + rates in `overviewControllers.ts` using the
  EXISTING pure derivations (`waAdmin.ts` `deriveWaAdminStats`/`closingCount`,
  `insight.ts` `sumMetrics`, `registration.ts`):
  - reach=sumMetrics(insight).reach, views, linkClicks
  - lead = deriveWaAdminStats(wa).total
  - closing = deriveWaAdminStats(wa).closing (or `closingCount(wa)`)
  - daftar = countPendaftar of latest year
  - spend already returned (keep `r.spend`)
- The registration source is a SEPARATE lazy factory (`getRegistrationSource`),
  so the controller must accept both sources (mirror `getRegistrationController`).
- Extend `overviewMetricsPayload` with a `funnel` object; keep all existing fields
  intact (Hero depends on them).

### Routing change
- `app/api/overview/metrics/route.ts` passes `getMasterSource()` AND
  `getRegistrationSource` (lazy) into the controller.
- Auth gate FIRST (401 before any env-key error) — mirror registration route.

## Home rendering
- Only the `<SectionHead title="Quick Insight">` block and its grid change.
- Keep `SectionHead` header + subtitle ("Ringkasan angka penting, live dari data.").
- New large card: SALES FUNNEL with 5 compact stage cards + arrows:
  AWARENESS(Reach main, Views supporting) → INTENT(Link Click) → LEAD → DAFTAR → CLOSING.
- Rate shown small under each connector. Closing gets visual emphasis (endpoint).
- Supporting row: Views | Interaksi | Profile Visit | Ad Spend (Rp).
- Horizontal on desktop; vertical on small screens.
- IKEA blue primary, yellow accent only (not full cards). Same Home typography.
  No chart library — CSS/HTML (or dependency-free SVG) only, like the repo.
- Keep the section compact; do not inflate Home height.

## Acceptance checklist (all must PASS)
1. Quick Insight stays in the same position; Hero/workspace grid/navbar unchanged.
2. Closing = STATUS col L == "closing" (pre-junk), == /admin-wa (70).
3. Lead == /admin-wa "Total Pesan" (1,436).
4. Daftar == latest-year Total Pendaftar, default WA Admin card (184).
5. Social metrics == /insight unfiltered sums.
6. Rates computed dynamically; "—" on zero divisor; skeleton on loading; error text on error.
7. No hardcoded business metrics.
8. Only Quick Insight modified.