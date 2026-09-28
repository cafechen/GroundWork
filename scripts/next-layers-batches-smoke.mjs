import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL;
if (!base) throw Error("Explicit isolated test BASE_URL required");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [];
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  async function count(locator, expected) {
    // Radix closes a portal asynchronously; wait for the accessible map to return.
    const deadline = Date.now() + 10000;
    let actual;
    do {
      actual = await locator.count();
      if (actual === expected) return;
      await page.waitForTimeout(50);
    } while (Date.now() < deadline);
    assert.equal(actual, expected);
  }
  const get = async (p) => {
    const r = await page.request.get(base + p);
    assert.ok(r.ok(), await r.text());
    return r.json();
  };
  await page.goto(base + "/maps");
  const catalog = await get("/api/platform"),
    maps = catalog.maps.filter((m) =>
      ["hotel", "office", "airport_terminal", "clinic", "campus"].includes(
        m.data.id,
      ),
    );
  assert.equal(maps.length, 5);
  for (const map of maps) {
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: map.name, exact: true }) });
    await row.getByRole("button", { name: "查看", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("地图图层与导航图", { exact: true }).click();
    for (const level of map.data.levels) {
      await dialog
        .getByRole("combobox", { name: "楼层 / Floor", exact: true })
        .click();
      await page.getByRole("option", { name: level.id, exact: true }).click();
      await dialog.getByRole("button", { name: "2D", exact: true }).click();
      await dialog
        .getByRole("combobox", { name: "导航图", exact: true })
        .click();
      await page.getByRole("option", { name: "全部", exact: true }).click();
      const svg = dialog.getByRole("img", { name: "园区地图" });
      await svg.waitFor({ state: "visible" });
      await count(svg.locator("[data-layer=lane]"), level.lanes.length);
      await count(svg.locator("[data-layer=door]"), level.doors.length);
      await count(
        svg.locator("[data-layer=lift]"),
        map.data.lifts.filter((l) => l.levels.includes(level.id)).length,
      );
      await count(svg.locator("[data-layer=model]"), level.models.length);
      await dialog
        .getByRole("checkbox", { name: "站点名称", exact: true })
        .check();
      await count(
        svg.locator("[data-layer=label]"),
        level.vertices.filter((v) => v.name).length,
      );
      const graph = [...new Set(level.lanes.map((l) => l.graph))][0];
      if (graph !== undefined) {
        await dialog
          .getByRole("combobox", { name: "导航图", exact: true })
          .click();
        await page
          .getByRole("option", { name: `Graph ${graph}`, exact: true })
          .click();
        await count(
          svg.locator("[data-layer=lane]"),
          level.lanes.filter((l) => l.graph === graph).length,
        );
      }
      await dialog.getByRole("button", { name: "3D", exact: true }).click();
      await dialog.locator("canvas").waitFor();
      const scene = dialog.getByTestId("map-3d");
      assert.equal(
        Number(await scene.getAttribute("data-lanes")),
        level.lanes.filter((l) => graph === undefined || l.graph === graph)
          .length,
      );
      for (const name of ["门与电梯", "模型位置", "导航路线", "墙体"])
        await dialog.getByRole("checkbox", { name, exact: true }).uncheck();
      assert.equal(await scene.getAttribute("data-doors"), "0");
      assert.equal(await scene.getAttribute("data-lifts"), "0");
      assert.equal(await scene.getAttribute("data-models"), "0");
      assert.equal(await scene.getAttribute("data-lanes"), "0");
      for (const name of ["门与电梯", "模型位置", "导航路线", "墙体"])
        await dialog.getByRole("checkbox", { name, exact: true }).check();
      await page.screenshot({
        path: `artifacts/next-layers-${map.data.id}-${level.id}.png`,
      });
    }
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
  assert.deepEqual(
    (await get("/api/platform")).maps,
    catalog.maps,
    "Display controls must not mutate map data",
  );
  await page.goto(base + "/workbench");
  const history = await get("/api/batches");
  let completed;
  for (const m of history) {
    const b = await get(`/api/batches/${m.id}`);
    if (b.summary.evaluatedPairs === 6) {
      completed = b;
      break;
    }
  }
  assert.ok(
    completed,
    "Run batch.integration.js first to generate verified worker evidence",
  );
  const panel = page.getByTestId("batch-panel");
  const select = async (id) => {
    await panel.getByRole("combobox").click();
    await page
      .getByRole("option")
      .filter({ hasText: id.slice(0, 8) })
      .click();
  };
  await select(completed.manifest.id);
  await panel
    .getByTestId("batch-progress")
    .filter({ hasText: "6/6" })
    .waitFor();
  assert.equal(await panel.locator("tbody tr").count(), 6);
  for (const name of ["JSON", "CSV", "批次报告"]) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      panel.getByRole("button", { name, exact: true }).click(),
    ]);
    assert.equal(await download.failure(), null);
    await download.saveAs(`artifacts/next-${download.suggestedFilename()}`);
  }
  await page.screenshot({
    path: "artifacts/next-batch-zh.png",
    fullPage: true,
  });
  const response = page.waitForResponse(
    (r) => r.url() === base + "/api/batches" && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "6 组配对回归（12 次）", exact: true })
    .click();
  const r = await response;
  assert.ok(r.ok(), await r.text());
  const created = await r.json();
  await panel
    .getByRole("button", { name: "取消未完成任务", exact: true })
    .click();
  await page.waitForFunction(async (id) => {
    const r = await fetch("/api/batches/" + id);
    return (await r.json()).summary.cancelled === 12;
  }, created.manifest.id);
  await page.reload();
  await panel
    .getByRole("combobox")
    .filter({ hasText: created.manifest.id.slice(0, 8) })
    .waitFor();
  assert.equal(
    (await get(`/api/batches/${created.manifest.id}`)).summary.evaluatedPairs,
    0,
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await select(completed.manifest.id);
  await panel
    .getByTestId("batch-progress")
    .filter({ hasText: "Compared 6/6" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "artifacts/next-batch-mobile-en.png",
    fullPage: true,
  });
  await panel.screenshot({ path: "artifacts/next-batch-panel-mobile-en.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "No page-level horizontal overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      maps: maps.length,
      batch: completed.manifest.id,
      cancelled: created.manifest.id,
      errors,
    }),
  );
} finally {
  await browser.close();
}
