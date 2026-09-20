/**
 * DataTable — normalized-rows table (UI_DESIGN_SPEC.md §C.10), consumes the
 * `rows` from GET /api/tables/[key].
 *
 * Sticky header, zebra rows, `overflow-x-auto` on the wrapper ONLY (so tables
 * h-scroll inside their own card — never the page). Columns derive from the
 * union of keys in the first row unless an explicit schema order is provided;
 * numeric columns are right-aligned. Loading/empty/error states are handled
 * in place (skeleton / EmptyState row / ErrorState).
 */
import { EmptyState } from "@/components/sections/EmptyState";
import { ErrorState } from "@/components/sections/ErrorState";
import { LoadingState } from "@/components/sections/LoadingState";
import type { Row } from "@/server/adapter/source";
import type { ApiFailure } from "@/components/sections/ErrorState";

export interface DataTableProps {
  rows: Row[];
  /** Explicit ordered columns (schema order). Appended keys land last. */
  columns?: string[];
  loading?: boolean;
  error?: ApiFailure | null;
  onRetry?: () => void;
  /** Max body height before the sticky header scrolls (default 480px). */
  maxHeightClass?: string;
  emptyTitle?: string;
  emptyHint?: string;
  /**
   * Optional category accent (hex color). When set, the wrapper gets a 4px
   * left border in that color and the sticky header underline is tinted with
   * it, so a set of tables reads as one system differing only by accent. All
   * other table styling (header/typography/row-height/padding) stays shared.
   */
  accentColor?: string;
}

/**
 * Column order = union of keys in the first row, in appearance order.
 * Keys starting with "__" are METADATA (e.g. `__rowIndex`) and are excluded so
 * they never render as a visible column in any workspace. Strictly
 * backward-compatible — no real declared column starts with "__".
 */
export function deriveColumns(rows: Row[]): string[] {
  if (!rows || rows.length === 0) return [];
  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (k.startsWith("__")) continue;
      if (!keys.has(k)) keys.add(k);
    }
    if (keys.size > 0) break;
  }
  return [...keys];
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

export function DataTable({
  rows,
  columns,
  loading = false,
  error = null,
  onRetry,
  maxHeightClass = "max-h-[480px]",
  emptyTitle = "Belum ada data.",
  emptyHint = "Check kembali atau import data untuk module ini.",
  accentColor,
}: DataTableProps) {
  // Error state replaces the whole table, same wrapper sizing.
  if (error) {
    return (
      <div className="overflow-x-auto rounded-[16px] border border-border bg-surface p-2 backdrop-blur-[8px]">
        <ErrorState failure={error} onRetry={onRetry} />
      </div>
    );
  }

  const cols = columns && columns.length ? columns : deriveColumns(rows);
  const isEmpty = !loading && rows.length === 0;

  const accentStyle = accentColor
    ? { borderLeftWidth: 4, borderLeftColor: accentColor, borderTop: 0 }
    : undefined;

  return (
    <div
      className="overflow-x-auto rounded-[16px] border border-border bg-surface backdrop-blur-[8px] shadow-[var(--dm-shadow)]"
      style={accentStyle}
    >
      <div className={`px-8 ${maxHeightClass} overflow-y-auto`}>
        {loading ? (
          <LoadingState variant="table" />
        ) : isEmpty ? (
          <table className="w-full border-collapse text-left">
            <tbody>
              <tr>
                <td>
                  <EmptyState title={emptyTitle} hint={emptyHint} />
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead
              className="sticky top-0 z-10 border-b border-divider bg-white/90 backdrop-blur-[8px]"
              style={accentColor ? { borderBottomColor: accentColor } : undefined}
            >
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-3 py-2 text-left text-[0.8rem] font-semibold uppercase tracking-[0.02em] text-muted">
                    {cellText(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white/70" : "bg-white/85"}>
                  {cols.map((c) => {
                    const v = row[c];
                    const numeric = typeof v === "number";
                    return (
                      <td
                        key={c}
                        className={`border-b border-divider px-3 py-2 text-sm text-ink ${numeric ? "text-right" : "text-left"}`}
                      >
                        {cellText(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}