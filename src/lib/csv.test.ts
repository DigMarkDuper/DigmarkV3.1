import { describe, expect, it } from "vitest";
import { parseCSV } from "./csv";

describe("parseCSV", () => {
  it("parses a plain comma CSV", () => {
    expect(parseCSV("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("handles quoted fields with commas and embedded quotes", () => {
    const text = 'name,note\n"Smith, John","He said ""hi"""\n';
    expect(parseCSV(text)).toEqual([
      ["name", "note"],
      ["Smith, John", 'He said "hi"'],
    ]);
  });
  it("handles newlines inside quoted fields", () => {
    const text = 'a,b\n"line1\nline2",x\n';
    expect(parseCSV(text)).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });
  it("handles CRLF line endings and bare CR", () => {
    expect(parseCSV("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("strips a UTF-8 BOM from the first header", () => {
    expect(parseCSV("\uFEFFa,b\n1,2\n")[0]).toEqual(["a", "b"]);
  });
  it("handles a trailing row without final newline", () => {
    expect(parseCSV("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
  it("returns [] for empty input", () => {
    expect(parseCSV("")).toEqual([]);
  });
});