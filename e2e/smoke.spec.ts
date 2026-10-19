import { expect, test, type Page } from "@playwright/test";
import { E2E_BASE_URL, E2E_PASSWORD } from "./env.ts";

async function signIn(page: Page) {
    const response = await page.request.post("/api/auth/login", { data: { password: E2E_PASSWORD } });
    expect(response.ok()).toBe(true);
}

async function openPlayer(page: Page, slug: string) {
    await page.addInitScript(() => {
        const sentinel = { released: false, type: "screen", release: async () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined };
        Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => sentinel } });
    });
    await signIn(page);
    await page.goto(`/player/${slug}`);
    await page.waitForFunction(
        () => (window as unknown as { EJS_emulator?: { started?: boolean } }).EJS_emulator?.started === true,
        undefined,
        { timeout: 60_000 },
    );
}

test("sign-in gates the app and the theme loads", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(`${E2E_BASE_URL}/login?next=%2F`);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("That password is not correct.");
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/`);
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe("rgb(8, 11, 18)");
});

test("library lists, filters, and opens a game", async ({ page }) => {
    await signIn(page);
    await page.goto("/library");
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    for (const title of ["Smoke Alpha", "Smoke Beta", "Smoke Gamma"]) {
        await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
    }
    await page.getByLabel("Filter by title").fill("Beta");
    await expect(page).toHaveURL(/[?&]q=Beta/);
    await expect(page.getByRole("heading", { level: 3, name: "Smoke Alpha" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "Smoke Beta" })).toBeVisible();
    await page.getByRole("link", { name: "Smoke Beta" }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/games/nes-smoke-beta`);
    await expect(page.getByRole("heading", { level: 1, name: "Smoke Beta" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Play game" }).first()).toBeVisible();
});

test("player boots, routes Save State to the server, and saves and quits", async ({ page }) => {
    await openPlayer(page, "nes-smoke-alpha");
    await expect(page.getByRole("button", { name: "Save File", exact: true })).toBeHidden();
    await page.getByRole("button", { name: "Save State", exact: true }).click();
    await expect(page.getByText("Save state created", { exact: true })).toBeVisible();
    await expect.poll(async () => {
        const response = await page.request.get("/api/games/nes-smoke-alpha/states?core=fceumm");
        const body = (await response.json()) as { states: { hasScreenshot: boolean }[] };
        return body.states.map((state) => state.hasScreenshot);
    }).toEqual([true]);
    await page.mouse.move(400, 300);
    await page.getByRole("button", { name: "Save & Quit" }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/games/nes-smoke-alpha`, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Resume" })).toBeVisible();
});

test("a failed Save & Quit keeps the play session open", async ({ page }) => {
    const ended: string[] = [];
    await page.route((url) => /^\/api\/sessions\/[^/]+\/end$/.test(url.pathname), async (route) => {
        ended.push(route.request().url());
        await route.continue();
    });
    const autosaveUpload = (url: URL) =>
        url.pathname === "/api/games/nes-smoke-gamma/states" && url.searchParams.get("autosave") === "true";
    await page.route(autosaveUpload, (route) => route.fulfill({ status: 500, json: { error: { message: "Injected failure" } } }));
    await openPlayer(page, "nes-smoke-gamma");
    await page.mouse.move(400, 300);
    await page.getByRole("button", { name: "Save & Quit" }).click();
    await expect(page.getByText("Play continues. Use Exit to leave without saving.")).toBeVisible();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/player/nes-smoke-gamma`);
    expect(ended).toEqual([]);
    await page.unroute(autosaveUpload);
    await page.getByRole("button", { name: "Save & Quit" }).click();
    await expect(page).toHaveURL(`${E2E_BASE_URL}/games/nes-smoke-gamma`, { timeout: 30_000 });
    expect(ended).toHaveLength(1);
});