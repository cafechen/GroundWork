import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  mapIds,
  validateMap,
  visibleLanes,
  liftPolygon,
  escapeText,
} from "../src/map-data.js";
const root = new URL("../assets/maps/rmf/", import.meta.url);
const read = async (name) =>
  JSON.parse(await readFile(new URL(name, root), "utf8"));
test("five pinned maps, all eight floors, explicit unavailable sixth and no simulation", async () => {
  const catalog = await read("catalog.json");
  assert.equal(catalog.maps.length, 6);
  assert.equal(catalog.maps.filter((m) => m.available).length, 5);
  assert.equal(catalog.maps[5].available, false);
  assert.equal(catalog.maps[5].url, undefined);
  const expected = {
    hotel: [
      [107, 58, 56, 5],
      [123, 32, 99, 7],
      [123, 32, 99, 7],
    ],
    office: [[73, 30, 33, 3]],
    airport_terminal: [[1297, 223, 464, 5]],
    clinic: [
      [449, 91, 360, 76],
      [335, 78, 259, 56],
    ],
    campus: [[157, 154, 0, 0]],
  };
  for (const id of mapIds) {
    const m = validateMap(await read(`${id}.json`), id);
    assert.deepEqual(
      m.levels.map((l) => [
        l.vertices.length,
        l.lanes.length,
        l.walls.length,
        l.doors.length,
      ]),
      expected[id],
    );
    assert.equal(m.capabilities.simulation, false);
    assert.equal(m.capabilities.liveControl, false);
    for (const [file, hash] of Object.entries(m.source.files)) {
      assert.equal(
        createHash("sha256")
          .update(await readFile(new URL(file, root)))
          .digest("hex"),
        hash,
        file,
      );
    }
  }
});
test("graph selection preserves lane direction and lift membership/dimensions", async () => {
  const campus = await read("campus.json");
  const lanes = visibleLanes(campus.levels[0], "0");
  assert.equal(lanes.length, 154);
  assert.ok(lanes.filter((e) => !e.bidirectional).length > 100);
  assert.equal(visibleLanes(campus.levels[0], "99").length, 0);
  const hotel = await read("hotel.json");
  assert.deepEqual(
    hotel.levels.map((l) => l.elevation),
    [0, 8, 16],
  );
  assert.deepEqual(hotel.lifts[0].levels, ["L1", "L2", "L3"]);
  const p = liftPolygon(hotel.lifts[0]);
  assert.ok(
    Math.abs(Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) - 2.7) < 1e-10,
  );
});
test("map validator rejects broken references, nonfinite coordinates, bad paths and run-like data", async () => {
  const base = await read("office.json");
  for (const mutate of [
    (m) => (m.levels[0].vertices[0].x = NaN),
    (m) => (m.levels[0].lanes[0].end = -1),
    (m) => (m.levels[0].lanes[0].bidirectional = "false"),
    (m) =>
      (m.levels[0].drawing = "/assets/maps/rmf/source/office/../../secret.png"),
    (m) => (m.capabilities.simulation = true),
    (m) => (m.schemaVersion = 2),
    (m) => (m.levels[0].bounds.w = 0),
    (m) => (m.levels[0].models[0].position[0] = Infinity),
  ]) {
    const data = structuredClone(base);
    mutate(data);
    assert.throws(() => validateMap(data, "office"));
  }
  assert.throws(() => validateMap(base, "hotel"));
  assert.equal(
    escapeText('<img onerror="x">'),
    "&lt;img onerror=&quot;x&quot;&gt;",
  );
});
