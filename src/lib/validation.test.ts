import { describe, expect, it } from "vitest";
import { ApiError, ErrorCodes } from "./errors";
import {
  assertKnownColumn,
  assertKnownTableKey,
  assertScalarValue,
  assertRowIndex,
  buildCellRows,
  normalizeHeader,
  rowIsEmpty,
} from "./validation";
import { columnsFor } from "@/server/adapter/schema";

describe("assertKnownTableKey", () => {
  it("accepts a valid schema key", () => {
    expect(assertKnownTableKey("sosmed")).toBe("sosmed");
  });
  it("throws NOT_FOUND (404) for an unknown table", () => {
    try {
      assertKnownTableKey("not-a-table");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).code).toBe(ErrorCodes.NOT_FOUND);
    }
  });
  it("throws VALIDATION_FAILED for a missing/non-string key", () => {
    expect(() => assertKnownTableKey("")).toThrow(ApiError);
    expect(() => assertKnownTableKey(null)).toThrow(ApiError);
  });
});

describe("assertKnownColumn", () => {
  it("accepts a declared column", () => {
    expect(assertKnownColumn("sosmed", "Kode Konten")).toBe("Kode Konten");
  });
  it("throws for an unknown column", () => {
    try {
      assertKnownColumn("sosmed", "BogusCol");
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).code).toBe(ErrorCodes.VALIDATION_FAILED);
    }
  });
});

describe("assertRowIndex", () => {
  it("accepts non-negative integers", () => {
    expect(assertRowIndex(0)).toBe(0);
    expect(assertRowIndex(5)).toBe(5);
  });
  it("rejects negatives, floats, and non-numbers", () => {
    expect(() => assertRowIndex(-1)).toThrow(ApiError);
    expect(() => assertRowIndex(1.5)).toThrow(ApiError);
    expect(() => assertRowIndex("2")).toThrow(ApiError);
  });
});

describe("assertScalarValue", () => {
  it("accepts scalars", () => {
    expect(assertScalarValue("DONE")).toBe("DONE");
    expect(assertScalarValue(1)).toBe(1);
    expect(assertScalarValue(true)).toBe(true);
    expect(assertScalarValue(null)).toBeNull();
  });
  it("rejects objects/arrays", () => {
    expect(() => assertScalarValue({ a: 1 })).toThrow(ApiError);
    expect(() => assertScalarValue([1, 2])).toThrow(ApiError);
  });
});

describe("buildCellRows", () => {
  it("projects a single object into schema column order, filling missing as ''", () => {
    const cols = columnsFor("sosmed");
    const cells = buildCellRows("sosmed", { "Kode Konten": "DP-1", PROSES: "DONE" });
    expect(cells).toHaveLength(1);
    expect(cells[0][cols.indexOf("Kode Konten")]).toBe("DP-1");
    expect(cells[0][cols.indexOf("PROSES")]).toBe("DONE");
    expect(cells[0][0]).toBe("DP-1"); // first declared column
    // all other columns default to ''
    expect(cells[0].filter((c) => c === "")).toHaveLength(cols.length - 2);
  });
  it("accepts an array of rows", () => {
    const cells = buildCellRows("sosmed", [{ "Kode Konten": "A" }, { "Kode Konten": "B" }]);
    expect(cells).toHaveLength(2);
  });
  it("rejects an unknown column rather than trusting position", () => {
    try {
      buildCellRows("sosmed", { "NotAColumn": "x" });
      expect.unreachable();
    } catch (e) {
      expect((e as ApiError).code).toBe(ErrorCodes.VALIDATION_FAILED);
      expect((e as ApiError).message).toContain("NotAColumn");
    }
  });
  it("rejects non-object rows and empty payloads", () => {
    expect(() => buildCellRows("sosmed", [1])).toThrow(ApiError);
    expect(() => buildCellRows("sosmed", [])).toThrow(ApiError);
    expect(() => buildCellRows("sosmed", null)).toThrow(ApiError);
  });
});

describe("normalizeHeader / rowIsEmpty", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizeHeader("  Kode  Konten ")).toBe("kode konten");
  });
  it("rowIsEmpty detects empty rows", () => {
    expect(rowIsEmpty(["", "", null, undefined])).toBe(true);
    expect(rowIsEmpty(["", "x"])).toBe(false);
  });
});