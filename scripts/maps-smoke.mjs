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
    viewport: { width: 1600, height: 1100 },
  });
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base)) external.push(r.url());
  });
  await page.goto(`${base}/maps`);
  await page.waitForFunction(
    () => document.querySelector("#map-name").textContent === "酒店",
  );
  assert.equal(await page.locator("[data-map-id]").count(), 6);
  assert.equal(await page.locator("[data-map-id]:disabled").count(), 1);
  assert.equal(await page.locator("#map-floor option").count(), 3);
  for (const [id, name, levels] of [
    ["hotel", "酒店", ["L1", "L2", "L3"]],
    ["office", "办公室", ["L1"]],
    ["airport_terminal", "机场航站楼", ["L1"]],
    ["clinic", "诊所", ["L1", "L2"]],
    ["campus", "校园", ["L1"]],
  ]) {
    await page.click(`[data-map-id="${id}"]`);
    await page.waitForFunction(
      (name) => document.querySelector("#map-name").textContent === name,
      name,
    );
    for (const level of levels) {
      await page.selectOption("#map-floor", level);
      assert.ok((await page.locator("#map-viewport svg path").count()) > 0);
      await page.click('[data-map-mode="3d"]');
      assert.ok(await page.locator("#map-viewport canvas").isVisible());
      await page.screenshot({ path: `artifacts/map-${id}-${level}-3d.png` });
      await page.click('[data-map-mode="2d"]');
    }
  }
  assert.match(
    await page.locator("#map-inspector").textContent(),
    /建筑环境来自外部模型/,
  );
  await page.screenshot({ path: "artifacts/map-campus-2d.png" });
  await page.click('[data-map-id="hotel"]');
  await page.waitForFunction(
    () => document.querySelector("#map-name").textContent === "酒店",
  );
  await page.locator('[data-layer="models"]').check();
  await page.locator('[data-layer="labels"]').check();
  await page.selectOption("#map-graph", "0");
  await page.screenshot({ path: "artifacts/map-hotel-zh.png" });
  // Force an old map response to arrive after a new selection.
  await page.route("**/office.json", async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ response });
  });
  await page.click('[data-map-id="office"]');
  await page.click('[data-map-id="clinic"]');
  await page.waitForFunction(
    () => document.querySelector("#map-name").textContent === "诊所",
  );
  await page.waitForTimeout(900);
  assert.equal(await page.locator("#map-name").textContent(), "诊所");
  await page.unroute("**/office.json");
  await page.route("**/office.json", (r) =>
    r.fulfill({ status: 500, body: "unavailable" }),
  );
  await page.click('[data-map-id="office"]');
  await page.waitForFunction(() =>
    document.querySelector("#map-status").textContent.includes("HTTP 500"),
  );
  assert.equal(await page.locator("#map-name").textContent(), "诊所");
  assert.ok(await page.locator("#map-viewport svg").isVisible());
  await page.unroute("**/office.json");
  await page.click("#map-language");
  assert.equal(await page.locator("#map-name").textContent(), "Clinic");
  await page.screenshot({ path: "artifacts/map-clinic-en.png" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Overflow at ${width}`,
    );
    await page.screenshot({
      path: `artifacts/map-mobile-${width}.png`,
      fullPage: true,
    });
  }
  assert.equal(
    (await page.request.get(`${base}/assets/maps/rmf/hotel.json`)).headers()[
      "content-type"
    ],
    "application/json; charset=utf-8",
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    "Maps PASS: 5 maps / 8 floors, 2D/3D, graph/layers, unavailable sixth, stale/failed loads, zh/en, 390/320px, no external requests",
  );
} finally {
  await browser.close();
}
