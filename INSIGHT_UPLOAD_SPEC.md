# FEATURE: Insight File Upload & Integration

## Digmark V3.1 — `/insight`

(Full original brief from Ejak. UI copy for the feature is Indonesian.)

### Context
Digmark V3.1 `/insight` uses Insight data from Google Sheets. Add an **Insight File Upload** feature so Ejak can upload exported Insight files from **Instagram or TikTok**. The system must: read the file → detect Instagram/TikTok → map source columns to a standardized schema → normalize → apply platform-specific calculations → preview transformed data → import into the existing Insight Google Sheet.

### UI — `/insight` (new card: **Upload Insight**)
- Upload File button / drag-and-drop zone. Supported: `.csv`, `.xlsx`.
- Display uploaded filename(s).
- Display detected platform (Instagram / TikTok / Unknown-Unsupported).
- If not confidently detected → instruct manual selection (Instagram/TikTok). Do NOT import unsupported or incorrectly mapped files.
- Display preview of the normalized data (standardized schema, not original layout).
- Display number of rows to import.
- `Import to Insight` button + `Cancel` button.
- File must NOT be written to Sheets immediately after upload.

Flow: Upload → Detect Platform → Parse File → Map Columns → Transform → Validate → Preview → Import to Google Sheets.

### Standard Insight Schema (exact, matches the INSIGHT tab)
| TANGGAL | PLATFORM | VIEW | REACH | CONTENT INTERACTION | PROFILE VISIT | LINK CLICKS | FOLLOWER |
TANGGAL normalized to the sheet's date format. PLATFORM = `Instagram` | `TikTok`. Optional metrics (REACH, PROFILE VISIT, LINK CLICKS, FOLLOWER) map when available, blank/null otherwise; never invent. VIEW maps the views/video-views metric; do not combine unrelated metrics. CONTENT INTERACTION: Instagram = total/content interaction metric; TikTok = Likes + Comments + SHARES (computed).

### TikTok CONTENT INTERACTION = Likes + Comments + Shares
Do not rely on a CONTENT INTERACTION column existing in the TikTok export; identify Likes/Comments/Shares and compute it.

### Flexible column mapping
Headers normalized (case-insensitive, whitespace-collapsed) before mapping. e.g. `Views|Video Views|Video views|Total Views` → VIEW; `Likes|Like|Total Likes` → LIKES; `Comments|Comment` → COMMENTS; `Shares|Share` → SHARES. Extensible for future export formats.

### Validation summary (before import)
Show ✓/⚠ per item: Platform detected, Date detected, Views detected, Likes/Comments/Shares detected, REACH available?, LINK CLICKS available?. Missing optional metrics must NOT block; block if critical fields (TANGGAL or the primary metric) can't be identified.

### Normalized preview
Display final standardized schema. User reviews before importing.

### Google Sheets integration
Write into the existing Insight worksheet when "Import to Insight" clicked. Do NOT create a new spreadsheet. Reuse the existing connection/auth/config/Insight worksheet/client. Append (never overwrite/delete existing data).

### Duplicate detection
At minimum consider TANGGAL+PLATFORM; inspect the existing data structure first (VERIFIED live: sheet is one row per date+platform → key = TANGGAL+PLATFORM). Before import show `New rows: N` and `Potential duplicates: M`; allow Import new only / Import all / Cancel. Never delete existing data automatically.

### Import result summary
Success: Platform, File, Rows processed, Rows imported, Duplicates skipped, Warnings. Failure: "Import Failed — No data was written to the spreadsheet. Reason: ...". Transaction-like: validate everything first, then write; never partially import on validation failure.

### Data type normalization
Numeric metrics stored as real numbers, not strings (`"10,000"→10000`, `"10.000"→10000`, `"1.2K"→1200`). Locale-aware. Dates normalized consistently.

### Error handling (user-friendly, NO raw tracebacks)
Empty/corrupted/unsupported file, unknown platform, missing/unknown headers, invalid dates, invalid numerics, missing optional metrics, duplicates, Google Sheets/API errors, permission, network/timeout.

### Architecture (separate from the /insight UI)
File Upload → File Parser → Platform Detector → Column Mapper → Data Transformer → Validator → Preview → Spreadsheet Writer. Named classes: InstagramInsightParser, TikTokInsightParser, InsightNormalizer, InsightValidator, InsightSpreadsheetService. Extensible for more platforms.

### Protect existing Digmark V3.1
Inspect existing architecture (DONE — see .planning findings), reuse services, don't duplicate connections, don't modify existing functionality, keep existing /insight working. Audit before coding.

### Acceptance Criteria (all must pass)
Upload CSV/XLSX; auto-detect IG/TT; manual platform pick; auto map columns; transform to standardized schema; TT content interaction = L+C+S; missing optional metrics don't block; required fields validated; preview before import; duplicate detection; write only after confirm; don't overwrite/delete; append to existing worksheet; existing /insight works; human-readable errors; no raw tracebacks; parser/mapper/validator/writer separated from UI; extensible for future platforms.

---
## EVA audit + engineering decisions (authoritative, added during build)
- INSIGHT tab schema (src/server/adapter/schema.ts) already EXACTLY equals the standardized schema above.
- TANGGAL storage format = `D/M/YYYY` day-first, non-padded (live verified).
- FOLLOWER = daily net-new-followers DELTA (live verified; negative allowed). TikTok → `Difference in followers from previous day` column; Instagram → `Facebook follows` file.
- Absent metrics stored as `0` (matches all 456 existing rows; existing analytics treat 0 as unavailable).
- Platform values written verbatim: `Instagram` / `TikTok`.
- Dedupe key = (normalized TANGGAL, PLATFORM).
- Backend layers in new `src/insight-import/`; new route `POST /api/insight/import` (editor) with `{ files:[{name,contentB64}], platform?, confirm }`; confirm=false → preview+counts (no write), confirm=true → same pipeline then append via getMasterSource() + audit-log. Reuse getMasterSource/requireRole/toErrorResponse/audit.record/toDatetime/normalizedPlatform. Extend src/lib/csv.ts with encoding-aware decoding (UTF-8/UTF-16, `sep=,` preamble, skip-title-line). No writes to MASTER during dev/tests (sandbox only).