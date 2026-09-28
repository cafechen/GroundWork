import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  mapLayers,
  liftPolygon,
  floorPolygons,
} from "../src/features/scene/map-layers.ts";
import { visibleLanes, liftPolygon as legacyLift } from "../src/map-data.js";
test("all five maps retain exact graph filters, floor-specific facilities and source data", async () => {
  for (const id of [
    "hotel",
    "office",
    "airport_terminal",
    "clinic",
    "campus",
  ]) {
    const map = JSON.parse(
        await readFile(`assets/maps/rmf/${id}.json`, "utf8"),
      ),
      before = JSON.stringify(map);
    for (const level of map.levels) {
      assert.deepEqual(
        mapLayers(map, level.id, { graph: "unavailable-on-this-floor" }).lanes,
        level.lanes,
      );
      for (const graph of ["all", ...level.graphs.map(String)]) {
        const result = mapLayers(map, level.id, { graph });
        assert.deepEqual(result.lanes, visibleLanes(level, graph));
        assert.deepEqual(
          result.lifts,
          map.lifts.filter((l) => l.levels.includes(level.id)),
        );
      }
      const hidden = mapLayers(map, level.id, {
        lanes: false,
        walls: false,
        facilities: false,
        models: false,
        labels: false,
      });
      for (const key of [
        "lanes",
        "walls",
        "doors",
        "lifts",
        "models",
        "labels",
      ])
        assert.equal(hidden[key].length, 0);
    }
    assert.equal(JSON.stringify(map), before);
  }
});
test("rotated lift uses original centre, dimensions and yaw", () => {
  const lift = {
    id: "L",
    position: [3, 5],
    yaw: Math.PI / 2,
    width: 4,
    depth: 2,
    levels: ["L1"],
  };
  assert.deepEqual(liftPolygon(lift), legacyLift(lift));
});
test("floor holes belong only to enclosing floor", () => {
  const vertices = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [2, 2],
    [3, 2],
    [3, 3],
    [2, 3],
    [20, 0],
    [30, 0],
    [30, 10],
    [20, 10],
  ].map(([x, y], id) => ({ id, x, y }));
  const level = {
    vertices,
    floors: [{ vertices: [0, 1, 2, 3] }, { vertices: [8, 9, 10, 11] }],
    holes: [{ vertices: [4, 5, 6, 7] }],
  };
  const polys = floorPolygons(level);
  assert.equal(polys[0].holes.length, 1);
  assert.equal(polys[1].holes.length, 0);
});
