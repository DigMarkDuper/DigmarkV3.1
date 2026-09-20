import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SalesFunnelCard, type SalesFunnelStage } from "./SalesFunnelCard";

const stages: SalesFunnelStage[] = [
  { name: "AWARENESS", value: "2.841.036", sub: "Views 7.363.486" },
  { name: "INTENT", value: "25.550" },
  { name: "LEAD", value: "1.436" },
  { name: "DAFTAR", value: "184" },
  { name: "CLOSING", value: "70" },
];
const connectors = [
  { rate: "0.9%" },
  { rate: "5.6%" },
  { rate: "12.8%" },
  { rate: "38.0%" },
];
const supports = [
  { name: "Views", value: "7.363.486" },
  { name: "Interaksi", value: "74.954" },
  { name: "Profile Visit", value: "133.314" },
  { name: "Ad Spend", value: "Rp 0" },
];

describe("SalesFunnelCard (server-rendered, no browser)", () => {
  it("renders the 5 stage names, values, connector rates, overall line and supporting strip", () => {
    const html = renderToStaticMarkup(
      <SalesFunnelCard stages={stages} connectors={connectors} overall="4.9%" supports={supports} />,
    );
    for (const name of ["AWARENESS", "INTENT", "LEAD", "DAFTAR", "CLOSING"]) {
      expect(html).toContain(name);
    }
    // Primary values.
    expect(html).toContain("2.841.036");
    expect(html).toContain("25.550");
    expect(html).toContain("1.436");
    expect(html).toContain("184");
    expect(html).toContain(">70<");
    // AWARENESS sub-label carries Views.
    expect(html).toContain("Views 7.363.486");
    // Connector rates + overall line.
    for (const r of ["0.9%", "5.6%", "12.8%", "38.0%"]) expect(html).toContain(r);
    expect(html).toContain("Konversi keseluruhan Lead → Closing:");
    expect(html).toContain("4.9%");
    // Supporting strip labels.
    for (const s of ["Views", "Interaksi", "Profile Visit", "Ad Spend"]) expect(html).toContain(s);
  });

  it("renders '—' verbatim for zero-divisor rates and empty values (never NaN/Infinity)", () => {
    const empty = stages.map((s) => ({ ...s, value: "—", sub: undefined }));
    const html = renderToStaticMarkup(
      <SalesFunnelCard
        stages={empty}
        connectors={[{ rate: "—" }, { rate: "—" }, { rate: "—" }, { rate: "—" }]}
        overall="—"
        supports={[
          { name: "Views", value: "—" },
          { name: "Interaksi", value: "—" },
          { name: "Profile Visit", value: "—" },
          { name: "Ad Spend", value: "—" },
        ]}
      />,
    );
    expect(html).toContain("—");
    expect(html).not.toMatch(/NaN|Infinity|Infinity/);
  });

  it("pins the big value + optional sub inside ONE bottom-pinned group so all five cards align", () => {
    const html = renderToStaticMarkup(
      <SalesFunnelCard stages={stages} connectors={connectors} overall="4.9%" supports={supports} />,
    );
    // Neutral branch (StageCard) wraps value + sub in a single mt-3 flex flex-col gap-1 group.
    const awareness = html.match(
      /mt-3 flex flex-col gap-1"><div class="[^"]*text-ink[^"]*">2\.841\.036<\/div>\n?\s*<div class="[^"]*text-muted[^"]*">Views 7\.363\.486<\/div>/,
    );
    expect(awareness).not.toBeNull();
    // CLOSING branch wraps its value in the same single group (text-brand value, no sub today).
    expect(html).toMatch(/mt-3 flex flex-col gap-1"><div class="[^"]*text-brand[^"]*">70<\/div>/);
  });

  it("emphasises the CLOSING endpoint card with a blue ring + text-brand value", () => {
    const html = renderToStaticMarkup(
      <SalesFunnelCard stages={stages} connectors={connectors} overall="4.9%" supports={supports} />,
    );
    expect(html).toContain("border-brand/70");
    expect(html).toContain("bg-brand/[0.06]");
    expect(html).toContain("ring-brand/40");
    // The CLOSING value is the emphasized blue number.
    expect(html).toContain("text-brand");
  });

  it("uses the responsive horizontal 5-column grid on md+ and stacks below", () => {
    const html = renderToStaticMarkup(
      <SalesFunnelCard stages={stages} connectors={connectors} overall="4.9%" supports={supports} />,
    );
    expect(html).toContain("md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]");
    expect(html).toContain("md:items-stretch");
    expect(html).toContain("grid-cols-1");
    // Supporting strip 2-up on small, 4-across on sm+.
    expect(html).toContain("sm:grid-cols-4");
  });

  it("renders pure skeletons (animate-pulse, aria-busy) with no fake numbers when loading", () => {
    const html = renderToStaticMarkup(<SalesFunnelCard loading stages={[]} connectors={[]} supports={[]} />);
    expect(html).toContain("SALES FUNNEL");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-muted");
    // No business numbers disguised as real values while loading.
    expect(html).not.toContain("2.841.036");
    expect(html).not.toContain("70");
  });
});