import { describe, expect, it } from "vitest";
import type { ScenarioPlan } from "@groundwork/contracts";
import type { MapModel } from "../index.js";
import {
  compileScenarioPlan,
  describeMapAffordances,
} from "./scenario-plan.js";
import { bodyWithinLanes, dimensions, lanePoint } from "./geometry.js";

const map: MapModel = {
  mapId: "plan-road",
  origin: [116, 40],
  roads: [0, 3.5].map((y, index) => ({
    id: index ? "left" : "right",
    widthM: 3.5,
    lengthM: 400,
    entryHeadingDeg: 0,
    centerline: [
      [0, y],
      [400, y],
    ],
  })),
  successors: [],
  adjacentSameDirection: [
    {
      from: "left",
      to: "right",
      side: "right",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
    {
      from: "right",
      to: "left",
      side: "left",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
  ],
};

describe("model-authored scenario plans", () => {
  it("describes map affordances with stable movement ids and no geometry payload", () => {
    const catalog = describeMapAffordances(map);
    expect(catalog.movements).toMatchObject([
      { id: "mv-left", laneIds: ["left"], kind: "road" },
      { id: "mv-right", laneIds: ["right"], kind: "road" },
    ]);
    expect(catalog.movements[0]?.adjacent).toEqual([
      { movementId: "mv-right", side: "right" },
    ]);
    expect(catalog.movements[0]?.initialCenterRangeM).toEqual({
      car: [2.35, 397.65],
      heavy_truck: [6, 394],
    });
    expect(JSON.stringify(catalog)).not.toContain("centerline");
  });

  it("repairs initial positions at lane ends before trajectory validation", () => {
    const catalog = describeMapAffordances(map);
    const spec = compileScenarioPlan(map, catalog, {
      schemaVersion: 1,
      title: "修复车道端点",
      summary: "车辆中心必须为完整车身留出空间",
      mapId: map.mapId,
      mapVersion: catalog.mapVersion,
      seed: 1,
      durationS: 8,
      actors: [
        {
          id: "Rear",
          name: "后车",
          role: "ego",
          movementId: "mv-right",
          positionM: 0,
          speedMps: 8,
          profile: {},
        },
        {
          id: "Front",
          name: "前车",
          role: "event",
          movementId: "mv-left",
          positionM: 399,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [],
      objectives: { outcome: "behavior", requiredEventIds: [] },
      constraints: {},
    });

    expect(spec.actors.find((actor) => actor.id === "Rear")?.positionM).toBe(
      2.35,
    );
    expect(spec.actors.find((actor) => actor.id === "Front")?.positionM).toBe(
      397.65,
    );
  });

  it("separates initially overlapping vehicles while preserving their order", () => {
    const catalog = describeMapAffordances(map);
    const spec = compileScenarioPlan(map, catalog, {
      schemaVersion: 1,
      title: "修复初始重叠",
      summary: "同车道车辆按模型给出的前后顺序留出车身间隔",
      mapId: map.mapId,
      mapVersion: catalog.mapVersion,
      seed: 1,
      durationS: 8,
      actors: [
        {
          id: "Rear",
          name: "后车",
          role: "ego",
          movementId: "mv-right",
          positionM: 2.5,
          speedMps: 10,
          profile: {},
        },
        {
          id: "Front",
          name: "前车",
          role: "event",
          movementId: "mv-right",
          positionM: 6.5,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [],
      objectives: { outcome: "behavior", requiredEventIds: [] },
      constraints: {},
    });

    const rear = spec.actors.find((actor) => actor.id === "Rear")!;
    const front = spec.actors.find((actor) => actor.id === "Front")!;
    expect(rear.positionM).toBe(2.5);
    expect(front.positionM).toBeGreaterThanOrEqual(7.45);
  });

  it("moves an actor to the nearest position where its complete footprint fits the real lane polygon", () => {
    const boundedRoad = {
      id: "bounded",
      widthM: 4,
      lengthM: 100,
      entryHeadingDeg: 0,
      centerline: [
        [0, 0],
        [100, 0],
      ] as [number, number][],
      polygon: [
        [5, -2],
        [100, -2],
        [100, 2],
        [5, 2],
        [5, -2],
      ] as [number, number][],
    };
    const boundedMap: MapModel = {
      mapId: "bounded-road",
      origin: [116, 40],
      roads: [boundedRoad],
      successors: [],
      adjacentSameDirection: [],
    };
    const catalog = describeMapAffordances(boundedMap);
    const spec = compileScenarioPlan(boundedMap, catalog, {
      schemaVersion: 1,
      title: "真实边界修复",
      summary: "车身必须完整落入地图提供的 polygon",
      mapId: boundedMap.mapId,
      mapVersion: catalog.mapVersion,
      seed: 1,
      durationS: 8,
      actors: [
        {
          id: "Rear",
          name: "后车",
          role: "ego",
          movementId: "mv-bounded",
          positionM: 2.35,
          speedMps: 8,
          profile: {},
        },
        {
          id: "Front",
          name: "前车",
          role: "event",
          movementId: "mv-bounded",
          positionM: 30,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [],
      objectives: { outcome: "behavior", requiredEventIds: [] },
      constraints: {},
    });
    const rear = spec.actors.find((actor) => actor.id === "Rear")!;
    expect(rear.positionM).toBeGreaterThanOrEqual(7.35);
    expect(
      bodyWithinLanes(
        {
          ...lanePoint(boundedRoad, rear.positionM),
          ...dimensions(rear.vehicleType),
        },
        [boundedRoad],
      ),
    ).toBe(true);
    expect(
      catalog.movements[0]?.initialCenterRangeM?.car?.[0],
    ).toBeGreaterThanOrEqual(7.35);
  });

  it("places leading vehicles on a connected successor when the short initial segment cannot contain the queue", () => {
    const routedMap: MapModel = {
      mapId: "short-approach",
      origin: [116, 40],
      roads: [
        {
          id: "approach",
          widthM: 3.5,
          lengthM: 9.5,
          entryHeadingDeg: 0,
          centerline: [
            [0, 0],
            [9.5, 0],
          ],
        },
        {
          id: "connector",
          widthM: 3.5,
          lengthM: 60,
          entryHeadingDeg: 0,
          centerline: [
            [9.5, 0],
            [69.5, 0],
          ],
          junction: {
            id: "j1",
            from: "approach",
            to: "exit",
            turn: "straight",
            stopPositionM: 0,
          },
        },
      ],
      successors: [{ from: "approach", to: "connector" }],
      adjacentSameDirection: [],
    };
    const catalog = describeMapAffordances(routedMap, 32, "j1");
    const spec = compileScenarioPlan(routedMap, catalog, {
      schemaVersion: 1,
      title: "短进口道队列",
      summary: "前车沿连续路线进入下一段，后车留在进口段",
      mapId: routedMap.mapId,
      mapVersion: catalog.mapVersion,
      seed: 1,
      durationS: 8,
      actors: [
        {
          id: "Rear",
          name: "后车",
          role: "ego",
          movementId: "mv-approach",
          routeMovementIds: ["mv-connector"],
          positionM: 2,
          speedMps: 10,
          profile: {},
        },
        {
          id: "Front",
          name: "前车",
          role: "event",
          movementId: "mv-approach",
          routeMovementIds: ["mv-connector"],
          positionM: 7,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [],
      junction: {
        priorities: {},
        nonYieldingActorIds: [],
        requiredTraversalActorIds: ["Rear", "Front"],
      },
      objectives: { outcome: "behavior", requiredEventIds: [] },
      constraints: {},
    });

    expect(spec.actors.find((actor) => actor.id === "Rear")).toMatchObject({
      laneId: "approach",
      route: ["approach", "connector"],
    });
    expect(spec.actors.find((actor) => actor.id === "Front")).toMatchObject({
      laneId: "connector",
      route: ["connector"],
    });
  });

  it("caps dense conflict catalogs at the schema limit", () => {
    const crowded: MapModel = {
      mapId: "dense-conflicts",
      origin: [116, 40],
      roads: Array.from({ length: 32 }, (_, index) => ({
        id: `road-${index}`,
        widthM: 3.5,
        lengthM: 10,
        entryHeadingDeg: index % 2 ? 180 : 0,
        centerline:
          index % 2
            ? ([
                [10, 0],
                [0, 0],
              ] as [number, number][])
            : ([
                [0, 0],
                [10, 0],
              ] as [number, number][]),
      })),
      successors: [],
      adjacentSameDirection: [],
    };

    const catalog = describeMapAffordances(crowded);
    expect(catalog.conflicts).toHaveLength(96);
    expect(catalog.conflicts.at(-1)?.id).toBe("conflict-96");
  });

  it("compiles movement choices, causal lane changes and yielding into SceneSpecV2", () => {
    const catalog = describeMapAffordances(map);
    const plan: ScenarioPlan = {
      schemaVersion: 1,
      title: "制动后切入",
      summary: "事件车先让行制动，再切入被测车车道",
      mapId: map.mapId,
      mapVersion: catalog.mapVersion,
      seed: 9,
      durationS: 12,
      actors: [
        {
          id: "Ego",
          name: "被测车",
          role: "ego",
          vehicleType: "car",
          movementId: "mv-right",
          routeMovementIds: [],
          positionM: 80,
          speedMps: 10,
          profile: {
            desiredSpeedMps: 11,
            timeHeadwayS: 1.5,
            reactionTimeS: 0.5,
            minimumGapM: 3,
            maxAccelerationMps2: 2,
            comfortableBrakingMps2: 2.5,
          },
        },
        {
          id: "Event",
          name: "事件车",
          role: "event",
          vehicleType: "car",
          movementId: "mv-left",
          routeMovementIds: [],
          positionM: 90,
          speedMps: 9,
          profile: {
            desiredSpeedMps: 9,
            timeHeadwayS: 1.2,
            reactionTimeS: 0.4,
            minimumGapM: 2,
            maxAccelerationMps2: 2,
            comfortableBrakingMps2: 2.5,
          },
        },
      ],
      events: [
        {
          id: "yield-first",
          actorId: "Event",
          action: "yield",
          trigger: { earliestS: 1, latestS: 2 },
          durationS: 2,
          targetSpeedMps: 6,
          minimumTargetGapM: 3,
        },
        {
          id: "merge-after-yield",
          actorId: "Event",
          action: "lane_change",
          targetMovementId: "mv-right",
          trigger: {
            earliestS: 4,
            latestS: 5,
            afterEventId: "yield-first",
          },
          durationS: 3,
          minimumTargetGapM: 3,
        },
      ],
      objectives: {
        outcome: "near_miss",
        requiredEventIds: ["yield-first", "merge-after-yield"],
        respondingActorIds: ["Ego"],
        minimumResponseBrakingMps2: 0.3,
      },
      constraints: {
        maxSpeedMps: 25,
        maxDecelerationMps2: 6,
        maxLateralAccelerationMps2: 4,
        maxJerkMps3: 10,
        maxYawRateRadS: 0.6,
        allowedCollisionPairs: [],
      },
      variations: [],
    };

    const spec = compileScenarioPlan(map, catalog, plan);
    expect(spec.actors[1]).toMatchObject({
      laneId: "left",
      route: ["left"],
    });
    expect(spec.events).toMatchObject([
      { id: "yield-first", action: "brake" },
      {
        id: "merge-after-yield",
        action: "lane_change",
        targetLaneId: "right",
        trigger: { afterEventId: "yield-first" },
      },
    ]);
  });

  it("rejects movement ids that were not issued by the selected map", () => {
    const catalog = describeMapAffordances(map);
    const invalid = {
      schemaVersion: 1,
      title: "伪造车道",
      summary: "不能使用模型发明的 movement",
      mapId: map.mapId,
      mapVersion: catalog.mapVersion,
      seed: 1,
      durationS: 8,
      actors: [
        {
          id: "Ego",
          name: "被测车",
          role: "ego",
          movementId: "invented",
          positionM: 30,
          speedMps: 8,
          profile: {},
        },
        {
          id: "Event",
          name: "事件车",
          role: "event",
          movementId: "mv-left",
          positionM: 45,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [],
      objectives: { outcome: "behavior", requiredEventIds: [] },
      constraints: {},
    };
    expect(() => compileScenarioPlan(map, catalog, invalid)).toThrow(
      /invented.*不存在/,
    );
  });

  it("rejects routes and lane changes that violate the issued topology", () => {
    const extended: MapModel = {
      ...map,
      roads: [
        ...map.roads,
        {
          id: "isolated",
          widthM: 3.5,
          lengthM: 400,
          entryHeadingDeg: 0,
          centerline: [
            [0, 30],
            [400, 30],
          ],
        },
      ],
    };
    const catalog = describeMapAffordances(extended);
    const base = {
      schemaVersion: 1,
      title: "拓扑检查",
      summary: "不能跨越不存在的连接",
      mapId: extended.mapId,
      mapVersion: catalog.mapVersion,
      seed: 1,
      durationS: 8,
      actors: [
        {
          id: "Ego",
          name: "被测车",
          role: "ego",
          movementId: "mv-right",
          positionM: 30,
          speedMps: 8,
          profile: {},
        },
        {
          id: "Event",
          name: "事件车",
          role: "event",
          movementId: "mv-left",
          positionM: 45,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [],
      objectives: { outcome: "behavior", requiredEventIds: [] },
      constraints: {},
    };
    expect(() =>
      compileScenarioPlan(extended, catalog, {
        ...base,
        actors: [
          { ...base.actors[0], routeMovementIds: ["mv-isolated"] },
          base.actors[1],
        ],
      }),
    ).toThrow(/不是.*连续 successor/);
    expect(() =>
      compileScenarioPlan(extended, catalog, {
        ...base,
        events: [
          {
            id: "invalid-change",
            actorId: "Event",
            action: "lane_change",
            targetMovementId: "mv-isolated",
            trigger: { earliestS: 1, latestS: 2 },
          },
        ],
        objectives: {
          outcome: "behavior",
          requiredEventIds: ["invalid-change"],
        },
      }),
    ).toThrow(/不是.*相邻 movement/);
  });

  it("materializes bounded plan variations reproducibly from the seed", () => {
    const catalog = describeMapAffordances(map);
    const input = {
      schemaVersion: 1 as const,
      title: "种子变化",
      summary: "速度、位置、反应时间和事件时刻随种子变化",
      mapId: map.mapId,
      mapVersion: catalog.mapVersion,
      durationS: 12,
      actors: [
        {
          id: "Ego",
          name: "被测车",
          role: "ego" as const,
          vehicleType: "car" as const,
          movementId: "mv-right",
          routeMovementIds: [],
          positionM: 40,
          speedMps: 8,
          profile: {},
        },
        {
          id: "Event",
          name: "事件车",
          role: "event" as const,
          vehicleType: "car" as const,
          movementId: "mv-left",
          routeMovementIds: [],
          positionM: 60,
          speedMps: 7,
          profile: {},
        },
      ],
      events: [
        {
          id: "brake",
          actorId: "Event",
          action: "brake" as const,
          trigger: { earliestS: 2, latestS: 3 },
          durationS: 2,
          targetSpeedMps: 2,
          minimumTargetGapM: 2,
        },
      ],
      objectives: {
        outcome: "behavior" as const,
        requiredEventIds: ["brake"],
        respondingActorIds: [],
        minimumResponseBrakingMps2: 0.3,
      },
      constraints: {},
      variations: [
        {
          target: "actor_position" as const,
          actorId: "Event",
          min: 50,
          max: 70,
        },
        { target: "actor_speed" as const, actorId: "Event", min: 5, max: 9 },
        {
          target: "reaction_time" as const,
          actorId: "Ego",
          min: 0.2,
          max: 1.1,
        },
        { target: "event_start" as const, eventId: "brake", min: 1, max: 4 },
      ],
    };
    const first = compileScenarioPlan(map, catalog, { ...input, seed: 21 });
    const repeated = compileScenarioPlan(map, catalog, { ...input, seed: 21 });
    const different = compileScenarioPlan(map, catalog, { ...input, seed: 22 });
    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
    expect(first.actors[1]?.positionM).toBeGreaterThanOrEqual(50);
    expect(first.actors[1]?.positionM).toBeLessThanOrEqual(70);
    expect(first.actors[1]?.speedMps).toBeGreaterThanOrEqual(5);
    expect(first.actors[1]?.speedMps).toBeLessThanOrEqual(9);
    expect(first.actors[0]?.profile.reactionTimeS).toBeGreaterThanOrEqual(0.2);
    expect(first.actors[0]?.profile.reactionTimeS).toBeLessThanOrEqual(1.1);
    expect(first.events[0]?.trigger.earliestS).toBeGreaterThanOrEqual(1);
    expect(first.events[0]?.trigger.earliestS).toBeLessThanOrEqual(4);
    expect(
      first.events[0]!.trigger.latestS - first.events[0]!.trigger.earliestS,
    ).toBeCloseTo(1);
  });
});
