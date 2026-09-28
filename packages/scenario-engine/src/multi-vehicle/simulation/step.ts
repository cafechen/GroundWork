import type { MultiActor, SceneSpecV2 } from "@groundwork/contracts";
import {
  dimensions,
  lanePoint,
  project,
  bodyWithinLanes,
} from "../geometry.js";
import type { VehicleState, ExternalController } from "./types.js";
import { DT, clamp } from "./types.js";
import { findLeader } from "./leader.js";
import type { MapModel } from "../../index.js";
import type { RingBuffer } from "../ring-buffer.js";

export type StepVehicleParams = {
  s: VehicleState;
  actor: MultiActor;
  index: number;
  spec: SceneSpecV2;
  roads: Map<string, MapModel["roads"][number]>;
  actors: readonly MultiActor[];
  history: RingBuffer<VehicleState[]>;
  states: VehicleState[];
  previousTime: number;
  dt: number;
  junctionStop?: number;
  specJunction: boolean;
  eventRecords: Array<{
    id: string;
    actorId: string;
    status: string;
    startedAt?: number;
    completedAt?: number;
  }>;
  externalControllers?: Record<string, ExternalController>;
  fail: (actorId: string, kind: string, time: number, value: number) => void;
  time: number;
};

/**
 * 单步推进一辆车的状态。
 *
 * 包含：延迟感知 → 跟车决策 → 路口停车 → 外部控制 → 加速度限制（加减速/急动度）→
 * 位置更新 → 变道插值 → 违规检测 → 返回新状态。
 */
export function stepVehicle(params: StepVehicleParams): VehicleState {
  const {
    s,
    actor,
    spec,
    roads,
    actors,
    history,
    states,
    previousTime,
    dt,
    junctionStop,
    specJunction,
    eventRecords,
    externalControllers,
    fail,
    time,
  } = params;

  const road = roads.get(s.laneId)!;
  const reactionOffset = Math.round(actor.profile.reactionTimeS / DT);
  const delayed =
    reactionOffset < history.length
      ? history.getRelative(-reactionOffset)
      : history.getRelative(0);
  const perceived = delayed.find((p) => p.id === s.id)!;

  // 两个车道中取 gap 更小的前车
  const detectedLeader = [
    findLeader(
      perceived,
      delayed,
      roads,
      actors,
      perceived.laneId,
      undefined,
      specJunction,
    ),
    perceived.change
      ? findLeader(
          perceived,
          delayed,
          roads,
          actors,
          perceived.change.target,
          undefined,
          specJunction,
        )
      : undefined,
  ]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.gap - b.gap)[0];
  const intentionalPair = (otherId: string) =>
    spec.constraints.allowedCollisionPairs.some(
      ([a, b]) =>
        (a === actor.id && b === otherId) || (a === otherId && b === actor.id),
    );
  // Collision avoidance is disabled only against an explicitly permitted
  // target counterpart. Other leaders remain protected by normal IDM logic.
  const leader =
    actor.profile.collisionAvoidance === false &&
    detectedLeader &&
    intentionalPair(detectedLeader.state.id)
      ? undefined
      : detectedLeader;

  // 当前是否处于 brake 事件
  const activeBrake = spec.events.find(
    (e, k) =>
      e.actorId === actor.id &&
      e.action === "brake" &&
      eventRecords[k]!.status === "running",
  );

  // 期望速度
  const desired = Math.min(
    actor.profile.desiredSpeedMps,
    spec.constraints.maxSpeedMps,
    road.maxSpeedKmh ? road.maxSpeedKmh / 3.6 : Infinity,
    activeBrake?.targetSpeedMps ?? Infinity,
  );

  // 基础加速度（指数趋近期望速度）
  let acceleration =
    actor.profile.maxAccelerationMps2 *
    (1 - Math.pow(s.speed / Math.max(0.1, desired), 4));

  // 跟车减速
  if (leader) {
    const desiredGap =
      actor.profile.minimumGapM +
      Math.max(
        0,
        perceived.speed * actor.profile.timeHeadwayS +
          (perceived.speed * (perceived.speed - leader.state.speed)) /
            (2 *
              Math.sqrt(
                actor.profile.maxAccelerationMps2 *
                  actor.profile.comfortableBrakingMps2,
              )),
      );
    acceleration -=
      actor.profile.maxAccelerationMps2 *
      Math.pow(desiredGap / Math.max(0.2, leader.gap), 2);
  }

  // 道路终点停车
  const nextLaneId = actor.route[s.routeIndex + 1];
  const distanceToEnd =
    road.lengthM - dimensions(actor.vehicleType).lengthM / 2 - s.s;
  if (!nextLaneId) {
    const stoppingSpeed = Math.sqrt(
      Math.max(
        0,
        2 *
          actor.profile.comfortableBrakingMps2 *
          Math.max(0, distanceToEnd - 1),
      ),
    );
    if (s.speed > stoppingSpeed)
      acceleration = Math.min(
        acceleration,
        -actor.profile.comfortableBrakingMps2,
      );
  }

  // 路口停车
  if (junctionStop !== undefined && actor.controlMode === "behavior") {
    const safeGap = Math.max(0.1, junctionStop - 1);
    const desiredStopGap =
      actor.profile.minimumGapM +
      s.speed * actor.profile.timeHeadwayS +
      (s.speed * s.speed) /
        (2 *
          Math.sqrt(
            actor.profile.maxAccelerationMps2 *
              actor.profile.comfortableBrakingMps2,
          ));
    acceleration = Math.min(
      acceleration,
      actor.profile.maxAccelerationMps2 *
        (1 - Math.pow(desiredStopGap / safeGap, 2)),
    );
  }

  // 外部控制器（覆盖行为模型加速度）
  if (actor.controlMode === "external")
    acceleration = externalControllers![actor.id]!(
      Object.freeze(structuredClone(s)),
      Object.freeze(
        states.map((p) =>
          Object.freeze({
            ...p,
            change: p.change ? Object.freeze({ ...p.change }) : undefined,
          }),
        ),
      ),
      previousTime,
    ).acceleration;

  if (!Number.isFinite(acceleration))
    throw new Error(`${actor.id} 控制器返回了无效加速度`);

  // 加减速限制
  acceleration = clamp(
    acceleration,
    -spec.constraints.maxDecelerationMps2,
    actor.profile.maxAccelerationMps2,
  );

  // 零速前释放制动（防止 clipping 产生瞬时跳变）
  acceleration = Math.max(
    acceleration,
    -0.5 * Math.sqrt(2 * spec.constraints.maxJerkMps3 * s.speed),
  );

  // 急动度限制
  acceleration = clamp(
    acceleration,
    s.acceleration - spec.constraints.maxJerkMps3 * dt,
    s.acceleration + spec.constraints.maxJerkMps3 * dt,
  );

  // 速度更新
  let speed = clamp(
    s.speed + acceleration * dt,
    0,
    spec.constraints.maxSpeedMps,
  );
  let ds = speed * dt;

  // 回放模式
  if (actor.controlMode === "replay") {
    const replay = actor.replay as Array<{ t: number; positionM: number }>;
    const right = replay.findIndex((f) => f.t >= time);
    const end = replay[right]!;
    const start = replay[Math.max(0, right - 1)]!;
    const position =
      start.positionM +
      ((end.positionM - start.positionM) * (time - start.t)) /
        Math.max(1e-9, end.t - start.t);
    ds = position - s.s;
    speed = ds / dt;
  }

  // 纵向位置 + 换道
  let laneId = s.laneId;
  let position = s.s + ds;
  let routeIndex = s.routeIndex;
  let change = s.change;

  if (nextLaneId && position >= road.lengthM && !change) {
    laneId = nextLaneId;
    position -= road.lengthM;
    routeIndex++;
  }

  let point = lanePoint(roads.get(laneId)!, position);

  // 变道：横向 Hermite 插值 + 纵向等路径长度校正
  if (change) {
    const p = clamp((time - change.startT) / change.duration, 0, 1);
    const blend = p * p * p * (10 - 15 * p + 6 * p * p);
    const target = roads.get(change.target)!;

    const blendedPoint = (at: number) => {
      const source = lanePoint(road, at);
      const b = lanePoint(target, project(target, source).s);
      return {
        ...source,
        x: source.x + (b.x - source.x) * blend,
        y: source.y + (b.y - source.y) * blend,
      };
    };

    let low = s.s;
    let high = s.s + Math.max(1, ds * 3);
    for (let iteration = 0; iteration < 30; iteration++) {
      const middle = (low + high) / 2;
      const test = blendedPoint(middle);
      if (Math.hypot(test.x - s.x, test.y - s.y) < ds) low = middle;
      else high = middle;
    }

    position = (low + high) / 2;
    point = blendedPoint(position);
    const targetS = project(target, lanePoint(road, position)).s;

    if (p >= 1) {
      laneId = target.id;
      position = targetS;
      change = undefined;
      routeIndex = actor.route.indexOf(laneId);
    }
  }

  // 实际行驶距离 / 速度 / 加速度 / 横摆角速度
  const traveled = Math.hypot(point.x - s.x, point.y - s.y);
  const measuredSpeed = traveled / dt;
  const heading =
    traveled > 1e-8 ? Math.atan2(point.y - s.y, point.x - s.x) : s.heading;
  const yawRate =
    Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading)) /
    dt;
  const measuredAcceleration = (measuredSpeed - s.speed) / dt;

  // 违规检测：构建 corridor（途经车道集合）
  const corridor = [
    roads.get(s.laneId)!,
    ...(s.change ? [roads.get(s.change.target)!] : []),
    ...(change ? [roads.get(change.target)!] : []),
    roads.get(laneId)!,
    ...(actor.route[routeIndex - 1]
      ? [roads.get(actor.route[routeIndex - 1]!)!]
      : []),
    ...(actor.route[routeIndex + 1]
      ? [roads.get(actor.route[routeIndex + 1]!)!]
      : []),
  ];

  if (
    !bodyWithinLanes(
      { ...point, heading, ...dimensions(actor.vehicleType) },
      corridor,
    )
  )
    fail(actor.id, "lane_boundary", time, 1);

  if (
    !actor.route[routeIndex + 1] &&
    position >
      roads.get(laneId)!.lengthM -
        dimensions(actor.vehicleType).lengthM / 2 +
        0.1
  )
    fail(actor.id, "road_end", time, position);

  if (measuredSpeed > spec.constraints.maxSpeedMps + 0.1)
    fail(actor.id, "speed", time, measuredSpeed);

  if (Math.abs(yawRate) > spec.constraints.maxYawRateRadS + 0.02)
    fail(actor.id, "yaw_rate", time, yawRate);

  if (
    Math.abs(yawRate * measuredSpeed) >
    spec.constraints.maxLateralAccelerationMps2 + 0.1
  )
    fail(actor.id, "lateral_acceleration", time, yawRate * measuredSpeed);

  if (
    measuredAcceleration < -spec.constraints.maxDecelerationMps2 - 0.2 ||
    measuredAcceleration > actor.profile.maxAccelerationMps2 + 0.2
  )
    fail(actor.id, "acceleration", time, measuredAcceleration);

  if (
    Math.abs(measuredAcceleration - s.acceleration) / dt >
    spec.constraints.maxJerkMps3 + 0.5
  )
    fail(
      actor.id,
      "jerk",
      time,
      Math.abs(measuredAcceleration - s.acceleration) / dt,
    );

  return {
    id: s.id,
    laneId,
    s: position,
    speed: measuredSpeed,
    acceleration: measuredAcceleration,
    routeIndex,
    change,
    ...point,
    heading,
  };
}
