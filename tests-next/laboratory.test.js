import test from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../src/simulation/yard.ts";
import { simulate as legacySimulate } from "../src/core/simulation.js";
import * as current from "../src/simulation/lab-domain.ts";
import * as legacy from "../server/domain.mjs";
import * as exportsNow from "../src/simulation/exports.ts";
import * as exportsBefore from "../server/exports.mjs";
import {
  encodeJson,
  decodeJson,
} from "../src/server/repositories/json-codec.ts";

test("yard engine, normalization and exports retain exact baseline results", (t) => {
  // Export metadata includes the wall clock; freeze it for both implementations.
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-09-28T00:00:00Z"),
  });
  for (const policy of ["fifo", "none"]) {
    const request = current.validateRequest({
      engine: "yard",
      config: { policy, seed: 42, doorDelay: 8 },
    });
    const run = simulate(request.config);
    assert.deepEqual(run, legacySimulate(request.config));
    const evidence = current.normalizeYard(run, request);
    assert.deepEqual(evidence, legacy.normalizeYard(run, request));
    for (const key of ["exportXosc", "exportRmfGraph", "exportSdf"])
      assert.deepEqual(exportsNow[key](evidence), exportsBefore[key](evidence));
  }
});
test("Chrono scene and normalizer preserve identity and contact semantics without claiming physics execution", () => {
  const request = current.validateRequest({
    engine: "chrono",
    vehicles: 2,
    duration: 20,
  });
  assert.deepEqual(
    current.makeChronoScene(request),
    legacy.makeChronoScene(request),
  );
  const rows = [
    {
      time: 0,
      contacts: 30,
      chrono_version: "10",
      robots: [
        { name: "T1", trailer_count: 0, poses: [[0, 0, 0, 1, 0, 0, 0]] },
      ],
    },
  ];
  const summary = { robots: [], seconds: 1, wall_seconds: 1 };
  assert.deepEqual(
    current.normalizeChrono(rows, summary, request),
    legacy.normalizeChrono(rows, summary, request),
  );
});
test("JSON text envelope roundtrips exact IEEE754 values through a JSON column", () => {
  const source = {
    x: 25.552914270615126,
    points: [
      [1, 2],
      [3, 4],
    ],
  };
  assert.deepEqual(
    decodeJson(JSON.parse(JSON.stringify(encodeJson(source)))),
    source,
  );
  assert.deepEqual(decodeJson(source), source);
});
