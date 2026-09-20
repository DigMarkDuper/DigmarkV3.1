import { afterAll, describe, expect, it } from "vitest";
import {
  auditFileExists,
  FileAuditLog,
  MemoryAuditLog,
  NullAuditLog,
  nowIso,
  record,
  type AuditEntry,
  type AuditLog,
} from "./audit";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmpDirs: string[] = [];
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe("MemoryAuditLog", () => {
  it("records entries and copies them (no shared mutation)", () => {
    const log = new MemoryAuditLog();
    log.log({ timestamp: "t", actor: "a", operation: "clear", success: true, summary: "s" });
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0].actor).toBe("a");
  });
});

describe("FileAuditLog", () => {
  it("writes JSONL to a file created lazily", () => {
    const dir = mkdtempSync(join(tmpdir(), "dm-audit-"));
    tmpDirs.push(dir);
    const file = join(dir, "audit.log.jsonl");
    const log = new FileAuditLog(file);
    expect(existsSync(file)).toBe(false);
    log.log({ timestamp: "2026-01-01T00:00:00.000Z", actor: "editor-user", operation: "clear", tableKey: "sosmed", targetResource: "SOSMED", success: true, summary: "Cleared." });
    log.log({ timestamp: "2026-01-01T00:00:01.000Z", actor: "viewer-user", operation: "append", tableKey: "crm", success: false, summary: "denied" });
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]) as AuditEntry;
    expect(first).toEqual({
      timestamp: "2026-01-01T00:00:00.000Z",
      actor: "editor-user",
      operation: "clear",
      tableKey: "sosmed",
      targetResource: "SOSMED",
      success: true,
      summary: "Cleared.",
    });
    expect(auditFileExists(file)).toBe(true);
  });
});

describe("NullAuditLog / record", () => {
  it("NullAuditLog is a no-op", () => {
    expect(() => new NullAuditLog().log()).not.toThrow();
  });
  it("record stamps an ISO timestamp and never throws on sink failure", () => {
    const log = new MemoryAuditLog();
    record(log, { actor: "a", operation: "sync", success: true, summary: "s" });
    expect(log.entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const bad: AuditLog = { log: () => { throw new Error("boom"); } };
    expect(() => record(bad, { actor: "a", operation: "x", success: true, summary: "s" })).not.toThrow();
  });
  it("nowIso returns ISO-8601", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});