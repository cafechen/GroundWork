import assert from "node:assert/strict";
import { readyYard } from "../examples/ready-yard.mjs";
import { schemas } from "../server/platform-contracts.mjs";
import { PlatformStore } from "../server/platform-store.mjs";
import { compileParkRun, simulatePark } from "../server/park-simulation.mjs";

const fixture = readyYard(),
  records = {};
for (const [kind, key, id] of [
  ["maps", "map", "demo-map"],
  ["models", "model", "demo-model"],
  ["parks", "park", "demo-park"],
])
  records[id] = {
    id,
    kind,
    version: 1,
    archived: false,
    ...fixture[key],
    data: schemas[kind].parse(fixture[key].data),
  };
records["demo-gateway"] = {
  id: "demo-gateway",
  kind: "gateways",
  archived: false,
  data: {
    adapter: "simulation",
    channels: [{ name: "state" }, { name: "events" }],
  },
};
const store = {
  get(kind, id, version) {
    const r = records[id];
    assert.ok(r && r.kind === kind && (!version || version === r.version));
    return r;
  },
  validatePark(p) {
    PlatformStore.prototype.validatePark.call(this, p);
  },
};
const request = compileParkRun(store, "demo-park", {
    version: 1,
    taskId: "demo-delivery",
  }),
  result = simulatePark(request);
function verify(r) {
  assert.equal(r.verdict, "COMPLETED");
  assert.equal(r.metrics.completed, 1);
  assert.equal(r.metrics.contactEpisodes, 0);
  assert.ok(r.metrics.distanceM > 50);
  assert.ok(r.frames.some((f) => f.actors[0].yaw > 2.8));
  for (const f of r.frames)
    for (const b of f.bodies)
      for (const p of b.polygon)
        assert.ok(
          p.x > 0 && p.x < 40 && p.y > 0 && p.y < 32,
          "All body footprints inside yard",
        );
  assert.ok(
    r.frames.some(
      (f) =>
        f.actors[0].x > 16 && f.actors[0].x < 19 && f.actors[0].speed <= 0.61,
    ),
    "Slow zone actually changes speed",
  );
}
verify(result);
assert.deepEqual(result, simulatePark(request));
console.log(
  JSON.stringify(
    {
      preflight: "PASS",
      metrics: result.metrics,
      completion: result.events.find((e) => e.type === "task-completed"),
    },
    null,
    2,
  ),
);
if (process.argv.includes("--apply")) {
  const base = process.env.BASE_URL;
  if (!base) throw Error("Explicit BASE_URL required for writes");
  const api = async (p, data) => {
    const r = await fetch(
      base + p,
      data === undefined
        ? {}
        : {
            method: "POST",
            headers: { Origin: base, "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
    );
    const v = await r.json();
    if (!r.ok) throw Error(JSON.stringify(v));
    return v;
  };
  const inventory = await api("/api/platform");
  if (inventory.parks.some((p) => p.name === fixture.park.name && !p.archived))
    throw Error("Demo already exists; refusing duplicate or overwrite");
  const before = inventory.parks.find(
    (p) => p.name === "亚朵场景" && !p.archived,
  );
  const gateway = inventory.gateways.find(
    (g) =>
      !g.archived &&
      g.data.adapter === "simulation" &&
      ["state", "events"].every((n) =>
        g.data.channels.some((c) => c.name === n),
      ),
  );
  if (!gateway)
    throw Error("Local simulation gateway with state/events required");
  const map = await api("/api/platform/maps", fixture.map);
  console.log("Created map", map.id);
  const model = await api("/api/platform/models", fixture.model);
  console.log("Created model", model.id);
  const payload = readyYard({
    mapId: map.id,
    modelId: model.id,
    gatewayId: gateway.id,
  }).park;
  const park = await api("/api/platform/parks", payload);
  console.log("Created park", park.id);
  const job = await api(`/api/platform/parks/${park.id}/runs`, {
    version: park.version,
    taskId: "demo-delivery",
  });
  let finished = false;
  for (let n = 0; n < 60; n++) {
    const j = await api(`/api/runs/${job.id}`);
    if (j.status === "completed") {
      const r = await api(`/api/runs/${job.id}/result`);
      verify(r);
      console.log(
        JSON.stringify(
          {
            parkId: park.id,
            jobId: job.id,
            url: `${base}/#parks/${park.id}/control`,
            metrics: r.metrics,
            verdict: r.verdict,
          },
          null,
          2,
        ),
      );
      finished = true;
      break;
    }
    if (!["queued", "running"].includes(j.status))
      throw Error(JSON.stringify(j));
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.ok(finished, "Timed out waiting for demo");
  if (before)
    assert.deepEqual(
      await api(`/api/platform/parks/${before.id}`),
      before,
      "Existing user park must remain unchanged",
    );
}
