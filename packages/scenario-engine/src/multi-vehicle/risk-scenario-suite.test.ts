import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadMap } from "../index.js";
import { createRiskScene } from "./risk-generation.js";
import { simulateReference } from "./reference.js";
import { source, styles } from "./risk-fixtures.js";

const root = fileURLToPath(
  new URL("../../../../apps/api/data/maps/", import.meta.url),
);
// Stable semantic cases, not snapshots of one implementation's point coordinates.
export const scenarioCases = [
  { id: "RISK-001", mechanism: "rear_end", moving: 5 },
  { id: "RISK-002", mechanism: "cut_in", moving: 5 },
  { id: "RISK-003", mechanism: "crossing", moving: 5 },
  { id: "RISK-004", mechanism: "unprotected_left_turn", moving: 5 },
  { id: "RISK-005", mechanism: "right_turn_merge", moving: 5 },
  { id: "RISK-006", mechanism: "oncoming_intrusion", moving: 5 },
  { id: "RISK-007", mechanism: "obstacle_bypass", moving: 4 },
] as const;
describe("risk scene regression collection", () => {
  it.each(
    scenarioCases.flatMap((c) => [42, 43].map((seed) => ({ ...c, seed }))),
  )(
    "$id $mechanism seed=$seed: actual event, risk, movement and negative controls",
    async ({ mechanism, moving, seed }) => {
      const map = await loadMap(root, "risk-fixture-cross");
      const request = {
        mechanism,
        count: 5 as const,
        outcome: "danger" as const,
      };
      const spec = createRiskScene(map, source(), styles, seed, request);
      const r = simulateReference(map, spec).properties.validationReport;
      expect(r.passed).toBe(true);
      expect(r.riskObjective?.mechanism.passed).toBe(true);
      expect(r.riskObjective?.achieved).toBe(true);
      expect(r.riskObjective?.movingActors).toBe(moving);
      expect(r.risk.collisions.every((c) => c.expected)).toBe(true);
      expect(spec.riskDesign?.request).toEqual(request);
      expect(r.riskObjective!.causalCheck.egoBrakingGainMps2).toBeGreaterThan(
        0.5,
      );
      const missingEvent = structuredClone(spec);
      missingEvent
        .reference!.tracks.find((t) => t.actorId === "Conflict")!
        .samples.forEach((p) => (p[1] += 1000));
      const invalid = simulateReference(map, missingEvent).properties
        .validationReport;
      expect(invalid.passed).toBe(false);
      expect(invalid.riskObjective?.achieved).toBe(false);
      const wrongOutcome = structuredClone(spec);
      wrongOutcome.riskDesign!.request!.outcome = r.riskObjective!.collision
        ? "near_miss"
        : "collision";
      expect(
        simulateReference(map, wrongOutcome).properties.validationReport
          .riskObjective?.outcomePassed,
      ).toBe(false);
      const wrongMechanism = structuredClone(spec);
      wrongMechanism.riskDesign!.request!.mechanism =
        mechanism === "cut_in" ? "rear_end" : "cut_in";
      expect(() => simulateReference(map, wrongMechanism)).toThrow(/不一致/);
      const unintendedCollision = structuredClone(spec);
      unintendedCollision.reference!.tracks.find(
        (t) => t.actorId === "Follower",
      )!.samples = structuredClone(
        spec.reference!.tracks.find((t) => t.actorId === "Ego")!.samples,
      );
      const bad = simulateReference(map, unintendedCollision).properties
        .validationReport;
      expect(bad.risk.passed).toBe(false);
      expect(bad.passed).toBe(false);
    },
    30000,
  );
  it("rejects a real map with no crossing straight movements", async () => {
    const map = await loadMap(root, "cross_0001");
    expect(() =>
      createRiskScene(map, source(), styles, 42, {
        mechanism: "crossing",
        count: 5,
        outcome: "danger",
      }),
    ).toThrow(/当前地图不满足/);
  });
  it.each(scenarioCases)(
    "$id rejects missing topology without changing map",
    async ({ mechanism }) => {
      const map = await loadMap(root, "risk-fixture-cross");
      map.roads = [];
      map.successors = [];
      map.adjacentSameDirection = [];
      expect(() =>
        createRiskScene(map, source(), styles, 42, {
          mechanism,
          count: 5,
          outcome: "danger",
        }),
      ).toThrow(/当前地图不满足/);
      expect(map.mapId).toBe("risk-fixture-cross");
    },
  );
  it("supports explicit no-collision crossing and verifies it independently", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "crossing",
      count: 5,
      outcome: "near_miss",
    });
    const r = simulateReference(map, spec).properties.validationReport;
    expect(r.passed).toBe(true);
    expect(r.risk.collisionFree).toBe(true);
    expect(r.riskObjective!.minimumGapM).toBeLessThan(0.8);
  }, 30000);
  it("searches tighter timing to satisfy an explicit TTC threshold end to end", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    // seed 43 的默认候选最小 TTC 为 1.15 s；显式要求 TTC ≤ 1 s 必须改搜更紧时机。
    const baseline = createRiskScene(map, source(), styles, 43, {
      mechanism: "crossing",
      count: 5,
      outcome: "danger",
    });
    const baselineReport = simulateReference(map, baseline).properties
      .validationReport;
    expect(baselineReport.riskObjective!.collision).toBe(false);
    expect(baselineReport.riskObjective!.minimumTtcS).toBeGreaterThan(1);

    const spec = createRiskScene(map, source(), styles, 43, {
      mechanism: "crossing",
      count: 5,
      outcome: "danger",
      maxTtcS: 1,
    });
    const r = simulateReference(map, spec).properties.validationReport;
    expect(r.passed).toBe(true);
    expect(r.riskObjective!.ttcThresholdS).toBe(1);
    expect(r.riskObjective!.ttcPassed).toBe(true);
    // 实际碰撞自动满足任何 TTC 阈值；否则必须实测 minimumTtcS ≤ 阈值。
    expect(
      r.riskObjective!.collision ||
        (r.riskObjective!.minimumTtcS !== null &&
          r.riskObjective!.minimumTtcS! <= 1),
    ).toBe(true);
  }, 30000);
  it("independently rejects a scene when its TTC misses the stored threshold", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "crossing",
      count: 5,
      outcome: "near_miss",
    });
    const baseline = simulateReference(map, spec).properties.validationReport;
    expect(baseline.passed).toBe(true);
    expect(baseline.riskObjective!.collision).toBe(false);
    const actualTtc = baseline.riskObjective!.minimumTtcS;
    expect(actualTtc).not.toBeNull();

    // 不重新生成，仅把存储的阈值收紧到实测值的一半，验收必须独立判失败。
    const tightened = structuredClone(spec);
    tightened.riskDesign!.request!.maxTtcS = actualTtc! / 2;
    const failed = simulateReference(map, tightened).properties
      .validationReport;
    expect(failed.riskObjective!.ttcPassed).toBe(false);
    expect(failed.riskObjective!.ttcThresholdS).toBeCloseTo(actualTtc! / 2, 6);
    expect(failed.passed).toBe(false);

    // 阈值与实测一致时放行，验证判定使用 ≤ 而非严格小于。
    const exact = structuredClone(spec);
    exact.riskDesign!.request!.maxTtcS = actualTtc!;
    expect(
      simulateReference(map, exact).properties.validationReport.passed,
    ).toBe(true);
  }, 30000);
  it("searches timing to land inside an explicit near-miss gap corridor", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    // seed 42 crossing 默认近失间隙为 0.249 m；要求 0.3–0.7 m 走廊必须改搜更宽时机。
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "crossing",
      count: 5,
      outcome: "near_miss",
      minGapM: 0.3,
      maxGapM: 0.7,
    });
    const r = simulateReference(map, spec).properties.validationReport;
    expect(r.passed).toBe(true);
    const o = r.riskObjective!;
    expect(o.collision).toBe(false);
    expect(o.minimumGapM).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(o.minimumGapM).toBeLessThanOrEqual(0.7);
    expect(o.gapPassed).toBe(true);
    expect(o.maxGapThresholdM).toBe(0.7);
    expect(o.minGapThresholdM).toBe(0.3);
  }, 30000);
  it("selects a faster encounter to satisfy an explicit closing-speed floor", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    // seed 43 danger 默认候选相对速度 7.23 m/s；要求 ≥8 m/s 必须改选高速候选。
    const baseline = createRiskScene(map, source(), styles, 43, {
      mechanism: "crossing",
      count: 5,
      outcome: "danger",
    });
    expect(
      simulateReference(map, baseline).properties.validationReport
        .riskObjective!.closingSpeedMps,
    ).toBeLessThan(8);
    const spec = createRiskScene(map, source(), styles, 43, {
      mechanism: "crossing",
      count: 5,
      outcome: "danger",
      minClosingSpeedMps: 8,
    });
    const r = simulateReference(map, spec).properties.validationReport;
    expect(r.passed).toBe(true);
    expect(r.riskObjective!.closingSpeedMps + 1e-9).toBeGreaterThanOrEqual(8);
    expect(r.riskObjective!.closingSpeedPassed).toBe(true);
    expect(r.riskObjective!.closingSpeedThresholdMps).toBe(8);
  }, 30000);
  it("independently rejects gap/PET/closing-speed thresholds that stored metrics miss", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    // 左转 seed 42 近失：gap≈0.13、PET=0.1、相对速度≈2.4，三项指标均为有限值。
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "unprotected_left_turn",
      count: 5,
      outcome: "near_miss",
    });
    const baseline = simulateReference(map, spec).properties.validationReport;
    expect(baseline.passed).toBe(true);
    const o = baseline.riskObjective!;
    expect(o.collision).toBe(false);
    expect(o.petS).not.toBeNull();
    const gap = o.minimumGapM,
      pet = o.petS!,
      closing = o.closingSpeedMps;

    const tighten = (patch: Record<string, number>) => {
      const clone = structuredClone(spec);
      Object.assign(clone.riskDesign!.request!, patch);
      return simulateReference(map, clone).properties.validationReport;
    };
    const failedGap = tighten({ maxGapM: gap / 2 });
    expect(failedGap.riskObjective!.gapPassed).toBe(false);
    expect(failedGap.passed).toBe(false);
    const failedCorridor = tighten({ minGapM: gap + 0.3 });
    expect(failedCorridor.riskObjective!.gapPassed).toBe(false);
    const failedPet = tighten({ maxPetS: pet / 2 });
    expect(failedPet.riskObjective!.petPassed).toBe(false);
    expect(failedPet.passed).toBe(false);
    const failedClosing = tighten({ minClosingSpeedMps: closing + 1 });
    expect(failedClosing.riskObjective!.closingSpeedPassed).toBe(false);
    expect(failedClosing.passed).toBe(false);

    // 阈值与实测一致时放行，验证判定使用 ≤ / ≥ 边界语义。
    const exact = tighten({
      maxGapM: gap,
      maxPetS: pet,
      minClosingSpeedMps: closing,
    });
    expect(exact.passed).toBe(true);
  }, 30000);
  it("rejects illegal sharpness combinations before searching", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    expect(() =>
      createRiskScene(map, source(), styles, 42, {
        mechanism: "crossing",
        count: 5,
        outcome: "danger",
        // @ts-expect-error 近失走廊下限只允许与 near_miss 同用
        minGapM: 0.2,
      }),
    ).toThrow(/参数不合法/);
    expect(() =>
      createRiskScene(map, source(), styles, 42, {
        mechanism: "crossing",
        count: 5,
        outcome: "near_miss",
        minGapM: 0.5,
        maxGapM: 0.3,
      }),
    ).toThrow(/走廊不能为空/);
  });
  it("transfers opposite-direction semantics through rotation and translation", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    map.mapId = "rotated-fixture";
    const xy = ([x, y]: [number, number]): [number, number] => [
      -y + 300,
      x - 400,
    ];
    map.roads.forEach((r) => {
      r.centerline = r.centerline.map(xy);
      if (r.polygon) r.polygon = r.polygon.map(xy);
      r.entryHeadingDeg += 90;
    });
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "oncoming_intrusion",
      count: 5,
      outcome: "collision",
    });
    const r = simulateReference(map, spec).properties.validationReport;
    expect(r.passed).toBe(true);
    expect(r.riskObjective!.collision).toBe(true);
    expect(r.riskObjective!.mechanism.checks[0]!.value).toBeGreaterThan(150);
    const wrongDirection = structuredClone(spec);
    wrongDirection.riskDesign!.request!.approach = "same_direction";
    const invalid = simulateReference(map, wrongDirection).properties
      .validationReport;
    expect(invalid.riskObjective!.mechanism.passed).toBe(false);
    expect(invalid.passed).toBe(false);
  }, 30000);
  it("keeps both principals at or above 40 km/h on the straight approach, but not in the curve", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    const spec = createRiskScene(map, source(), styles, 42, {
      mechanism: "right_turn_merge",
      count: 5,
      outcome: "danger",
      minSpeedMps: 40 / 3.6,
    });
    const r = simulateReference(map, spec).properties.validationReport;
    expect(r.passed).toBe(true);
    const o = r.riskObjective!;
    expect(o.speedPassed).toBe(true);
    expect(o.speedThresholdMps).toBeCloseTo(40 / 3.6, 6);
    expect(o.approachCruise!.ego.available).toBe(true);
    expect(o.approachCruise!.event.available).toBe(true);
    expect(o.approachCruise!.ego.windowDurationS).toBeGreaterThanOrEqual(1.5);
    expect(o.approachCruise!.event.windowDurationS).toBeGreaterThanOrEqual(1.5);
    expect(o.approachCruise!.ego.minSpeedMps! + 1e-9).toBeGreaterThanOrEqual(
      40 / 3.6,
    );
    expect(o.approachCruise!.event.minSpeedMps! + 1e-9).toBeGreaterThanOrEqual(
      40 / 3.6,
    );
    // 转弯车在弯中按曲率自然减速：冲突点附近速度允许明显低于巡航下限。
    const conflict = r.actors.find((a) => a.id === "Conflict")!;
    expect(conflict.minimumSpeedMps).toBeLessThan(40 / 3.6 - 1);
    // 只约束两名主角：背景车不纳入 approachCruise。
    expect(o.approachCruise).not.toHaveProperty("follower");
    expect(spec.riskDesign!.sampledParameters!.eventSpeedMps).toBeGreaterThan(
      11.11,
    );
  }, 60000);
  it("independently rejects a tampered, higher cruise-speed floor against stored tracks", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    const spec = createRiskScene(map, source(), styles, 43, {
      mechanism: "crossing",
      count: 5,
      outcome: "danger",
      minSpeedMps: 40 / 3.6,
    });
    const accepted = simulateReference(map, spec).properties.validationReport;
    expect(accepted.passed).toBe(true);
    const measured = Math.min(
      accepted.riskObjective!.approachCruise!.ego.minSpeedMps!,
      accepted.riskObjective!.approachCruise!.event.minSpeedMps!,
    );
    // 只改需求阈值、不改轨迹：独立复算必须判失败，不采信生成端的 speedPassed。
    const tampered = structuredClone(spec);
    tampered.riskDesign!.request!.minSpeedMps = measured + 1;
    const rejected = simulateReference(map, tampered).properties
      .validationReport;
    expect(rejected.riskObjective!.speedPassed).toBe(false);
    expect(rejected.passed).toBe(false);
    // 阈值与实测相等时按 ≥ 边界放行。
    const exact = structuredClone(spec);
    exact.riskDesign!.request!.minSpeedMps = measured;
    expect(
      simulateReference(map, exact).properties.validationReport.riskObjective!
        .speedPassed,
    ).toBe(true);
  }, 60000);
  it("fails honestly when the inlet is too short for the explicit cruise speed", async () => {
    // 40 km/h 巡航需要约 80 m 冲突前导距；裁剪过的 cross_0001 进口道放不下，
    // 穷尽搜索后错误原因必须指出速度/直线段瓶颈，而不是泛化的几何原因。
    const map = await loadMap(root, "cross_0001");
    expect(() =>
      createRiskScene(map, source(), styles, 42, {
        mechanism: "oncoming_intrusion",
        count: 5,
        outcome: "danger",
        minSpeedMps: 40 / 3.6,
      }),
    ).toThrow(/显式巡航速度/);
  }, 30000);
  it("rejects cruise floors beyond the generation ceiling before searching", async () => {
    const map = await loadMap(root, "risk-fixture-cross");
    expect(() =>
      createRiskScene(map, source(), styles, 42, {
        mechanism: "crossing",
        count: 5,
        outcome: "danger",
        minSpeedMps: 22,
      }),
    ).toThrow(/17 m\/s/);
  });
});
