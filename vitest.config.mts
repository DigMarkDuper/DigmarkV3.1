import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // Match Next.js tsconfig paths alias ("@/*" -> "./src/*") so src/server/metrics
  // internals resolve the same way under Vitest as under `next build`.
  resolve: {
    alias: {
      "@": `${root}/src`,
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // Phase B includes real (network) sandbox tests; run files serially and
    // allow generous timeouts for the many sequential Sheets API round-trips.
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});