# DigMark V3.1 Logic Contract

**Author:** REX (developer specialist), on delegation from EVA
**Date:** 2026-09-18
**Purpose:** One verified reference that captures exactly how DigMark V3.1 computes every number, so the read-only Tarjo Discord bot can reproduce DigMark's numbers exactly and stop drifting.
**Method:** Read-only trace of the implementation. No builds, no typechecks, no app execution, no spreadsheet writes, no source modification. Only this file is created.
**Evidence levels:** **VERIFIED** = directly confirmed from code (function/formula read). **INFERRED** = logically implied but not directly confirmed. **UNKNOWN** = cannot be established from the implementation.
**Docs consulted for intended semantics:** `docs/quick_insight_funnel_data_spec.md`, `docs/quick_insight_funnel_ui_spec.md`, `docs/insight-rev-2026-ui-spec.md`, `docs/wa_admin_registration_ui_spec.md`. These are INTENT docs; the traced truth is the CODE, and any divergence is flagged.

---

## 1. System Overview

**VERIFIED** — DigMark V3.1 is a Next.js 16 / React 19 / TypeScript / App Router web app deployed at `D:/digmarkv3.1`. Google Sheets is the sole persistent data source, read through a service-account based adapter (`src/server/adapter/sheets/*`). There are **two** Google workbooks:

1. **Master spreadsheet** — contains 10 tabs (SOSMED, WEBSITE, INSIGHT, WA ADMIN REPORT, DATABASE NOMOR, SOSMED ADMIN REPORT, REPORT ADS TIKTOK, REPORT ADS META, REPORT MEKARI, SCHEDULE INTERVIEW). Bound via `MASTER_SPREADSHEET_KEY`.
2. **Registration workbook (second spreadsheet)** — single tab "Form Responses 1" (Google Form responses). Bound via `REGISTRATION_SPREADSHEET_KEY`. Read via a dedicated read-only source.

**Architecture (VERIFIED, code-confirmed):**

```
Google Sheets (master + registration)
   │  service-account JWT (googleapis), scope: spreadsheets only (auth.ts)
   ▼
Data Access Layer (src/server/adapter/sheets/*)
   │  read.ts: readTable() → normalizeRows() → row objects keyed by declared columns
   │  GoogleSheetsSource (index.ts) with in-memory TableCache TTL 300s
   ▼
API Routes (app/api/*) → thin route shells → src/server/api/*Controllers
   │  GET/POST/PATCH /api/tables/[key], GET /api/overview/metrics, GET /api/ads/metrics,
   │  POST /api/sync/wa-to-crm, GET /api/registration/data, POST /api/import/[key],
   │  POST /api/clear/[key], GET /api/meta/tabs, /api/auth/*
   ▼
Browser (React client pages + dashboards)
   │  Route shells fetch via useApi() and render src/workspaces/*Dashboard.tsx
   ▼
Pure business-logic derivations (src/workspaces/*.ts, src/server/metrics/metrics.ts)
```

**Critical architectural fact (VERIFIED):** Business logic lives in **pure TypeScript modules** (`src/workspaces/*.ts` and `src/server/metrics/metrics.ts`) that are shared — the same functions are imported by both the browser dashboards AND the server controllers (e.g. `deriveWaAdminStats`, `closingCount`, `sumMetrics`, `roi`, `funnel` are imported by `overviewControllers.ts`). This is exactly the shared-logic shape Tarjo needs. The browser fetches **normalized rows** via the API and runs the pure derivation functions locally for dashboard rendering; the server ALSO runs some derivations for server-side scalar payloads (overview/ads). **UNKNOWN/ambivalence:** Cross-checking both paths (dashboard-local vs server-scalar) for the SAME metric (e.g. closing on /wa-admin vs closing in /api/overview/metrics) reveals they can differ because they use different rows definitions (see §8) — this is a real drift risk to document, not a single formula.

**Auth (VERIFIED):** JWT Cookie-based session (`dm_session`), httpOnly + SameSite=Lax, 8-hour TTL, roles `viewer`/`editor`. `requireAuth` → 401, `requireRole("editor")` → 403 for viewers. Credentials/secret in `.env.local` (never exposed, never read here).

---

## 2. Codebase Map

Each entry = file path → purpose. **VERIFIED** all present.

### Pages (routes) — `app/`
| File | Route | Purpose |
|---|---|---|
| `app/page.tsx` | `/` | Overview / Command Center: auth gate + Hero (closing/ROAS) + workspace grid + QuickInsight SalesFunnel (from `GET /api/overview/metrics`) + drift banner (from `GET /api/meta/tabs`). |
| `app/login/page.tsx` | `/login` | Login form → `POST /api/auth/login`. |
| `app/(workspaces)/sosmed/page.tsx` | `/sosmed` | Soshmed workspace shell: auth + `GET /api/tables/sosmed` → `SosmedDashboard`. |
| `app/(workspaces)/website/page.tsx` | `/website` | Website shell → `WebsiteDashboard`. |
| `app/(workspaces)/insight/page.tsx` | `/insight` | Insight shell → `InsightDashboard`. |
| `app/(workspaces)/wa-admin/page.tsx` | `/wa-admin` | WA Admin + Registration Command Center shell → `WaAdminDashboard` (fetches wa_admin + registration rows). |
| `app/(workspaces)/crm/page.tsx` | `/crm` | CRM shell → `CrmDashboard`. |
| `app/(workspaces)/dm/page.tsx` | `/dm` | DM shell → `DmDashboard`. |
| `app/(workspaces)/ads/page.tsx` | `/ads` | Ads shell → `AdsDashboard` (fetches 4 tables + `GET /api/ads/metrics`). |
| `app/(workspaces)/interview/page.tsx` | `/interview` | Interview shell → `InterviewDashboard`. |

### API routes — `app/api/`
| File | Method | Controller |
|---|---|---|
| `app/api/tables/[key]/route.ts` | GET/POST/PATCH | `tableControllers.ts` |
| `app/api/overview/metrics/route.ts` | GET | `overviewControllers.ts` |
| `app/api/ads/metrics/route.ts` | GET | `adsControllers.ts` |
| `app/api/sync/wa-to-crm/route.ts` | POST | `syncControllers.ts` |
| `app/api/registration/data/route.ts` | GET | `registrationControllers.ts` |
| `app/api/import/[key]/route.ts` | POST | `importControllers.ts` |
| `app/api/clear/[key]/route.ts` | POST | `clearControllers.ts` |
| `app/api/meta/tabs/route.ts` | GET | `metaControllers.ts` |
| `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts` | POST/POST/GET | `authControllers.ts` |

### Server adapters — `src/server/adapter/`
| File | Purpose |
|---|---|
| `schema.ts` | Declarative tab→column map `TAB_SCHEMAS` + `TAB_ORDER` + `columnsFor()`. Single source of column truth. |
| `registrationSchema.ts` | Declarative schema for the SEPARATE registration workbook (tab "Form Responses 1", 35 columns) + `REGISTRATION_STAGE_COLUMNS`. |
| `source.ts` | `SheetSource` interface + Phase-A placeholder (interface only; real impl in sheets/). |
| `sheets/read.ts` | `normalizeRows()` (values→row objects) + `readTable()` (fetch+normalize by app key). |
| `sheets/client.ts` | `GoogleSheetsClient`: workbook bootstrap (title→gid), header drift detection, `colToA1`. |
| `sheets/auth.ts` | Service-account JWT + `SheetConfig` env loader. |
| `sheets/factory.ts` | `createSource()` (master), `createSandboxSource()`, `createRegistrationSource()`. |
| `sheets/cache.ts` | `TableCache` TTL 300s, per-key invalidation. |
| `sheets/index.ts` | `GoogleSheetsSource` (real `SheetSource` impl): fetch/append/update/clear/sync + cache. |
| `sheets/registration.ts` | `readRegistrationTable()` + read-only `RegistrationSource` (fetch only, cached). |
| `sheets/write.ts` | Append/updateCell/clearSheet/`buildCrmAppendRows`/`syncWaToCrm` (all writes + B1 fix). |
| `sheets/sandbox.ts` | `buildSandboxSchema()` — builds a SANDBOX spreadsheet (never production) for write tests. |

### Server API — `src/server/api/`
`tableControllers.ts`, `overviewControllers.ts`, `adsControllers.ts`, `syncControllers.ts`, `registrationControllers.ts`, `importControllers.ts`, `clearControllers.ts`, `metaControllers.ts`, `authControllers.ts`, `context.ts` (lazy source singletons), `types.ts` (`ApiSource`), `testHelpers.ts`.

### Metrics — `src/server/metrics/metrics.ts`
`statusCol`, `findCol`, `funnel`, `monthlySnapshot`, `pendingCounts`, `roi`. Pure, imported by controllers.

### Workspace derivations (PURE LOGIC — Tarjo's primary target) — `src/workspaces/`
`sosmed.ts`, `insight.ts`, `waAdmin.ts`, `crm.ts`, `dm.ts`, `ads.ts`, `interview.ts`, `website.ts`, `registration.ts`. Plus their dashboards `*Dashboard.tsx`.

### Utils — `src/server/utils/helpers.ts`
`toDatetime`, `normalizePhone`, `cleanIdr`, `cleanText`, `monthLabel`, `sanitizeMixed`, `columnNames`, `isDone`.

### Lib (browser+server) — `src/lib/`
`api-client.ts` (useApi + fetch wrappers), `auth.ts`, `validation.ts`, `errors.ts`, `audit.ts`, `csv.ts`.

### Components — `src/components/`
Presentational/shared only (metrics, charts, layout, grid, sections, ui). No business math (except formatting helpers in `ui-common.ts`).

### Tests (corroboration) — `src/**/*.test.ts*`, `e2e/home.spec.ts`
Encode intended edge cases.

### Docs — `docs/`, `.phase-e/*.md`, DATA_CONTRACT.md, MIGRATION_LOG.md
Design/intent/audit history. `scripts/` is **empty** (the `scripts/smoke_test.py` referenced by some test comments is not in this repo — **UNKNOWN** as to whether it was removed or never migrated).

---

## 3. Data Sources

### 3.1 Master workbook tabs → app keys → declared columns (VERIFIED, `schema.ts`)

**VERIFIED live header counts (from `schema.test.ts`):** sosmed=16, website=14, insight=8, wa_admin=14, crm=17, dm_sosmed=9, ads_tiktok=15, ads_meta=11, mekari=5, interview=11.

| App key | Tab title (`SHEETS`, constants.ts) | Declared columns (`columns`, schema.ts) | Columns used by LOGIC |
|---|---|---|---|
| `sosmed` | `SOSMED` | `Kode Konten, Tanggal Deadline, Tanggal Posting, Output, Konten Pillar, Platform, PIC, Judul Konten, Materi Konten, "  CAPTION ", LINK COVER, PROSES, LINK KONTEN JADI, IG, TIKTOK, YT` | `PIC`, `PROSES`, `Output`, `IG`, `YT`, `TIKTOK`, `Tanggal Deadline`, `Tanggal Posting` (read-only in editor), `Kode Konten`, `Judul Konten` (display). Platform column is declared but NOT consumed by sosmed logic/filters. `DONE_KEYWORDS` not used here (uses `PROSES=="DONE"`). |
| `website` | `WEBSITE` | `Kode Konten, Deadline, Tanggal Posting, Content Pillar, SEO Rekomendasi, Judul, Status Check, Bahan Upload, LinkFolder Design, Designer, Status Writting, Status Design, Status Post, Link Live` | `Deadline`, `Status Post`, `Content Pillar` |
| `insight` | `INSIGHT` | `TANGGAL, PLATFORM, VIEW, REACH, CONTENT INTERACTION, PROFILE VISIT, LINK CLICKS, FOLLOWER` | all 8 |
| `wa_admin` | `WA ADMIN REPORT` | `f, Tanggal Masuk, No Hp, Jam Chat Masuk, PIC, Nama, Asal, Sumber (Ads/Organik/Sales), Pertanyaan, Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll), Mekari Tag, Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing), Keterangan Admin, Database` | `Tanggal Masuk`, `No Hp`, `PIC`, `Nama`, `Asal`, `Sumber (Ads/Organik/Sales)`, `Kategori (…)`, `Mekari Tag`, `Status \n\n(…)` |
| `crm` | `DATABASE NOMOR` | `No, No Hp, Nama, Domisili, Tanggal Lahir, Usia, Kategori, Keterangan Setelah Isi Form, Tanggal Masuk Database, Mekari Tag (Status Terakhir), Treatment 1, Treatment 2, Tanggal Treatment 1, Tanggal Treatment 2, Status, Updated Status After Treatment, Catatan` | `Mekari Tag (Status Terakhir)`, `Domisili`, `Nama`, `No Hp`, `Treatment 1`, `Treatment 2`, `Status` is at index 14 → **column 15** (B1 fix) |
| `dm_sosmed` | `SOSMED ADMIN REPORT` | `No, Platform, Nama / Username, Link Username, No HP/ Whatsapp, Domisili, Status, Tag Prospek, Tanggal Masuk` | `Platform`, `Status`, `Tag Prospek` |
| `ads_tiktok` | `REPORT ADS TIKTOK` | 15 columns incl. `Campaign name, Primary status, Date Created, Cost, CPM, …` | first column whose lowercase name contains cost key `cost|spent|spend` (order: cost, spent, spend) |
| `ads_meta` | `REPORT ADS META` | 11 columns incl. `Reporting starts, Reporting ends, Campaign name, Account name, Amount spent (IDR), Link clicks, Results, …` | first column matching `spent|spend|cost` (order: spent, spend, cost) |
| `mekari` | `REPORT MEKARI` | `Tanggal Input, Periode, Jenis Laporan, Total Interaksi, Total Biaya (Rp)` | `Total Biaya (Rp)` (biaya col), row count |
| `interview` | `SCHEDULE INTERVIEW` | `Tanggal, Nama Calon Siswa, Nomor Whatsapp, Pilihan Program, PIC Interview, Status Follow-Up, Tanggal Interview, Waktu Interview, Tipe Interview, Hasil Interview, Catatan PIC` | `PIC Interview`, `Status Follow-Up`, `Hasil Interview` |

### 3.2 Registration workbook (second spreadsheet) — VERIFIED (`registrationSchema.ts`)
- Tab: `"Form Responses 1"`
- 35 columns. Key columns used by logic (`registration.ts`): `Timestamp` (year via regex `(\d{4})`), `Nama Lengkap`, `Nomor Whatsapp`, `Nomor Handphone`, `Email`, `MENGETAHUI DUTA PERSADA DARI` (source), and stage columns: `Penjadwalan Interview`, `Interview`, `Hasil Interview\n(Diterima/Tidak)`, `Pengumuman hasil interview`, `Pengiriman Juknis`, `Pembayaran`, `Invite Grup Pendaftar`.

### 3.3 Derived / cross-sheet sources (VERIFIED)
- **WA Admin → CRM**: copies WA fields into CRM when synced (`write.ts::buildCrmAppendRows`), header-mapped.
- **Overview funnel**: combines insight + wa_admin + registration (latest-year count) server-side (`overviewControllers.ts`).
- **Ads per-platform KPIs** combine ads tables + wa_admin rows filtered by source pattern (`ads.ts::adsTab`).
- **Registration ↔ WA Admin match** cross-references rows visually only (`registration.ts::matchRegistrationToWa`), never writes.

---

## 4. Data Normalization

### 4.1 `normalizeRows(columns, values)` — VERIFIED (`read.ts`)
1. Header row = `values[0]`. Builds `headerIdx` map keyed by **exact trimmed** live header → column index. Only declared `columns` are surfaced.
2. For each subsequent row: for each declared column, read `raw[idx]`, coerce via `coerceCell` (string `"TRUE"`/`"FALSE"` case-insensitive → real boolean), default to `""` when missing.
3. Row is kept only if `any` declared cell is non-empty (`v !== "" && v !== null && v !== undefined`). **Fully-empty rows are dropped.**
4. `sanitizeMixed()`: any column where values span >1 JS type (`typeof`) is coerced entirely to strings (Arrow-safe). E.g. a column with `"25"` and `30` → both strings.
5. Returns row objects keyed by the **declared** header names (e.g. `row["Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)"]`).

### 4.2 Declared-column model & unknown/extra columns — VERIFIED
- **Only declared columns are surfaced.** Extra live columns (e.g. a stray `"Extra"` or `"Pixel"`) are **DROPPED** from the row object and never reach logic. (read.test.ts confirms: `rows[0]).not.toHaveProperty("Extra")`.) Extra **rows** ignored. A fully-different/absent tab → `[]` (graceful empty).
- Header matching is by **trimmed exact string**. Trailing-space headers like `"  CAPTION "` stay as declared keys after trim→matches live trimmed header (client.ts `trimTrailingEmpty` uses `.trim()`).

### 4.3 Value coercion in helpers — VERIFIED (`helpers.ts`)
- `cleanIdr`: numeric returns as-is; else strips `RP`/`IDR`, trims `,00`/`.00`, strips `.` and `,`, `Number(s)`; NaN/empty → 0.
- `normalizePhone`: strips non-digits, strips trailing `.0` (pandas float artifact), leading `0`→`62`, leading `8`→`62`, else returns digits; invalid/empty → `""`.
- `cleanText`: control-char strip for export; null→`"-"`.
- `toDatetime`: see §5.
- `columnNames`: distinct keys in first-appearance order.

### 4.4 Read path (`readTable`) — VERIFIED
- `spreadsheet.values.get` with `valueRenderOption: "FORMATTED_VALUE"` on range `'<tab>'!A1:ZZ`. So Google Sheets renders dates as `DD/MM/YYYY` strings and booleans as real booleans before normalization. Errors/missing tab → `[]`.

### 4.5 Duplicate handling — VERIFIED
- **Read**: duplicates are NOT deduplicated by design. All data-bearing rows are returned. Insight's `dataQuality()` *reports* duplicate date+platform pairs as a quality issue but does not remove them; other workspaces (wa_admin, sosmed, etc.) also do NOT dedupe on read.
- **WA→CRM sync**: dedupe only happens there, by normalized phone against existing CRM phones (§8).

---

## 5. Date Logic

### 5.1 `toDatetime(value, dayFirst=true)` — VERIFIED (`helpers.ts`)
- null/undefined/`nan`/`none`/`nat`/`null`/`""` → `null`.
- **ISO** `YYYY[-/]M[-/]D` (optionally with `T`/space time tail) → date. **Priority given to ISO.**
- **Day-first** `DD[-/]MM[-/]YYYY` (or 2-digit year → +2000) → date. This is the primary format for Sheets `FORMATTED_VALUE` dates.
- `makeDate` validates year 1900–2100, month 1–12, day 1–31, and **rejects rollover** (e.g. 31/02 → null).
- Returns local-midnight `Date`; otherwise `null`.

### 5.2 Date filters per workspace — VERIFIED
- **SOSMED - "Bulan Deadline"**: groups by **`Tanggal Deadline`** month label `"%B %Y"` (e.g. "September 2026"). Grouping is by DEADLINE month, NOT posting month. If NO deadline month is derivable across rows, the month filter is **skipped entirely** (`sosmed.ts::filterSosmedRows`). A row whose deadline month cannot be parsed is dropped when the month filter is active. **Today/deadline comparison (OVERDUE) is NOT implemented** — see §16.
- **WEBSITE - "Bulan Deadline"**: same pattern via `Deadline` column (`website.ts`). `monthLabel(row["Deadline"])`. Filter skipped when no month derivable. No live/deadline comparison.
- **INSIGHT**: date-range filter on `TANGGAL` (via `toDatetime`). `filterInsightRows` — **inclusive** `[from, to]`, platform filter. Rows without parseable date are **kept when no date bound active**, **dropped as soon as any bound is set**. `buildInsightModel` defaults `from`/`to` to the data span min/max when not provided. `previousDates` computes the equal-length immediately-preceding window (delta comparison). No "today" defaults — the dashboard's `<input type="date">` starts empty (full span).
- **WA ADMIN - "Filter Bulan"**: `monthOptions`/`filterByMonth` on **`Tanggal Masuk`** (`YYYY-MM` period). Also `monthlyTrend` counts only the **current calendar year** rows.
- **Registration**: year extracted from `Timestamp` via regex `(\d{4})` (accepts `M/D/YYYY h:m:s` or ISO); `registrationYears` descending; `filterByYear`. **Year default in dashboard = latest year present** (see §8/§9).
- **Interview / DM / CRM**: no date-range filtering in the derivations (interview has no date filter; DM no; CRM no).

### 5.3 Timezone / inclusive-exclusive — VERIFIED
- All `Date` objects are **local server/browser-timezone** midnights (`new Date(y, m-1, d)`). **No explicit timezone handling** beyond that. No UTC conversion.
- Date-range bounds are **inclusive** (row date `>= from` AND `<= to`).
- `daysBetween` returns inclusive day count (>=1); `previousDates` is `[from-span, from-1day]` inclusive.
- `toDatetime` on a `DD/MM/YYYY` with trailing time (e.g. "13/04/2026 10:00") parses via the day-first regex which tolerates a time tail; the registration `Timestamp` uses its own dedicated `timestampMs` parser.

### 5.4 Invalid/empty dates — VERIFIED
- Unparseable → `null`/"". Month-label derivation yields `""` → those rows grouped as no-month (and dropped when filter active). Insight `dataQuality()` reports `outOfOrder`/empty. No crash paths.

---

## 6. Sosmed Logic  (HIGH PRIORITY)

### 6.1 Source & columns (VERIFIED, `sosmed.ts`)
- Source: `SOSMED` tab (master workbook).
- Columns consumed: `PIC`, `PROSES`, `Output`, `IG`, `YT`, `TIKTOK`, `Tanggal Deadline`, `Tanggal Posting` (read-only editor date col), `Kode Konten`, `Judul Konten`.

### 6.2 Per-field definitions (VERIFIED)
- **PIC field**: `PIC` column. `picOptions` = sorted distinct non-null PIC values; falls back to sorted `PIC_LIST` (`["Ejak","Hana","Abi","Angel"]`) only if `PIC` column absent.
- **Task/content field**: each row = one content/task item. `Judul Konten` = title.
- **Content type = `Output`** column. `isVideo` = `Output` lowercased **contains** `"video"` (substring). Otherwise counted as "design" (the else branch). So `"Video Reels"` → video; `"Design Feed"`/`"Static"` → design.
- **Status field**: `PROSES`. `isDone` = `PROSES.toUpperCase() === "DONE"` (exact, trimmed implicitly by JS? No — `str(...).toUpperCase()` is compared to `"DONE"` — case-insensitive via upcase, no explicit trim, but `str()` does not trim). Note: `PROSES_OPTIONS = ["DONE","PENDING","ON PROGRESS"]`.
- **DONE definition**: **`PROSES` upper == `"DONE"`**. NOT `DONE_KEYWORDS`. **`Tanggal Posting`, `LINK KONTEN JADI`, and the `DONE_KEYWORDS` constant are NOT used for the sosmed DONE determination.**
- **NOT DONE** = `PROSES` does not equal `"DONE"` (e.g. PENDING). Everything that isn't done.
- **OVERRDUE**: **not implemented** (no deadline-vs-today comparison). `hutang` in the workload is "not done", not "overdue".
- **Post flags / truthiness**: `truthy`/`postDone` — bool pass-through, number `!==0`, else string trimmed+uppercased ∈ `POST_TRUTHY = {V,TRUE,1,YES,CHECKED}`. Used for IG/YT/TIKTOK col "posted" semantics and for the editor diff.

### 6.3 Metrics over FILTERED rows (`sosmedMetrics`) — VERIFIED
- `total` = filtered row count.
- `done` = count of `isDone`.
- `videoCount`/`videoDone` & `designCount`/`designDone`: split by `isVideo`; done subset each. Displayed as `"a/b"` labels.
- **Hutang (post debt)**: within DONE rows:
  - `hutangIg` = count(done && !postDone(IG))
  - `hutangYt` = count(done && video && !postDone(YT))   ← YT debt only for VIDEO items
  - `hutangTiktok` = count(done && !postDone(TIKTOK))
- Workload per PIC (`workload`): for each selected PIC present in filtered data, `selesai` = count isDone, `hutang` = length - selesai.

### 6.4 Filters (VERIFIED)
- PIC multiselect → subset rows `PIC ∈ picSel`.
- "Bulan Deadline" multiselect (`monthSel`) → subset rows whose `Tanggal Deadline` month label ∈ monthSel. Month filter applies only if `sosmedMonths(rows).length > 0`.
- **Concrete group filter on the page**: PIC + Bulan Deadline. There is **no Platform filter** on the sosmed page — the `Platform` column is declared in the schema but the dashboard only exposes PIC and Bulan Deadline multi-selects. (The brief's "platform filter" question: **there is none active in code.**)

### 6.5 Grouping / sorting
- Metrics use row order as-is (no global sort). Workload ordered by the `selectedPics` argument (sorted distinct PICs by default). Months in first-appearance order.

### 6.6 Example-output trace (brief's target `ABI 10 DONE / 2 NOT DONE / Total 12`)
- This exact per-PIC Brevity output (PIC name: Selesai / Hutang; plus labeled NOT-DONE list like "1. Reels — Interview Hotel", "2. Design — Promo Gelombang 3") is **NOT produced by the current implementation** as a labeled NOT-DONE itemization. The code produces per-PIC workload counts (`ABI selesai/hutang`), not a bulleted list of individual NOT-DONE content with labels derived from Output. **To reproduce the brief's example, a Tarjo command would need to derive** the item type label from **`Output`** (e.g. substring `video` → "Video"/the pre-token, else "Design") and the title from **`Judul Konten`**, filtered to `!isDone` per PIC. **INFERRED** (the target text is not in code, but the underlying derivation `!PROSES==DONE` + `Output` + `Judul Konten` is VERIFIED). Marked **UNKNOWN** as a shipped output, **VERIFIED** as a derivable expression.

---

## 7. Insight Logic  (VERIFIED unless noted — `insight.ts`, 574 lines)

### 7.1 Pipeline (VERIFIED)
`Raw rows → filterInsightRows (platform+date) → sumMetrics → deriveMetrics → model (buildInsightModel) → dashboard`.

### 7.2 Parsing (VERIFIED)
- `toNum`: numeric pass-through (finite); strings: strip `[.,\s]` and `Number()`; empty/`-`/`.`/`,` → 0; NaN → 0.
- `insightDate`: `toDatetime(row["TANGGAL"])`.
- `insightPlatform`: trimmed string; `normalizedPlatform` = case-insensitive match to `["Instagram","TikTok"]`, else null. Unknown platforms (e.g. "Facebook") are counted but excluded from Instagram/TikTok comparison; `platform` filter `"all"` keeps everything.

### 7.3 KPIs / cards (VERIFIED)
| Metric | Column | Aggregation | Display |
|---|---|---|---|
| Views | `VIEW` | sum | `formatCount` (id-ID grouping) |
| Reach | `REACH` | sum | |
| Interaksi Konten | `CONTENT INTERACTION` | sum | |
| Profile Visit | `PROFILE VISIT` | sum | |
| Link Click | `LINK CLICKS` | sum | |
| Net Follower | `FOLLOWER` | sum (net, can be negative) | |

### 7.4 Derived rates (VERIFIED `derivedRates`) — **denominator-guarded (null when denom ≤ 0)**
- Engagement Rate = Content Interaction / Reach × 100
- Profile Visit Rate = Profile Visit / Reach × 100
- Link CTR = Link Clicks / Reach × 100
- Profile→Click Conversion = Link Clicks / Profile Visit × 100
- `rate` returns `null` (never NaN/Infinity) when denom ≤ 0. UI shows "N/A" or "—".

### 7.5 Metric availability — **"0 ≠ unavailable"** (VERIFIED `metricAvailable`)
- A metric is **UNAVAILABLE** when EVERY row in scope parses to 0/empty for that metric (i.e. column unpopulated throughout). **Available** (real "0") if any row is non-zero, even if they cancel to a genuine summed 0. Empty scope → unavailable. Drive N/A vs genuine 0 in KPI + platform comparison.

### 7.6 Funnel (INSIGHT-only, no CRM/Lead) (VERIFIED)
Stages in order: Reach → Content Interaction → Profile Visit → Link Clicks, values = summed metrics. Adjacent-stage conversion = cur/prev × 100, null when prev ≤ 0 (UI "N/A").

### 7.7 Platform comparison (VERIFIED)
Instagram vs TikTok: for each, deriveMetrics over its rows. No scoring/ranking. Availability per platform per metric.

### 7.8 Period comparisons & growth (deltas) (VERIFIED `buildInsightModel`)
- `previousDates` = equal-length window `[from-span, from-1day]` before current `[from,to]`. If any previous-period rows exist, compute `pctChange(cur, prev) = (cur-prev)/prev×100`, **null when prev == 0**. If no baseline → deltas all null, `hasPrevious=false`. Dashboard shows delta only when `hasPrevious && delta !== null`.
- **INDIRECT**: `overviewControllers` also fetches unfiltered insight and uses `sumMetrics` (all-time) for the funnel; there is no per-period comparison on the home funnel.

### 7.9 Trend & period summary (VERIFIED)
- `trendSeries`/`multiTrend`: per-day summed metric(s), keys `YYYY-MM-DD`, Indonesian `D MMM` labels. Sorted ascending.
- `periodSummary`: daily / weekly (week starts **Monday**, label `Wk D MMM`) / monthly (Indonesian `MMM YYYY`) buckets; each bucket sums all 6 metrics; sorted by period start.

### 7.10 `dataQuality` (VERIFIED) — read-only diagnostics
Flags: empty (no rows), Reach=0 count, negative Follower, duplicate date+platform, out-of-order dates, unknown platforms. Reports counts; does NOT alter data.

### 7.11 Availability of "hidden calculations": N/A. The 574 lines are fully enumerated above. No hardcoded numbers.

---

## 8. Admin WA / CRM Logic  (SPECIAL: CLOSING)

### 8.1 Sources (VERIFIED)
- `wa_admin` = `WA ADMIN REPORT`; `crm` = `DATABASE NOMOR`.

### 8.2 Junk filter (VERIFIED `waAdmin.ts::junkFiltered`, and `write.ts::buildCrmAppendRows`)
- `JUNK_TAGS = ["not eligible","partnership","alumni","closed - not interested","closed - registered","double chat"]`.
- Regex join `"|"` case-insensitive. Applied to columns **`Mekari Tag` and `Kategori`** — but **ONLY the EXACT-name columns** (junkCols = those present in the data). A suffix like `"Kategori (Persyaratan/...)"` does **NOT** fire the junk filter (it is an exact-name check). The full suffix column `Kategori (…...)` is present but not the literal `Kategori`, so junkFiltered evaluates only exact `"Mekari Tag"` + exact `"Kategori"`.
- In `buildCrmAppendRows`, junk filtering also checks both `"Mekari Tag"` and `"Kategori"` (present-or-not) columns.

### 8.3 Status column resolution (VERIFIED)
- `statusCol(rows)` (from `metrics.ts::statusCol`) = LAST column whose lowercase name contains `"status"` and does NOT contain `"mekari"`. On wa_admin this resolves to `Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)`.
- `normalizeStatuses`: trim; `""` → `"Belum Terupdate"`.
- Tools that resolve "Status": waAdmin `statusColumn`, ads `waStatusCol` (first match, different: first col containing "status" minus mekari), write `waStatusColumn` (last col containing "status" not mekari).

### 8.4 KPI definitions (VERIFIED `deriveWaAdminStats`)
Key fractions - **IMPORTANT distinction**:
- `total` = **junk-filtered + status-normalized (prepared)** row count = /admin-wa "Total Pesan".
- `closing` (`closingCount`) = rows whose **STATUS (col L) EXACTLY equals `"closing"`** **case-insensitive, trimmed**, measured over the **(month-filtered) ALL source rows PRE-junk** (NOT the junk-filtered prepared set). Rationale per comment: junk strips Closing rows (70→2), and the headline metric must match the spreadsheet's column-L count. **This is the CLOSING source of truth.**
- `conversionLabel` = `(closing/total)×100` to 1 decimal, or `"—"` when total=0. Here **numerator = closing (pre-junk), denominator = total (post-junk)** — these use DIFFERENT row sets (documented in code). `closingTargetLabel` = `closing/CLOSING_TARGET` (CLOSING_TARGET=45).
- Sales Progress table = STATUS == `"sales progress"` (case-insens exact after trim), over month-filtered source rows (pre-junk).
- Pending Form - L1 = STATUS == `"Pending Registration"` (status-category map `STATUS_CATEGORY`), over prepared (post-junk) rows.
- Future Prospect = **MEKARI TAG (col K)** == `"future prospect"` (case-insens exact), over source rows (pre-junk).

### 8.5 Other WA KPIs (VERIFIED)
- `monthlyTrend`: leads per month (current year only), `Tanggal Masuk`, label `MMM YYYY`.
- `sourceBreakdown`: group by first column whose lowercase name contains `"Sumber"` → `Sumber (Ads/Organik/Sales)`; excludes empty/nan; count-desc.
- `picBreakdown`: group by `PIC`, exclude empty, count-desc.
- `mekariTagBreakdown`: group by `Mekari Tag`, exclude empty/nan, count-desc.
- `kategoriBreakdown`: group by first column whose lowercase contains `"kategori"` and not `"mekari"` (→ the suffixed column), exclude empty/nan, count-desc.
- `asalBreakdown` (treemap "Tag Asal"): group by `Asal`, **exclude empty/null/"nan"**, keep every distinct valid value verbatim (no aggregation/Onbekend), count-desc.
- `monthOptions`/`filterByMonth`: `Tanggal Masuk` `YYYY-MM`.
- Status distribution donut / detail table: `statusDist` = value counts of resolved status col over prepared, count-desc; `options` = distinct statuses sorted (excl empty/nan); detail filter by exact selection.
- CSV export: whole prepared (junk-filtered) set, `utf-8-sig` BOM, filename `wa_admin_YYYYMMDD.csv`.

### 8.6 Legacy vs new closing — AMBIGUITY (VERIFIED divergence)
- `metrics.ts::funnel()` (legacy, used for **Hero metrics** in overview): `closing` = count rows where status col **lowercase INCLUDES** `"closing"` (substring), over **ALL ws rows** (no junk filter). `conversion = closing/leads×100`, `leads=wa.length`.
- `roi()` (used for overview spend/cac/roas + ads metrics): `closing` also uses the **substring** `includes("closing")` over all wa rows.
- So **/api/overview/metrics.metrics.closing** (substring, all-rows) can differ from **/api/overview/metrics.funnel.closing** (= `waStats.closing`, `STATUS=="closing"` pre-junk) **and** from /wa-admin's closing KPI. **This is a genuine intra-app definitional split** Tarjo must be aware of (§16).

### 8.7 WA→CRM sync (VERIFIED `write.ts::buildCrmAppendRows` + `syncWaToCrm`)
1. Junk filter on `Mekari Tag`/exact `Kategori` (drop).
2. Require `No Hp` column (else `NO_NO_HP` error).
3. Dedupe: normalize each WA `No Hp` (60/08/8 → 62…) and skip if already present in CRM `No Hp` (also normalized).
4. Header-aligned mapping into CRM (B1 fix — by column header, NOT fixed offset):
   - `No Hp` → `No Hp` (normalized 62)
   - `Nama` → `Nama`
   - `Asal` → `Domisili`
   - first `kategori` col → `Kategori`
   - `Tanggal Masuk` → `Tanggal Masuk Database`
   - `Mekari Tag` → `Mekari Tag (Status Terakhir)`
   - **`Status` (last non-Mekari status col) → `Status`** which lands at CRM index 14 = **column 15** (V3 bug wrote index 17/col-null offset).
5. `syncWaToCrm` returns `{ok, message, added, skipped}`; appends via `appendRowsToSheet`; invalidates only the `crm` cache.

### 8.8 Registration (feeds "Total Pendaftar" / registration stats) — VERIFIED
Beyond §3.2/§5, `registration.ts` exposes: 6-stage funnel `Pendaftar → Interview → Diterima → Juknis → Pembayaran → Grup`, stage reached = exact `Sudah` (case-insens, trimmed; blank/`Belum` NOT reached), `Diterima` = `Hasil Interview` == `Ya` (exact), `Tidak` = rejected. `needsAttentionTotal` = distinct union across 5 categories. `sourceBreakdownReg` per source (Pendaftar/Diterima/Pembayaran). `recentPendaftar` newest-first. **Dashboard default year = latest year present** (`regStats.years[0]`), which is why Overview "Daftar" uses latest-year count.

---

## 9. Other Page Logic

### 9.1 DM (VERIFIED `dm.ts`)
- Platform col: `Platform` else 2nd row-key column else none. Status col: `Status DM` else `Status`. Tag col: `Tag Prospek` else `Tag`.
- Metrics: total, Instagram/TikTok/Facebook counts (case-insensitive **substring match** on platform col). Status donut = value counts (incl. empty string). Tag donut = counts over rows with non-empty tag (filters empty tags). Recent = reversed rows take 15.
- **Append** (write): DNS-only form posts payload (`dm.ts::buildAppendPayload`) with `No` = rowCount+1, username stripped of `@`, link builder (Instagram no @, TikTok `@`, else Facebook fallback), phone: starts `"0"` → `'62<rest>` else `'<num>`; `Tanggal Masuk` = today `YYYY-MM-DD`. Writes via `POST /api/tables/dm_sosmed` (editor only).

### 9.2 Ads (VERIFIED `ads.ts` + `adsControllers.ts` + `AdsDashboard.tsx`)
- `spendOf`: sum `cleanIdr` over first column whose lowercase name contains a cost key (per-tab order).
- `adsTab` (TikTok/Meta tabs): spend from ad rows + leads/closing counted on WA rows whose `Sumber` (first col with "Sumber") matches `sourcePat` regex (case-insensitive): TikTok `sourcePat="tiktok"`; Meta `sourcePat="instagram|facebook|ig|fb"`. Closing = those matching rows whose status col (first col with "status" minus "mekari") lowercased includes `"closing"`. CPL = `rupiah(spend/leads)` or `"—"` when no leads.
- `mekariStats`: total=row count, biaya col = first lowercase contains `"biaya"` else exact `"cost"`, `biaya`=cleanIdr sum, `biayaPer`=rupiah(biaya/total) or `"—"`.
- **ROI Overview** (server scalar via `roi()` in metrics.ts): spend = tiktok+meta cost columns + mekari biaya; leads/closing = wa (substring closing, all-rows); omzet = closing × `BIAYA_PELATIHAN` (12,995,000); CAC = spend/closing (0 if closing=0); ROAS = omzet/spend (0 if spend=0). Empty degraded to "—".
- **Mekari special import**: client parses file (xlsx/csv via SheetJS), `dropTotalRows` drops rows whose first column lowercased starts with "total"; `buildMekariRow` classifies: "WA Campaign Logs" (has `deducted balance` or `broadcast amount`; biaya=sum deducted balance, msg=sum broadcast amount or rowcount), "WA Billing Logs" (`credit` → sum credit, msg rowcount), else "Manual" (first col incl `biaya`), with warning if no recognized biaya col. Appends ONE summary row to `mekari` via POST `/api/tables/mekari`.

### 9.3 Interview (VERIFIED `interview.ts`)
- KPIs over full set: total; `menunggu` = status matches regex `No Respon|Follow Up|Reschedule|Pending|Belum|Menunggu`; `selesai` = hasil non-empty OR status=="Done"; `lolos` = hasil matches `lulus|diterima` AND NOT `tidak lulus|tidak `.
- Filters: PIC / Status Follow-Up / Hasil independent multiselects (sorted distinct non-null); intersection. Column-absent → no-op.

### 9.4 Website (VERIFIED `website.ts`)
- Month filter via `Deadline` month label; total/live/pending over filtered where live = `Status Post` up/strip ∈ `DONE_KEYWORDS`.
- **Pillar remaining counts** over not-done rows: Artikel (`Article` substring), News (`News|Berita` regex), Galeri (`Galery|Gallery|Album` regex), LinkedIn (`Linkedin` substring).
- `pendingByPillar` groups not-done by Content Pillar sorted. Tables show `Kode Konten`, `Judul`, `Deadline`.

### 9.5 Registration (covered §8.8). Also `needsAttention` 5 categories + `matchRegistrationToWa` visual match (Whatsapp→Handphone→Email→Nama, DM all rows find-first; **no cross-table writes**).

### 9.6 CRM (VERIFIED `crm.ts`)
- Search: Nama case-insensitive substring OR No Hp substring (only when column present). Mekari Tag + Domisili multiselect exact. Treatment select via `Treatment 1`/`Treatment 2` presence. `crmMetrics`: hasilFilter / totalDb / sudahT1 / sudahT2.
- Mekari CSV export `mekari_contacts_YYYYMMDD.csv` with `phone_number,full_name,customer_name,company` (normalizePhone). No logic-level closing metric on CRM page.

---

## 10. KPI Definitions (master consolidated list)

Definitions are VERIFIED from the cited functions. `Formula` lists the exact computation.

| # | KPI | Where (page) | Source table | Definition / Formula | Scope | Status |
|---|---|---|---|---|---|---|
| 1 | Total Rencana | sosmed | SOSMED | `filtered.length` | filtered PIC+deadline-month | VERIFIED |
| 2 | Total DONE | sosmed | SOSMED | count `PROSES.toUpperCase()=="DONE"` | filtered | VERIFIED |
| 3 | Video Selesai | sosmed | SOSMED | `videoDone/videoCount` (video = Output contains "video") | filtered | VERIFIED |
| 4 | Design Selesai | sosmed | SOSMED | `designDone/designCount` | filtered | VERIFIED |
| 5 | Hutang Post IG | sosmed | SOSMED | count(done && `!truthy(IG)`) | filtered | VERIFIED |
| 6 | Hutang Post YT | sosmed | SOSMED | count(done && video && `!truthy(YT)`) | filtered | VERIFIED |
| 7 | Hutang Post TikTok | sosmed | SOSMED | count(done && `!truthy(TIKTOK)`) | filtered | VERIFIED |
| 8 | Workload per PIC (Selesai/Hutang) | sosmed | SOSMED | per PIC present: selesai=count done, hutang=len−selesai | filtered | VERIFIED |
| 9 | Total Task | website | WEBSITE | `filtered.length` (deadline-month filtered) | filtered | VERIFIED |
| 10 | Live Pages | website | WEBSITE | count `Status Post up/strip ∈ DONE_KEYWORDS` | filtered | VERIFIED |
| 11 | Pending | website | WEBSITE | `total - live` | filtered | VERIFIED |
| 11b | Per-pillar remaining | website | WEBSITE | not-done rows split by regex on Content Pillar | filtered | VERIFIED |
| 12 | Views / Reach / Interaksi / Profile Visit / Link Click / Net Follower | insight | INSIGHT | sum per column | filtered date+platform | VERIFIED |
| 13 | Engagement Rate | insight | INSIGHT | Interaction/Reach×100, null if Reach≤0 | filtered | VERIFIED |
| 14 | Profile Visit Rate | insight | INSIGHT | ProfileVisit/Reach×100, null if Reach≤0 | filtered | VERIFIED |
| 15 | Link CTR | insight | INSIGHT | LinkClicks/Reach×100, null if Reach≤0 | filtered | VERIFIED |
| 16 | Profile→Click | insight | INSIGHT | LinkClicks/ProfileVisit×100, null if PV≤0 | filtered | VERIFIED |
| 16b | Funnel 4-stage + conversion | insight | INSIGHT | Reach→Interaction→Profile→LinkClicks; conv=cur/prev×100 | filtered | VERIFIED |
| 17 | Total Pesan (Lead) | wa-admin / overview funnel | WA ADMIN REPORT | junk-filtered prepared row count | month-filtered (dashboard); all (overview) | VERIFIED |
| 18 | Closing | wa-admin / overview funnel | WA ADMIN REPORT | STATUS(col L) == "closing" (case-insens, trimmed), **pre-junk** source rows | month-filtered (dashboard); all (overview) | VERIFIED |
| 19 | Conversion % | wa-admin | WA ADMIN REPORT | `closing(post-junk denom? No)/total`. Precisely `(closing/total)*100` 1dp where closing=pre-junk closing, total=post-junk total; or "—" if total=0 | month-filtered | VERIFIED |
| 20 | Closing / Target | wa-admin | WA ADMIN REPORT | `closing/45` | month-filtered | VERIFIED |
| 21 | Sales Progress | wa-admin | WA ADMIN REPORT | STATUS == "sales progress" (case-insens) | source rows (month-filtered) | VERIFIED |
| 22 | Pending Form L1 | wa-admin | WA ADMIN REPORT | STATUS == "Pending Registration" | prepared | VERIFIED |
| 23 | Future Prospect | wa-admin | WA ADMIN REPORT | Mekari Tag == "future prospect" (case-insens) | source rows | VERIFIED |
| 24 | Leads/month trend | wa-admin | WA ADMIN REPORT | count `Tanggal Masuk` per month, current year | prepared | VERIFIED |
| 25 | Total Pendaftar | wa-admin / overview funnel | REGISTRATION | `countPendaftar` (row count) | year-filtered (default latest) | VERIFIED |
| 26 | Registration funnel 6-stage + conversion | wa-admin | REGISTRATION | stage=exact "Sudah"; Diterima=exact "Ya"; conversions next/cur | year-filtered | VERIFIED |
| 27 | Needs Attention | wa-admin | REGISTRATION | distinct union across 5 categories | year-filtered | VERIFIED |
| 28 | Total Prospek / IG / TikTok / FB | dm | SOSMED ADMIN REPORT | count platform-col substring match | all | VERIFIED |
| 29 | Total Spend / Leads / Closing / CAC / ROAS / Omzet | ads (ROI) + home Hero | WA+ads tables | `roi()`: spend=sum cost cols; leads=wa.length; closing=wa status substring "closing"; omzet=closing×12,995,000; cac=spend/closing; roas=omzet/spend | all | VERIFIED |
| 30 | Per-platform Spend/Leads/Closing/CPL | ads TikTok & Meta | ads + WA | `adsTab` (source-pattern WA leads; closing substring) | all | VERIFIED |
| 31 | Mekari Interaksi/Biaya/Biaya-per-Interaksi | ads Mekari | REPORT MEKARI | total=rows; biaya=cleanIdr sum biaya col; per=rupiah(biaya/total) | all | VERIFIED |
| 32 | Home SalesFunnel stages + linear rates | home | insight+wa+registration | reach→views(awareness), linkClick(intent), lead, daftar(latest-year), closing; rates linkClick/reach, lead/linkClick, daftar/lead, closing/daftar, closing/lead; null on 0 denom | all-time insight + wa + latest-year reg | VERIFIED |
| 33 | Interview Total / Menunggu / Selesai / Lolos | interview | SCHEDULE INTERVIEW | see §9.3 regexes | all | VERIFIED |
| 34 | CRM Hasil Filter / Total DB / Sudah T1 / Sudah T2 | crm | DATABASE NOMOR | filters + treatment column presence | filtered | VERIFIED |

**Formatting (VERIFIED ui-common.ts):** `formatCount` (id-ID dot grouping, rounded), `formatPercent(pct, hasBase)` → `"—"` when no base, `formatRoas` → `—` when no spend, `formatRupiah` → `.000`.

---

## 11. Edge Cases (VERIFIED from code)

- **Empty rows**: `normalizeRows` returns `[]` for <2 value rows (header-only/empty) / missing tab. Read → no rows → page empty states.
- **Empty PIC**: `picOptions` retains only non-null; `workload` skips PICs not present.
- **Empty status**: wa-admin → normalized `"Belum Terupdate"` used in distribution/table; closingCount ignores (only status == closing). Empty status in sosmed → not done.
- **Empty content / content type**: `Output` empty → `isVideo` false → counted "design"; `Judul` empty fine.
- **Empty content type**: same as empty Output.
- **Duplicate rows**: allowed on read (not deduped). Insight reports duplicates, other pages count them.
- **Unknown status / unknown tag**: wa-admin treats all non-closing exactly; future prospect = Mekari tag only. Ads closing = substring.
- **Unknown platform (insight)**: kept under filter "all, excluded from IG/TikTok scopes; flagged by quality.
- **Invalid dates**: `toDatetime` null → row excluded from month/year/date-based aggregations; kept when no date filter; dropped when filter active.
- **Missing columns**: every derivation guards on column presence (JUNK filter exact-name; statusCol resolves; interview guards; website guards `Status Post`; CRM guards; ads finds first match). Missing column → 0 / unfiltered / no chart.
- **Missing tab / spreadsheet empty**: `readTable`/`readRegistrationTable` → `[]` (graceful). 
- **API errors**: uniform `{error:{code,message,status}}`; 401 auth, 403 role, 400 validation, 404 unknown key, 502 adapter, 500 internal. `decodeApiError` maps non-JSON to defaults. Client surfaces ErrorState.
- **Real 0 vs unavailable**: insight `metricAvailable` (VERIFIED) — N/A only when column all-zero through scope.
- **Division by zero guards**: `rate` (null), `linearRate` (null), `pctChange` (null when prev 0), `conversionPct` ("—" when cur=0), `conversionLabel` ("—" total=0), `roi` CAC/ROAS → 0, home rates null → UI "—". No NaN/Infinity rendered (tests assert).
- **V3 boolean "TRUE"/"FALSE" strings → real booleans** via `coerceCell`.
- **Mixed-dtype column** → string via sanitizeMixed.

---

## 12. UI → Logic Trace (important numbers)

Format: **UI label → function(s) → source/transformation → formula → output**.

1. **/wa-admin "Total Pesan"** → `deriveWaAdminStats().total` → wa_admin rows → junkFiltered → status-normalized count.
2. **/wa-admin "Closing"** → `closingCount(sourceRows)` → source rows (pre-junk, month-filtered) → STATUS == "closing" (case-insens trim).
3. **/wa-admin "Conversion"** → `conversionLabel` → `(closing/total)*100` 1dp where closing = pre-junk count, total = post-junk total; "—" if total=0.
4. **/wa-admin "Closing/Target"** → `closing/45`.
5. **Home Hero "Closing"** → `overviewMetricsController` → `metrics.closing = funnel(wa).closing` = legacy substring over all wa rows (NOT same as /wa-admin KPI). `metrics.leads = funnel(wa).leads = wa.length`. `metrics.conversion = funnel(wa).conversion`.
6. **Home "ROAS"/"Omzet"/"CAC"/"Spend"** → `roi()` (metrics.ts) → `roas=omzet/spend`, `omzet=closing×12995000`, etc.
7. **Home QuickInsight funnel** → `overviewMetricsController` → `reach/views/linkClick/interaction/profileVisit = sumMetrics(insight)`; `lead = deriveWaAdminStats(wa).total`; `closing = deriveWaAdminStats(wa).closing`; `daftar = countPendaftar(filterByYear(reg, latestYear))`; rates via `linearRate`. **NOTE: home funnel closing == /wa-admin closing (STATUS "closing" pre-junk), while home Hero closing == substring legacy.** Both are in the SAME payload.
8. **/insight KPI** → `buildInsightModel` → `sumMetrics(filtered)` → `formatCount`.
9. **/insight Engagement Rate** → `deriveMetrics().engagement` → `(contentInteraction/reach)*100`, null→"—".
10. **/sosmed "Total Rencana"/"Total DONE"** → `sosmedMetrics(filtered)` → count & `PROSES=="DONE"`.
11. **/sosmed "Video Selesai"** → `videoDone/videoCount` (Output contains video).
12. **/website "Live Pages"** → `deriveWebsiteStats().live` → `Status Post ∈ DONE_KEYWORDS`.
13. **/ads ROI Overview** → `GET /api/ads/metrics` → `roi()`.
14. **app /login Auth** → `authControllers.loginController` → credentials → signed cookie; `meController` returns role.
15. **/ads TikTok Spend** → `adsTab(tiktokRows, wa, costKeys, sourcePat)` → `spendOf` cleanIdr sum.

---

## 13. Tarjo Command Specification

**Read-only mandate: Tarjo must ONLY call GET-style/derivation logic (fetch rows + run pure derivations). It must never call the write endpoints.** (See §14.)

| Tarjo command | Supported by DigMark logic? | Source | Recommendation |
|---|---|---|---|
| `/content_status` | **PARTIAL** | SOSMED | Yep — reproduce `sosmedMetrics` per PIC (done/not-done counts). Add PIC + deadline-month filters. **Not in code as a command** but derivation exists. |
| `/content_pending` | **PARTIAL** | SOSMED | Derived: rows where `PROSES != DONE`. Note brief's "NOT DONE items w/ label (Reels/Design)" must derive Output + Judul — supported expression. |
| `/content_pic` | **PARTIAL** | SOSMED | Supported via `workload()`. |
| `/insight` | **YES** | INSIGHT | Reproduce `buildInsightModel` KPIs + rates + funnel + platform comparison. Strongly recommended. |
| `/insight_summary` | **YES** | INSIGHT | `deriveMetrics` + `dataQuality` summary. |
| `/leads` | **YES** | WA ADMIN REPORT | Reproduce `deriveWaAdminStats().total` (post-junk). |
| `/leads_source` | **YES** | WA ADMIN REPORT | `sourceBreakdown` (post-junk, count-desc). |
| `/leads_status` | **YES** | WA ADMIN REPORT | `statusDist`/`statusOptions` (post-junk, count-desc). |
| `/sales_progress` | **YES** | WA ADMIN REPORT | `salesProgressRows` (STATUS == "sales progress", pre-junk source).
| `/closing` | **YES** | WA ADMIN REPORT | `closingCount` (STATUS == "closing", pre-junk). **Use THIS definition, not the metrics.ts substring.** |
| `/overdue` | **NO (not implemented)** | SOSMED/WEBSITE | There is **no deadline-vs-today comparison** anywhere. Recommend either adding shared logic or define overdue = not-done (documented). |
| `/report_daily` | **NO** | — | No daily auto-report endpoint. Insight has daily trend; wa-admin monthly trend. Recommend a scheduled composition, not a single formula. |
| `/report_weekly` | **NO** | — | No weekly report endpoint. |
| **Additional supported commands (not in the brief):** `/registration_funnel` (§8.8), `/dashboard_overview` (home funnel payload `GET /api/overview/metrics`), `/ads_roi` (`roi()`), `/dm` (mini stats), `/website` (live/pending/pillars), `/interview` (KPIs), `/mekari` stats, `/awa` (monthly trend). |

**Cross-cutting caution for Tarjo:** There are TWO closing definitions (`STATUS=="closing"` vs substring). Always use the workspace `closingCount` semantics for marketing closing; use `roi()/funnel()` substring only if replicating the Hero metrics block exactly.

---

## 14. Shared Logic Architecture

### 14.1 Target architecture (brief)
`Google Sheets → Data Access Layer → DigMark Business Logic → (DIGMARK V3.1 UI | TARJO BOT)`.

### 14.2 Verdict (VERIFIED)
DigMark's business logic is **already cleanly separated into pure, framework-free modules** (`src/workspaces/*.ts`, `src/server/metrics/metrics.ts`, `src/server/utils/helpers.ts`) that take normalized `Row[]`/rows and return plain objects. They carry **no React/Next/Sheets imports**. **Tarjo can import these same modules** (or the same compiled functions) to get bit-identical numbers — this is the SINGLE most important lever and it is largely already in place.

**Duplication / centralization review:**
- **Already centralized (good):** `toDatetime`, `cleanIdr`, `normalizePhone`, `sanitizeMixed`, `statusCol`, `findCol`, `closingCount`, `deriveWaAdminStats`, `sumMetrics`, `roi`, `funnel`, `sosmedMetrics`, `buildInsightModel`, `deriveRegistrationStats`, `adsTab`.
- **Currently duplicated / inconsistent (candidates to centralize):**
  1. **WA status-column resolution** defined 3 different ways: `metrics.ts::statusCol` (last, excl mekari), `ads.ts::waStatusCol` (first, excl mekari), `write.ts::waStatusColumn` (last, excl mekari). `statusCol` and `waStatusColumn` are effectively identical for wa_admin; `waStatusCol` is "first match". **Should converge to one.**
  2. **Closing definition** diverges: `closingCount` (exact "closing", pre-junk) vs `metrics.funnel/roi` (substring includes). **Centralize a single `closingCount` and alias it in funnel/roi (or document the divergence explicitly).**
  3. **WA KPI total** diverges: wa-admin uses post-junk total; overview Hero uses raw `wa.length` (via funnel). 
  4. Row normalization is single-source (read.ts) — good.

**Recommendation (SMALLEST safe refactor, NOT performed):** Extract/shared-ify the status-col resolution and the closing predicate into one pure helper used by metrics.ts, waAdmin.ts, ads.ts, write.ts; and make `funnel()`/`roi()` delegate to `statusCol` + `closingCount` so the two block surfaces cannot drift. Optionally move `src/workspaces/*.ts` + `src/server/utils/helpers.ts` + `src/server/metrics/metrics.ts` into a shared `src/digmark-core/` package both app and Tarjo import. **Do NOT re-platform the adapter** (it's fine as-is).

---

## 15. Source-of-Truth Rules

1. **Google Sheets is the source of truth. No in-app hardcoded business numbers** (except targets: ANNUAL_TARGETS, WEBSITE_TARGETS, CLOSING_TARGET=45, BIAYA_PELATIHAN=12,995,000 in constants.ts — these are configuration, VERIFIED).
2. **Normalized row object keys = exact declared column names** (schema.ts / registrationSchema.ts). Any code referencing a column must use the declared name.
3. **Column positions are never trusted from the client** — all mapping is by header name (B1 fix). `Status` in CRM lives at column 15 (index 14).
4. **The dashboard and the server-scalar paths must reproduce the same numbers** — where they currently don't (closing/leads definition), one truth must be chosen (recommend the workspace definitions).
5. **Realtime "today" logic is absent** — any "today/yesterday/overdue" Tarjo output must be built, not assumed from DigMark.

---

## 16. Known Problems / Ambiguities

1. **Closing definition doubles** (exact "closing"/pre-junk vs substring/all-rows). VERIFIED divergence between /wa-admin & Home Hero.
2. **Lead/Total Pesan** differs between dashboard (post-junk) and Hero metrics (`wa.length` raw). 
3. **`Content/PIC` NOT-DONE itemized lists are not shipped** — the brief's target SOSMED example output is not a real UI string; must be derived by Tarjo.
4. **No OVERDUE (deadline vs today)** logic exists anywhere.
5. **`Kategori` junk filter checks exact `"Kategori"`, not the suffixed live header** — so `Kategori (Persyaratan/...)` DOES NOT trigger junk filtering (only `Mekari Tag` does in practice on wa_admin). The `Kategori` check is effectively inert for the live header. **INFERRED consequence** (bug or intended).
6. **`Status` exact-match table uses `statusColumn`(prepared)** for pendingForm but closing/salesProgress/futureProspect use source rows — inconsistent row scope by design, documented in code.
7. **Registration match is visual-only**, first-match per reg row; a WA row could match multiple registrations (no dedupe of WA rows across reg rows) — the MatchMap keys by reg row ref so duplicates map the same WA row to several reg rows. Not a number, but a consistency caveat.
8. **`scripts/smoke_test.py` referenced by test comments is absent** (`scripts/` empty). The contract's parity fixtures are in `src/**/*.test.ts*` instead.
9. **Date parsing gives ISO priority over day-first** — an ISO-looking value is treated as YYYY-MM-DD even in a day-first sheet. Not expected in the master, but a sharp edge.
10. **Local-timezone dates** — no UTC handling; results depend on server/browser TZ (Asia/Jakarta for Ejak).

---

## 17. Recommended Minimal Refactor

**Do NOT perform (read-only).** Smallest safe, ordered:

1. **Add one pure helper** `resolveWaStatusCol(rows)` + `isClosingStatus(value)` exported from `src/server/utils/helpers.ts` (or `metrics.ts`), and make `metrics.funnel/roi`, `waAdmin.closingCount/closingRows`, `ads.waStatusCol`, and `write.waStatusColumn` all call it. Removes divergence (only 2 small call-sites changed; tests updated; numbers for `closingCount`/wa-admin unchanged, Hero's substring closing changes to the exact definition — that is the intended correctness fix).
2. **Unify WA KPI totals** — decide `total = post-junk` everywhere (change `overviewMetricsController` to use `waStats.total` for `metrics.leads` too, so Hero matches /wa-admin). Currently `metrics.leads = funnel(wa).leads = wa.length`. This is a behavior change to document.
3. **Optional:** relabel Home payload fields (`metrics.closing` maps to the exact closing) and add an explicit `funnel.closingDefinition: "status==closing pre-junk"` field for clarity.
4. **Shareable package (optional):** move pure logic into `src/digmark-core/` so Tarjo imports the identical functions; no behavior change.
5. **Do NOT** change adapter/writes/clear/import (all safe), no writes intended for Tarjo.

**Expected impact:** eliminates the main drift risk between the two closing/lead definitions; leaves normal wa-admin numbers unchanged (only Hero/overview scalar surfaces align), so Tarjo reproduces ONE truth.

---

## 18. Verification Checklist

Every claim above was **VERIFIED by direct code read**. Cross-checks performed:

- [x] Read all 9 workspace derivation modules (`sosmed/insight/waAdmin/crm/dm/ads/interview/website/registration.ts`).
- [x] Read all workspace dashboards + all route shells.
- [x] Read adapters: read, write, client, auth, cache, index, registration, sandbox, source, schema, registrationSchema.
- [x] Read all API controllers + all API route handlers.
- [x] Read metrics.ts + helpers.ts + all lib (auth/validation/errors/audit/csv/api-client/ui-common).
- [x] Read all tests as corroboration (`schema.test`, `read.test`, `write.test`, `registration.test`, `metadata`, `metrics.test`, `overviewControllers.test`, `syncControllers.test`, `importControllers.test`, `clearControllers.test`, and all workspace `.test.tsx`).
- [x] Confirmed no `smoke_test.py` (scripts empty).
- [x] Confirmed no OVERDUE/today logic via grep.
- [x] Confirmed no per-PIC NOT-DONE item listing via grep.
- [x] Did NOT read `.env.local` secrets; only referenced key names (MASTER_SPREADSHEET_KEY, REGISTRATION_SPREADSHEET_KEY, AUTH_*, GOOGLE_SERVICE_ACCOUNT_*).
- [x] Did NOT run builds/typechecks, execute the app, or modify any DigMark source.

**Evidence-level summary:** nearly all metric definitions = **VERIFIED** (read from functions). A small set flagged **INFERRED/UNKNOWN**: (a) the brief's exact sosmed "NOT DONE items" output string (not present as shipped), (b) the inert `Kategori` junk-check consequence (INFERRED), (c) scripts file absence rationale (UNKNOWN). No fabricated numbers.

---

*End of contract. Any metric Tarjo needs beyond this list should be derived from the pure modules named in §2/§14, not re-derived from scratch.*