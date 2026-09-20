import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingState } from "@/components/sections/LoadingState";
import { EmptyState } from "@/components/sections/EmptyState";
import { ErrorState } from "@/components/sections/ErrorState";
import { SectionHead } from "@/components/sections/SectionHead";
import { QuickInsightStat } from "@/components/metrics/QuickInsightStat";
import { MetricCard } from "@/components/metrics/MetricCard";
import { Button } from "@/components/ui/Button";
import { Divider } from "@/components/ui/Divider";
import { DataTable, deriveColumns } from "@/components/grid/DataTable";

describe("component anatomy (server-rendered, no browser)", () => {
  it("LoadingState announces busy state and never renders blank", () => {
    const html = renderToStaticMarkup(<LoadingState variant="card" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-muted");
  });

  it("EmptyState renders role=status with the title", () => {
    const html = renderToStaticMarkup(<EmptyState title="Belum ada data." />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Belum ada data.");
  });

  it("ErrorState renders role=alert with the mapped heading", () => {
    const html = renderToStaticMarkup(
      <ErrorState failure={{ code: "ADAPTER_FAILED", message: "x", status: 502 }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Google Sheets is temporarily unavailable.");
  });

  it("SectionHead renders the big homepage heading", () => {
    const html = renderToStaticMarkup(<SectionHead title="Quick Insight" />);
    expect(html).toContain("Quick Insight");
    expect(html).toContain("text-[1.9rem]");
  });

  it("QuickInsightStat shows label, value and loading skeleton", () => {
    const idle = renderToStaticMarkup(<QuickInsightStat label="Total Leads" value="12" />);
    expect(idle).toContain("Total Leads");
    expect(idle).toContain(">12<");
    const loading = renderToStaticMarkup(<QuickInsightStat label="Closing" value="—" loading />);
    expect(loading).toContain('aria-busy="true"');
  });

  it("MetricCard renders value and delta colouring", () => {
    const up = renderToStaticMarkup(<MetricCard label="ROAS" value="4.3x" delta={1} />);
    expect(up).toContain("4.3x");
    expect(up).toContain("text-success");
  });

  it("Button renders a semantic link when given an href", () => {
    const html = renderToStaticMarkup(<Button variant="primary" href="#workspace">Explore</Button>);
    expect(html).toContain('href="#workspace"');
    expect(html).toContain("Explore");
  });

  it("Divider renders an hr rule", () => {
    expect(renderToStaticMarkup(<Divider />)).toMatch(/^<hr/);
  });

  it("deriveColumns returns the union of keys in the first row's order", () => {
    const rows = [{ a: 1, b: 2 }, { b: 3, c: 4 }];
    expect(deriveColumns(rows)).toEqual(["a", "b"]);
    expect(deriveColumns([])).toEqual([]);
  });

  it("deriveColumns excludes __-prefixed metadata keys (e.g. __rowIndex)", () => {
    expect(deriveColumns([{ a: 1, __rowIndex: 3 }])).toEqual(["a"]);
    expect(deriveColumns([{ a: 1, __rowIndex: 3 }, { b: 2 }])).toEqual(["a"]);
  });

  it("DataTable renders an EmptyState row for zero rows", () => {
    const html = renderToStaticMarkup(<DataTable rows={[]} />);
    expect(html).toContain('role="status"');
  });

  it("DataTable renders an ErrorState for api failures", () => {
    const html = renderToStaticMarkup(
      <DataTable rows={[{ a: 1 }]} error={{ code: "AUTH_FAILED", message: "x", status: 401 }} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Session expired");
  });
});