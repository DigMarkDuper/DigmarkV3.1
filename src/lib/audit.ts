/**
 * Server-side audit logging (Phase C).
 *
 * Every mutating/destructive API action (append, update, import, sync, clear)
 * and every login attempt records one audit entry:
 *   { timestamp (ISO), actor (identity), operation, tableKey?, targetResource?,
 *     success, summary }
 *
 * Entries are persisted as newline-delimited JSON to `data/audit.log.jsonl`
 * (created lazily) AND mirrored to stdout via console.info. Never logs private
 * keys, auth secrets, or sensitive credential payloads.
 *
 * The writer is injectable (AuditLog interface + MemoryAuditLog/NullAuditLog)
 * so tests can assert on entries without touching disk. `data/` is gitignored.
 */

import { mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** One audit entry (all fields safe to log). */
export interface AuditEntry {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Actor identity (username), or "anonymous". */
  actor: string;
  /** Operation: append | update | import | sync | clear | login | logout. */
  operation: string;
  /** Target table app key when applicable. */
  tableKey?: string;
  /** Human-readable target resource (e.g. schema tab title). */
  targetResource?: string;
  success: boolean;
  /** Short human-readable summary. */
  summary: string;
}

/** Injectable audit sink (tests use MemoryAuditLog; prod uses FileAuditLog). */
export interface AuditLog {
  log(entry: AuditEntry): void;
}

/** In-memory audit sink for tests. Exposes the recorded entries. */
export class MemoryAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];
  log(entry: AuditEntry): void {
    this.entries.push({ ...entry });
  }
}

/** No-op sink (e.g. when auditing is intentionally disabled). */
export class NullAuditLog implements AuditLog {
  log(): void {
    /* no-op */
  }
}

/**
 * Appends JSONL entries to a local file, creating the directory on first use.
 * Also mirrors each entry to stdout so operators see writes in server logs.
 */
export class FileAuditLog implements AuditLog {
  private readonly filePath: string;
  private ready = false;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  log(entry: AuditEntry): void {
    try {
      if (!this.ready) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        this.ready = true;
      }
      appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (err) {
      // Auditing must never take the request down with it.
      console.error("[audit] failed to write audit entry:", err instanceof Error ? err.message : String(err));
    }
    console.info(`[audit] action=${entry.operation} actor=${entry.actor} ok=${entry.success} table=${entry.tableKey ?? "-"} target=${entry.targetResource ?? "-"}`);
  }
}

/** True when `filePath` exists and already has a non-empty audit file. */
export function auditFileExists(filePath: string): boolean {
  return existsSync(filePath);
}

/**
 * Default singleton audit writer pointed at `data/audit.log.jsonl` relative to
 * the process working directory. The file/dir is created lazily on first write.
 */
export const defaultAuditLogPath = join(process.cwd(), "data", "audit.log.jsonl");
export const defaultAuditLog: AuditLog = new FileAuditLog(defaultAuditLogPath);

/** Build an ISO timestamp for a new audit entry. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Record a single audit entry, never letting a sink failure throw. */
export function record(auditlog: AuditLog, entry: Omit<AuditEntry, "timestamp">): void {
  try {
    auditlog.log({ ...entry, timestamp: nowIso() });
  } catch (err) {
    console.error("[audit] record failed:", err instanceof Error ? err.message : String(err));
  }
}