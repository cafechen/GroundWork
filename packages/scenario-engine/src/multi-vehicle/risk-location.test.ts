import { describe, expect, it } from "vitest";
import type { MapModel } from "../index.js";
import { createMultiVehicleTemplate } from "./template.js";
import { simulateMultiVehicle } from "./simulation.js";
import { evaluateBehaviorObjective } from "./behavior-objective.js";
import {
  describeMapAffordances,
  compileScenarioPlan,
} from "./scenario-plan.js";
import { resolveRiskLocation } from "./risk-location.js";

const map: MapModel = {
  mapId: "location-test",
  origin: [116, 40],
  successors: [],
  adjacentSameDirection: [
    {
      from: "r",
      to: "l",
      side: "left",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
  ],
  roads: [0, 3.5].map((y, i) => ({
    id: i ? "l" : "r",
    widthM: 3.5,
    lengthM: 2000,
    entryHeadingDeg: 0,
    centerline: [
      [0, y],
      [2000, y],
    ],
  })),
};
map.roads.push({
  id: "connector",
  widthM: 3.5,
  lengthM: 20,
  entryHeadingDeg: 0,
  centerline: [
    [100, 0],
    [120, 0],
  ],
  polygon: [
    [100, -10],
    [120, -10],
    [120, 10],
    [100, 10],
    [100, -10],
  ],
  junction: {
    id: "j1",
    from: "r",
    to: "l",
    turn: "straight",
    maxCurvature: 0,
    stopPositionM: 0,
  },
});

function evaluate(
  xs: number[],
  patch: Record<string, unknown> = {},
  selectedMap: MapModel | null = map,
  gap = 3,
  backgroundCollision = false,
) {
  const spec = createMultiVehicleTemplate(map);
  const trajectory = simulateMultiVehicle(map, spec);
  const ego = spec.actors.find((a) => a.role === "ego")!;
  const event = spec.actors.find((a) => a.role === "event")!;
  spec.events = [];
  trajectory.properties.validationReport.passed = true;
  trajectory.properties.validationReport.risk.collisionFree = gap > 4.7;
  trajectory.features = xs.flatMap((x, t) =>
    [
      { actor: ego.id, localX: x, speedMps: 10 },
      { actor: event.id, localX: x + gap, speedMps: 5 },
    ].map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: {
        ...p,
        featureType: "trajectoryPoint",
        localY: 0,
        headingRad: 0,
        t,
      },
    })),
  ) as any;
  if (backgroundCollision) {
    for (const [i, actor] of spec.actors.slice(2, 4).entries())
      trajectory.features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {
          actor: actor.id,
          localX: 500 + i * 3,
          localY: 0,
          speedMps: i ? 0 : 5,
          headingRad: 0,
          t: 0,
          featureType: "trajectoryPoint",
        },
      } as any);
  }
  const goal: any = {
    summary: "路口内追尾",
    count: 5,
    requiredActions: [],
    outcome: "collision",
    riskLocation: {
      region: "junction_interior",
      junctionId: "j1",
      maxDistanceM: 0,
    },
    ...patch,
  };
  return evaluateBehaviorObjective(
    spec,
    trajectory,
    goal,
    selectedMap ?? undefined,
  );
}

describe("accident location from actual trajectories", () => {
  it("rejects a collision far upstream even when the path later enters the junction", () => {
    const result = evaluate([20, 110]);
    expect(result.passed).toBe(false);
    expect(result.locationPassed).toBe(false);
    expect(result.pairs[0]?.location).toMatchObject({
      passed: false,
      timeS: 0,
    });
  });
  it("accepts the first collision inside the requested junction", () => {
    expect(evaluate([110]).passed).toBe(true);
  });
  it("does not accept an in-region target collision alongside an out-of-region background accident", () => {
    expect(evaluate([110], {}, map, 3, true).passed).toBe(false);
  });
  it("uses the explicit distance from the polygon for nearby requests", () => {
    const location = {
      region: "junction_nearby",
      junctionId: "j1",
      maxDistanceM: 10,
    };
    expect(evaluate([92], { riskLocation: location }).passed).toBe(true);
    expect(evaluate([82], { riskLocation: location }).passed).toBe(false);
  });
  it("fails closed for missing geometry, wrong junction and missing map", () => {
    expect(
      evaluate(
        [110],
        {},
        { ...map, roads: map.roads.filter((r) => !r.junction) },
      ).passed,
    ).toBe(false);
    expect(
      evaluate([110], {
        riskLocation: {
          region: "junction_interior",
          junctionId: "other",
          maxDistanceM: 0,
        },
      }).passed,
    ).toBe(false);
    expect(
      evaluate(
        [110],
        {},
        { ...map, roads: map.roads.map((r) => ({ ...r, polygon: undefined })) },
      ).passed,
    ).toBe(false);
    expect(evaluate([110], {}, null).passed).toBe(false);
  });
  it("checks near-miss closest approach in the same region", () => {
    expect(evaluate([110], { outcome: "near_miss" }, map, 5).passed).toBe(true);
    expect(evaluate([20], { outcome: "near_miss" }, map, 5).passed).toBe(false);
  });
  it("does not choose an arbitrary junction when multiple junctions exist", () => {
    const other = structuredClone(map.roads.at(-1)!);
    other.id = "second";
    other.junction!.id = "j2";
    expect(() =>
      resolveRiskLocation(
        { ...map, roads: [...map.roads, other] },
        { region: "junction_interior", maxDistanceM: 0 },
      ),
    ).toThrow(/多个路口/);
    expect(
      resolveRiskLocation(map, { region: "junction_interior", maxDistanceM: 0 })
        .junctionId,
    ).toBe("j1");
  });
  it("compiles and executes a model-style two-car junction collision with real behavior dynamics", () => {
    const catalog = describeMapAffordances(map);
    const goal = {
      summary: "路口内追尾",
      count: 2,
      requiredActions: [],
      outcome: "collision" as const,
      riskLocation: {
        region: "junction_interior" as const,
        junctionId: "j1",
        maxDistanceM: 0 as const,
      },
    };
    const spec = compileScenarioPlan(map, catalog, {
      schemaVersion: 1,
      title: goal.summary,
      summary: goal.summary,
      mapId: map.mapId,
      mapVersion: catalog.mapVersion,
      seed: 42,
      durationS: 5,
      actors: [
        {
          id: "Ego",
          name: "后车",
          role: "ego",
          movementId: "mv-r",
          positionM: 100,
          speedMps: 15,
          profile: { reactionTimeS: 2, desiredSpeedMps: 15 },
        },
        {
          id: "Event",
          name: "前车",
          role: "event",
          movementId: "mv-r",
          positionM: 115,
          speedMps: 0,
          profile: { desiredSpeedMps: 0.1 },
        },
      ],
      events: [],
      objectives: {
        outcome: goal.outcome,
        requiredEventIds: [],
        respondingActorIds: ["Ego"],
        riskLocation: goal.riskLocation,
      },
      constraints: { allowedCollisionPairs: [["Ego", "Event"]] },
    });
    expect(spec.objectives.riskLocation).toEqual(goal.riskLocation);
    expect(spec.objectives.respondingActorIds).toEqual([]);
    expect(spec.junction?.nonYieldingActorIds).toEqual([]);
    expect(
      spec.actors.every((actor) => actor.profile.collisionAvoidance === false),
    ).toBe(true);
    const trajectory = simulateMultiVehicle(map, spec);
    const report = evaluateBehaviorObjective(spec, trajectory, goal, map);
    expect(report.pairs[0]?.collision).toBe(true);
    expect(report.locationPassed).toBe(true);
    expect(report.passed).toBe(true);

    const collisionTimeS = report.pairs[0]!.location!.timeS;
    const postCollisionNoise = structuredClone(trajectory);
    const noisyValidation = postCollisionNoise.properties.validationReport;
    noisyValidation.passed = false;
    noisyValidation.physical.passed = false;
    noisyValidation.physical.violations.push({
      actorId: "Ego",
      kind: "lane_boundary",
      time: collisionTimeS + 1,
      value: 1,
    });
    noisyValidation.junction!.passed = false;
    noisyValidation.junction!.missingTraversals = ["Ego", "Event"];
    const terminal = evaluateBehaviorObjective(
      spec,
      postCollisionNoise,
      goal,
      map,
    );
    expect(terminal.passed).toBe(true);
    expect(terminal.validation).toMatchObject({
      passed: true,
      physical: { passed: true, violations: [] },
      junction: { passed: true, missingTraversals: [] },
      terminalCollision: {
        timeS: collisionTimeS,
        actors: ["Ego", "Event"],
      },
    });

    const preCollisionViolation = structuredClone(postCollisionNoise);
    preCollisionViolation.properties.validationReport.physical.violations[0]!.time =
      collisionTimeS - 0.1;
    expect(
      evaluateBehaviorObjective(spec, preCollisionViolation, goal, map).passed,
    ).toBe(false);

    const elsewhere = structuredClone(map);
    elsewhere.roads.at(-1)!.polygon = [
      [500, -10],
      [520, -10],
      [520, 10],
      [500, 10],
      [500, -10],
    ];
    expect(
      evaluateBehaviorObjective(spec, trajectory, goal, elsewhere).passed,
    ).toBe(false);
  });
  it("keeps unrestricted legacy goals compatible", () => {
    expect(evaluate([20], { riskLocation: undefined }).passed).toBe(true);
  });
  it("exposes real junction identifiers to the plan designer", () => {
    const catalog = describeMapAffordances(map);
    expect(
      catalog.movements.find((m) => m.id === "mv-connector"),
    ).toMatchObject({ junctionId: "j1" });
    expect(catalog.junctions).toContainEqual({
      id: "j1",
      regionAvailable: true,
    });
  });
  it("keeps a complete route for the requested junction in a crowded compact catalog", () => {
    const crowded: MapModel = {
      ...map,
      roads: [
        ...map.roads,
        ...Array.from({ length: 40 }, (_, i) => ({
          ...map.roads[0]!,
          id: `unrelated-${i}`,
          lengthM: 10000,
        })),
      ],
      successors: [
        { from: "r", to: "connector" },
        { from: "connector", to: "l" },
      ],
    };
    const catalog = describeMapAffordances(crowded, 32, "j1");
    expect(catalog.movements.map((m) => m.id)).toEqual([
      "mv-connector",
      "mv-l",
      "mv-r",
    ]);
    expect(
      catalog.movements.find((m) => m.id === "mv-r")?.successorIds,
    ).toContain("mv-connector");
    expect(
      catalog.movements.find((m) => m.id === "mv-connector")?.successorIds,
    ).toContain("mv-l");
  });
});
