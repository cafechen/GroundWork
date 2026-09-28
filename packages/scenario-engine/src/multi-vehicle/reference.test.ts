import { describe, it, expect } from "vitest";
import { sceneSpecV2Schema } from "@groundwork/contracts";
import { mapFingerprint, type MapModel } from "../index.js";
import {
  referencePoint,
  simulateReference,
  optimizeReference,
} from "./reference.js";

const map: MapModel = {
  mapId: "cross_0001",
  origin: [116, 40],
  roads: [
    {
      id: "lane",
      widthM: 20,
      lengthM: 200,
      entryHeadingDeg: 0,
      centerline: [
        [0, 0],
        [200, 0],
      ],
      polygon: [
        [-10, -10],
        [200, -10],
        [200, 10],
        [-10, 10],
      ],
      // 路口连接道路：indexed_reference_replay 模式要求地图包含路口结构
      junction: {
        id: "junction_1",
        from: "in_s",
        to: "out_n",
        turn: "straight",
        maxCurvature: 0.01,
        stopPositionM: 20,
      },
      geometrySource: "junction_connector",
    },
  ],
  successors: [],
  adjacentSameDirection: [],
};
function fixture() {
  return sceneSpecV2Schema.parse({
    schemaVersion: 2,
    title: "reference",
    mapId: map.mapId,
    mapVersion: mapFingerprint(map),
    seed: 42,
    durationS: 10,
    actors: ["Ego", "Other"].map((id, i) => ({
      id,
      name: id,
      role: i ? "background" : "ego",
      controlMode: "replay",
      laneId: "lane",
      positionM: 20,
      speedMps: 0,
      profile: {},
      replay: [
        { t: 0, positionM: 20 },
        { t: 10, positionM: 60 },
      ],
    })),
    events: [],
    objectives: { requiredEventIds: [] },
    constraints: {},
    reference: {
      mode: "indexed_reference_replay",
      dataset: "wanji-50",
      sourceId: "example",
      sourceKey: "example/optimized_data.json",
      sourceSha256: "a".repeat(64),
      sourceStartMs: 0,
      sourceOffsetS: 0.4,
      sourceDurationS: 10,
      requestedSpeedFactor: 1,
      appliedSpeedFactor: 1,
      tracks: ["Ego", "Other"].map((actorId, i) => ({
        actorId,
        sourceUuid: String(i),
        samples: Array.from({ length: 107 }, (_, k) => {
          const t = (k - 3) / 10;
          return [t, 20 + t * 4, i * 4, 0];
        }),
      })),
    },
  });
}
describe("indexed joint reference replay", () => {
  it("preserves linear motion, source provenance and synchronized time", () => {
    const spec = fixture();
    expect(referencePoint(spec.reference!.tracks[0]!.samples, 3).x).toBeCloseTo(
      32,
      8,
    );
    const result = simulateReference(map, spec);
    expect(result.properties.validationReport.passed).toBe(true);
    expect(result.properties.validationReport.reference.sourceKey).toBe(
      spec.reference!.sourceKey,
    );
    const points = result.features.filter((f) => f.geometry.type === "Point");
    expect(points).toHaveLength(402);
    expect(points[100]!.properties.speedMps).toBeCloseTo(4, 6);
  });
  it("reduces a common time factor to satisfy speed while preserving spatial paths", () => {
    const spec = fixture();
    spec.reference!.requestedSpeedFactor = 2;
    spec.reference!.appliedSpeedFactor = 2;
    spec.durationS = 5;
    spec.constraints.maxSpeedMps = 5;
    for (const a of spec.actors) {
      a.profile.desiredSpeedMps = 5;
      a.replay![1]!.t = 5;
    }
    const result = optimizeReference(map, spec);
    expect(result.reference!.appliedSpeedFactor).toBeLessThan(1.26);
    expect(result.reference!.tracks).toEqual(spec.reference!.tracks);
    expect(
      simulateReference(map, result).properties.validationReport.passed,
    ).toBe(true);
  });
  it("rejects off-road bodies instead of repairing them by slowing down", () => {
    const spec = fixture();
    for (const p of spec.reference!.tracks[0]!.samples) p[2] = 20;
    expect(() => optimizeReference(map, spec)).toThrow(/地图范围/);
  });
  it("records intentional collisions without declaring collision-free traffic", () => {
    const spec = fixture();
    spec.reference!.tracks[1]!.samples = structuredClone(
      spec.reference!.tracks[0]!.samples,
    );
    expect(
      simulateReference(map, spec).properties.validationReport.passed,
    ).toBe(false);
    spec.constraints.allowedCollisionPairs = [["Ego", "Other"]];
    const report = simulateReference(map, spec).properties.validationReport;
    expect(report.passed).toBe(true);
    expect(report.risk.collisionFree).toBe(false);
    expect(report.risk.collisions[0]!.expected).toBe(true);
  });
  it("rejects gaps, actor mismatches and unsupported map transfers", () => {
    const spec = fixture();
    spec.reference!.tracks[0]!.samples.splice(10, 1);
    expect(sceneSpecV2Schema.safeParse(spec).success).toBe(false);
    expect(() =>
      simulateReference({ ...map, mapId: "other" }, fixture()),
    ).toThrow(/地图/);
  });
});
