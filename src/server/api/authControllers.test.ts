import { describe, expect, it } from "vitest";
import { loginController, logoutController, meController } from "./authControllers";
import { MemoryAuditLog } from "@/lib/audit";
import { makeEnv } from "./testHelpers";

const body = async (res: Response) => res.json() as Promise<unknown>;

describe("POST /api/auth/login", () => {
  it("issues a signed httpOnly cookie for valid editor credentials", async () => {
    const audit = new MemoryAuditLog();
    const res = await loginController({ url: "http://localhost:3000" }, { username: "editor", password: "passeditor" }, audit, makeEnv());
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("dm_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    // localhost -> no Secure flag
    expect(setCookie).not.toContain("Secure");
    const b = (await body(res)) as { ok: boolean; identity: string; role: string };
    expect(b).toEqual({ ok: true, identity: "editor", role: "editor" });
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ operation: "login", actor: "editor", success: true });
  });

  it("sets Secure on non-localhost hosts", async () => {
    const res = await loginController({ url: "https://digmark.example.com" }, { username: "editor", password: "passeditor" }, new MemoryAuditLog(), makeEnv());
    expect(res.headers.get("set-cookie")).toContain("Secure");
  });

  it("401 for invalid credentials (and no cookie)", async () => {
    const audit = new MemoryAuditLog();
    const res = await loginController({ url: "http://localhost:3000" }, { username: "editor", password: "wrong" }, audit, makeEnv());
    expect(res.status).toBe(401);
    const b = await body(res);
    expect((b as { error: { code: string } }).error.code).toBe("AUTH_FAILED");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(audit.entries[0]).toMatchObject({ operation: "login", success: false });
  });

  it("400 when username/password missing", async () => {
    const res = await loginController({ url: "http://localhost:3000" }, {}, new MemoryAuditLog(), makeEnv());
    expect(res.status).toBe(400);
    const res2 = await loginController({ url: "http://localhost:3000" }, null, new MemoryAuditLog(), makeEnv());
    expect(res2.status).toBe(400);
  });

  it("500 when AUTH_SECRET is unconfigured (clear config error)", async () => {
    const res = await loginController({ url: "http://localhost:3000" }, { username: "editor", password: "passeditor" }, new MemoryAuditLog(), { AUTH_USERS: "editor:passeditor:editor" });
    expect(res.status).toBe(500);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await logoutController({ url: "http://localhost:3000" }, null, new MemoryAuditLog());
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("dm_session=");
    expect(setCookie).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await body(res)) as { ok: boolean }).toEqual({ ok: true });
  });
});

describe("GET /api/auth/me", () => {
  it("returns identity + role for an authenticated user", async () => {
    const res = await meController({ identity: "bob", role: "editor", iat: 0, exp: 0 });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, identity: "bob", role: "editor" });
  });
  it("401 when not authenticated", async () => {
    const res = await meController(null);
    expect(res.status).toBe(401);
  });
});