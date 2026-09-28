import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileParkRun, simulatePark } from "../src/simulation/park.ts";
import {
  simulatePark as legacySimulate,
  compileParkRun as legacyCompile,
} from "../server/park-simulation.mjs";
import { validatePark } from "../src/server/services/validation.ts";
import { canonical } from "../src/server/repositories/platform.ts";
import { guardRequest, body, failure } from "../src/server/http.ts";
import { PlatformError } from "../src/server/errors.ts";
import { fixture } from "./fixture.js";

test("typed compiler/engine exactly preserve legacy frames, metrics, verdict and events", () => {
  const c = fixture(),
    p = c.parks[0],
    input = { version: 1, taskId: "demo-delivery" };
  const store = {
    get: (k, id, version) =>
      c[k].find((r) => r.id === id && (!version || r.version === version)),
    validatePark: (data) => validatePark(data, c),
  };
  const before = legacyCompile(store, p.id, input),
    after = compileParkRun(p, c, input);
  assert.deepEqual(after, before);
  const result = simulatePark(after);
  assert.deepEqual(result, legacySimulate(before));
  assert.equal(result.verdict, "COMPLETED");
  assert.equal(result.metrics.contactEpisodes, 0);
  assert.equal(result.metrics.distanceM, 54.530020589459085);
});
test("contact, spawn and physical-device guards are not relaxed by migration", () => {
  const c = fixture(),
    p = c.parks[0],
    input = { version: 1, taskId: "demo-delivery" };
  p.data.devices[0].pose = [17, 15, 0];
  assert.throws(() => compileParkRun(p, c, input), /within 2 m/);
  p.data.devices[0].pose = [8, 6, 0];
  p.data.objects.push({
    ...p.data.objects[1],
    id: "blocked",
    type: "restricted",
    w: 4,
    h: 4,
  });
  const r = compileParkRun(p, c, input);
  assert.deepEqual(simulatePark(r), legacySimulate(r));
  assert.equal(simulatePark(r).verdict, "CONTACT");
  p.data.devices[0].kind = "physical";
  assert.throws(() => compileParkRun(p, c, input), /mismatch|实机/);
});
test("foreign park resources, duplicate channels and route references are rejected", () => {
  const c = fixture(),
    p = c.parks[0].data;
  p.devices[0].mapId = "foreign";
  assert.throws(() => validatePark(p, c), /楼层/);
  p.devices[0].mapId = "demo-map";
  p.devices[0].channels = ["state", "state"];
  assert.throws(() => validatePark(p, c), /重复/);
});
test("canonical hashing ignores object key order but not route order", () => {
  assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
  assert.notEqual(canonical([1, 2]), canonical([2, 1]));
});
test("both generated schemas retain the same business models and relation definitions", async () => {
  const mysql = await readFile("prisma/mysql/schema.prisma", "utf8"),
    pg = await readFile("prisma/postgresql/schema.prisma", "utf8");
  assert.equal(
    mysql
      .replace('provider = "mysql"', 'provider = "postgresql"')
      .replaceAll("@db.DateTime(3)", "@db.Timestamp(3)")
      .replaceAll("@db.Double", "@db.DoublePrecision"),
    pg,
  );
  assert.equal([...mysql.matchAll(/^model /gm)].length, 18);
});
test("same-origin and body limit boundaries survive Next.js migration", async () => {
  assert.throws(
    () =>
      guardRequest(
        new Request("http://localhost/api/platform", {
          headers: { host: "evil.example" },
        }),
      ),
    /Host/,
  );
  assert.throws(
    () =>
      guardRequest(
        new Request("http://localhost/api/platform", {
          method: "POST",
          headers: { host: "localhost", origin: "https://evil.example" },
        }),
      ),
    /origin/,
  );
  assert.doesNotThrow(() =>
    guardRequest(
      new Request("http://localhost/api/platform", {
        method: "POST",
        headers: { host: "localhost", origin: "http://localhost" },
      }),
    ),
  );
  await assert.rejects(
    () =>
      body(
        new Request("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"message":"large"}',
        }),
        4,
      ),
    /large/,
  );
  assert.equal(failure(new PlatformError("Conflict", 409)).status, 409);
  const hidden = await failure(new Error("mysql://secret")).text();
  assert.ok(!hidden.includes("secret"));
});
