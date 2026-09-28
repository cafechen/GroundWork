import {
  mapAffordanceCatalogSchema,
  scenarioPlanSchema,
  sceneSpecV2Schema,
  type MapAffordanceCatalog,
  type ScenarioPlan,
  type SceneSpecV2,
} from "@groundwork/contracts";
import type { MapModel, Road } from "../index.js";
import { bodyWithinLanes, dimensions, lanePoint } from "./geometry.js";
import { validateSceneSpec } from "./simulation.js";
import { mapFingerprint } from "./template.js";
import { junctionRegions, resolveRiskLocation } from "./risk-location.js";

const movementId = (roadId: string) => `mv-${roadId}`;
const angleDifference = (a: number, b: number) =>
  Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const heading = (road: Road) => lanePoint(road, road.lengthM / 2).heading;
const INITIAL_CLEARANCE_M = 0.25;
const INITIAL_POSITION_STEP_M = 0.25;
const footprintFits = (road: Road, vehicleType: string, positionM: number) =>
  bodyWithinLanes(
    {
      ...lanePoint(road, positionM),
      ...dimensions(vehicleType),
    },
    [road],
  );
const nearestValidInitialPosition = (
  road: Road,
  vehicleType: string,
  desiredPositionM: number,
  minimumPositionM?: number,
  maximumPositionM?: number,
) => {
  const halfLengthM = dimensions(vehicleType).lengthM / 2;
  const lower = Math.max(halfLengthM, minimumPositionM ?? halfLengthM);
  const upper = Math.min(
    road.lengthM - halfLengthM,
    maximumPositionM ?? road.lengthM - halfLengthM,
  );
  if (upper < lower) return null;
  const desired = Math.max(lower, Math.min(upper, desiredPositionM));
  if (footprintFits(road, vehicleType, desired)) return desired;

  const steps = Math.ceil((upper - lower) / INITIAL_POSITION_STEP_M);
  for (let index = 1; index <= steps; index++) {
    const distanceM = index * INITIAL_POSITION_STEP_M;
    const after = desired + distanceM;
    if (after <= upper && footprintFits(road, vehicleType, after)) return after;
    const before = desired - distanceM;
    if (before >= lower && footprintFits(road, vehicleType, before))
      return before;
  }
  for (const boundary of [lower, upper])
    if (footprintFits(road, vehicleType, boundary)) return boundary;
  return null;
};
const initialCenterRange = (road: Road, vehicleType: string) => {
  const halfLengthM = dimensions(vehicleType).lengthM / 2;
  if (road.lengthM < halfLengthM * 2) return null;
  const first = nearestValidInitialPosition(road, vehicleType, halfLengthM);
  const last = nearestValidInitialPosition(
    road,
    vehicleType,
    road.lengthM - halfLengthM,
  );
  if (first === null || last === null || first > last) return null;
  return [Number(first.toFixed(2)), Number(last.toFixed(2))] as [
    number,
    number,
  ];
};
const sampleVariation = (
  seed: number,
  index: number,
  min: number,
  max: number,
) => {
  let state = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return min + (state / 0x100000000) * (max - min);
};

export function materializeScenarioPlan(input: ScenarioPlan): ScenarioPlan {
  const plan = structuredClone(input);
  for (const [index, variation] of plan.variations.entries()) {
    const value = sampleVariation(
      plan.seed,
      index,
      variation.min,
      variation.max,
    );
    if (variation.target === "event_start") {
      const event = plan.events.find(
        (candidate) => candidate.id === variation.eventId,
      )!;
      const width = event.trigger.latestS - event.trigger.earliestS;
      event.trigger.earliestS = value;
      event.trigger.latestS = value + width;
      continue;
    }
    const actor = plan.actors.find(
      (candidate) => candidate.id === variation.actorId,
    )!;
    if (variation.target === "actor_position") actor.positionM = value;
    else if (variation.target === "actor_speed") actor.speedMps = value;
    else actor.profile.reactionTimeS = value;
  }
  return plan;
}

export function describeMapAffordances(
  map: MapModel,
  maximumMovements = 32,
  junctionId?: string,
): MapAffordanceCatalog {
  const adjacentRoadIds = new Set(
    map.adjacentSameDirection.flatMap((link) => [link.from, link.to]),
  );
  const ranked = [...map.roads].sort((a, b) => {
    const score = (road: Road) =>
      (adjacentRoadIds.has(road.id) ? 1_000_000 : 0) +
      (road.junction ? 100_000 : 0) +
      road.lengthM;
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });
  const limit = Math.min(48, Math.max(2, maximumMovements));
  const preferred = new Map<string, Road>();
  // Keep complete approach -> connector -> exit triples for the requested
  // junction, rather than filling a compact catalog with unrelated long roads.
  if (junctionId) {
    const byId = new Map(map.roads.map((road) => [road.id, road]));
    for (const road of ranked.filter((r) => r.junction?.id === junctionId)) {
      const triple = [
        byId.get(road.junction!.from),
        road,
        byId.get(road.junction!.to),
      ].filter((r): r is Road => !!r);
      const additions = triple.filter((r) => !preferred.has(r.id));
      if (preferred.size + additions.length <= limit)
        for (const item of additions) preferred.set(item.id, item);
    }
  }
  const selected = [
    ...preferred.values(),
    ...(junctionId ? [] : ranked.filter((r) => !preferred.has(r.id))),
  ]
    .slice(0, limit)
    .sort((a, b) => a.id.localeCompare(b.id));
  const selectedIds = new Set(selected.map((road) => road.id));

  // Compute distance to next downstream junction and junctionRole for each
  // selected movement. Results are memoized by road id.
  const nextJunctionCache = new Map<
    string,
    { distanceM: number | null; role: "approach" | "inside" | "exit" | "midblock" }
  >();
  const getNextJunction = (
    roadId: string,
    visited = new Set<string>(),
  ): { distanceM: number | null; role: "approach" | "inside" | "exit" | "midblock" } => {
    const cached = nextJunctionCache.get(roadId);
    if (cached) return cached;
    if (visited.has(roadId)) {
      const result = { distanceM: null, role: "midblock" as const };
      nextJunctionCache.set(roadId, result);
      return result;
    }
    visited.add(roadId);
    const road = map.roads.find((r) => r.id === roadId);
    if (!road) {
      const result = { distanceM: null, role: "midblock" as const };
      nextJunctionCache.set(roadId, result);
      return result;
    }
    if (road.junction) {
      const result = { distanceM: 0, role: "inside" as const };
      nextJunctionCache.set(roadId, result);
      return result;
    }
    const nextRoadIds = map.successors
      .filter((link) => link.from === roadId)
      .map((link) => link.to);
    // Pick the first successor that stays within selected roads when possible,
    // but follow the chain regardless to determine approach vs midblock.
    type JunctionInfo = {
      distanceM: number | null;
      role: "approach" | "inside" | "exit" | "midblock";
    };
    let best: JunctionInfo | null = null;
    for (const nextId of nextRoadIds) {
      const downstream = getNextJunction(nextId, visited);
      if (downstream.distanceM === null) continue;
      const candidate = downstream.role === "inside"
        ? { distanceM: downstream.distanceM + road.lengthM, role: "approach" as const }
        : downstream.role === "approach"
          ? { distanceM: downstream.distanceM + road.lengthM, role: "approach" as const }
          : { distanceM: downstream.distanceM + road.lengthM, role: "midblock" as const };
      if (!best || (candidate.distanceM !== null && (best.distanceM === null || candidate.distanceM < best.distanceM))) {
        best = candidate;
      }
    }
    if (!best) {
      const result = { distanceM: null, role: "midblock" as const };
      nextJunctionCache.set(roadId, result);
      return result;
    }
    nextJunctionCache.set(roadId, best);
    return best;
  };

  const movements = selected.map((road) => {
    const junctionInfo = getNextJunction(road.id);
    let role: "approach" | "inside" | "exit" | "midblock" = junctionInfo.role;
    // Classify exit roads (immediately downstream of a junction) as "exit".
    if (role === "midblock") {
      const hasUpstreamJunction = map.successors.some(
        (link) => link.to === road.id && map.roads.find((r) => r.id === link.from)?.junction,
      );
      if (hasUpstreamJunction) role = "exit";
    }
    return {
    id: movementId(road.id),
    laneIds: [road.id],
    kind: road.junction ? ("junction" as const) : ("road" as const),
    ...(road.junction ? { junctionId: road.junction.id } : {}),
    ...(road.junction?.turn ? { turn: road.junction.turn } : {}),
    lengthM: Number(road.lengthM.toFixed(2)),
    initialCenterRangeM: {
      car: initialCenterRange(road, "car"),
      heavy_truck: initialCenterRange(road, "heavy_truck"),
    },
    successorIds: map.successors
      .filter((link) => link.from === road.id && selectedIds.has(link.to))
      .map((link) => movementId(link.to))
      .sort(),
    adjacent: map.adjacentSameDirection
      .filter((link) => link.from === road.id && selectedIds.has(link.to))
      .map((link) => ({ movementId: movementId(link.to), side: link.side }))
      .sort((a, b) => a.movementId.localeCompare(b.movementId)),
    distanceToJunctionM:
      junctionInfo.distanceM === null
        ? null
        : Number(junctionInfo.distanceM.toFixed(2)),
    junctionRole: role,
  }});
  const conflicts: MapAffordanceCatalog["conflicts"] = [];
  conflictScan: for (let i = 0; i < selected.length; i++)
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i]!,
        b = selected[j]!;
      let type: "crossing" | "opposing" | "merge" | undefined;
      if (
        a.junction &&
        b.junction &&
        a.junction.id === b.junction.id &&
        a.junction.from !== b.junction.from
      ) {
        type =
          a.junction.to === b.junction.to
            ? "merge"
            : angleDifference(heading(a), heading(b)) > 2.6
              ? "opposing"
              : "crossing";
      } else if (!a.junction && !b.junction) {
        const pa = lanePoint(a, a.lengthM / 2),
          pb = lanePoint(b, b.lengthM / 2);
        if (
          Math.hypot(pa.x - pb.x, pa.y - pb.y) < 15 &&
          angleDifference(pa.heading, pb.heading) > 2.6
        )
          type = "opposing";
      }
      if (type)
        conflicts.push({
          id: `conflict-${conflicts.length + 1}`,
          type,
          movementIds: [movementId(a.id), movementId(b.id)],
        });
      if (conflicts.length >= 96) break conflictScan;
    }
  return mapAffordanceCatalogSchema.parse({
    mapId: map.mapId,
    mapVersion: mapFingerprint(map),
    movements,
    junctions: [...junctionRegions(map)].map(([id, polygons]) => ({
      id,
      regionAvailable: polygons.length > 0,
    })),
    conflicts,
  });
}

/**
 * Project model-authored initial positions onto the executable lane geometry.
 * This is a protocol/geometry repair only: actor order, route, speed, events and
 * objectives remain unchanged. Vehicles sharing a lane keep the longitudinal
 * order proposed by the model and receive a small non-overlap clearance.
 */
function repairInitialActorPositions(map: MapModel, spec: SceneSpecV2) {
  const roads = new Map(map.roads.map((road) => [road.id, road]));
  const groups = new Map<
    string,
    Array<{
      actor: SceneSpecV2["actors"][number];
      desiredPositionM: number;
      index: number;
      originalRoute: string[];
      routeRoads: Road[];
      globalPositionM?: number;
    }>
  >();

  for (const [index, actor] of spec.actors.entries()) {
    const road = roads.get(actor.laneId);
    if (!road) continue;
    const halfLengthM = dimensions(actor.vehicleType).lengthM / 2;
    const lower = halfLengthM;
    const upper = road.lengthM - halfLengthM;
    if (upper < lower)
      throw new Error(`${actor.name} 所在车道长度不足以容纳完整车身`);
    const group = groups.get(actor.laneId) ?? [];
    const originalRoute = actor.route.length
      ? [...actor.route]
      : [actor.laneId];
    group.push({
      actor,
      desiredPositionM: actor.positionM,
      index,
      originalRoute,
      routeRoads: originalRoute.map((roadId) => roads.get(roadId)!),
    });
    groups.set(actor.laneId, group);
  }

  for (const group of groups.values()) {
    group.sort(
      (a, b) => a.desiredPositionM - b.desiredPositionM || a.index - b.index,
    );

    const place = (
      current: (typeof group)[number],
      minimumGlobalM?: number,
      maximumGlobalM?: number,
    ) => {
      let offsetM = 0;
      let best:
        | { roadIndex: number; positionM: number; globalPositionM: number }
        | undefined;
      for (const [roadIndex, road] of current.routeRoads.entries()) {
        const localMinimumM =
          minimumGlobalM === undefined
            ? undefined
            : Math.max(0, minimumGlobalM - offsetM);
        const localMaximumM =
          maximumGlobalM === undefined
            ? undefined
            : Math.min(road.lengthM, maximumGlobalM - offsetM);
        const positionM = nearestValidInitialPosition(
          road,
          current.actor.vehicleType,
          current.desiredPositionM - offsetM,
          localMinimumM,
          localMaximumM,
        );
        if (positionM !== null) {
          const candidate = {
            roadIndex,
            positionM,
            globalPositionM: offsetM + positionM,
          };
          if (
            !best ||
            Math.abs(candidate.globalPositionM - current.desiredPositionM) <
              Math.abs(best.globalPositionM - current.desiredPositionM) ||
            (Math.abs(candidate.globalPositionM - current.desiredPositionM) ===
              Math.abs(best.globalPositionM - current.desiredPositionM) &&
              candidate.globalPositionM < best.globalPositionM)
          )
            best = candidate;
        }
        offsetM += road.lengthM;
      }
      if (!best) return false;
      current.actor.laneId = current.originalRoute[best.roadIndex]!;
      current.actor.route = current.originalRoute.slice(best.roadIndex);
      current.actor.positionM = best.positionM;
      current.globalPositionM = best.globalPositionM;
      return true;
    };

    let forwardSucceeded = true;
    for (let index = 0; index < group.length; index++) {
      const current = group[index]!;
      const behind = group[index - 1];
      const minimumGlobalM = behind
        ? behind.globalPositionM! +
          (dimensions(behind.actor.vehicleType).lengthM +
            dimensions(current.actor.vehicleType).lengthM) /
            2 +
          INITIAL_CLEARANCE_M
        : undefined;
      if (!place(current, minimumGlobalM)) {
        forwardSucceeded = false;
        break;
      }
    }

    if (!forwardSucceeded) {
      for (let index = group.length - 1; index >= 0; index--) {
        const current = group[index]!;
        const ahead = group[index + 1];
        const maximumGlobalM = ahead
          ? ahead.globalPositionM! -
            (dimensions(ahead.actor.vehicleType).lengthM +
              dimensions(current.actor.vehicleType).lengthM) /
              2 -
            INITIAL_CLEARANCE_M
          : undefined;
        if (!place(current, undefined, maximumGlobalM))
          throw new Error(
            `${current.actor.name} 所在车道没有足够的真实边界空间放置 ${group.length} 辆车`,
          );
      }
    }
  }
}

export function compileScenarioPlan(
  map: MapModel,
  inputCatalog: MapAffordanceCatalog,
  inputPlan: ScenarioPlan | unknown,
): SceneSpecV2 {
  const catalog = mapAffordanceCatalogSchema.parse(inputCatalog);
  const plan = materializeScenarioPlan(scenarioPlanSchema.parse(inputPlan));
  const currentVersion = mapFingerprint(map);
  if (
    catalog.mapId !== map.mapId ||
    plan.mapId !== map.mapId ||
    catalog.mapVersion !== currentVersion ||
    plan.mapVersion !== currentVersion
  )
    throw new Error("场景方案使用的地图或版本已失效");
  const movements = new Map(
    catalog.movements.map((movement) => [movement.id, movement]),
  );
  const requireMovement = (id: string) => {
    const movement = movements.get(id);
    if (!movement) throw new Error(`movement ${id} 在当前地图目录中不存在`);
    return movement;
  };
  const ego = plan.actors.find((actor) => actor.role === "ego")!;
  const allowedPair = (a: string, b: string) =>
    plan.constraints.allowedCollisionPairs.some(
      ([first, second]) =>
        (first === a && second === b) || (first === b && second === a),
    );
  const collisionTargetIds = new Set<string>();
  if (plan.objectives.outcome === "collision") {
    for (const actor of plan.actors.filter((item) => item.role === "event")) {
      if (!allowedPair(ego.id, actor.id)) continue;
      collisionTargetIds.add(ego.id);
      collisionTargetIds.add(actor.id);
    }
    if (!collisionTargetIds.size)
      throw new Error("碰撞目标必须在 allowedCollisionPairs 中声明目标车辆对");
  }
  const actors = plan.actors.map((actor) => {
    const selected = [
      requireMovement(actor.movementId),
      ...actor.routeMovementIds.map(requireMovement),
    ];
    for (let index = 1; index < selected.length; index++)
      if (!selected[index - 1]!.successorIds.includes(selected[index]!.id))
        throw new Error(
          `${selected[index]!.id} 不是 ${selected[index - 1]!.id} 的连续 successor`,
        );
    const route = selected
      .flatMap((movement) => movement.laneIds)
      .filter((id, index, ids) => !index || id !== ids[index - 1]);
    return {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      controlMode: "behavior" as const,
      vehicleType: actor.vehicleType,
      laneId: route[0]!,
      route,
      positionM: actor.positionM,
      speedMps: actor.speedMps,
      profile: collisionTargetIds.has(actor.id)
        ? { ...actor.profile, collisionAvoidance: false }
        : actor.profile,
    };
  });
  const events = plan.events.map((event) => {
    if (event.action === "lane_change") {
      const actor = plan.actors.find(
        (candidate) => candidate.id === event.actorId,
      )!;
      const source = requireMovement(actor.movementId);
      if (
        !source.adjacent.some(
          (adjacent) => adjacent.movementId === event.targetMovementId,
        )
      )
        throw new Error(
          `${event.targetMovementId} 不是 ${source.id} 的相邻 movement`,
        );
    }
    return {
      id: event.id,
      actorId: event.actorId,
      action: event.action === "yield" ? ("brake" as const) : event.action,
      ...(event.targetMovementId
        ? { targetLaneId: requireMovement(event.targetMovementId).laneIds[0]! }
        : {}),
      trigger: event.trigger,
      durationS: event.durationS,
      ...(event.targetSpeedMps !== undefined
        ? { targetSpeedMps: event.targetSpeedMps }
        : {}),
      minimumTargetGapM: event.minimumTargetGapM,
    };
  });
  const configuredJunction = plan.junction
    ? structuredClone(plan.junction)
    : collisionTargetIds.size && plan.objectives.riskLocation
      ? {
          priorities: {},
          nonYieldingActorIds: [],
          requiredTraversalActorIds: [],
        }
      : undefined;
  const spec = sceneSpecV2Schema.parse({
    schemaVersion: 2,
    title: plan.title,
    mapId: plan.mapId,
    mapVersion: plan.mapVersion,
    seed: plan.seed,
    durationS: plan.durationS,
    actors,
    events,
    junction: configuredJunction,
    objectives: {
      ...(plan.objectives.riskLocation
        ? {
            riskLocation: resolveRiskLocation(
              map,
              plan.objectives.riskLocation,
            ),
          }
        : {}),
      requiredEventIds: plan.objectives.requiredEventIds,
      // A model-invented mandatory avoidance response cannot coexist with an
      // explicit target collision. Explicit brake events remain required.
      respondingActorIds: plan.objectives.respondingActorIds.filter(
        (id) => !collisionTargetIds.has(id),
      ),
      minimumResponseBrakingMps2: plan.objectives.minimumResponseBrakingMps2,
    },
    constraints: plan.constraints,
  });
  repairInitialActorPositions(map, spec);
  return validateSceneSpec(map, spec);
}
