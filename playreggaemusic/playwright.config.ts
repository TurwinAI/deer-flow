import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config (B07).
 *
 * The app is built and served in FIXTURES mode (`VITE_USE_FIXTURES=1`) so the
 * whole flow runs OFFLINE — no live Firebase / Functions / Polar / Anthropic.
 * Vite inlines `import.meta.env.VITE_USE_FIXTURES` at BUILD time, so the
 * webServer must build with the flag set, then `vite preview` serves that
 * fixtures build.
 *
 * The browser binary is installed separately (`pnpm exec playwright install
 * chromium`). If that install is blocked by the sandbox, the E2E gate is
 * reported BLOCKED — this config + the spec stay in place so it runs once a
 * browser is available.
 */
const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Build with fixtures enabled, then serve the static build via vite preview.
    command: `VITE_USE_FIXTURES=1 pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
