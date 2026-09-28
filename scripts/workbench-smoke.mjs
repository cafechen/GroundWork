import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:4180";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1040 },
  });
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("data:"))
      external.push(r.url());
  });
  // Reproduce slow historical-result loading racing a newly submitted run.
  // The new selection must win even if the older HTTP response arrives later.
  let delayFirstResult = true;
  await page.route("**/api/runs/*/result", async (route) => {
    const response = await route.fetch();
    if (delayFirstResult) {
      delayFirstResult = false;
      await new Promise((r) => setTimeout(r, 1200));
    }
    await route.fulfill({ response });
  });
  await page.goto(`${base}/workbench`);
  await page.waitForFunction(
    () =>
      document.querySelector("#run") &&
      !document.querySelector("#run").disabled,
  );
  await page.waitForTimeout(300);
  assert.equal(
    await page.locator("#map-library-link").getAttribute("href"),
    "/maps?lang=zh",
  );
  const initial = await page.locator("#run-label").textContent();
  await page.selectOption("#engine", "yard");
  await page.click("#run");
  await page.waitForFunction(
    (old) =>
      document.querySelector("#run-label").textContent !== old &&
      document.querySelector("#model-caption").textContent.startsWith("YARD"),
    initial,
    { timeout: 20000 },
  );
  await page.locator("#timeline").fill("80");
  await page.locator("#timeline").dispatchEvent("input");
  assert.match(await page.locator("#clock").textContent(), /8\.0/);
  await page.screenshot({ path: "artifacts/workbench-zh.png", fullPage: true });
  await page.click('[data-mode="2d"]');
  assert.ok((await page.locator(".svg-view svg polygon").count()) > 0);
  await page.click("#language");
  await page.screenshot({ path: "artifacts/workbench-en.png", fullPage: true });
  assert.equal(await page.locator("#title").textContent(), "Scenario & tasks");
  await page.selectOption("#engine", "road");
  await page.waitForFunction(() =>
    document.querySelector("#plan").value.includes("schemaVersion"),
  );
  const before = await page.locator("#run-label").textContent();
  await page.click("#run");
  await page.waitForFunction(
    (old) => document.querySelector("#run-label").textContent !== old,
    before,
    { timeout: 20000 },
  );
  assert.match(await page.locator("#model-caption").textContent(), /ROAD/);
  await page.click('[data-tab="3"]');
  await page.screenshot({
    path: "artifacts/workbench-road.png",
    fullPage: true,
  });
  const response = await page.request.post(`${base}/api/runs`, {
    data: { engine: "yard" },
    headers: { Origin: "http://evil.invalid" },
  });
  assert.equal(response.status(), 403);
  for (const file of [
    "/AGENTS.md",
    "/package.json",
    "/server/jobs.mjs",
    "/.env",
    "/node_modules/zod/package.json",
  ])
    assert.equal((await page.request.get(base + file)).status(), 404, file);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `artifacts/workbench-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Overflow at ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "Workbench browser smoke PASS: yard/road run, replay, 2D/3D, zh/en, 390/320 px, origin/static guards, no external requests",
  );
} finally {
  await browser.close();
}
