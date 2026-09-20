/**
 * Shared Phase C test helpers: build a FakeApi-backed GoogleSheetsSource (the
 * REAL Phase B adapter over an in-memory store) and session fixtures, so API
 * controllers are exercised network-free against the actual adapter.
 */

import { TAB_SCHEMAS, columnsFor } from "@/server/adapter/schema";
import { GoogleSheetsSource } from "@/server/adapter/sheets";
import { GoogleSheetsClient } from "@/server/adapter/sheets/client";
import { FakeApi } from "@/server/adapter/sheets/testUtils";
import type { Session } from "@/lib/auth";

/** Build a FakeApi with all 10 declared tabs (headers only, optionally seeded). */
export function makeFakeSource(opts: { seed?: (title: string, appKey: string) => unknown[][] } = {}) {
  const api = new FakeApi(
    (Object.keys(TAB_SCHEMAS) as (keyof typeof TAB_SCHEMAS)[]).map((k, i) => ({
      title: TAB_SCHEMAS[k].tab,
      gid: i + 1,
      values: opts.seed ? opts.seed(TAB_SCHEMAS[k].tab, k) : [columnsFor(k)],
    })),
  );
  const client = new GoogleSheetsClient(api, "fake");
  const source = new GoogleSheetsSource(client, api);
  return { api, client, source };
}

/** A valid fake session for the given identity/role. */
export function makeSession(identity = "viewer-user", role: "viewer" | "editor" = "viewer"): Session {
  return { identity, role, iat: Date.now(), exp: Date.now() + 3600_000 };
}

/** Env map with a real secret + two users, for login/session tests. */
export function makeEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    AUTH_SECRET: "0123456789abcdef0123456789abcdef", // 32 hex chars
    AUTH_USERS: "viewer:passviewer:viewer,editor:passeditor:editor",
    ...overrides,
  };
}