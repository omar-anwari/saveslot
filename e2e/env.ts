import path from "node:path";

export const E2E_HOST = "127.0.0.1";
export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_PORT}`;
export const E2E_PASSWORD = "saveslot-e2e-password";
export const E2E_ROOT = path.resolve(".e2e");

export const E2E_GAMES = [
    { file: "Smoke Alpha.nes", title: "Smoke Alpha", slug: "nes-smoke-alpha" },
    { file: "Smoke Beta.nes", title: "Smoke Beta", slug: "nes-smoke-beta" },
    { file: "Smoke Gamma.nes", title: "Smoke Gamma", slug: "nes-smoke-gamma" },
] as const;

export const E2E_ENV: Record<string, string> = {
    NEXT_DIST_DIR: ".next-e2e",
    ROM_LIBRARY_PATH: path.join(E2E_ROOT, "library"),
    APP_DATA_PATH: path.join(E2E_ROOT, "data"),
    DATABASE_URL: path.join(E2E_ROOT, "data", "app.sqlite"),
    APP_URL: E2E_BASE_URL,
    APP_PASSWORD: E2E_PASSWORD,
    SESSION_SECRET: "e2e-only-session-secret-not-used-anywhere-else",
};