import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL;
if (!base) throw Error("Explicit BASE_URL required");
const get = async (p) => {
  const r = await fetch(base + p);
  assert.ok(r.ok);
  return r.json();
};
const park = (await get("/api/platform/parks")).find(
  (p) => p.name === "可运行示例 · 牵引车物流园" && !p.archived,
);
assert.ok(park);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/#parks/${park.id}/control`);
  await page.locator("[data-action=replay]").first().click();
  await page.waitForSelector("#run-details strong");
  assert.equal(
    await page.locator("#run-details strong").textContent(),
    "COMPLETED",
  );
  const shape = () =>
    page
      .locator("[data-business-overlay] polygon")
      .evaluateAll((ps) => ps.map((p) => p.getAttribute("points")).join("|"));
  const before = await shape();
  assert.ok(before);
  await page.click("[data-action=play]");
  await page.waitForFunction(
    () => Number(document.querySelector("#park-timeline").value) > 15,
  );
  assert.notEqual(
    await shape(),
    before,
    "Vehicle polygons must move during playback",
  );
  await page.click("[data-action=play]");
  await page.locator("#park-timeline").fill("300");
  await page.locator("#park-timeline").dispatchEvent("input");
  assert.notEqual(await shape(), before);
  await page.click('[data-action=mode][data-id="3d"]');
  await page.waitForSelector("#park-viewport canvas");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/ready-yard-demo-3d.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      browser: "PASS",
      parkId: park.id,
      operations: `${base}/#parks/${park.id}/operations`,
      verified:
        "real playback changes vehicle polygons; 30 s seek and 3D render",
      errors,
    }),
  );
} finally {
  await browser.close();
}
