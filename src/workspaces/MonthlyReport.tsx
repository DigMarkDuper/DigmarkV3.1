/**
 * MonthlyReport — print-optimized render of the Monthly WA Admin Report dataset
 * (built by `buildMonthlyReport`). Sections A..E all come from the SAME period,
 * so the tables/chart/insights agree. No I/O, no state — pure presentation.
 */
import { ChartContainer } from "@/components/charts/ChartContainer";
import { PALETTE, formatCount, formatPercent } from "@/components/ui-common";
import type {
  CountPctItem,
  MonthlyReport,
} from "@/workspaces/waAdminReport";

function SectionTitle({ code, title }: { code: string; title: string }) {
  return (
    <div className="border-b border-divider pb-1.5">
      <p className="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-brand">{code}</p>
      <h4 className="text-[0.98rem] font-extrabold tracking-[-0.01em] text-ink">{title}</h4>
    </div>
  );
}

function PctBar({ pct }: { pct: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-[64px] overflow-hidden rounded-full" style={{ backgroundColor: PALETTE.grid }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: PALETTE.brand }} />
      </span>
      <span className="w-11 text-right text-[0.78rem] font-extrabold text-ink">{formatPercent(pct / 100, true)}</span>
    </span>
  );
}

function BreakdownTable({ rows }: { rows: CountPctItem[] }) {
  if (!rows.length) {
    return <p className="text-[0.82rem] text-muted">Tidak ada data.</p>;
  }
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <table className="w-full border-collapse text-[0.82rem]">
      <thead>
        <tr className="border-b border-divider text-left text-[0.68rem] uppercase tracking-[0.04em] text-muted">
          <th className="py-1.5 pr-3 font-bold">Kategori</th>
          <th className="py-1.5 pr-3 text-right font-bold">Jumlah</th>
          <th className="py-1.5 text-right font-bold">%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-divider/60">
            <td className="py-1.5 pr-3 font-semibold text-ink">{r.name}</td>
            <td className="py-1.5 pr-3 text-right font-bold text-ink">{formatCount(r.count)}</td>
            <td className="py-1.5 text-right">
              <span className="inline-flex items-center justify-end gap-2">
                <PctBar pct={total ? (r.count / total) * 100 : 0} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function pendingFollowUp(report: MonthlyReport) {
  return report.insights.pending + report.insights.followUp;
}

/** Horizontal bar chart for section D — Grafik Asal Chat. */
function AsalChart({ rows }: { rows: CountPctItem[] }) {
  const W = 520;
  const n = rows.length || 1;
  const rowH = 40;
  const H = 46 + n * rowH;
  const max = Math.max(1, ...rows.map((r) => r.count));
  const band = W - 132;
  return (
    <ChartContainer data={rows} heightClass="h-max" label="Grafik Asal Chat (Sumber)">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart: asal chat berdasarkan Sumber" className="h-auto w-full">
        <g fontSize="11" fill={PALETTE.muted}>
          <rect x={0} y={14} width={10} height={10} rx={2} fill={PALETTE.brand} />
          <text x={14} y={22}>Jumlah chat</text>
        </g>
        {rows.map((r, i) => {
          const y = 40 + i * rowH;
          const w = (r.count / max) * band;
          return (
            <g key={r.name}>
              <text x={6} y={y + 9} fontSize={12} fontWeight={700} fill={PALETTE.muted}>{r.name}</text>
              <rect x={132} y={y} width={w} height={16} rx={4} fill={PALETTE.catBlue} opacity={0.85} />
              <text x={132 + w + 6} y={y + 12} fontSize={12} fontWeight={800} fill={PALETTE.ink}>
                {formatCount(r.count)}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartContainer>
  );
}

/** E — insight facts on one line-friendly grid. */
function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-border bg-white/70 px-3 py-2">
      <p className="text-[0.66rem] font-bold uppercase tracking-[0.04em] text-muted">{label}</p>
      <p className="mt-0.5 text-[1.05rem] font-extrabold text-ink">{value}</p>
    </div>
  );
}

export function WaMonthlyReport({ report }: { report: MonthlyReport }) {
  const { period, chatMasuk, closing, pendaftar, asalChat, insights } = report;
  return (
    <section aria-label="Laporan Bulanan WhatsApp Admin" className="rounded-[20px] border border-border bg-surface p-5 shadow-[var(--dm-shadow)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-divider pb-3">
        <div>
          <p className="text-[0.74rem] font-bold uppercase tracking-[0.14em] text-brand">Laporan Bulanan</p>
          <h3 className="mt-1 text-[1.3rem] font-extrabold tracking-[-0.01em] text-ink">WhatsApp Admin</h3>
        </div>
        <div className="text-right text-[0.8rem] font-semibold text-muted">
          <div>Periode: <span className="text-ink">{period.label}</span></div>
        </div>
      </div>

      {/* A — Chat Masuk */}
      <SectionTitle code="A · Chat Masuk" title={`Total chat: ${formatCount(chatMasuk.total)}`} />
      <div className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2">
        <BreakdownTable rows={chatMasuk.byMekariTag} />
        <div>
          <p className="mb-1.5 text-[0.8rem] font-bold text-ink">Rincian per Mekari Tag</p>
          <BreakdownTable rows={chatMasuk.byMekariTag} />
        </div>
      </div>

      <div className="my-5 border-t border-divider" />

      {/* B — Closing */}
      <SectionTitle code="B · Closing" title={`Total closing: ${formatCount(closing.total)}`} />
      <div className="mt-2">
        <p className="mb-1.5 text-[0.8rem] font-bold text-ink">Breakdown per status</p>
        <BreakdownTable rows={closing.byStatus} />
      </div>

      <div className="my-5 border-t border-divider" />

      {/* C — Pendaftar */}
      <SectionTitle code="C · Pendaftar / Pengisi Data" title={`Total pendaftar: ${formatCount(pendaftar.total)}`} />
      {pendaftar.rows.length === 0 ? (
        <p className="mt-2 text-[0.82rem] text-muted">Tidak ada pendaftar pada periode ini.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-[12px] border border-divider">
          <table className="w-full border-collapse text-[0.8rem]">
            <thead>
              <tr className="border-b border-divider bg-white/80 text-left text-[0.66rem] uppercase tracking-[0.04em] text-muted">
                <th className="px-3 py-2 font-bold">Nama</th>
                <th className="px-3 py-2 font-bold">WhatsApp</th>
                <th className="px-3 py-2 font-bold">Mengetahui dari</th>
                <th className="px-3 py-2 font-bold">PIC</th>
                <th className="px-3 py-2 font-bold">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {pendaftar.rows.map((r, i) => (
                <tr key={i} className="border-b border-divider/60">
                  <td className="px-3 py-1.5 font-semibold text-ink">{r.nama || "—"}</td>
                  <td className="px-3 py-1.5 text-muted">{r.whatsapp || "—"}</td>
                  <td className="px-3 py-1.5 text-muted">{r.source || "—"}</td>
                  <td className="px-3 py-1.5 text-muted">{r.pic || "—"}</td>
                  <td className="px-3 py-1.5 text-muted">{r.timestamp || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="my-5 border-t border-divider" />

      {/* D — Grafik Asal Chat */}
      <SectionTitle code="D · Asal Chat" title="Distribusi sumber chat" />
      <div className="mt-2">
        <AsalChart rows={asalChat} />
      </div>

      <div className="my-5 border-t border-divider" />

      {/* E — Insights */}
      <SectionTitle code="E · Insight" title="Ringkasan bulan ini" />
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Insight label="Total Pendaftar" value={formatCount(insights.totalPendaftar)} />
        <Insight label="Konversi Daftar / Chat" value={insights.conDaftarChat} />
        <Insight label="Pending" value={formatCount(insights.pending)} />
        <Insight label="Follow-Up Dibutuhkan" value={formatCount(insights.followUp)} />
        <Insight label="Chat Masuk" value={formatCount(chatMasuk.total)} />
        <Insight label="Closing" value={formatCount(closing.total)} />
        <Insight label="Perlu Tindak Lanjut" value={formatCount(pendingFollowUp(report))} />
        <Insight label="Status Teratas" value={insights.statusDist[0]?.name ?? "—"} />
      </div>
    </section>
  );
}
