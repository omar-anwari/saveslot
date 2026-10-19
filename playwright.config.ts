import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_ENV, E2E_HOST, E2E_PORT } from "./e2e/env.ts";

export default defineConfig({
    testDir: "./e2e",
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: E2E_BASE_URL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
        command: `node --conditions=react-server e2e/prepare.ts && pnpm exec next dev --hostname ${E2E_HOST} --port ${E2E_PORT}`,
        url: `${E2E_BASE_URL}/api/health`,
        env: E2E_ENV,
        reuseExistingServer: false,
        timeout: 180_000,
    },
});