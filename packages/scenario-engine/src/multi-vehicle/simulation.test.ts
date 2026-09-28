import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadMap } from "../index.js";
import type { MapModel } from "../index.js";
import { simulateMultiVehicle, validateSceneSpec } from "./simulation.js";
import { evaluateBehaviorObjective } from "./behavior-objective.js";
import { createMultiVehicleTemplate } from "./template.js";
const map: MapModel = {
  mapId: "test-road",
  origin: [116, 40],
  roads: [
    {
      id: "right",
      widthM: 3.5,
      centerline: [
        [0, 0],
        [2000, 0],
      ],
      lengthM: 2000,
      entryHeadingDeg: 0,
    },
    {
      id: "left",
      widthM: 3.5,
      centerline: [
        [0, 3.5],
        [2000, 3.5],
      ],
      lengthM: 2000,
      entryHeadingDeg: 0,
    },
  ],
  successors: [],
  adjacentSameDirection: [
    {
      from: "right",
      to: "left",
      side: "left",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
  ],
};
describe("multi-vehicle closed loop", () => {
  it("does not treat physical success as proof of collision or near-miss objectives", () => {
    const spec = createMultiVehicleTemplate(map);
    const trajectory = simulateMultiVehicle(map, spec);
    const goal = {
      summary: "切入",
      count: 5,
      requiredActions: ["lane_change" as const],
      outcome: "behavior" as const,
    };
    expect(evaluateBehaviorObjective(spec, trajectory, goal).passed).toBe(true);
    expect(
      evaluateBehaviorObjective(spec, trajectory, {
        ...goal,
        outcome: "collision",
      }).passed,
    ).toBe(false);
    const far = structuredClone(trajectory);
    for (const feature of far.features) {
      const p = feature.properties as Record<string, any>;
      if (p.actor === "CutIn" && p.featureType === "trajectoryPoint")
        p.localY += 100;
    }
    expect(
      evaluateBehaviorObjective(spec, far, { ...goal, outcome: "near_miss" })
        .passed,
    ).toBe(false);
  });

  it("waits for a predecessor to complete before braking and rejects dependency cycles", () => {
    const spec = createMultiVehicleTemplate(map);
    const first = spec.events[0]!;
    spec.durationS = 16;
    spec.events.push({
      id: "after-cut-in",
      actorId: first.actorId,
      action: "brake",
      trigger: { earliestS: 8, latestS: 10, afterEventId: first.id },
      durationS: 4,
      targetSpeedMps: 4,
      minimumTargetGapM: 5,
    });
    const records = simulateMultiVehicle(map, spec).properties.validationReport
      .events;
    expect(records[0]!.status).toBe("completed");
    expect(records[1]!.startedAt).toBeGreaterThanOrEqual(
      records[0]!.completedAt!,
    );
    first.trigger.leaderGapBelowM = 1;
    const failed = simulateMultiVehicle(map, spec).properties.validationReport
      .events;
    expect(failed[0]!.status).toBe("missed");
    expect(failed[1]!.startedAt).toBeUndefined();
    first.trigger.afterEventId = "after-cut-in";
    expect(() => validateSceneSpec(map, spec)).toThrow(/依赖/);
  });

  it("runs a validated 20-car scenario on the real Xushui road", async () => {
    const real = await loadMap(
      fileURLToPath(
        new URL("../../../../apps/api/data/maps/", import.meta.url),
      ),
      "xushui-expressway",
    );
    expect(
      simulateMultiVehicle(real, createMultiVehicleTemplate(real, 20))
        .properties.validationReport.passed,
    ).toBe(true);
  });
  it("distinguishes allowed collisions from actually collision-free traffic, including background pairs", () => {
    const spec = createMultiVehicleTemplate(map);
    const follower = spec.actors.find((a) => a.id === "Follower")!;
    follower.controlMode = "replay";
    follower.speedMps = 0;
    follower.replay = [
      { t: 0, positionM: follower.positionM },
      { t: 12, positionM: follower.positionM },
    ];
    const rear = spec.actors.find((a) => a.id === "Rear")!;
    rear.speedMps = 25;
    rear.profile.reactionTimeS = 2;
    const first = simulateMultiVehicle(map, spec).properties.validationReport
      .risk;
    expect(first.collisionFree).toBe(false);
    expect(
      first.collisions.some(
        (c) => c.actors.includes("Rear") && c.actors.includes("Follower"),
      ),
    ).toBe(true);
    spec.constraints.allowedCollisionPairs = first.collisions.map(
      (c) => c.actors as [string, string],
    );
    expect(
      simulateMultiVehicle(map, spec).properties.validationReport.risk,
    ).toMatchObject({ passed: true, collisionFree: false });
  });
  it("generates a feasible cut-in and reactive braking for five vehicles", () => {
    const spec = createMultiVehicleTemplate(map);
    const result = simulateMultiVehicle(map, spec);
    expect(
      result.properties.validationReport,
      JSON.stringify(result.properties.validationReport),
    ).toMatchObject({ passed: true });
    expect(result.properties.validationReport.events[0]).toMatchObject({
      status: "completed",
    });
    expect(
      result.properties.validationReport.actors
        .filter((a) => ["Ego", "Follower", "Rear"].includes(a.id))
        .every(
          (a) =>
            a.maximumBrakingMps2! >= spec.objectives.minimumResponseBrakingMps2,
        ),
    ).toBe(true);
    const baseline = simulateMultiVehicle(map, {
      ...spec,
      events: [],
      objectives: { requiredEventIds: [], respondingActorIds: [] },
    });
    for (const id of ["Ego", "Follower", "Rear"]) {
      expect(
        result.properties.validationReport.actors.find((a) => a.id === id)!
          .minimumSpeedMps!,
      ).toBeLessThan(
        baseline.properties.validationReport.actors.find((a) => a.id === id)!
          .minimumSpeedMps! - 0.3,
      );
    }
  });
  it("is deterministic and independent of actor input order", () => {
    const spec = createMultiVehicleTemplate(map);
    const first = simulateMultiVehicle(map, spec);
    expect(simulateMultiVehicle(map, spec)).toEqual(first);
    expect(
      simulateMultiVehicle(map, {
        ...spec,
        actors: [...spec.actors].reverse(),
      }),
    ).toEqual(first);
    expect(createMultiVehicleTemplate(map, 5, 41).actors).not.toEqual(
      spec.actors,
    );
  });
  it("checks all pairs including background vehicles", () => {
    const spec = createMultiVehicleTemplate(map);
    spec.actors[4]!.positionM = spec.actors[2]!.positionM;
    expect(() => validateSceneSpec(map, spec)).toThrow("初始车身重叠");
  });
  it("reports missed conditions without silently changing the objective", () => {
    const spec = createMultiVehicleTemplate(map);
    spec.events[0]!.trigger.leaderGapBelowM = 1;
    const result = simulateMultiVehicle(map, spec);
    expect(result.properties.validationReport.semantic.passed).toBe(false);
    expect(result.properties.validationReport.events[0]!.status).toBe("missed");
  });
  it("requires an external controller rather than pretending to test an algorithm", () => {
    const spec = createMultiVehicleTemplate(map);
    spec.actors[0]!.controlMode = "external";
    expect(() => simulateMultiVehicle(map, spec)).toThrow("外部控制器");
  });
  it("rejects impossible routes and duplicate ids", () => {
    const spec = createMultiVehicleTemplate(map);
    spec.actors[0]!.route.push("right");
    expect(() => validateSceneSpec(map, spec)).toThrow("不连通");
    spec.actors[0]!.route = [];
    spec.actors[1]!.id = spec.actors[0]!.id;
    expect(() => validateSceneSpec(map, spec)).toThrow();
  });
  it("supports larger populations and does not silently reduce their count", () => {
    const spec = createMultiVehicleTemplate(map, 20);
    expect(
      simulateMultiVehicle(map, spec).properties.validationReport.actors,
    ).toHaveLength(20);
  });
});
