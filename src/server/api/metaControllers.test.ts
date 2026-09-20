import { describe, expect, it } from "vitest";
import { tabsMetaController } from "./metaControllers";
import { makeFakeSource, makeSession } from "./testHelpers";

const body = async (res: Response) => res.json() as Promise<unknown>;

describe("GET /api/meta/tabs", () => {
  it("returns safe tab metadata (appKey,title,gid,drift) for a viewer", async () => {
    const { source } = makeFakeSource();
    const res = await tabsMetaController(makeSession("v", "viewer"), source);
    expect(res.status).toBe(200);
    const b = (await body(res)) as { ok: boolean; tabs: Record<string, string | boolean>[]; drift: boolean };
    expect(b.ok).toBe(true);
    expect(b.tabs.length).toBeGreaterThan(0);
    const t = b.tabs[0];
    expect(Object.keys(t).sort()).toEqual(["appKey", "drift", "gid", "title"]);
    expect(typeof t.appKey).toBe("string");
    expect(typeof t.drift).toBe("boolean");
    expect(b.drift).toBe(false);
    // No credentials/auth internals are exposed.
    expect(JSON.stringify(b)).not.toMatch(/secret|password|token/i);
  });

  it("401 when unauthenticated", async () => {
    const { source } = makeFakeSource();
    const res = await tabsMetaController(null, source);
    expect(res.status).toBe(401);
  });
});