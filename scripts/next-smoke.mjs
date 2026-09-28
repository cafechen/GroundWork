import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { readyYard } from "../examples/ready-yard.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL;
if (!base)
  throw Error("Explicit BASE_URL for an isolated test deployment required");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ["--enable-unsafe-swiftshader"],
});
await mkdir("artifacts", { recursive: true });
const suffix = Date.now(),
  errors = [],
  external = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("blob:"))
      external.push(r.url());
  });
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
  const map = await api("/api/platform/maps", {
    ...readyYard().map,
    name: `QA map ${suffix}`,
  });
  await page.goto(base);
  await page.getByRole("heading", { name: "从场景到可复现证据" }).waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "主菜单" })
      .getByRole("link")
      .count(),
    5,
  );
  await page.screenshot({
    path: "artifacts/next-overview-zh.png",
    fullPage: true,
  });
  console.log("Overview verified");
  await page
    .getByRole("link", { name: "设备模型", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill(`QA tugger ${suffix}`);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const catalog = await api("/api/platform"),
    model = catalog.models.find((m) => m.name === `QA tugger ${suffix}`);
  assert.ok(model);
  console.log("Model created");
  await page.getByRole("link", { name: "园区管理", exact: true }).click();
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByLabel("名称", { exact: true }).fill(`QA park ${suffix}`);
  await page.getByLabel(`QA map ${suffix} · v1`, { exact: true }).check();
  await page.getByLabel(`QA tugger ${suffix} · v1`, { exact: true }).check();
  await page
    .getByLabel("本地仿真网关 / Local simulation · v1", { exact: true })
    .check();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("row")
    .filter({ hasText: `QA park ${suffix}` })
    .getByRole("link", { name: "进入园区" })
    .click();
  console.log("Park created");
  await page.getByRole("link", { name: "场景编辑", exact: true }).click();
  await page.getByRole("combobox", { name: "绘图工具" }).click();
  await page.getByRole("option", { name: "route", exact: true }).click();
  const pick = async (x, y) => {
    const position = await page.getByRole("img", { name: "园区地图" }).evaluate(
      (svg, p) => {
        const q = svg.createSVGPoint();
        q.x = p.x;
        q.y = -p.y;
        const screen = q.matrixTransform(svg.getScreenCTM());
        return { x: screen.x, y: screen.y };
      },
      { x, y },
    );
    await page.mouse.click(position.x, position.y);
  };
  await pick(8, 6);
  await pick(24, 6);
  await page.getByRole("button", { name: "完成路线 (2)" }).click();
  await page.getByLabel("名称", { exact: true }).fill(`QA route ${suffix}`);
  await page.getByRole("button", { name: "应用到草稿" }).click();
  await page.getByRole("button", { name: "保存场景", exact: true }).click();
  await page.waitForFunction(
    () => !document.body.textContent.includes("有未保存修改"),
  );
  console.log("Route saved");
  await page.getByRole("link", { name: "设备实例", exact: true }).click();
  await page.getByRole("button", { name: "创建设备实例" }).click();
  await page.getByLabel("名称", { exact: true }).fill(`QA vehicle ${suffix}`);
  await page
    .getByRole("button", { name: `使用路线起点：QA route ${suffix}` })
    .click();
  // Pointer coordinates are rasterized by the browser; the route-start action
  // must copy the actual saved point exactly, not the ideal requested pixel.
  const current = (await api("/api/platform")).parks.find(
    (p) => p.name === `QA park ${suffix}`,
  );
  const start = current.data.objects.find(
    (o) => o.name === `QA route ${suffix}`,
  ).points[0];
  assert.equal(
    Number(await page.getByLabel("x / m", { exact: true }).inputValue()),
    start[0],
  );
  assert.equal(
    Number(await page.getByLabel("y / m", { exact: true }).inputValue()),
    start[1],
  );
  await page.getByRole("button", { name: "保存设备" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log("Device created");
  await page.getByRole("link", { name: "作业管理", exact: true }).click();
  await page.getByRole("button", { name: "创建任务" }).click();
  await page.getByLabel("名称", { exact: true }).fill(`QA task ${suffix}`);
  await page.getByRole("button", { name: "保存任务" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  console.log("Task created");
  await page.getByRole("button", { name: "开始仿真" }).click();
  await page
    .getByRole("cell", { name: "COMPLETED", exact: true })
    .waitFor({ timeout: 30000 });
  console.log("Simulation completed");
  await page.getByRole("link", { name: "控制面板", exact: true }).click();
  await page.getByRole("button", { name: "回放", exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector("input[type=range]")?.value) > 3,
  );
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.screenshot({
    path: "artifacts/next-replay-2d-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.locator("canvas").waitFor();
  await page.screenshot({
    path: "artifacts/next-replay-3d-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("link", { name: "Analytics", exact: true }).click();
  await page.getByRole("heading", { name: "Metrics", exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/next-analytics-en.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "Device models", exact: true }).click();
  await page
    .getByRole("heading", { name: "Device models", exact: true })
    .waitFor();
  await page.screenshot({
    path: "artifacts/next-mobile-en.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      map: map.id,
      model: model.id,
      suffix,
      errors,
      external,
    }),
  );
} finally {
  await browser.close();
}
