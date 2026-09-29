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
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  const capture = async (options) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ ...options, animations: "disabled" });
  };
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  const api = async (p, data) => {
    const r =
      data === undefined
        ? await page.request.get(base + p)
        : await page.request.post(base + p, {
            headers: { Origin: base },
            data,
          });
    assert.ok(r.ok(), await r.text());
    return r.json();
  };
  await page.goto(base + "/maps");
  const catalog = await api("/api/platform");
  const maps = catalog.maps.filter((m) =>
    ["hotel", "office", "airport_terminal", "clinic", "campus"].includes(
      m.data.id,
    ),
  );
  assert.equal(maps.length, 5);
  for (const { name } of maps) {
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name, exact: true }) });
    await row.waitFor();
    assert.equal(await row.count(), 1);
    await row.getByRole("button", { name: "查看", exact: true }).click();
    await page.getByRole("img", { name: "园区地图" }).waitFor();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page.locator("canvas").waitFor();
    await capture({ path: `artifacts/next-map-${name}.png` });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
  }
  console.log("Map previews verified");
  await page.goto(base + "/workbench");
  await page
    .getByRole("heading", { name: "独立实验室", exact: true })
    .waitFor();
  const ids = [];
  for (const engine of ["yard", "road"]) {
    if (engine === "road") {
      await page.getByRole("combobox", { name: "引擎", exact: true }).click();
      await page.getByRole("option", { name: "road", exact: true }).click();
      await page
        .getByRole("button", { name: "生成模板方案", exact: true })
        .click();
    }
    const response = page.waitForResponse(
      (r) => r.url() === base + "/api/runs" && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "运行实验", exact: true }).click();
    const r = await response;
    assert.ok(r.ok(), await r.text());
    const job = await r.json();
    ids.push(job.id);
    let status;
    const deadline = Date.now() + 45000;
    do {
      status = await api("/api/runs/" + job.id);
      if (["completed", "failed", "interrupted"].includes(status.status)) break;
      await new Promise((r) => setTimeout(r, 500));
    } while (Date.now() < deadline);
    assert.equal(status.status, "completed");
    const line = page
      .locator("div.border-b")
      .filter({ hasText: job.id.slice(0, 8) });
    await line.getByRole("button", { name: "回放", exact: true }).click();
    const evidence = await api(`/api/runs/${job.id}/result`);
    await page.getByText(`${evidence.verdict} · ${evidence.validity}`, {exact:true}).waitFor();
    await page.waitForFunction(
      () => Number(document.querySelector("input[type=range]")?.value) > 3,
    );
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page.locator("canvas").waitFor();
    await capture({
      path: `artifacts/next-lab-${engine}.png`,
      fullPage: true,
    });
    for (const action of ["report", "xosc", "rmf", "sdf"])
      assert.ok(
        (await page.request.get(`${base}/api/runs/${job.id}/${action}`)).ok(),
      );
  }
  await page.getByRole("combobox", { name: "引擎", exact: true }).click();
  await page.getByRole("option", { name: "chrono", exact: true }).click();
  const caps = await api("/api/capabilities");
  if (!caps.engines.chrono)
    assert.equal(
      await page
        .getByRole("button", { name: "运行实验", exact: true })
        .isDisabled(),
      true,
    );
  await page.goto(base + "/classic");
  await page
    .getByRole("heading", { name: "经典实验室", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "引擎", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page
    .getByRole("heading", { name: "Classic laboratory", exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture({
    path: "artifacts/next-classic-mobile-en.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: "PASS", ids, errors }));
} finally {
  await browser.close();
}
