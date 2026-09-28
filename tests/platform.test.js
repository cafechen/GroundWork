import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PlatformStore } from "../server/platform-store.mjs";
import { compileParkRun, simulatePark } from "../server/park-simulation.mjs";
import { exportSdf, exportRmfGraph, exportXosc } from "../server/exports.mjs";
test("legacy exporters cannot silently omit park walls and business objects", async (t) => {
  const { request } = await fixture(t),
    run = simulatePark(request());
  for (const exporter of [exportSdf, exportRmfGraph, exportXosc])
    assert.throws(() => exporter(run), /Park.*export/);
});
import { gatewaySchema, mapSchema } from "../server/platform-contracts.mjs";

async function fixture(t) {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "groundwork-platform-test-"),
  );
  const store = new PlatformStore(path.join(dir, "platform.sqlite"));
  await store.init();
  t.after(async () => {
    store.close();
    await rm(dir, { recursive: true, force: true });
  });
  const source = structuredClone(store.list("maps")[0].data);
  source.levels = [
    {
      id: "L1",
      elevation: 0,
      vertices: [
        [0, 0],
        [40, 0],
        [40, 30],
        [0, 30],
      ].map(([x, y], id) => ({ id, x, y, z: 0, name: "", parameters: {} })),
      walls: [],
      lanes: [],
      doors: [],
      floors: [{ vertices: [0, 1, 2, 3] }],
      holes: [],
      models: [],
      graphs: [],
      bounds: { x: 0, y: 0, w: 40, h: 30 },
    },
  ];
  source.lifts = [];
  const map = store.save("maps", { name: "Test map", data: source });
  const model = store.list("models").find((m) => m.data.category === "amr");
  const gateway = store.list("gateways")[0];
  const park = store.save("parks", {
    name: "Test park",
    data: {
      maps: [{ id: map.id, version: 1 }],
      models: [{ id: model.id, version: 1 }],
      gateways: [gateway.id],
      devices: [
        {
          id: "robot",
          name: "Robot",
          kind: "virtual",
          model: { id: model.id, version: 1 },
          mapId: map.id,
          level: "L1",
          pose: [5, 10, 0],
          gatewayId: gateway.id,
          channels: ["state"],
        },
      ],
      objects: [
        {
          id: "route",
          name: "Route",
          type: "route",
          mapId: map.id,
          level: "L1",
          x: 5,
          y: 10,
          points: [
            [5, 10],
            [25, 10],
          ],
        },
      ],
      tasks: [
        {
          id: "task",
          name: "Delivery",
          deviceId: "robot",
          routeId: "route",
          speed: 1,
          duration: 30,
        },
      ],
    },
  });
  const save = (data) =>
    store.save(
      "parks",
      { name: park.name, version: store.get("parks", park.id).version, data },
      park.id,
    );
  const request = () =>
    compileParkRun(store, park.id, {
      version: store.get("parks", park.id).version,
      taskId: "task",
    });
  return { store, dir, map, model, gateway, park, save, request };
}
test("resource versions persist across restart; park references and run snapshots stay pinned", async (t) => {
  const f = await fixture(t),
    { store, map, model, park } = f;
  const before = f.request();
  store.save(
    "models",
    { name: model.name, version: 1, data: { ...model.data, length: 2 } },
    model.id,
  );
  store.save(
    "maps",
    {
      name: map.name,
      version: 1,
      data: { ...map.data, name: { zh: "Changed", en: "Changed" } },
    },
    map.id,
  );
  assert.equal(f.request().snapshot.model.length, before.snapshot.model.length);
  assert.equal(f.request().snapshot.mapVersion, 1);
  store.close();
  await store.init();
  assert.equal(store.get("models", model.id).version, 2);
  assert.equal(store.get("models", model.id, 1).data.length, 1.2);
  assert.equal(store.get("parks", park.id).data.maps[0].version, 1);
  assert.equal(store.history("models", model.id).length, 2);
});
test("stale writes, broken references and referenced archival fail atomically", async (t) => {
  const { store, park, map, save } = await fixture(t),
    before = store.audit().length;
  assert.throws(() =>
    store.save(
      "parks",
      { name: "stale", version: 0, data: park.data },
      park.id,
    ),
  );
  assert.throws(
    () =>
      store.save(
        "parks",
        { name: "stale", version: 2, data: park.data },
        park.id,
      ),
    (e) => e.status === 409,
  );
  const bad = structuredClone(park.data);
  bad.devices[0].level = "missing";
  assert.throws(() => save(bad), /floor/);
  assert.throws(() => store.archive("maps", map.id, 1), /referenced/);
  assert.equal(store.audit().length, before);
  assert.equal(store.get("parks", park.id).version, 1);
});
test("physical devices, unsupported models and Chrono do not silently become kinematic simulations", async (t) => {
  const { store, park, save, request } = await fixture(t);
  let p = structuredClone(park.data);
  p.devices[0].kind = "physical";
  delete p.devices[0].gatewayId;
  p.devices[0].channels = [];
  save(p);
  assert.throws(request, /Physical devices/);
  p = structuredClone(park.data);
  p.tasks[0].engine = "chrono";
  save(p);
  assert.throws(request, /Chrono adapter/);
  p = structuredClone(park.data);
  const quad = store
    .list("models")
    .find((m) => m.data.category === "quadruped");
  p.models = [{ id: quad.id, version: 1 }];
  p.devices[0].model = p.models[0];
  save(p);
  assert.throws(request, /No simulation adapter/);
});
test("gateway credentials, unbound channels, adapter mismatches and referenced channel removal are rejected", async (t) => {
  const { store, park, gateway, save } = await fixture(t);
  assert.throws(() =>
    gatewaySchema.parse({
      ...gateway.data,
      location: "cloud",
      adapter: "external",
      endpoint: "https://user:secret@example.com",
    }),
  );
  const p = structuredClone(park.data);
  p.devices[0].kind = "physical";
  assert.throws(() => save(p), /mismatch/);
  p.devices[0].kind = "virtual";
  p.devices[0].channels = ["missing"];
  assert.throws(() => save(p), /Unknown gateway channel/);
  delete p.devices[0].gatewayId;
  assert.throws(() => save(p), /gateway/i);
  assert.throws(
    () =>
      store.save(
        "gateways",
        {
          name: gateway.name,
          version: 1,
          data: { ...gateway.data, channels: [] },
        },
        gateway.id,
      ),
    /referenced/,
  );
});
test("map validation rejects unsafe drawings and invalid topology without affecting saved map", async (t) => {
  const { map } = await fixture(t);
  const bad = structuredClone(map.data);
  bad.levels[0].drawing = "https://external.example/map.png";
  assert.throws(() => mapSchema.parse(bad));
  delete bad.levels[0].drawing;
  bad.levels[0].walls = [{ id: 0, start: 0, end: 999 }];
  assert.throws(() => mapSchema.parse(bad), /vertex references/);
});
test("straight-line simulation is deterministic and obeys configured speed and position", async (t) => {
  const { request } = await fixture(t);
  const q = request(),
    r = simulatePark(q);
  assert.deepEqual(r, simulatePark(q));
  assert.equal(r.verdict, "COMPLETED");
  assert.equal(r.metrics.contactEpisodes, 0);
  assert.ok(r.metrics.maxPathError < 1e-9);
  assert.ok(Math.abs(r.frames.at(-1).actors[0].x - 25) < 0.35);
  assert.ok(r.frames.every((f) => f.actors[0].speed <= 1));
  const short = simulatePark({ ...q, duration: 1 });
  assert.equal(short.verdict, "INCOMPLETE");
  assert.ok(Math.abs(short.metrics.distanceM - 0.525) < 1e-9);
  const slower = simulatePark({ ...q, speed: 0.3 });
  assert.equal(slower.verdict, "INCOMPLETE");
  assert.ok(slower.metrics.distanceM < r.metrics.distanceM);
});
test("actual wall geometry and model dimensions change contact results", async (t) => {
  const { request } = await fixture(t);
  const q = request();
  q.snapshot.walls = [{ a: [12, 0], b: [12, 30] }];
  const r = simulatePark(q);
  assert.equal(r.verdict, "CONTACT");
  assert.equal(r.metrics.completed, 0);
  assert.ok(r.events.some((e) => e.type === "sampled-contact"));
  const bigger = structuredClone(q);
  bigger.snapshot.model.length = 3;
  assert.ok(simulatePark(bigger).metrics.distanceM < r.metrics.distanceM);
  assert.ok(r.frames.at(-1).actors[0].x < 12);
});
test("restricted and speed-zone overlays affect computations, not only rendering", async (t) => {
  const { request } = await fixture(t);
  const q = request();
  q.snapshot.objects.push({
    id: "zone",
    type: "restricted",
    x: 15,
    y: 10,
    w: 2,
    h: 4,
    yaw: 0,
  });
  assert.equal(simulatePark(q).verdict, "CONTACT");
  q.snapshot.objects.pop();
  q.snapshot.objects.push({
    id: "slow",
    type: "speed",
    x: 15,
    y: 10,
    w: 30,
    h: 20,
    yaw: 0,
    value: 0.2,
  });
  const r = simulatePark(q);
  assert.equal(r.verdict, "INCOMPLETE");
  assert.ok(r.frames.every((f) => f.actors[0].speed <= 0.2));
});
test("trailer and full drawbar are separate sampled collision bodies", async (t) => {
  const { request } = await fixture(t);
  const q = request();
  q.snapshot.model = { ...q.snapshot.model, category: "tugger", trailers: 1 };
  q.snapshot.walls = [{ a: [2.5, 9], b: [2.5, 11] }];
  const r = simulatePark(q);
  assert.equal(r.verdict, "CONTACT");
  assert.equal(r.frames[0].bodies.length, 3);
  assert.ok(r.events.some((e) => e.detail.includes("trailer")));
});
test("invalid task pose, speed and duplicate route points fail explicitly", async (t) => {
  const { request } = await fixture(t);
  const q = request();
  assert.throws(() => simulatePark({ ...q, speed: 5 }), /speed limit/);
  q.snapshot.pose[0] = 0;
  assert.throws(() => simulatePark(q), /route start/);
  q.snapshot.pose[0] = 5;
  q.snapshot.route[1] = q.snapshot.route[0];
  assert.throws(() => simulatePark(q), /Duplicate route/);
});
