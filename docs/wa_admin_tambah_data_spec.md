# WA Admin — "+ Tambah Data" (append row) Implementation Spec

Feature: add a "+ Tambah Data" action button + modal form on `/wa-admin` that
appends ONE new row to the live **WA ADMIN REPORT** tab via the EXISTING append
API. Backend append is already built — this is a UI-layer-only change. DO NOT
touch any server/adapter/schema/constant file. Reuse `columnsFor("wa_admin")`
for mapping; the payload keys MUST be the exact live/schema headers.

## Verified live facts (probed 2026-09-19)

- Tab: `WA ADMIN REPORT` in the master workbook. 2091 rows incl. header.
- Live header (14 cols) == `columnsFor("wa_admin")` exactly:
  1. `f` (auto-number; NOT a form field)
  2. `Tanggal Masuk` (date, day-first DD/MM/YYYY display; date serial in sheet)
  3. `No Hp` (text phone; rows stored as `628...` already 62-form)
  4. `Jam Chat Masuk` (TEXT, stored **dot-separated** `HH.MM`, e.g. `13.39`)
  5. `PIC`
  6. `Nama`
  7. `Asal`
  8. `Sumber (Ads/Organik/Sales)`
  9. `Pertanyaan`
  10. `Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)`
  11. `Mekari Tag`
  12. `Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)` — the header
      contains a literal `\n\n`; build the key with `"\n\n"`, never a space.
  13. `Keterangan Admin`
  14. `Database` (NOT a form field)
- Form value domains from ACTUAL live data (build dropdowns from the live `rows`
  prop, falling back to these if empty; do NOT hardcode the brief's lists):
  - PIC: `BELIA, DEA, EJAK` (also merge `PIC_LIST` fallback if none present)
  - Sumber: `ADS/ Blast, Organik, Sales Team`
  - Kategori: `Biaya, Lainnya, Loker, Partnership, Pendaftaran, Persyaratan`
  - Status: `Closing, Follow Up, Interview, Lainnya, No Response, Pending
    Registration, Sales Progress, Withdraw`
- Date format to write: `YYYY-MM-DD` ISO string via USER_ENTERED — Sheets parses
  it to the same date serial the column already holds → displays as DD/MM/YYYY.
- Time format to write: convert `HH:MM` → `HH.MM` (dot) to match the column.

## Field → column mapping (form → payload key)

| Form field            | Payload key (exact schema header)          | Type/Input              | Required |
|-----------------------|--------------------------------------------|-------------------------|----------|
| Tanggal Masuk         | `Tanggal Masuk`                            | date picker, default today, write `YYYY-MM-DD` | YES |
| No Hp                 | `No Hp`                                    | text (never type=number), normalize to 62-form via `normalizePhone` | YES |
| Jam Chat Masuk        | `Jam Chat Masuk`                           | time picker, default now, write `HH.MM` | YES |
| PIC                   | `PIC`                                      | dropdown from live data | YES |
| Nama                  | `Nama`                                     | text                    | YES |
| Asal                  | `Asal`                                     | text                    | no |
| Sumber                | `Sumber (Ads/Organik/Sales)`               | dropdown from live data | YES |
| Pertanyaan            | `Pertanyaan`                               | textarea                | no |
| Kategori              | `Kategori (Persyaratan/Biaya/Pendaftaran/Loker/dll)` | dropdown from live data | YES |
| Mekari Tag            | `Mekari Tag`                               | text                    | no |
| Status                | `Status \n\n(No Respon/Follow Up/Daftar/Interview/Closing)` | dropdown from live data | YES |
| Keterangan Admin      | `Keterangan Admin`                         | textarea                | no |

Payload sent to POST `/api/tables/wa_admin` is the object of set keys ONLY.
`buildCellRows` already projects to the declared column order, filling `f` and
`Database` with "" — do NOT include them and do NOT invent new columns.

## Validation (client-side, before submit)

- Required: Tanggal Masuk, No Hp, Jam Chat Masuk, PIC, Nama, Sumber, Kategori,
  Status. Asal/Pertanyaan/Mekari Tag/Keterangan Admin optional.
- No Hp: normalize via `normalizePhone` from `@/server/utils/helpers` (reuse —
  do NOT write new phone logic). If the normalized value is empty after
  trim (i.e. no digits), show inline error, block submit. Display the normalized
  62-form value back in the field so the operator sees the stored form.
- Show clear per-field error text + a red ring (validation state) on required blanks.
- Never allow submit with missing required fields.

## UI/UX requirements

- Button: `+ Tambah Data` (primary) in the header action bar (Band 0), beside
  the existing `🔄 Refresh Data` button. Do NOT change page/doc strings otherwise.
- Modal: reuse the existing in-dashboard modal pattern (fixed overlay + backdrop,
  Escape/backdrop close, brand surface chrome). Desktop-friendly, responsive label.
- Buttons: `Batal` (close) and `Simpan Data` (submit).
- Submit: disable `Simpan Data` while in-flight + show loading state (spinner or
  "Menyimpan…"). Prevent double submit.
- Success: close modal, reset the form, call `onRefresh()` so the new row appears
  without a full browser reload, and show success notification
  `Data berhasil ditambahkan ke WA Admin.`
- Failure: keep the form values (do NOT clear), show a clear error inline, do not
  create a duplicate row on retry (only submit once; re-enable button).
- Follow the Digmark design system tokens already in WaAdminDashboard
  (`text-ink`, `text-muted`, `bg-surface`, `border-border`, `text-danger`,
  `rounded-[16px]`, `rounded-[12px]` inputs, brand accent). No new design system.
- Do not redesign the page: only ADD the button + modal; do not alter existing
  layout, calculations, filters, filters/filering, or dashboard logic.

## Where to put it

Put the button + modal in `src/workspaces/WaAdminDashboard.tsx` (add the two
buttons in Band 0 header where Refresh already is) OR a new sibling component
`src/components/ops/WaAdminDataForm.tsx` imported by the dashboard. Keep pure
payload-build + formatting logic (time HH:MM→HH.MM, required-set + payload assembly)
in a testable pure function, e.g. `src/workspaces/waAdminForm.ts` (mirror of
waAdmin.ts style) with a matching `.test.tsx`. Reuse `columnsFor`,
`normalizePhone` from existing helpers, `Select`/`Button`/field styles from
`@/components/ui/...`. POST via `postJson` from `@/lib/api-client.

## Gates (run before done)

- `npx tsc --noEmit` → exit 0
- `npx vitest run` → all pre-existing tests stay green + new form tests pass
- `npm run build` → succeeds; /wa-admin still listed
- `npm run lint` → no NEW errors
- No production MASTER writes during dev/test: `data/audit.log.jsonl` unchanged.
- Functional smoke via a thrown-away SSR render test asserting the modal + fields
  render and the "+ Tambah Data" button is present.

## Important constraints

- NEVER modify schema.ts, constants.ts, tableControllers, write.ts, read.ts,
  source.ts, factory/auth/client. Backend append is done.
- Do NOT hardcode for the brief's option lists; derive from live `rows`.
- Keep `f` and `Database` out of the payload.
- JANGAN melanggar bahasa: UI copy stays **Indonesian** (labels as in the brief).