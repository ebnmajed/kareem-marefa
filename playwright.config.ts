import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (13 §5, REQ-NFR-018). Locally and in CI the app is served
// by scripts/serve-stub.mjs — `next start` wired to the QA stub — so a test
// can submit real forms and never reach a real Supabase project (DEC-023).
// Nightly runs against staging are a later concern; there is no staging yet
// (DEC-025).
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    // Arabic is the default; a test that needs English navigates to /en.
    locale: "ar-SA",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node scripts/serve-stub.mjs",
    url: "http://localhost:3000/ar",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // SIGTERM first, so the server releases the gate lock (DEC-040) instead
    // of leaving a dead holder behind; the PID check covers the rest.
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
