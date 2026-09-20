import { describe, expect, it } from "vitest";
import {
  assertValidConfig,
  buildSheetsApi,
  loadSheetConfig,
  normalizePrivateKey,
  SHEET_SCOPES,
} from "./auth";

const VALID_PEM =
  "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCohwOAgEA\n-----END PRIVATE KEY-----\n";

describe("auth config validation (no network)", () => {
  it("buildSheetsApi uses ONLY the spreadsheets scope (least privilege)", () => {
    expect(SHEET_SCOPES).toEqual(["https://www.googleapis.com/auth/spreadsheets"]);
  });

  it("loads config from env", () => {
    const cfg = loadSheetConfig({
      GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: "svc@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: VALID_PEM,
      MASTER_SPREADSHEET_KEY: "AAAA",
      SANDBOX_SPREADSHEET_KEY: "BBBB",
    });
    expect(cfg.credentials.clientEmail).toBe("svc@example.iam.gserviceaccount.com");
    expect(cfg.masterSpreadsheetKey).toBe("AAAA");
    expect(cfg.sandboxSpreadsheetKey).toBe("BBBB");
  });

  it("normalizePrivateKey converts literal \\n to real newlines and trims", () => {
    const key = "-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----\\n";
    const out = normalizePrivateKey(key);
    expect(out).toBe("-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----");
  });

  it("throws a clear error when client email is missing", () => {
    const cfg = loadSheetConfig({}, {
      credentials: { clientEmail: "", privateKey: VALID_PEM },
    });
    expect(() => assertValidConfig(cfg)).toThrow(/missing client email/i);
  });

  it("throws a clear error when private key is missing", () => {
    const cfg = loadSheetConfig({}, {
      credentials: { clientEmail: "a@b", privateKey: "" },
    });
    expect(() => assertValidConfig(cfg)).toThrow(/missing private key/i);
  });

  it("throws when private key is not a PEM block", () => {
    const cfg = loadSheetConfig({}, {
      credentials: { clientEmail: "a@b", privateKey: "not-a-pem" },
    });
    expect(() => assertValidConfig(cfg)).toThrow(/not a PEM/i);
  });

  it("buildSheetsApi returns a client surface when valid (no network call)", () => {
    const cfg = loadSheetConfig({
      GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL: "svc@example.iam.gserviceaccount.com",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: VALID_PEM,
    });
    const api = buildSheetsApi(cfg);
    expect(api).toBeDefined();
    expect(api.spreadsheets).toBeDefined();
    expect(typeof api.spreadsheets.values.get).toBe("function");
  });
});