import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildImportRows, importController, parseImportFile } from "./importControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { columnsFor } from "@/server/adapter/schema";
import { makeFakeSource, makeSession } from "./testHelpers";

const body = async (res: Response) => res.json() as Promise<unknown>;
const sosmedCols = ["Kode Konten", "Output", "PIC"];

describe("buildImportRows (projection)", () => {
  it("maps file headers to schema columns in declared order, dropping unknowns", () => {
    const { rows, skippedUnknownColumns } = buildImportRows("sosmed",
      [["Kode Konten", "Output", "Pixel", "PIC"], ["DP-1", "Design", "ABCDE", "Hanif"]],
      () => sosmedCols);
    expect(skippedUnknownColumns).toEqual(["Pixel"]);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("DP-1"); // Kode Konten
    expect(rows[0][1]).toBe("Design"); // Output
    expect(rows[0][2]).toBe("Hanif"); // PIC
  });

  it("rejects a file with no matching columns (400)", () => {
    expect(() => buildImportRows("sosmed", [["Foo", "Bar"], ["1", "2"]], () => sosmedCols)).toThrow();
  });

  it("skips fully-empty rows", () => {
    const { rows } = buildImportRows("sosmed",
      [["Kode Konten", "Output"], ["DP-1", "Design"], ["", ""]],
      () => sosmedCols);
    expect(rows).toHaveLength(1);
  });

  it("rejects a file with no data rows (400)", () => {
    expect(() => buildImportRows("sosmed", [["Kode Konten"]], () => sosmedCols)).toThrow();
  });

  it("matches columns tolerantly (case + whitespace) and maps columnsFor(key)", () => {
    const cols = columnsFor("sosmed");
    const { rows } = buildImportRows("sosmed",
      [["kode konten", "proses"], ["DP-9", "DONE"]],
      () => cols);
    expect(rows[0][cols.indexOf("Kode Konten")]).toBe("DP-9");
    expect(rows[0][cols.indexOf("PROSES")]).toBe("DONE");
  });
});

describe("parseImportFile (CSV/XLSX only)", () => {
  it("accepts CSV", () => {
    const aoa = parseImportFile("report.csv", Buffer.from("a,b\n1,2\n", "utf8"));
    expect(aoa).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("accepts XLSX", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Kode Konten", "Output"], ["DP-1", "Design"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const aoa = parseImportFile("report.xlsx", buf);
    expect(aoa[0]).toEqual(["Kode Konten", "Output"]);
    expect(aoa[1][0]).toBe("DP-1");
  });
  it("rejects unsupported file types (400)", () => {
    expect(() => parseImportFile("report.txt", Buffer.from("x"))).toThrow();
    expect(() => parseImportFile("report.pdf", Buffer.from("x"))).toThrow();
  });
  it("rejects corrupt xlsx via the import controller (400)", async () => {
    const { source } = makeFakeSource();
    const res = await importController(makeSession("e", "editor"), source, "sosmed", "bad.xlsx", Buffer.from("not-a-real-zip"), new MemoryAuditLog());
    expect(res.status).toBe(400);
  });
});

describe("POST /api/import/[key]", () => {
  it("imports a CSV for an editor and audits", async () => {
    const { source, api } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const csv = Buffer.from("Kode Konten,Output,PIC\nDP-100,Video,Hana\n", "utf8");
    const res = await importController(makeSession("editor-user", "editor"), source, "sosmed", "sosmed.csv", csv, audit);
    expect(res.status).toBe(200);
    const b = (await body(res)) as { ok: boolean; added: number; summary: { skippedUnknownColumns: number } };
    expect(b.ok).toBe(true);
    expect(b.added).toBe(1);
    expect(b.summary.skippedUnknownColumns).toBe(0);
    expect(audit.entries[0]).toMatchObject({ operation: "import", tableKey: "sosmed", actor: "editor-user", success: true });
    expect(source.cacheImpl.has("sosmed")).toBe(false); // affected-table invalidation
    void api;
  });

  it("returns 403 for a viewer", async () => {
    const { source } = makeFakeSource();
    const res = await importController(makeSession("v", "viewer"), source, "sosmed", "x.csv", Buffer.from("Kode Konten\nA\n"), new MemoryAuditLog());
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const { source } = makeFakeSource();
    const res = await importController(null, source, "sosmed", "x.csv", Buffer.from("Kode Konten\nA\n"), new MemoryAuditLog());
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown table", async () => {
    const { source } = makeFakeSource();
    const res = await importController(makeSession("e", "editor"), source, "nope", "x.csv", Buffer.from("a\nb\n"), new MemoryAuditLog());
    expect(res.status).toBe(404);
  });

  it("returns 400 for unsupported file type", async () => {
    const { source } = makeFakeSource();
    const res = await importController(makeSession("e", "editor"), source, "sosmed", "x.txt", Buffer.from("a\nb\n"), new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("returns 400 when file headers match no schema column", async () => {
    const { source } = makeFakeSource();
    const res = await importController(makeSession("e", "editor"), source, "sosmed", "x.csv", Buffer.from("Totally,Unknown\n1,2\n"), new MemoryAuditLog());
    expect(res.status).toBe(400);
  });

  it("imports XLSX for an editor", async () => {
    const { source } = makeFakeSource();
    const ws = XLSX.utils.aoa_to_sheet([["Kode Konten", "Output"], ["DP-200", "Article"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const res = await importController(makeSession("editor-user", "editor"), source, "sosmed", "report.xlsx", buf, new MemoryAuditLog());
    expect(res.status).toBe(200);
    expect((await body(res)) as { added: number }).toEqual({ ok: true, added: 1, skipped: 0, summary: expect.any(Object) });
  });
});

describe("POST /api/import/[ads keys] (Phase E — Ads workspace)", () => {
  it("imports ad-platform CSV into ads_meta (header projection, unknown col dropped)", async () => {
    const { source } = makeFakeSource();
    const audit = new MemoryAuditLog();
    const csv = Buffer.from(
      "Reporting starts,Campaign name,Amount spent (IDR),Pixel,Results\n" +
      "2026-09-01,Camp A,100000,ABCDE,5\n",
      "utf8",
    );
    const res = await importController(makeSession("e", "editor"), source, "ads_meta", "meta.csv", csv, audit);
    expect(res.status).toBe(200);
    const b = (await body(res)) as { ok: boolean; added: number; summary: { skippedUnknownColumns: number } };
    expect(b.ok).toBe(true);
    expect(b.added).toBe(1);
    expect(b.summary.skippedUnknownColumns).toBe(1); // "Pixel" dropped
    expect(audit.entries[0]).toMatchObject({ operation: "import", tableKey: "ads_meta", success: true });
  });

  it("400 for ads_tiktok when file headers match no schema column", async () => {
    const { source } = makeFakeSource();
    const res = await importController(
      makeSession("e", "editor"), source, "ads_tiktok", "x.csv",
      Buffer.from("Totally,Unknown\n1,2\n"), new MemoryAuditLog(),
    );
    expect(res.status).toBe(400);
    expect(((await body(res)) as { error: { code: string } }).error.code).toBe("VALIDATION_FAILED");
  });

  it("403 for a viewer importing into mekari", async () => {
    const { source } = makeFakeSource();
    const res = await importController(
      makeSession("v", "viewer"), source, "mekari", "m.csv",
      Buffer.from("x\na\n"), new MemoryAuditLog(),
    );
    expect(res.status).toBe(403);
  });
});