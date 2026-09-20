/**
 * "Upload Insight" card — place at the top of the /insight content column
 * (first section after the filter card) so importing is a primary affordance.
 *
 * Client state machine (docs/insight_upload_ui_spec.md §4):
 *   idle ──(files chosen)──▶ parsing/detecting ──▶ detected? ─▶ preview
 *                                                 └─▶ unknown → manual pick → preview
 *   preview ──(Impor ✓)──▶ importing ──▶ result(success|failure)
 *   preview ──(Batal)──▶ idle
 *   result ──(Upload lagi / close)──▶ idle
 *
 * Guardrails (§8): a single hidden <input type=file> driven by the dashed zone;
 * every network action is double-submit-guarded via `inFlight`; the card sets
 * aria-busy while any server call runs; `onRefresh` fires exactly once after a
 * successful import. UI copy is Indonesian (spec §9), idiomatic, casual register.
 *
 * Row display is a sticky, capped-height preview table showing ONLY the merged
 * batch (one row per date+platform) in the exact 8-column schema order and the
 * existing INSIGHT_METRIC_LABELS for the six metric headers.
 */
"use client";
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { formatCount } from "@/components/ui-common";
import {
  INSIGHT_METRIC_COLS,
  INSIGHT_METRIC_LABELS,
  type InsightMetric,
} from "@/workspaces/insight";
import {
  buildImportBody,
  fileToBase64,
  isErrorBody,
  postInsightImport,
  validateClientFiles,
  InsightConnectError,
  type ConfirmData,
  type InsightPayloadFile,
  type NormalizedRow,
  type PreviewData,
  type ValidationItem,
} from "@/workspaces/insightUpload";

/* -------------------------------------------------------------------------- *
 * Copy (Indonesian, idiomatic, casual register — spec §9 + copy polish)
 * ------------------------------------------------------------------------ */

const C = {
  title: "Upload Insight",
  subtitle: "Upload export data Insight (Instagram / TikTok) untuk impor ke sheet INSIGHT.",
  dropPrimary: "Drag & drop file di sini",
  dropOr: "atau",
  dropBtn: "Pilih File",
  dropHint: "Format didukung: .csv, .xlsx · Platform: Instagram / TikTok · Data dinormalisasi sebelum impor.",
  parsing: "Analisis file dan deteksi platform…",
  detected: "Platform dideteksi:",
  unknown: "Pilih manual: Instagram atau TikTok sebelum impor.",
  selectPlaceholder: "— Pilih platform —",
  selectHint: "Platform tidak dapat dideteksi otomatis. Pilih manual.",
  previewTitle: "Preview Data Normalisasi",
  blocking: "Import belum — Kolom kunci tidak dapat diidentifikasi (Tanggal atau metrik views konten).",
  importNew: "Impor hanya baru",
  importAll: "Impor semua",
  importOne: "Impor ke Insight",
  cancel: "Batal",
  importing: "Impor sedang proses…",
  successHeading: "Impor berhasil",
  uploadAgain: "Upload lagi",
  failureHeading: "Import belum — Tidak ada data yang ditulis ke spreadsheet.",
  retry: "Kanalis lagi",
  duplicatesNote: (m: number) => `Impor semua juga impor ${formatCount(m)} baris duplikasi (tidak tampil di preview).`,
};

/* Platform badge hues (parity with InsightDashboard's PLATFORM_COLORS). */
const PLATFORM_COLOR: Record<string, string> = {
  Instagram: "#E1306C",
  TikTok: "#010101",
};

/** Display columns in the exact 8-column schema order (spec §5.5.1). */
const TABLE_COLS: string[] = ["TANGGAL", "PLATFORM", ...INSIGHT_METRIC_COLS];
const NUMERIC_COLS = new Set<string>(INSIGHT_METRIC_COLS);

/* -------------------------------------------------------------------------- *
 * Component
 * ------------------------------------------------------------------------ */

type Stage = "idle" | "parsing" | "preview" | "importing" | "result";

interface StagedFile {
  id: string;
  name: string;
  size: number;
  file: File;
}

/** Client-frozen snapshot of a successful preview (what the card reviews). */
export interface PreviewState {
  platform: string | null;
  platformDetected: boolean;
  rows: NormalizedRow[]; // rows returned for display (server-capped)
  newCount: number;
  dupCount: number;
  totalRows: number;
  items: ValidationItem[];
  blockReasons: string[];
  warnings: string[];
  blocking: boolean;
}

interface SuccessState {
  kind: "success";
  data: ConfirmData;
}
interface FailureState {
  kind: "failure";
  reason: string;
}
export type ResultState = SuccessState | FailureState;

let autoId = 0;
const nextId = () => `f${++autoId}-${Date.now()}`;

export interface InsightUploadCardProps {
  onRefresh?: () => void;
  /**
   * Test-only initial-state injection (mirrors the dashboard's `initialAnalisisOpen`
   * convention). Omitted in production; pure `useState` seeds so the render spec can
   * assert each state's markup via renderToStaticMarkup without driving events/async.
   */
  initialExpanded?: boolean;
  initialPreview?: PreviewState | null;
  initialResult?: ResultState | null;
}

function headerLabel(col: string): string {
  if (col === "TANGGAL" || col === "PLATFORM") return col;
  return INSIGHT_METRIC_LABELS[col as InsightMetric];
}

function cellValue(row: NormalizedRow, col: string): string {
  if (col === "TANGGAL") return String(row.TANGGAL);
  if (col === "PLATFORM") return String(row.PLATFORM);
  const raw = (row as unknown as Record<string, unknown>)[col as InsightMetric];
  // Missing / NaN metric -> muted dash (missing-vs-zero distinction, spec §3 N/A).
  if (raw === null || raw === undefined || raw === "" || Number.isNaN(Number(raw))) {
    return "—";
  }
  return formatCount(Number(raw));
}

/** True when a numeric metric cell should render the muted missing-dash. */
function cellMissing(row: NormalizedRow, col: string): boolean {
  const raw = (row as unknown as Record<string, unknown>)[col as InsightMetric];
  return raw === null || raw === undefined || raw === "" || Number.isNaN(Number(raw));
}

function chipLabel(f: StagedFile): string {
  const kb = f.size / 1024;
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
  return `${f.name} — ${size}`;
}

export function InsightUploadCard({ onRefresh, initialExpanded, initialPreview, initialResult }: InsightUploadCardProps) {
  const [stage, setStage] = useState<Stage>(
    initialResult ? "result" : initialPreview ? "preview" : "idle",
  );
  const [collapsed, setCollapsed] = useState(!initialExpanded && !initialPreview && !initialResult);
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(initialPreview ?? null);
  const [manualPlatform, setManualPlatform] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [result, setResult] = useState<ResultState | null>(initialResult ?? null);
  const [lastMode, setLastMode] = useState<"new" | "all">("new");

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0); // F12: counter so inner-element dragLeave doesn't flicker

  /** Encode a file list into the payload { name, contentB64 } array. */
  async function encodeFiles(list: StagedFile[]): Promise<InsightPayloadFile[]> {
    return Promise.all(
      list.map(async (f) => ({ name: f.name, contentB64: await fileToBase64(f.file) })),
    );
  }

  /** Parse the preview wire payload into the card's frozen PreviewState. */
  function toPreviewState(p: PreviewData): PreviewState {
    const blocking = Array.isArray(p.validation?.blockReasons) && p.validation.blockReasons.length > 0;
    return {
      platform: p.platform,
      platformDetected: p.platformDetected,
      rows: Array.isArray(p.preview) ? p.preview : [],
      newCount: Number(p.rowCount) || 0,
      dupCount: Array.isArray(p.potentialDuplicates) ? p.potentialDuplicates.length : 0,
      totalRows: Number(p.rowCount) || 0,
      items: Array.isArray(p.validation?.items) ? p.validation.items : [],
      blockReasons: Array.isArray(p.validation?.blockReasons) ? p.validation.blockReasons : [],
      warnings: Array.isArray(p.warnings) ? p.warnings : [],
      blocking,
    };
  }

  /** One preview round-trip (confirm=false). Does NOT write anything. */
  async function runPreview(list: StagedFile[] = files, platformOverride?: string) {
    if (inFlight || list.length === 0) return;
    setInFlight(true);
    setStage("parsing");
    setResult(null);
    try {
      const payload = await encodeFiles(list);
      const { status, payload: body } = await postInsightImport(
        buildImportBody(payload, { platform: (platformOverride ?? manualPlatform) || "", confirm: false, mode: "new" }),
      );
      if (status === 200 && body && typeof body === "object" && "platformDetected" in body) {
        setPreview(toPreviewState(body as PreviewData));
        setStage("preview");
      } else if (
        status === 400 &&
        body &&
        typeof body === "object" &&
        Array.isArray((body as { blockReasons?: unknown }).blockReasons) &&
        (body as { blockReasons: unknown[] }).blockReasons.length > 0
      ) {
        // Blocking validation: show the danger banner, disable Import, no rows.
        const b = body as PreviewData & { blockReasons: string[] };
        setPreview({
          platform: b.platform,
          platformDetected: true,
          rows: [],
          newCount: 0,
          dupCount: 0,
          totalRows: 0,
          items: Array.isArray(b.validation?.items) ? b.validation.items : [],
          blockReasons: b.blockReasons,
          warnings: [],
          blocking: true,
        });
        setStage("preview");
      } else if (isErrorBody(body)) {
        setResult({ kind: "failure", reason: body.error?.message || C.failureHeading });
        setStage("result");
      } else {
        setResult({ kind: "failure", reason: C.failureHeading });
        setStage("result");
      }
    } catch (e) {
      setResult({
        kind: "failure",
        reason: e instanceof InsightConnectError ? e.message : C.failureHeading,
      });
      setStage("result");
    } finally {
      setInFlight(false);
    }
  }

  /** Confirm round-trip (confirm=true). Sends `mode`; on success refreshes once. */
  async function runImport(mode: "new" | "all") {
    if (inFlight) return;
    if (!preview?.platformDetected && manualPlatform === "") return; // gated until picked
    setInFlight(true);
    setLastMode(mode);
    setStage("importing");
    setResult(null);
    try {
      const payload = await encodeFiles(files);
      const { status, payload: body } = await postInsightImport(
        buildImportBody(payload, { platform: manualPlatform, confirm: true, mode }),
      );
      if (status === 200 && body && typeof body === "object") {
        setResult({ kind: "success", data: body as ConfirmData });
        setStage("result");
        onRefresh?.(); // exactly once, after a successful import — never per-file
      } else if (isErrorBody(body)) {
        setResult({ kind: "failure", reason: body.error?.message || C.failureHeading });
        setStage("result");
      } else if (
        body && typeof body === "object" &&
        Array.isArray((body as { blockReasons?: unknown }).blockReasons) &&
        (body as { blockReasons: unknown[] }).blockReasons.length > 0
      ) {
        setResult({ kind: "failure", reason: (body as { blockReasons: string[] }).blockReasons[0] || C.failureHeading });
        setStage("result");
      } else {
        setResult({ kind: "failure", reason: C.failureHeading });
        setStage("result");
      }
    } catch (e) {
      setResult({
        kind: "failure",
        reason: e instanceof InsightConnectError ? e.message : C.failureHeading,
      });
      setStage("result");
    } finally {
      setInFlight(false);
    }
  }

  /** Enqueue dropped/picked files (client gate) then preview the whole batch. */
  function handleFiles(list: FileList | File[] | null | undefined) {
    if (!list) return;
    const incoming: StagedFile[] = Array.from(list).map((f) => ({
      id: nextId(),
      name: f.name,
      size: f.size,
      file: f,
    }));
    const { valid: validMeta, rejected: bad } = validateClientFiles(incoming);
    if (bad.length) setRejected(bad);
    if (validMeta.length) {
      const validKeys = new Set(validMeta.map((f) => f.name));
      const validFiles = incoming.filter((f) => validKeys.has(f.name));
      const merged = [...files, ...validFiles];
      setFiles(merged);
      setRejected([]);
      void runPreview(merged);
    }
    // Reset the input so re-selecting the same file re-fires `change`.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(id: string) {
    const remaining = files.filter((f) => f.id !== id);
    setFiles(remaining);
    if (remaining.length === 0) {
      setStage("idle");
      setPreview(null);
      setManualPlatform("");
      return;
    }
    void runPreview(remaining);
  }

  function resetCard(keepExpanded = true) {
    setFiles([]);
    setRejected([]);
    setPreview(null);
    setManualPlatform("");
    setResult(null);
    setLastMode("new");
    setStage("idle");
    setCollapsed(!keepExpanded);
  }

  /** Retry re-runs confirm on the SAME preview (keeps the reviewed data). */
  function retryImport() {
    void runImport(lastMode);
  }

  const importDisabled =
    inFlight ||
    !preview ||
    preview.blocking ||
    (!preview.platformDetected && manualPlatform === "");

  /* ---------------------------------------------------------------------- */
  /* Per-state bodies                                                         */
  /* ---------------------------------------------------------------------- */

  const idleBody = (
    <div className="mt-3">
      <label
        htmlFor={fileInputId}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          // F3: keyboard-accessible drop zone (Enter/Space opens the picker).
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDragLeave={() => {
          // F12: only clear when the drag genuinely left the whole zone (counter).
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          handleFiles(e.dataTransfer?.files);
        }}
        className={`cursor-pointer block rounded-[16px] border-2 border-dashed px-6 py-10 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 ${dragging ? "border-brand bg-brand/5" : "border-border/70 bg-white/40"}`}
      >
        <span className="text-[1.6rem]" aria-hidden>📥</span>
        <p className="mt-2 text-[0.95rem] font-semibold text-ink">{C.dropPrimary}</p>
        <p className="mt-2 text-[0.85rem] text-muted">{C.dropOr}</p>
        <span className="mt-3 inline-flex items-center gap-2 rounded-[14px] bg-gradient-to-br from-brand to-brand-hover px-6 py-3 font-bold text-[0.92rem] text-white shadow-[var(--dm-shadow-cta)]">
          {C.dropBtn}
        </span>
        <p className="mt-3 text-[0.78rem] text-muted">{C.dropHint}</p>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept=".csv,.xlsx"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>
      {rejected.length ? (
        <ul className="mt-2 space-y-1" role="alert">
          {rejected.map((r) => (
            <li key={r} className="text-[0.82rem] text-danger">✕ {r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  const parsingBody = (
    <div className="mt-3 flex items-center gap-3 text-muted">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand" aria-hidden />
      <span className="text-[0.9rem]">{C.parsing}</span>
    </div>
  );

  const fileChips = (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <span
          key={f.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/80 px-3 py-1 text-[0.82rem] text-ink"
        >
          <span aria-hidden>📄</span>
          {chipLabel(f)}
          <button
            type="button"
            aria-label={`Hapus ${f.name}`}
            disabled={inFlight}
            onClick={() => removeFile(f.id)}
            className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-brand/30 text-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:opacity-50"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );

  const platformArea = preview
    ? preview.platformDetected && preview.platform
      ? (
        <p className="text-[0.9rem] text-ink">
          {C.detected}{" "}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border px-2.5 py-0.5 text-[0.82rem] font-semibold" style={{ borderColor: PLATFORM_COLOR[preview.platform] ?? "#8a8f98" }}>
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[preview.platform] ?? "#8a8f98" }} />
            {preview.platform}
          </span>
        </p>
      )
      : (
        <div className="flex flex-col gap-2">
          <p className="text-[0.85rem] text-warning">⚠ {C.unknown}</p>
          <Select
            label="Platform"
            hint={C.selectHint}
            value={manualPlatform}
            options={[
              { value: "", label: C.selectPlaceholder },
              { value: "Instagram", label: "Instagram" },
              { value: "TikTok", label: "TikTok" },
            ]}
            onSelect={(v) => {
              const prev = manualPlatform;
              setManualPlatform(v);
              if (v !== "" && v !== prev) void runPreview(files, v);
            }}
          />
        </div>
      )
    : null;

  const previewBody = preview ? (
    <div className="mt-3 space-y-4">
      {/* Staged files + platform status row */}
      <div className="flex flex-col gap-2">
        {fileChips}
        {platformArea}
      </div>

      {/* Blocking banner FIRST (nothing else matters when it blocks) */}
      {preview.blocking ? (
        <div role="alert" className="rounded-[12px] border border-danger/30 bg-danger/10 p-3 text-[0.88rem] text-ink">
          <p className="font-bold text-danger">✕ {C.blocking}</p>
          <ul className="mt-1 space-y-1 text-[0.82rem] text-muted">
            {preview.blockReasons.map((r) => <li key={r}>• {r}</li>)}
          </ul>
        </div>
      ) : null}

      {/* Validation checklist */}
      {preview.items.length ? (
        <div className="rounded-[12px] border border-border bg-white/60 p-3">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {preview.items.map((it) => (
              <li key={it.key} className={`text-[0.82rem] ${it.level === "ok" ? "text-success" : it.level === "warn" ? "text-warning" : "text-danger"}`}>
                {it.level === "ok" ? "✓ " : "⚠ "}{it.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Preview table */}
      {preview.rows.length ? (
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-[0.95rem] font-extrabold text-ink">{C.previewTitle}</h3>
            <span className="text-[0.82rem] text-muted">
              {formatCount(Math.min(preview.rows.length, preview.newCount))} baris untuk impor
            </span>
          </div>
          {/* F1: cap note on served-vs-total (real served count, not hardcoded). */}
          {preview.rows.length < preview.totalRows ? (
            <p className="mt-1 text-[0.78rem] text-muted">
              - Menampilkan {formatCount(preview.rows.length)} baris pertama dari {formatCount(preview.totalRows)}.
            </p>
          ) : null}
          {/* F6: add overflow-x-auto so the min-w-[820px] table never clips on narrow shells. */}
          <div className="mt-1 max-h-[320px] overflow-x-auto overflow-y-auto rounded-[16px] border border-border bg-surface">
            <table className="min-w-[820px] border-collapse text-left">
              <thead className="sticky top-0 z-10 border-b border-divider bg-white/90">
                <tr>
                  {TABLE_COLS.map((c) => (
                    <th key={c} className="px-3 py-2 text-[0.74rem] font-semibold uppercase tracking-[0.02em] text-muted">
                      {headerLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={`${r.TANGGAL}-${r.PLATFORM}-${i}`} className={i % 2 === 0 ? "bg-white/60" : "bg-white/80"}>
                    {TABLE_COLS.map((c) => (
                      <td key={c} className={`px-3 py-2 text-[0.82rem] text-ink ${NUMERIC_COLS.has(c) ? "text-right tabular-nums" : ""} ${NUMERIC_COLS.has(c) && cellMissing(r, c) ? "text-muted" : ""}`}>
                        {cellValue(r, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Duplicates choice + primary action band */}
      <div className="rounded-[12px] border border-border bg-white/60 p-3">
        <p className="text-[0.92rem] font-semibold text-ink">
          Baris baru: <span className={preview.newCount > 0 ? "text-success" : "text-muted"}>{formatCount(preview.newCount)}</span>
          {" · "}Duplikasi potensial: <span className={preview.dupCount > 0 ? "text-warning" : "text-muted"}>{formatCount(preview.dupCount)}</span>
        </p>
        <p className="mt-1 text-[0.78rem] text-muted">
          Duplikasi identifikasi berdasarkan tanggal + platform (baris yang sudah ada di sheet INSIGHT).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {preview.dupCount > 0 ? (
            <>
              <Button variant="primary" disabled={importDisabled} onClick={() => void runImport("new")}>
                {C.importNew}
              </Button>
              <Button variant="secondary" disabled={importDisabled} onClick={() => void runImport("all")}>
                {C.importAll}
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={importDisabled} onClick={() => void runImport("new")}>
              {C.importOne}
            </Button>
          )}
          <Button variant="ghost" disabled={inFlight} onClick={() => resetCard(true)}>
            {C.cancel}
          </Button>
        </div>
        {preview.dupCount > 0 ? (
          <p className="mt-2 text-[0.78rem] text-muted">{C.duplicatesNote(preview.dupCount)}</p>
        ) : null}
        {!preview.platformDetected && manualPlatform === "" ? (
          <p className="mt-1 text-[0.78rem] text-muted">
            Import diaktivan setelah platform dipilih.
          </p>
        ) : null}
      </div>
    </div>
  ) : null;

  const importingBody = (
    <div className="mt-3 flex items-center gap-3">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand" aria-hidden />
      <span className="text-[1rem] font-semibold text-ink">{C.importing}</span>
    </div>
  );

  const resultBody = result ? (
    <div className={`mt-3 rounded-[12px] p-3 ${result.kind === "success" ? "border border-success/30 bg-success/10" : "border border-danger/30 bg-danger/10"}`}>
      {result.kind === "success" ? (
        <>
          <p className="text-[1rem] font-bold text-success">✓ {C.successHeading}</p>
          <p className="mt-1 text-[0.84rem] text-ink">
            {successSummary(result.data, files)}
          </p>
          {result.data.warnings && result.data.warnings.length ? (
            <ul className="mt-1 space-y-1 text-[0.8rem] text-muted">
              {result.data.warnings.map((w) => <li key={w}>• {w}</li>)}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => resetCard(true)}>{C.uploadAgain}</Button>
            <Button variant="ghost" onClick={() => resetCard(true)}>{C.cancel}</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[1rem] font-bold text-danger">✕ {C.failureHeading}</p>
          <p className="mt-1 text-[0.9rem] text-ink">Alasan: {result.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={retryImport}>{C.retry}</Button>
            <Button variant="ghost" onClick={() => resetCard(true)}>{C.cancel}</Button>
          </div>
        </>
      )}
    </div>
  ) : null;

  /* ---------------------------------------------------------------------- */

  const cardBody: ReactNode =
    stage === "preview" ? previewBody
    : stage === "importing" ? importingBody
    : stage === "result" ? resultBody
    : stage === "parsing" ? parsingBody
    : idleBody;

  return (
    <section
      aria-label={C.title}
      aria-busy={inFlight}
      className="mb-6 mt-6 rounded-[16px] border border-border bg-surface p-5 shadow-[var(--dm-shadow-xs)] backdrop-blur-[8px]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.05rem] font-extrabold text-ink">{C.title}</h2>
          <p className="mt-0.5 text-[0.8rem] text-muted">{C.subtitle}</p>
        </div>
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted hover:bg-white/70 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
          aria-label={collapsed ? "Expandir Upload Insight" : "Kolaps Upload Insight"}
        >
          <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
        </button>
      </div>
      {!collapsed ? cardBody : null}
    </section>
  );
}

/** Human-readable success summary line (spec §5.7). */
function successSummary(d: ConfirmData, staged: StagedFile[]): string {
  const fileNames = staged.map((f) => f.name).join(", ") || "—";
  const warnings = Number(d.warnings?.length) || 0;
  const platform = d.platform || "—";
  return (
    `Platform: ${platform} · File: ${fileNames} · Baris proses: ${Number(d.rowsProcessed) || 0}` +
    ` · Baris impor: ${Number(d.rowsImported) || 0} · Duplikasi dilewati: ${Number(d.duplicatesSkipped) || 0}` +
    ` · Warning: ${warnings}`
  );
}