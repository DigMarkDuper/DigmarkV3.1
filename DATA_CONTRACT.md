# DIGMARK V3.1 — DATA CONTRACT

**Status:** Verified **read-only** against the live master via gspread workbook metadata (2026-09-15). No spreadsheet values were modified; all tab titles and column headers below were fetched from the live workbook.

**CORE PRINCIPLE (confirmed):**
> **Google Sheets = the single SOURCE OF TRUTH — with READ + WRITE access.** The app does not just read; it edits cells, appends rows, and clears tabs. V3.1 must preserve write-back parity, not treat Sheets as read-only-only.
> Adapter target: `Google Sheets → Data Adapter → Normalized Data → Dashboard` so a future swap to PostgreSQL does not touch the frontend.

---

## 1. Master spreadsheet

- **Open by key** (`services/sheets.py:40 open_master`) using a Google service account.
- **Scope:** `spreadsheets` only (least privilege; no Drive scope). **Verified good.**
- **10 tabs (live titles, confirmed via workbook metadata).** `config/settings.py → SHEETS` maps app key → exact tab title:

| App key | Live tab title | Direction | Page(s) |
|---|---|---|---|
| `sosmed` | `SOSMED` | R + W (cell editor) | Overview, Sosmed |
| `website` | `WEBSITE` | R | Overview, Website |
| `insight` | `INSIGHT` | R (currently **unused** — see notes) | Overview (unwired) |
| `wa_admin` | `WA ADMIN REPORT` | R | Overview, WA Admin |
| `crm` | `DATABASE NOMOR` | R + W (sync append, import append) | CRM |
| `dm_sosmed` | `SOSMED ADMIN REPORT` | R + W (append) | DM Sosmed |
| `ads_tiktok` | `REPORT ADS TIKTOK` | R + W (append/clear) | Ads |
| `ads_meta` | `REPORT ADS META` | R + W (append/clear) | Ads |
| `mekari` | `REPORT MEKARI` | R + W (append/clear) | Ads |
| `interview` | `SCHEDULE INTERVIEW` | R | Interview |

> ⚠️ **Doc-drift note (non-blocking):** `docs/SPREADSHEET_SCHEMA.md` lists different titles (`Sosmed Tracker`, `Website`, `WA Admin Report`, `Database Nomor`). The **code and live master agree** (`SOSMED`, …). The doc is stale and should be refreshed to the verified titles above.

---

## 2. Tab schemas (verified live headers)

### `SOSMED` — 16 cols · R+W
`Kode Konten` · `Tanggal Deadline` · `Tanggal Posting` · `Output` · `Konten Pillar` · `Platform` · `PIC` · `Judul Konten` · `Materi Konten` · `  CAPTION ` · `LINK COVER` · `PROSES` · `LINK KONTEN JADI` · `IG` · `TIKTOK` · `YT`
- Date filter base: **`Tanggal Posting`** (month label). Fallbacks: `Tanggal Deadline`, `Deadline`.
- Editor-write columns: `Output`, `PIC`, `PROSES`, `IG`(bool), `YT`(bool), `TIKTOK`(bool).
- `PROSES` domain: `DONE` / `PENDING` / `ON PROGRESS`.

### `WEBSITE` — 14 cols · R
`Kode Konten` · `Deadline` · `Tanggal Posting` · `Content Pillar` · `SEO Rekomendasi` · `Judul` · `Status Check` · `Bahan Upload` · `LinkFolder Design` · `Designer` · `Status Writting` · `Status Design` · `Status Post` · `Link Live`
- `Content Pillar` ∈ {`Article`, `News`, `Gallery`, …}.
- `Status Post` "done" via `DONE_KEYWORDS = DONE|TRUE|V|1|YES|POSTED|SELESAI|UPLOAD|UPLOADED|SUDAH UPLOAD|CHECKED` (config).

### `INSIGHT` — 8 cols · R (unwired)
`TANGGAL` · `PLATFORM` · `VIEW` · `REACH` · `CONTENT INTERACTION` · `PROFILE VISIT` · `LINK CLICKS` · `FOLLOWER`
- Case-insensitive mapping intent: `VIEW→View`, `REACH→Reach`, `LINK CLICKS→Link Clicks`, `CONTENT INTERACTION→Engagement` (feeds `ANNUAL_TARGETS`).
- **No page currently calls `load_insight`** → dead scaffold; include in contract (targets) but mark **unused pending decision**.

### `WA ADMIN REPORT` — 14 cols · R
`f` · `Tanggal Masuk` · `No Hp` · `Jam Chat Masuk` · `PIC` · `Nama` · `Asal` · `Sumber (Ads/Organik/Sales)` · `Pertanyaan` · `Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)` · `Mekari Tag` · `Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)` · `Keterangan Admin` · `Database`
- Headers multi-word; app locates by fuzzy keyword (`Sumber`, `Kategori`, `Status` excluding `mekari`).
- `No Hp` frequently empty → sync may report "no new prospects".

### `DATABASE NOMOR` (CRM) — 26-col dimension, **17 effective data columns** · R+W
`No` · `No Hp` · `Nama` · `Domisili` · `Tanggal Lahir` · `Usia` · `Kategori` · `Keterangan Setelah Isi Form` · `Tanggal Masuk Database` · `Mekari Tag (Status Terakhir)` · `Treatment 1` · `Treatment 2` · `Tanggal Treatment 1` · `Tanggal Treatment 2` · **`Status`** · `Updated Status After Treatment` · `Catatan` · (cols 18+ empty)
- **🔴 Known issue (from audit B1):** `services/writers.py::_build_crm_rows` writes the WA `Status` at **column 18** (0-based idx 17), but live `Status` is at **column 15**. Confirm on a synced row; correct the offset in the adaptor.

### `SOSMED ADMIN REPORT` (DM) — 9 cols · R+W (append)
`No` · `Platform` · `Nama / Username` · `Link Username` · `No HP/ Whatsapp` · `Domisili` · `Status` · `Tag Prospek` · `Tanggal Masuk`
- Input form appends a 9-cell row mapping 1:1; `No` = `len(df)+1`; phone prefixed with `'`.

### `REPORT ADS TIKTOK` — 15 cols · R+W (append/clear)
`Campaign name` · `Primary status` · `Date Created` · `Cost` · `CPM` · `CPC (destination)` · `Clicks (destination)` · `CTR (destination)` · `Video views at 25%` · `…50%` · `…75%` · `…100%` · `Average play time per video view` · `Clicks (all)` · `Currency`
- Spend from column whose name contains `cost`/`spent`/`spend`.

### `REPORT ADS META` — 11 cols · R+W (append/clear)
`Reporting starts` · `Reporting ends` · `Campaign name` · `Account name` · `Amount spent (IDR)` · `Link clicks` · `Results` · `Result indicator` · `Cost per results` · `CTR (link click-through rate)` · `CPM (cost per 1,000 impressions) (IDR)`
- Spend from column containing `spent`.

### `REPORT MEKARI` — 5 cols · R+W (append/clear)
`Tanggal Input` · `Periode` · `Jenis Laporan` · `Total Interaksi` · `Total Biaya (Rp)`
- Cost matched via `biaya`/`cost` keyword.

### `SCHEDULE INTERVIEW` — 11 cols · R
`Tanggal` · `Nama Calon Siswa` · `Nomor Whatsapp` · `Pilihan Program` · `PIC Interview` · `Status Follow-Up` · `Tanggal Interview` · `Waktu Interview` · `Tipe Interview` · `Hasil Interview` · `Catatan PIC`
- `Status Follow-Up` ∈ {`No Respon`, `Reschedule`, `Follow Up`, `Done`, …}.
- `Hasil Interview` ∈ {`Lulus`, `Tidak Lulus`, `Gagal`, `Diterima`, …}; "Lolos" KPI = contains `lulus|diterima` AND NOT `tidak`.

---

## 3. Normalization rules (must live in the data adapter)

| Rule | Source | Behavior |
|---|---|---|
| `normalize_phone` | `utils/helpers.py:10` | → `62…` international; strip non-digits; `0`→`62`, `8`→`62`+digits; "" on invalid |
| `clean_idr` | `utils/helpers.py:31` | IDR string → float (`Rp 1.000.000,00` → `1000000.0`) |
| `to_datetime` | `utils/helpers.py:59` | day-first `DD/MM/YYYY`, coerce errors |
| `sanitize_mixed` | `utils/helpers.py:64` | mixed-dtype object cols → str (Arrow/display-safe) |
| `_to_cells` | `services/writers.py:24` | ints/floats/bools kept, else `str()` |
| `append_rows` write mode | `services/writers.py:39` | `value_input_option="USER_ENTERED"` (preserves formulas/formatting) |

---

## 4. Business constants (single source → V3.1 config)

- `BIAYA_PELATIHAN = 12_995_000` (Rp, per closing) — drives omzet/ROI.
- `CLOSING_TARGET = 45` (WA Admin "Closing / Target").
- `ANNUAL_TARGETS` (View 10M / Reach 2.4M / Link Click 24k / Engagement 40k) — **unwired**.
- `WEBSITE_TARGETS` (Artikel 72 / Berita 36 / Album Galeri 60 / Linkedin 72) — **unwired**.
- `JUNK_TAGS` = not eligible | partnership | alumni | closed - not interested | closed - registered | double chat (funnel/sync exclusion).
- `DONE_KEYWORDS` (see WEBSITE above).
- `PIC_LIST = [Ejak, Hana, Abi, Angel]`.
- `COLORS` brand palette (blue `#0058A3`, yellow `#FFDB00`, …).

---

## 5. Relationships / derived metrics (implement once in adapter, consistent everywhere)

- **Closing funnel** (`metrics.funnel`): leads = row count; closing = rows whose `<status>` contains `"Closing"`; conversion = closing/leads.
- **Monthly snapshot** (`metrics.monthly_snapshot`): filter by `Tanggal Masuk` current month; omzet = closing × `BIAYA_PELATIHAN`.
- **ROI** (`metrics.roi`): spend = Σ cost col (TikTok `Cost` + Meta `Amount spent (IDR)` + Mekari `Total Biaya (Rp)`); leads/closing from WA; `cac = spend/closing`; `roas = omzet/spend`.
- **Pending counts** (`pending_counts`) — **unwired**, defined for SOSMED+WEBSITE.
- **WA→CRM sync** (`writers.sync_wa_to_crm`): filter junk on `Mekari Tag`/`Kategori` → dedupe by normalized `No Hp` against existing CRM phones → append mapped CRM row. **Involves B1 offset bug.**
- **Ads source attribution** (pages/7): TikTok spend leads counted where `Sumber` contains `Tiktok`; Meta where matches `Instagram|Facebook|IG|FB`.

---

## 6. Adapter layer design (the deliverable contract)

```
                 ┌─────────────────────────────────────────────┐
 Google Sheets ──▶│  Data Adapter (Next.js server-side layer)   │
 (source of truth)│  - auth & workbook bootstrap (title→id map) │
                  │  - schema map: app-key → {tab, col schema}  │
                  │  - fetch + normalize to typed DTOs          │
                  │  - write ops: append / updateCell / clear / │
                  │    sync (with offset fixes + audit guarded) │
                  │  - caching + invalidation                    │
                  │  - HTTP API (REST or tRPC)                   │
                  └─────────────────────────────────────────────┘
                                              │  Normalized Data (typed DTOs)
                                              ▼
                                        Dashboard (Next.js UI)
```

**Swap-to-PostgreSQL rule:** the UI and use-cases may only consume **normalized DTOs + use-case functions**. The adapter is the *only* place that knows "Sheets" (column names, gspread calls). To switch to Postgres: implement a `PostgresSource` behind the same interface; schema map + rules unchanged.

**Interface sketch (target):**
```ts
interface SheetSource {
  fetchTable(key: string): Promise<Row[]>
  appendRows(key: string, rows: Cell[][]): Promise<Result>
  updateCell(key: string, rowIndex: number, column: string, value: unknown): Promise<Result>
  clearTable(key: string, confirm: ConfirmInfo): Promise<Result>   // server-guarded
  listTabs(): Promise<TabMeta[]>                                    // bootstrap + drift check
}
```

---

## 7. BLOCKERS / ASSUMPTIONS (data)

- **B1 (from audit):** CRM sync Status column offset — verify on a real synced row, fix in adapter.
- **A1:** Sheets remains **writable** source of truth for V3.1 (permission `Editor`, scope `spreadsheets`).
- **A2:** No formula cells are written by the app (all writes are plain values via `USER_ENTERED`) — confirmed from `_to_cells`; preserve this (never overwrite formulas the sheet owner relies on).
- **A3:** `DATABASE NOMOR` has trailing empty columns (dimension 26, effective 17) — adapter must append by **column header**, not fixed A–R offsets, to avoid B1-class drift.
- **A4:** Tab titles are treated as stable; adapter bootstrap should snapshot `title → gid` and fail loudly (or warn) on drift rather than silently return empty.