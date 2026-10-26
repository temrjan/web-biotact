import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "https://localhost:4173",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node tests/server.mjs",
    url: "https://localhost:4173/__test/ready",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 15000 },
    timeout: 60000,
  },
});
