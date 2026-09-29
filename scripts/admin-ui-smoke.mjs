import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL;
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw Error("Explicit isolated loopback BASE_URL required");
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ["--enable-unsafe-swiftshader"],
});
await mkdir("artifacts/admin-ui", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    external = [];
  const capture = async (options) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ ...options, animations: "disabled" });
  };
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(base) && !r.url().startsWith("blob:"))
      external.push(r.url());
  });
  await page.goto(base);
  await page.getByRole("heading", { name: "总览", exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "园区工作空间", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("navigation", { name: "主菜单", exact: true })
      .getByRole("link")
      .count(),
    5,
  );
  await capture({
    path: "artifacts/admin-ui/overview-light-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换侧栏", exact: true }).click();
  await page.locator('[data-slot="sidebar"][data-state="collapsed"]').waitFor();
  await page.getByRole("button", { name: "切换深色模式", exact: true }).click();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.reload();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains("dark"),
  );
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await capture({
    path: "artifacts/admin-ui/overview-dark-en.png",
    fullPage: true,
  });
  await page.goto(base + "/maps");
  await page.getByRole("heading", { name: "Maps", exact: true }).waitFor();
  const response = await page.request.get(base + "/api/platform");
  assert.equal(response.status(), 200);
  const data = await response.json();
  const name = data.maps.find((m) => m.data.id === "hotel").name;
  await page
    .getByRole("searchbox", { name: "Search resources", exact: true })
    .fill(name);
  await page.getByRole("cell", { name, exact: true }).waitFor();
  assert.equal(await page.getByRole("row").count(), 2);
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("img", { name: "Park map", exact: true }).waitFor();
  await capture({
    path: "artifacts/admin-ui/map-dark-en.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("searchbox", { name: "Search resources", exact: true })
    .fill("no-such-fixture-20260929");
  await page
    .getByText("No matching resources. Adjust filters or create one.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.getByRole("row").count(), 1);
  await page
    .getByRole("searchbox", { name: "Search resources", exact: true })
    .fill("");
  await page
    .getByRole("combobox", { name: "Resource state", exact: true })
    .click();
  await page.getByRole("option", { name: "Archived", exact: true }).click();
  await page.getByRole("columnheader", { name: "Name", exact: true }).waitFor();
  const archivedCount = data.maps.filter((map) => map.archived).length;
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll("main tbody tr").length === expected,
    archivedCount,
  );
  assert.equal(await page.getByRole("row").count(), archivedCount + 1);
  await page
    .getByRole("combobox", { name: "Resource state", exact: true })
    .click();
  await page.getByRole("option", { name: "All", exact: true }).click();
  await page.getByRole("columnheader", { name: "Name", exact: true }).waitFor();
  await page.waitForFunction(
    (expected) =>
      document.querySelectorAll("main tbody tr").length === expected,
    data.maps.length,
  );
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains("dark"),
  );
  await capture({
    path: "artifacts/admin-ui/maps-light-en.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Toggle sidebar", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await drawer.waitFor();
  await capture({
    path: "artifacts/admin-ui/mobile-drawer-en.png",
    fullPage: false,
  });
  await drawer
    .getByRole("link", { name: "Device models", exact: true })
    .click();
  await drawer.waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: "Device models", exact: true })
    .waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Mobile must not overflow horizontally",
  );
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.getByRole("heading", { name: "设备模型", exact: true }).waitFor();
  await capture({
    path: "artifacts/admin-ui/mobile-models-zh.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换侧栏", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "切换侧栏", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    JSON.stringify({
      result: "PASS",
      coverage:
        "template shell, collapse, mobile drawer, themes, locale, filters, map dialog, no external requests",
      errors,
      external,
    }),
  );
} finally {
  await browser.close();
}
