import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRequest,
  makeChronoScene,
  normalizeChrono,
  compareResults,
  importMap,
} from "../server/domain.mjs";

test("job requests are bounded and reject client executable/path selection", () => {
  assert.throws(() => validateRequest({ engine: "chrono", duration: 999999 }));
  assert.throws(() => validateRequest({ engine: "chrono", command: "rm" }));
  assert.equal(
    validateRequest({ engine: "chrono", duration: 20 }).duration,
    20,
  );
});
test("synthetic Chrono scene has explicit local frame and no source checkout paths", () => {
  const scene = makeChronoScene(
    validateRequest({
      engine: "chrono",
      duration: 20,
      vehicles: 2,
      trailers: 3,
    }),
  );
  assert.equal(scene.robots.length, 2);
  assert.deepEqual(scene.origin, [0, 0]);
  assert.ok(
    scene.robots.every((r) => r.outbound.length > 4 && r.return.length > 4),
  );
  assert.ok(!JSON.stringify(scene).includes("/Users/"));
});
test("ground contacts are not accident counts and inactive train slots are omitted", () => {
  const row = {
    time: 1,
    contacts: 30,
    chrono_version: "10",
    robots: [
      {
        name: "T1",
        x: 0,
        y: 0,
        speed: 0,
        stage: "loading",
        trailer_count: 0,
        poses: [
          [0, 0, 0, 1, 0, 0, 0],
          [0, 0, -100, 1, 0, 0, 0],
        ],
        error: "",
      },
    ],
  };
  const result = normalizeChrono(
    [row],
    { robots: [], seconds: 1 },
    { engine: "chrono" },
  );
  assert.equal(result.frames[0].bodies.length, 1);
  assert.equal(result.metrics.groundInclusiveContactsMax, 30);
  assert.equal(result.metrics.collisionEpisodes, undefined);
  assert.equal(result.verdict, "NOT_EVALUATED");
});
test("comparisons reject unlike engines and cases", () => {
  assert.throws(() => compareResults({ engine: "chrono" }, { engine: "road" }));
  assert.throws(() =>
    compareResults(
      { engine: "chrono", caseKey: "a" },
      { engine: "chrono", caseKey: "b" },
    ),
  );
});

test("different executed code fingerprints cannot be silently compared", () => {
  const common = {
    engine: "chrono",
    engineVersion: "v1",
    caseKey: "map",
    metrics: {},
    request: {},
  };
  assert.throws(() =>
    compareResults(
      { ...common, provenance: { codeFingerprint: "a" } },
      { ...common, provenance: { codeFingerprint: "b" } },
    ),
  );
});

test("reattached trailers retain physical generation identity, not only slot index", () => {
  const row = {
    time: 1,
    contacts: 8,
    chrono_version: "10",
    robots: [
      {
        name: "T1",
        x: 0,
        y: 0,
        speed: 0,
        stage: "loading",
        trailer_count: 1,
        wagons: [{ id: "T1-wagon-4" }],
        poses: [
          [0, 0, 0, 1, 0, 0, 0],
          [-1, 0, 0, 1, 0, 0, 0],
        ],
        error: "",
      },
    ],
  };
  assert.equal(
    normalizeChrono([row], { robots: [], seconds: 1 }, { engine: "chrono" })
      .frames[0].bodies[1].id,
    "T1-wagon-4",
  );
});
test("map import requires explicit local coordinates; rejects inferred WGS84", () => {
  assert.throws(() => importMap({ type: "FeatureCollection", features: [] }));
  const map = importMap({
    type: "FeatureCollection",
    properties: { coordinateSystem: "local-metres" },
    features: [
      {
        type: "Feature",
        properties: { id: "r", widthM: 4 },
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [30, 0],
          ],
        },
      },
    ],
  });
  assert.equal(map.roads[0].lengthM, 30);
});
