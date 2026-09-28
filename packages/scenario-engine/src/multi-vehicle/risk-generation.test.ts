import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadMap } from "../index.js";
import { bodyGap, crossingRisk } from "./risk-metrics.js";
import {
  buildBackgroundPlacements,
  createDangerousLeftTurn,
  createRiskScene,
} from "./risk-generation.js";
import type { MapModel, Road } from "../index.js";
import { simulateReference } from "./reference.js";
import { source, styles } from "./risk-fixtures.js";

describe("dangerous left turn synthesis", () => {
  it("uses full oriented bodies and does not count parked proximity as danger", () => {
    const body = { x: 0, y: 0, heading: 0, lengthM: 4.7, widthM: 1.9 };
    expect(bodyGap(body, { ...body, x: 5.7 })).toBeCloseTo(1);
    const a = Array.from({ length: 20 }, (_, i) => ({
      t: i * 0.1,
      x: 0,
      y: 0,
      heading: 0,
      speed: 0,
    }));
    expect(
      crossingRisk(
        a,
        a.map((p) => ({ ...p, x: 5 })),
      ).achieved,
    ).toBe(false);
  });
  it("reports collision and PET zero for crossing bodies", () => {
    const a = Array.from({ length: 41 }, (_, i) => ({
      t: i * 0.1,
      x: i - 20,
      y: 0,
      heading: 0,
      speed: 10,
    }));
    const b = a.map((p) => ({ ...p, x: 0, y: p.x, heading: Math.PI / 2 }));
    const result = crossingRisk(a, b);
    expect(result.achieved).toBe(true);
    expect(result.collision).toBe(true);
    expect(result.petS).toBe(0);
    expect(result.minimumTtcS).toBeLessThan(1);
  });
  it("rejects an unsuitable map instead of silently changing maps", async () => {
    const map = await loadMap(
      fileURLToPath(
        new URL("../../../../apps/api/data/maps/", import.meta.url),
      ),
      "cross_1502",
    );
    expect(() => createDangerousLeftTurn(map, source(), styles)).toThrow(
      /当前地图/,
    );
  });
  it("generates moving off-center cars with a measured hazard and causal ego braking", async () => {
    const map = await loadMap(
      fileURLToPath(
        new URL("../../../../apps/api/data/maps/", import.meta.url),
      ),
      "cross_0001",
    );
    const spec = createDangerousLeftTurn(map, source(), styles, 42);
    const report = simulateReference(map, spec).properties.validationReport;
    expect(report.passed).toBe(true);
    expect(report.riskObjective?.achieved).toBe(true);
    expect(report.riskObjective?.movingActors).toBe(5);
    expect(report.riskObjective?.meanLateralOffsetM).toBeGreaterThan(0.05);
    expect(spec.riskDesign!.causalCheck.egoBrakingGainMps2).toBeGreaterThan(
      0.5,
    );
    const adapted = structuredClone(map);
    adapted.mapId = "another-city-intersection";
    adapted.origin = [120, 30];
    const transform = ([x, y]: [number, number]): [number, number] => [
      -y + 400,
      x - 200,
    ];
    adapted.roads.forEach((r) => {
      r.centerline = r.centerline.map(transform);
      if (r.polygon) r.polygon = r.polygon.map(transform);
      r.entryHeadingDeg += 90;
    });
    const adaptedSpec = createDangerousLeftTurn(adapted, source(), styles, 42);
    const adaptedReport = simulateReference(adapted, adaptedSpec).properties
      .validationReport;
    expect(adaptedSpec.mapId).toBe(adapted.mapId);
    expect(adaptedReport.passed).toBe(true);
    expect(adaptedReport.riskObjective!.peakTimeS).toBeCloseTo(
      report.riskObjective!.peakTimeS,
      1,
    );
    const altered = structuredClone(spec);
    altered.reference!.tracks[1]!.samples.forEach((p) => {
      p[1] += 1000;
    });
    expect(
      simulateReference(map, altered).properties.validationReport.passed,
    ).toBe(false);
  }, 30000);

  it("uses the seed for reproducible lane, speed and timing search choices", async () => {
    const map = await loadMap(
      fileURLToPath(
        new URL("../../../../apps/api/data/maps/", import.meta.url),
      ),
      "risk-fixture-cross",
    );
    const request = {
      mechanism: "oncoming_intrusion" as const,
      count: 5 as const,
      outcome: "danger" as const,
      approach: "opposing" as const,
    };
    const first = createRiskScene(map, source(), styles, 42, request);
    const repeated = createRiskScene(map, source(), styles, 42, request);
    const varied = createRiskScene(map, source(), styles, 43, request);

    expect(first.riskDesign).toEqual(repeated.riskDesign);
    expect((first.riskDesign as any).sampledParameters).toBeTruthy();
    expect({
      movementIds: first.riskDesign?.movementIds,
      sampled: (first.riskDesign as any).sampledParameters,
    }).not.toEqual({
      movementIds: varied.riskDesign?.movementIds,
      sampled: (varied.riskDesign as any).sampledParameters,
    });
  }, 30000);
});

describe("background placement on short approaches", () => {
  // 标准编队位置：[s0, s1, s0-14, s1-19, s0-32]
  const nominalAt = (speed: number, cp = 90) => {
    const s0 = cp - speed * 5.5;
    const s1 = cp - speed * 0.85 * 5.5;
    return [s0, s1, s0 - 14, s1 - 19, s0 - 32];
  };

  it("leaves the standard platoon untouched when the approach is long", () => {
    const overrides = buildBackgroundPlacements(
      [200, 200, 200, 200, 200],
      [130, 130],
      "oncoming_intrusion",
      nominalAt(10, 130),
    );
    expect(overrides).toEqual({});
  });

  it("compresses upstream spacing before moving cars downstream", () => {
    // 97m 进口道，冲突点在中点；6m/s 时 actor2 标准位 0.5m，需压缩
    const cp = 48.5;
    const overrides = buildBackgroundPlacements(
      [97, 135, 97, 135, 97],
      [cp, 87],
      "oncoming_intrusion",
      nominalAt(6, cp),
    );
    // actor2 贴自车后方 8m，actor4 无处可放，移到冲突点下游当自由车
    expect(overrides[2]!.s).toBeCloseTo(cp - 33 - 8, 0);
    expect(overrides[2]!.free).toBeUndefined();
    expect(overrides[4]!.free).toBe(true);
    expect(overrides[4]!.s).toBeGreaterThan(cp + 18 - 0.01);
    expect(overrides[4]!.s).toBeLessThanOrEqual(97 - 6);
    for (const o of Object.values(overrides)) expect(o!.s).toBeGreaterThan(4);
  });

  it("gives up when no slot exists for a background car", () => {
    // 冲突点距出口只有 6m：下游自由车位（cp+18）超出路端，上游也贴不下
    const overrides = buildBackgroundPlacements(
      [58, 200, 58, 200, 58],
      [52, 150],
      "oncoming_intrusion",
      nominalAt(8, 52),
    );
    expect(overrides).toBeNull();
  });
});

describe("oncoming intrusion on a short-arm opposing road pair", () => {
  // 两条紧邻的对向直行道路（中心线 3.1m，路面多边形彼此重叠，相当于一块路面
  // 上的上下行车道），进口道 120m、冲突点在中点：旧逻辑要求冲突点后方按
  // s0-32 放三辆背景车，低速档也要 ~64m，必然报"进口道路长度不足"。
  // 各接一段 120m successor，供自适应放置的下游自由交通车继续驶离。
  function shortOpposingMap(): MapModel {
    const L = 120;
    const width = 3.1;
    const polyHalf = 2.8;
    const roads: Road[] = [];
    const make = (
      id: string,
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      len: number,
    ): Road => {
      const h = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(h);
      const ny = Math.cos(h);
      const corner = (x: number, y: number, side: number): [number, number] => [
        x + nx * side * polyHalf,
        y + ny * side * polyHalf,
      ];
      return {
        id,
        widthM: width,
        centerline: [
          [x0, y0],
          [x1, y1],
        ],
        lengthM: len,
        entryHeadingDeg: (h * 180) / Math.PI,
        polygon: [
          corner(x0, y0, -1),
          corner(x1, y1, -1),
          corner(x1, y1, 1),
          corner(x0, y0, 1),
        ],
      };
    };
    roads.push(make("ego_road", 0, 0, L, 0, L));
    roads.push(make("ego_ext", L, 0, L + 120, 0, 120));
    roads.push(make("oncoming_road", L, width, 0, width, L));
    roads.push(make("oncoming_ext", 0, width, -120, width, 120));
    return {
      mapId: "short-opposing",
      origin: [116, 40],
      roads,
      successors: [
        { from: "ego_road", to: "ego_ext" },
        { from: "oncoming_road", to: "oncoming_ext" },
      ],
      adjacentSameDirection: [],
    };
  }

  it("constructs a passing five-actor scene instead of rejecting for length", () => {
    const map = shortOpposingMap();
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "oncoming_intrusion",
      count: 5,
      outcome: "danger",
      approach: "opposing",
    });
    expect(spec.actors).toHaveLength(5);
    const report = simulateReference(map, spec).properties.validationReport;
    expect(report.passed).toBe(true);
  }, 30000);
});
