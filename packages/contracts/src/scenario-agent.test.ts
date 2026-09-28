import { describe, it, expect } from "vitest";
import {
  mapAffordanceCatalogSchema,
  scenarioIntentSchema,
  scenarioGoalSchema,
  scenarioPlanSchema,
} from "./scenario-agent.js";
describe("agent goal contract", () => {
  it("preserves an accident region and rejects a widened junction-interior constraint", () => {
    const base = {
      summary: "路口内追尾",
      count: 4,
      outcome: "collision",
      requiredActions: [],
    };
    const riskLocation = {
      region: "junction_interior",
      junctionId: "j1",
      maxDistanceM: 0,
    };
    expect(scenarioGoalSchema.parse({ ...base, riskLocation })).toMatchObject({
      riskLocation,
    });
    expect(() =>
      scenarioGoalSchema.parse({
        ...base,
        riskLocation: { ...riskLocation, maxDistanceM: 30 },
      }),
    ).toThrow();
    expect(() =>
      scenarioGoalSchema.parse({ ...base, outcome: "behavior", riskLocation }),
    ).toThrow();
  });
  it("accepts composed actions and four vehicles without reducing the request", () => {
    const goal = scenarioGoalSchema.parse({
      summary: "四车切入后制动",
      count: 4,
      outcome: "near_miss",
      requiredActions: ["lane_change", "brake"],
    });
    expect(goal.count).toBe(4);
    expect(goal.requiredActions).toHaveLength(2);
  });
  it("leaves vehicle count unconstrained when the user did not specify it", () => {
    const goal = scenarioGoalSchema.parse({
      summary: "路口内追尾",
      outcome: "collision",
      requiredActions: ["brake"],
    });
    expect(goal).not.toHaveProperty("count");
  });
  it("rejects unsupported actions and invalid counts instead of silently removing them", () => {
    expect(() =>
      scenarioGoalSchema.parse({
        summary: "行人",
        count: 1,
        outcome: "behavior",
        requiredActions: ["walk"],
      }),
    ).toThrow();
    expect(() =>
      scenarioIntentSchema.parse({
        action: "generate",
        goal: {
          summary: "测试",
          count: 51,
          outcome: "behavior",
          requiredActions: [],
        },
      }),
    ).toThrow();
  });
  it("cross-validates the near-miss gap corridor at intent level", () => {
    const base = {
      summary: "近失走廊",
      count: 5,
      requiredActions: [],
      legacyRisk: { mechanism: "crossing", minGapM: 0.2 },
    } as const;
    expect(() =>
      scenarioGoalSchema.parse({ ...base, outcome: "danger" }),
    ).toThrow(/near_miss/);
    expect(() =>
      scenarioGoalSchema.parse({
        ...base,
        outcome: "near_miss",
        legacyRisk: { mechanism: "crossing", minGapM: 0.5, maxGapM: 0.3 },
      }),
    ).toThrow(/走廊/);
    expect(
      scenarioGoalSchema.parse({
        ...base,
        outcome: "near_miss",
        legacyRisk: { mechanism: "crossing", minGapM: 0.2, maxGapM: 0.6 },
      }).legacyRisk?.minGapM,
    ).toBe(0.2);
  });
});

it("preserves a legacy mechanism in a structured goal without changing explicit count", () => {
  const parsed = scenarioGoalSchema.parse({
    summary: "四车对向越线",
    count: 4,
    outcome: "near_miss",
    requiredActions: [],
    legacyRisk: { mechanism: "oncoming_intrusion", approach: "opposing" },
  });
  expect(parsed.count).toBe(4);
  expect(parsed.legacyRisk?.mechanism).toBe("oncoming_intrusion");
});

it("passes the explicit cruise-speed floor through the legacy-risk goal subset", () => {
  const parsed = scenarioGoalSchema.parse({
    summary: "两车均按 40 公里每小时以上接近",
    count: 5,
    outcome: "danger",
    requiredActions: [],
    legacyRisk: { mechanism: "right_turn_merge", minSpeedMps: 11.11 },
  });
  expect(parsed.legacyRisk?.minSpeedMps).toBe(11.11);
});

it("accepts a model-authored plan using map-issued movement ids and causal events", () => {
  const catalog = mapAffordanceCatalogSchema.parse({
    mapId: "road",
    mapVersion: "v1",
    movements: [
      {
        id: "mv-left",
        laneIds: ["left"],
        kind: "road",
        lengthM: 300,
        successorIds: [],
        adjacent: [{ movementId: "mv-right", side: "right" }],
      },
      {
        id: "mv-right",
        laneIds: ["right"],
        kind: "road",
        lengthM: 300,
        successorIds: [],
        adjacent: [{ movementId: "mv-left", side: "left" }],
      },
    ],
    conflicts: [],
  });
  const plan = scenarioPlanSchema.parse({
    schemaVersion: 1,
    title: "前车制动后事件车向右切入",
    summary: "模型选择实际 movement 并设计事件因果顺序",
    mapId: catalog.mapId,
    mapVersion: catalog.mapVersion,
    seed: 7,
    durationS: 12,
    actors: [
      {
        id: "Ego",
        name: "被测车",
        role: "ego",
        movementId: "mv-right",
        positionM: 50,
        speedMps: 10,
        profile: {},
      },
      {
        id: "Event",
        name: "事件车",
        role: "event",
        movementId: "mv-left",
        positionM: 60,
        speedMps: 9,
        profile: {},
      },
    ],
    events: [
      {
        id: "brake-first",
        actorId: "Event",
        action: "brake",
        trigger: { earliestS: 1, latestS: 2 },
        durationS: 2,
        targetSpeedMps: 6,
      },
      {
        id: "change-after-brake",
        actorId: "Event",
        action: "lane_change",
        targetMovementId: "mv-right",
        trigger: {
          earliestS: 4,
          latestS: 5,
          afterEventId: "brake-first",
        },
        durationS: 3,
      },
    ],
    objectives: {
      outcome: "near_miss",
      requiredEventIds: ["brake-first", "change-after-brake"],
      respondingActorIds: ["Ego"],
    },
    constraints: { allowedCollisionPairs: [] },
    variations: [
      {
        target: "actor_speed",
        actorId: "Event",
        min: 8,
        max: 11,
      },
    ],
  });
  expect(plan.actors[1]?.movementId).toBe("mv-left");
  expect(plan.events[1]?.trigger.afterEventId).toBe("brake-first");
  expect(plan.variations[0]?.target).toBe("actor_speed");
});

it("requires every variation to identify an existing actor or event", () => {
  const base = scenarioPlanSchema.parse({
    schemaVersion: 1,
    title: "参数化场景",
    summary: "用种子采样事件车速度",
    mapId: "map",
    mapVersion: "version",
    seed: 7,
    durationS: 10,
    actors: [
      {
        id: "Ego",
        name: "被测车",
        role: "ego",
        movementId: "mv-main",
        positionM: 10,
        speedMps: 8,
        profile: {},
      },
      {
        id: "Event",
        name: "事件车",
        role: "event",
        movementId: "mv-main",
        positionM: 30,
        speedMps: 6,
        profile: {},
      },
    ],
    events: [],
    objectives: { outcome: "near_miss", requiredEventIds: [] },
    constraints: {},
    variations: [],
  });
  expect(() =>
    scenarioPlanSchema.parse({
      ...base,
      variations: [
        { target: "actor_speed", actorId: "Missing", min: 4, max: 8 },
      ],
    }),
  ).toThrow(/变化参数引用了未知参与者/);
  expect(() =>
    scenarioPlanSchema.parse({
      ...base,
      variations: [{ target: "event_start", min: 1, max: 3 }],
    }),
  ).toThrow(/事件变化参数必须指定 eventId/);
});
