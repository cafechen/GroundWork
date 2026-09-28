import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:4180";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
await mkdir("artifacts", { recursive: true });
const created = [];
const suffix = Date.now();
try {
  const page = await browser.newPage({
      viewport: { width: 1536, height: 1000 },
    }),
    errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("blob:"))
      external.push(r.url());
  });
  await page.goto(base);
  await page.waitForSelector('[data-action="new"][data-id="parks"]');
  assert.equal(await page.locator(".sidebar nav a").count(), 5);
  await page.screenshot({ path: "artifacts/platform-overview-zh.png" });
  const action = async (a, id) =>
    page.click(`[data-action="${a}"]${id ? `[data-id="${id}"]` : ""}`);
  const fill = async (n, v) =>
    page.locator(`#edit-form [name="${n}"]`).fill(String(v));
  const submit = async () => {
    await page.click("#edit-form button[type=submit]");
    await page.waitForFunction(() => !document.querySelector("#dialog").open);
  };
  const api = async (url, input) => {
    const r =
      input === undefined
        ? await page.request.get(base + url)
        : await page.request.post(base + url, {
            headers: { Origin: base },
            data: input,
          });
    assert.ok(r.ok(), await r.text());
    return r.json();
  };
  let inventory = await api("/api/platform");
  const initial = inventory.maps.length;
  await page.click('.sidebar a[href="#maps"]');
  await action("new", "maps");
  await fill("name", `QA synthetic yard ${suffix}`);
  await submit();
  inventory = await api("/api/platform");
  const map = inventory.maps.find(
    (m) => m.name === `QA synthetic yard ${suffix}`,
  );
  created.push(["maps", map.id]);
  assert.equal(inventory.maps.length, initial + 1);
  await action("preview", map.id);
  await page.waitForSelector("#asset-preview svg");
  await page.click("#dialog-cancel");
  await page.click('.sidebar a[href="#models"]');
  await action("new", "models");
  await fill("name", `QA tugger ${suffix}`);
  await submit();
  inventory = await api("/api/platform");
  const model = inventory.models.find((m) => m.name === `QA tugger ${suffix}`);
  created.push(["models", model.id]);
  await action("edit", `models:${model.id}`);
  await fill("maxSpeed", 1.5);
  await submit();
  assert.equal((await api(`/api/platform/models/${model.id}`)).version, 2);
  await page.click('.sidebar a[href="#gateways"]');
  await action("new", "gateways");
  await fill("name", `QA external gateway ${suffix}`);
  await fill("endpoint", "https://example.invalid/robot");
  await submit();
  inventory = await api("/api/platform");
  const externalGateway = inventory.gateways.find(
    (g) => g.name === `QA external gateway ${suffix}`,
  );
  created.push(["gateways", externalGateway.id]);
  const gateway = inventory.gateways.find(
    (g) => g.data.adapter === "simulation" && !g.archived,
  );
  await page.click('.sidebar a[href="#parks"]');
  await action("new", "parks");
  await fill("name", `QA park ${suffix}`);
  for (const [kind, id] of [
    ["maps", map.id],
    ["maps", inventory.maps[0].id],
    ["models", model.id],
    ["gateways", gateway.id],
    ["gateways", externalGateway.id],
  ])
    await page.check(`#edit-form [name="${kind}"][value="${id}"]`);
  await submit();
  await page.waitForSelector(".tabs");
  inventory = await api("/api/platform");
  const park = inventory.parks.find((p) => p.name === `QA park ${suffix}`);
  created.unshift(["parks", park.id]);
  assert.equal(park.data.maps.length, 2);
  assert.equal(park.data.models[0].version, 2);
  const tab = async (id) => {
    await page.click(`.tabs a[href="#parks/${park.id}/${id}"]`);
  };
  await tab("scene");
  await page.waitForSelector("#park-viewport svg");
  await page.selectOption("#park-map", map.id);
  await page.waitForSelector(`#park-viewport[data-map-id="${map.id}"] svg`);
  await page.selectOption("#draw-tool", "route");
  const pick = async (x, y) => {
    const p = await page.locator("#park-viewport svg").evaluate(
      (svg, [x, y]) => {
        const p = new DOMPoint(x, -y).matrixTransform(svg.getScreenCTM());
        return { x: p.x, y: p.y };
      },
      [x, y],
    );
    await page.mouse.click(p.x, p.y);
  };
  await pick(8, 10);
  await pick(28, 10);
  await action("finish-route");
  await fill("name", "QA route");
  await fill("points", "[[8,10],[28,10]]");
  await submit();
  await action("save-park");
  await page.waitForFunction(() =>
    document.querySelector("#scene-inspector").textContent.includes("已保存"),
  );
  await page.selectOption("#draw-tool", "charging");
  await pick(35, 20);
  await fill("name", "QA charger");
  await submit();
  // Unsaved park navigation must not silently discard the scene.
  page.once("dialog", (d) => d.dismiss());
  await page.click('.sidebar a[href="#overview"]');
  await page.waitForURL("**/scene");
  await action("undo");
  assert.equal(
    await page
      .locator("#scene-inspector")
      .getByText("QA charger", { exact: true })
      .count(),
    0,
  );
  await action("redo");
  await page.waitForSelector("#scene-inspector");
  await action("save-park");
  await tab("devices");
  await action("device-new");
  await fill("name", "QA virtual tugger");
  await page.selectOption("#edit-form [name=map]", map.id);
  await page.selectOption("#edit-form [name=gateway]", gateway.id);
  await fill("x", 8);
  await fill("y", 10);
  await fill("channels", '["state","events"]');
  await submit();
  await tab("operations");
  await action("task-new");
  await fill("name", "QA transport");
  await fill("duration", 30);
  await submit();
  await action("run-task");
  await page.waitForSelector("#run-details strong", { timeout: 30000 });
  assert.equal(
    await page.locator("#run-details strong").textContent(),
    "COMPLETED",
  );
  await page.waitForFunction(
    () => Number(document.querySelector("#park-timeline").value) > 0,
  );
  await action("play");
  await page.screenshot({ path: "artifacts/platform-control-zh.png" });
  await action("mode", "3d");
  assert.ok(await page.locator("#park-viewport canvas").isVisible());
  await page.screenshot({ path: "artifacts/platform-control-3d.png" });
  const records = await api(`/api/platform/parks/${park.id}/runs`),
    result = await api(`/api/runs/${records[0].id}/result`);
  assert.equal(result.request.snapshot.mapId, map.id);
  assert.equal(result.request.snapshot.modelVersion, 2);
  assert.equal(result.frames[0].bodies.length, 3);
  const report = await page.request.get(
    `${base}/api/runs/${records[0].id}/report`,
  );
  assert.equal(report.status(), 200);
  await tab("devices");
  await action("device-new");
  await fill("name", "QA physical forklift");
  await page.selectOption("#edit-form [name=kind]", "physical");
  await page.selectOption("#edit-form [name=map]", map.id);
  await page.selectOption("#edit-form [name=gateway]", externalGateway.id);
  await fill("serial", "QA-NOT-A-REAL-DEVICE");
  await fill("channels", '["state"]');
  await submit();
  await tab("operations");
  await action("task-new");
  await fill("name", "QA physical task");
  await page.selectOption("#edit-form [name=device]", {
    label: "QA physical forklift",
  });
  await submit();
  assert.ok(
    await page.getByRole("button", { name: "实机作业未接通" }).isDisabled(),
  );
  const updated = await api(`/api/platform/parks/${park.id}`);
  const rejected = await page.request.post(
    `${base}/api/platform/parks/${park.id}/runs`,
    {
      headers: { Origin: base },
      data: {
        version: updated.version,
        taskId: updated.data.tasks.find((t) => t.name === "QA physical task")
          .id,
      },
    },
  );
  assert.equal(rejected.status(), 400);
  assert.match(await rejected.text(), /Physical devices/);
  const stale = await page.request.post(
    `${base}/api/platform/parks/${park.id}`,
    {
      headers: { Origin: base },
      data: { name: park.name, version: 1, data: updated.data },
    },
  );
  assert.equal(stale.status(), 409);
  const referenced = await page.request.post(
    `${base}/api/platform/maps/${map.id}/archive`,
    { headers: { Origin: base }, data: { version: 1 } },
  );
  assert.equal(referenced.status(), 409);
  const bypass = await page.request.post(`${base}/api/runs`, {
    headers: { Origin: base },
    data: result.request,
  });
  assert.equal(bypass.status(), 400);
  await tab("analytics");
  await page.waitForSelector("#park-body tbody tr");
  assert.match(await page.locator("#park-body").textContent(), /QA transport/);
  await page.screenshot({ path: "artifacts/platform-analytics-zh.png" });
  await action("language");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await page.waitForSelector("#park-body tbody tr");
  assert.match(await page.locator(".sidebar").textContent(), /Device models/);
  await page.screenshot({ path: "artifacts/platform-analytics-en.png" });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal document overflow",
    );
    await page.screenshot({ path: `artifacts/platform-mobile-${width}.png` });
  }
  await page.reload();
  await page.waitForSelector("#park-body tbody tr");
  assert.match(await page.locator("#park-body").textContent(), /QA transport/);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      passed: true,
      menus: 5,
      flow: "map/model/gateway → multi-map park → scene undo/redo → device → task → automatic run replay → analytics → reload",
      languages: ["zh", "en"],
      mobile: [390, 320],
      errors,
      external,
    }),
  );
  // Archive only QA-created resources; retained run evidence and unrelated data are untouched.
  for (const [kind, id] of created) {
    const r = await api(`/api/platform/${kind}/${id}`);
    await api(`/api/platform/${kind}/${id}/archive`, { version: r.version });
  }
} finally {
  await browser.close();
}
