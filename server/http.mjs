import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { JobStore } from "./jobs.mjs";
import { planContext, defaultPlan, modelPlan } from "./planning.mjs";
import { compareResults, reportHtml } from "./domain.mjs";
import { exportRmfGraph, exportSdf, exportXosc } from "./exports.mjs";
import { PlatformStore, PlatformError } from "./platform-store.mjs";
import { compileParkRun } from "./park-simulation.mjs";
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 4173),
  host = process.env.HOST || "127.0.0.1";
const allowedHosts = new Set([
  "127.0.0.1",
  "localhost",
  ...(process.env.GROUNDWORK_ALLOWED_HOSTS || "").split(",").filter(Boolean),
]);
let python = process.env.GROUNDWORK_CHRONO_PYTHON || "";
if (python) {
  try {
    await access(python);
  } catch {
    python = "";
  }
}
const jobs = new JobStore(
  path.resolve(process.env.GROUNDWORK_DATA || path.join(root, "data/runs")),
  python,
);
await jobs.init();
const platform = new PlatformStore(
  path.resolve(
    process.env.GROUNDWORK_PLATFORM_DB ||
      path.join(jobs.directory, "../platform.sqlite"),
  ),
);
await platform.init();
const json = (res, status, value) => {
  res
    .writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    .end(JSON.stringify(value));
};
async function body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("Content-Type must be application/json");
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (
      Buffer.byteLength(text) >
      (req.url.startsWith("/api/platform") ? 4 : 1) * 1024 * 1024
    )
      throw Error("Request exceeds size limit");
  }
  return JSON.parse(text);
}
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".yaml": "text/plain",
  ".txt": "text/plain",
};
const server = createServer(async (req, res) => {
  try {
    const authority = req.headers.host || "";
    if (!allowedHosts.has(authority.split(":")[0])) {
      json(res, 403, { error: "Host is not allowed" });
      return;
    }
    const url = new URL(req.url, `http://${authority}`),
      pathname = decodeURIComponent(url.pathname);
    if (
      req.method === "POST" &&
      (req.headers.origin !== `http://${authority}` ||
        ["cross-site", "none"].includes(req.headers["sec-fetch-site"]))
    ) {
      json(res, 403, { error: "Same-origin browser request required" });
      return;
    }
    if (pathname.startsWith("/api/")) {
      if (pathname.startsWith("/api/platform")) {
        if (req.method === "GET" && pathname === "/api/platform") {
          const summary = {};
          for (const kind of ["maps", "models", "gateways", "parks"])
            summary[kind] = platform
              .list(kind)
              .map((r) =>
                kind === "maps"
                  ? {
                      ...r,
                      data: {
                        name: r.data.name,
                        levels: r.data.levels.map((l) => ({
                          id: l.id,
                          elevation: l.elevation,
                        })),
                        source: r.data.source,
                      },
                    }
                  : r,
              );
          json(res, 200, {
            ...summary,
            audit: platform.audit(),
            security: "trusted-lan-no-auth",
            unavailableMap: "Manufacturing & Logistics",
          });
          return;
        }
        const route =
          /^\/api\/platform\/(maps|models|gateways|parks)(?:\/([a-zA-Z0-9_-]{1,80}))?(?:\/(versions|archive|clone|runs))?$/.exec(
            pathname,
          );
        if (!route) {
          json(res, 404, { error: "Unknown platform route" });
          return;
        }
        const [, kind, id, action] = route;
        if (req.method === "GET") {
          if (action === "runs" && kind === "parks") {
            platform.get(kind, id);
            json(
              res,
              200,
              jobs.list().filter((j) => j.parkId === id),
            );
            return;
          }
          if (action === "versions" && id) {
            json(res, 200, platform.history(kind, id));
            return;
          }
          if (!action) {
            const v = url.searchParams.get("version");
            if (v !== null && !/^[1-9]\d{0,6}$/.test(v))
              throw Error("Invalid version");
            json(
              res,
              200,
              id
                ? platform.get(kind, id, v === null ? undefined : Number(v))
                : platform.list(kind),
            );
            return;
          }
        }
        if (req.method === "POST") {
          const input = await body(req);
          if (action === "runs" && kind === "parks") {
            if (
              Object.keys(input).some((k) => !["version", "taskId"].includes(k))
            )
              throw Error("Only version/taskId accepted");
            json(
              res,
              202,
              await jobs.submit(compileParkRun(platform, id, input)),
            );
            return;
          }
          if (action === "archive" && id) {
            json(res, 200, platform.archive(kind, id, input.version));
            return;
          }
          if (action === "clone" && id) {
            const old = platform.get(kind, id);
            json(
              res,
              201,
              platform.save(kind, {
                name: input.name || `${old.name} copy`,
                data: old.data,
              }),
            );
            return;
          }
          if (!action) {
            json(res, id ? 200 : 201, platform.save(kind, input, id));
            return;
          }
        }
        json(res, 405, { error: "Method not allowed" });
        return;
      }
      if (req.method === "GET" && pathname === "/api/capabilities") {
        const { map, catalog } = planContext();
        json(res, 200, {
          version: "0.2.0",
          engines: { yard: true, road: true, chrono: Boolean(python) },
          modelGateway: Boolean(process.env.GROUNDWORK_MODEL_URL),
          rmf: "export-only",
          catalog,
          plan: defaultPlan(map, catalog),
          limits: { queued: 12, jobs: 200, chronoSeconds: 180 },
          security: "Trusted LAN preview; no user authentication",
        });
        return;
      }
      if (req.method === "GET" && pathname === "/api/runs") {
        json(res, 200, jobs.list());
        return;
      }
      if (req.method === "POST" && pathname === "/api/runs") {
        const input = await body(req);
        if (input.engine === "park")
          throw new PlatformError("Use a validated park task endpoint");
        json(res, 202, await jobs.submit(input));
        return;
      }
      if (req.method === "POST" && pathname === "/api/plan") {
        const input = await body(req);
        const { map, catalog } = planContext(input.map);
        json(res, 200, { catalog, plan: defaultPlan(map, catalog) });
        return;
      }
      if (req.method === "POST" && pathname === "/api/model-plan") {
        const input = await body(req);
        json(res, 200, await modelPlan(input.prompt, input.map));
        return;
      }
      if (req.method === "POST" && pathname === "/api/compare") {
        const { baseline, candidate } = await body(req);
        json(
          res,
          200,
          compareResults(
            await jobs.result(baseline),
            await jobs.result(candidate),
          ),
        );
        return;
      }
      const match =
        /^\/api\/runs\/([a-f0-9-]{36})(?:\/(result|report|cancel|xosc|rmf|sdf))?$/.exec(
          pathname,
        );
      if (match) {
        const [, id, action] = match;
        if (req.method === "POST" && action === "cancel") {
          await body(req);
          json(res, 200, await jobs.cancel(id));
          return;
        }
        if (req.method === "GET") {
          if (!action) {
            json(res, 200, await jobs.progress(id));
            return;
          }
          const run = await jobs.result(id);
          if (action === "result") {
            json(res, 200, run);
            return;
          }
          const exporters = {
            report: () => reportHtml(run),
            xosc: () => exportXosc(run),
            rmf: () => JSON.stringify(exportRmfGraph(run), null, 2),
            sdf: () => exportSdf(run),
          };
          if (exporters[action]) {
            const content = exporters[action]();
            res
              .writeHead(200, {
                "Content-Type":
                  action === "report"
                    ? "text/html; charset=utf-8"
                    : "application/octet-stream",
                "Content-Disposition": `attachment; filename="groundwork-${id}.${{ report: "html", xosc: "xosc", rmf: "json", sdf: "sdf" }[action]}"`,
                "X-Content-Type-Options": "nosniff",
              })
              .end(content);
            return;
          }
        }
      }
      json(res, 404, { error: "Unknown API route" });
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    let relative =
      pathname === "/"
        ? "platform.html"
        : pathname === "/workbench"
          ? "workbench.html"
          : pathname === "/classic"
            ? "index.html"
            : pathname === "/maps"
              ? "maps.html"
              : pathname.slice(1);
    if (relative === "vendor/three.js")
      relative = "node_modules/three/build/three.module.js";
    else if (relative === "vendor/three.core.js")
      relative = "node_modules/three/build/three.core.js";
    const allowed =
      [
        "index.html",
        "workbench.html",
        "maps.html",
        "platform.html",
        "node_modules/three/build/three.module.js",
        "node_modules/three/build/three.core.js",
      ].includes(relative) || /^(src|assets)\//.test(relative);
    const target = path.resolve(root, relative);
    if (
      !allowed ||
      !target.startsWith(root + path.sep) ||
      relative.split("/").some((p) => p.startsWith("."))
    ) {
      res.writeHead(404).end("Not found");
      return;
    }
    let content;
    try {
      content = await readFile(target);
    } catch {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": `${types[path.extname(target)] || "application/octet-stream"}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    json(res, error.status || 400, { error: error.message });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, host, () =>
  console.log(`GroundWork → http://${host}:${port} · standalone workbench`),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await jobs.close();
    platform.close();
    server.close(() => process.exit(0));
  });
