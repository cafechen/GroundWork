import { sceneSpecV2Schema, type SceneSpecV2 } from "@groundwork/contracts";
import type { MapModel } from "../index.js";
import { junctionController } from "./junction-control.js";
import { validateReference, simulateReference } from "./reference.js";
import {
  dimensions,
  bodyWithinLanes,
  lanePoint,
  overlaps,
  project,
} from "./geometry.js";
import { SimulationState } from "./simulation/simulation-state.js";
import { findLeader } from "./simulation/leader.js";
import { canChangeLane } from "./simulation/lane-change.js";
import { stepVehicle } from "./simulation/step.js";
import { buildGeoJsonOutput } from "./simulation/geojson.js";
import { DT } from "./simulation/types.js";
import type {
  VehicleState,
  EventRecord,
  ExternalController,
  SimulationOptions,
} from "./simulation/types.js";

// 重新导出类型，保持原有公共 API 不变
export type {
  VehicleState,
  EventRecord,
  ExternalController,
  SimulationOptions,
};

export const MULTI_ENGINE_VERSION = "2.2.0";

export function validateSceneSpec(map: MapModel, input: unknown): SceneSpecV2 {
  const spec = sceneSpecV2Schema.parse(input);
  if (spec.reference) return validateReference(map, spec);
  if (spec.mapId !== map.mapId) throw new Error("场景地图与加载地图不一致");
  const roads = new Map(map.roads.map((r) => [r.id, r]));
  for (const a of spec.actors) {
    const road = roads.get(a.laneId);
    if (
      !road ||
      a.positionM > road.lengthM - dimensions(a.vehicleType).lengthM / 2
    )
      throw new Error(`${a.name} 初始位置不在有效车道内`);
    if (a.positionM < dimensions(a.vehicleType).lengthM / 2)
      throw new Error(`${a.name} 初始车身超出车道起点`);
    if (
      !bodyWithinLanes(
        { ...lanePoint(road, a.positionM), ...dimensions(a.vehicleType) },
        [road],
      )
    )
      throw new Error(`${a.name} 初始车身超出真实车道边界`);
    if (a.route.length && a.route[0] !== a.laneId)
      throw new Error(`${a.name} 路线必须从初始车道开始`);
    if (spec.junction && new Set(a.route).size !== a.route.length)
      throw new Error(`${a.name} 路口路线不能重复经过同一车道`);
    if (
      spec.junction?.requiredTraversalActorIds.includes(a.id) &&
      !a.route.some((id) => roads.get(id)?.junction)
    )
      throw new Error(`${a.name} 路口通行目标缺少连接路径`);
    for (let i = 1; i < a.route.length; i++) {
      const previous = roads.get(a.route[i - 1]!),
        next = roads.get(a.route[i]!);
      if (
        !previous ||
        !next ||
        !map.successors.some((l) => l.from === previous.id && l.to === next.id)
      )
        throw new Error(`${a.name} 路线不连通`);
      const end = lanePoint(previous, previous.lengthM),
        start = lanePoint(next, 0);
      if (Math.hypot(end.x - start.x, end.y - start.y) > 0.5)
        throw new Error(`${a.name} 路线连接缺少连续几何，请补充连接车道`);
      if (
        Math.abs(
          Math.atan2(
            Math.sin(end.heading - start.heading),
            Math.cos(end.heading - start.heading),
          ),
        ) >
        Math.PI / 12
      )
        throw new Error(`${a.name} 路线连接航向不连续`);
    }
  }
  const laneByActor = new Map(spec.actors.map((a) => [a.id, a.laneId]));
  const availableAt = new Map<string, number>();
  for (const e of [...spec.events].sort(
    (a, b) => a.trigger.earliestS - b.trigger.earliestS,
  )) {
    if (e.trigger.earliestS < (availableAt.get(e.actorId) ?? 0))
      throw new Error(`${e.id} 与同车其他事件的执行窗口重叠`);
    availableAt.set(e.actorId, e.trigger.latestS + e.durationS);
    if (e.action === "lane_change") {
      if (
        !roads.has(e.targetLaneId!) ||
        !map.adjacentSameDirection.some(
          (l) =>
            l.from === laneByActor.get(e.actorId) && l.to === e.targetLaneId,
        )
      )
        throw new Error(`${e.id} 目标车道不相邻、不同向或共享边界不允许跨越`);
      laneByActor.set(e.actorId, e.targetLaneId!);
    }
  }
  const initial = spec.actors.map((a) => ({
    ...lanePoint(roads.get(a.laneId)!, a.positionM),
    ...dimensions(a.vehicleType),
    id: a.id,
  }));
  for (let i = 0; i < initial.length; i++)
    for (let j = i + 1; j < initial.length; j++)
      if (overlaps(initial[i]!, initial[j]!))
        throw new Error(`初始车身重叠：${initial[i]!.id} / ${initial[j]!.id}`);
  return spec;
}

export function simulateMultiVehicle(
  map: MapModel,
  input: unknown,
  options: SimulationOptions = {},
) {
  const spec = validateSceneSpec(map, input);
  if (spec.reference) return simulateReference(map, spec);

  const roads = new Map(map.roads.map((r) => [r.id, r]));
  const actors = [...spec.actors].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const junctions = junctionController(map, spec);

  for (const a of actors)
    if (a.controlMode === "external" && !options.externalControllers?.[a.id])
      throw new Error(`${a.name} 需要连接外部控制器，预览请切换为行为模型`);

  // ─── 状态初始化 ────────────────────────────────────────────────────
  const state = new SimulationState(spec, roads, actors, map);

  // 记录初始帧
  const initialSnapshot = state.history.getRelative(0);
  state.recordStep(0, initialSnapshot);

  // ─── 主循环 ────────────────────────────────────────────────────────
  const steps = Math.ceil(spec.durationS / DT);
  for (let step = 1; step <= steps; step++) {
    if (options.signal?.aborted) throw new Error("仿真已取消");

    const time = Math.min(spec.durationS, step * DT);
    const previousTime = (step - 1) * DT;
    const dt = time - previousTime;

    // 事件触发检查
    for (const [i, e] of spec.events.entries()) {
      const r = state.eventRecords[i]!;
      const s = state.states.find((s) => s.id === e.actorId)!;

      // 运行中：检查是否完成
      if (
        r.status === "running" &&
        previousTime >= r.startedAt! + e.durationS - 1e-6
      ) {
        r.status =
          e.action === "brake" && s.speed > e.targetSpeedMps! + 0.3
            ? "missed"
            : "completed";
        if (r.status === "missed") r.reason = "执行窗口内没有达到目标速度";
        else r.completedAt = previousTime;
      }
      if (r.status !== "waiting") continue;
      if (previousTime > e.trigger.latestS + 1e-6) {
        r.status = "missed";
        r.reason = "触发窗口内未满足间距或道路条件";
        continue;
      }
      if (previousTime < e.trigger.earliestS) continue;
      if (
        e.trigger.afterEventId &&
        !state.eventRecords.some(
          (record) =>
            record.id === e.trigger.afterEventId &&
            record.status === "completed",
        )
      )
        continue;
      const leader = findLeader(
        s,
        state.states,
        roads,
        actors,
        s.laneId,
        state.byLane.get(s.laneId),
        !!spec.junction,
      );
      if (
        e.trigger.leaderGapBelowM !== undefined &&
        (!leader || leader.gap > e.trigger.leaderGapBelowM)
      )
        continue;
      if (e.action === "lane_change" && !canChangeLane(s, e, roads, state.byLane, actors))
        continue;

      r.status = "running";
      r.startedAt = previousTime;
      if (e.action === "lane_change")
        s.change = {
          eventId: e.id,
          target: e.targetLaneId!,
          startS: project(roads.get(e.targetLaneId!)!, s).s,
          startT: previousTime,
          duration: e.durationS,
        };
    }

    // 路口停车决策
    const junctionStops = junctions.step(state.states, previousTime, dt);

    // 逐车推进
    const next = state.states.map((s, i): VehicleState =>
      stepVehicle({
        s,
        actor: actors[i]!,
        index: i,
        spec,
        roads,
        actors,
        history: state.history,
        states: state.states,
        previousTime,
        dt,
        junctionStop: junctionStops.get(actors[i]!.id),
        specJunction: !!spec.junction,
        eventRecords: state.eventRecords,
        externalControllers: options.externalControllers,
        fail: (actorId, kind, t, value) => state.fail(actorId, kind, t, value),
        time,
      }),
    );

    state.states = next;
    state.rebuildByLane();
    const snapshot = structuredClone(state.states);
    state.history.push(snapshot);
    state.recordStep(time, snapshot);
  }

  // ─── 后处理：事件最终状态 ──────────────────────────────────────────
  for (const [i, r] of state.eventRecords.entries()) {
    if (
      r.status === "running" &&
      r.startedAt! + spec.events[i]!.durationS <= spec.durationS + 1e-6
    ) {
      const event = spec.events[i]!;
      const s = state.states.find((s) => s.id === event.actorId)!;
      r.status =
        event.action === "brake" && s.speed > event.targetSpeedMps! + 0.3
          ? "missed"
          : "completed";
      if (r.status === "completed")
        r.completedAt = r.startedAt! + event.durationS;
      else r.reason = "执行窗口内没有达到目标速度";
    }
    if (r.status === "waiting") {
      r.status = "missed";
      r.reason = "触发条件未满足";
    }
  }

  // ─── 验收报告 ──────────────────────────────────────────────────────
  const eventPassed = spec.objectives.requiredEventIds.every((id) =>
    state.eventRecords.some((e) => e.id === id && e.status === "completed"),
  );
  const responsePassed = spec.objectives.respondingActorIds.every(
    (id) =>
      state.responseBraking[id]! >= spec.objectives.minimumResponseBrakingMps2,
  );
  const physicalPassed = !state.violations.size;
  const collisionFree = state.collisions.size === 0;
  const riskPassed = ![...state.collisions.values()].some((c) => !c.expected);

  junctions.step(state.states, spec.durationS, 0);
  const junctionReport = junctions.report();

  const report = {
    passed:
      eventPassed &&
      responsePassed &&
      physicalPassed &&
      riskPassed &&
      junctionReport.passed,
    ...(spec.junction ? { junction: junctionReport } : {}),
    semantic: {
      passed: eventPassed && responsePassed,
      eventPassed,
      responsePassed,
      missingResponses: spec.objectives.respondingActorIds.filter(
        (id) =>
          state.responseBraking[id]! < spec.objectives.minimumResponseBrakingMps2,
      ),
    },
    physical: {
      passed: physicalPassed,
      violations: [...state.violations.values()],
    },
    roadGeometry: {
      junctionBacked: actors.some((a) =>
        a.route.some((id) => roads.get(id)?.junction),
      ),
      passed: ![...state.violations.values()].some(
        (v) => v.kind === "lane_boundary",
      ),
      boundaryBacked: [
        ...actors.flatMap((a) => [a.laneId, ...a.route]),
        ...spec.events.flatMap((e) => (e.targetLaneId ? [e.targetLaneId] : [])),
      ].every((id) => roads.get(id)!.geometrySource === "boundary_pair"),
      scope:
        "车身轮廓每 0.25 米采样；路口连接线检查路口多边形与进口/出口车道并集。路口优先级属于场景配置，未验证法定交通流方向、转向许可或信号灯。",
    },
    risk: {
      passed: riskPassed,
      collisionFree,
      collisions: [...state.collisions.values()],
    },
    events: state.eventRecords,
    actors: actors.map((a) => ({
      id: a.id,
      minimumSpeedMps: state.minimumSpeeds[a.id],
      maximumBrakingMps2: state.maxBraking[a.id],
      responseBrakingMps2: state.responseBraking[a.id],
      brakingOnsetS: state.brakingOnset[a.id] ?? null,
    })),
  };

  // ─── GeoJSON 输出 ─────────────────────────────────────────────────
  return buildGeoJsonOutput(state.compactFrames, actors, map, {
    originWgs84: map.origin,
    engineVersion: MULTI_ENGINE_VERSION,
    mapVersion: spec.mapVersion,
    seed: spec.seed,
    validationReport: report,
  });
}
