/**
 * Vitest setup: load the gitignored local secrets into process.env so the real
 * sandbox write tests can authenticate. Unit tests that mock the API don't
 * depend on these, but the shared auth module reads env when constructing a
 * config, so keep it loaded for the whole suite.
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}