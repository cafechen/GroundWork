import type { MultiActor, SceneSpecV2 } from "@groundwork/contracts";
import type { MapModel } from "../../index.js";
import { dimensions, lanePoint, overlaps } from "../geometry.js";
import { RingBuffer } from "../ring-buffer.js";
import type {
  VehicleState,
  EventRecord,
  CompactFrame,
  CollisionRecord,
  ViolationRecord,
} from "./types.js";
import { DT } from "./types.js";

/**
 * 仿真状态容器。
 *
 * 封装仿真循环中所有可变状态：
 * - states / byLane / history：车辆状态 + 车道分组 + 环形缓冲历史
 * - eventRecords：事件执行记录
 * - collisions / violations：碰撞 + 违规检测结果
 * - compactFrames：紧凑帧（循环结束后构建 GeoJSON）
 * - stats：minimumSpeeds / maxBraking / responseBraking / brakingOnset
 *
 * 并提供：rebuildByLane / recordStep / fail 等方法。
 */
export class SimulationState {
  states: VehicleState[];
  byLane = new Map<string, VehicleState[]>();
  history: RingBuffer<VehicleState[]>;
  eventRecords: EventRecord[];
  compactFrames: CompactFrame[] = [];
  collisions = new Map<string, CollisionRecord>();
  violations = new Map<string, ViolationRecord>();
  minimumSpeeds: Record<string, number>;
  maxBraking: Record<string, number>;
  responseBraking: Record<string, number>;
  brakingOnset: Record<string, number> = {};

  constructor(
    readonly spec: SceneSpecV2,
    readonly roads: Map<string, MapModel["roads"][number]>,
    readonly actors: readonly MultiActor[],
    readonly map: MapModel,
  ) {
    // 初始化状态
    this.states = actors.map((a) => ({
      id: a.id,
      laneId: a.laneId,
      s: a.positionM,
      speed: a.speedMps,
      acceleration: 0,
      routeIndex: 0,
      ...lanePoint(roads.get(a.laneId)!, a.positionM),
    }));

    // 历史环形缓冲（保留最大反应时间 + 安全余量）
    const maxReactionSteps =
      Math.ceil(
        Math.max(...actors.map((a) => a.profile.reactionTimeS)) / DT,
      ) + 2;
    this.history = new RingBuffer<VehicleState[]>(
      Math.max(maxReactionSteps, 5),
    );
    this.history.push(structuredClone(this.states));

    this.rebuildByLane();

    // 事件记录
    this.eventRecords = spec.events.map((e) => ({
      id: e.id,
      actorId: e.actorId,
      status: "waiting" as const,
    }));

    // 统计指标
    this.minimumSpeeds = Object.fromEntries(
      actors.map((a) => [a.id, a.speedMps]),
    );
    this.maxBraking = Object.fromEntries(actors.map((a) => [a.id, 0]));
    this.responseBraking = Object.fromEntries(actors.map((a) => [a.id, 0]));
  }

  /** 重建 byLane 分组（每步状态更新后调用） */
  rebuildByLane(): void {
    this.byLane = new Map();
    for (const s of this.states) {
      const list = this.byLane.get(s.laneId);
      if (list) list.push(s);
      else this.byLane.set(s.laneId, [s]);
    }
  }

  /** 记录一个违规（去重：同车同类只记第一次） */
  fail(actorId: string, kind: string, time: number, value: number): void {
    const key = `${actorId}:${kind}`;
    if (!this.violations.has(key))
      this.violations.set(key, { actorId, kind, time, value });
  }

  /**
   * 记录一步：更新物理指标统计 + 碰撞检测 + 保存紧凑帧。
   * 复用传入的 snapshot（调用方保证已深拷贝）。
   */
  recordStep(time: number, snapshot: VehicleState[]): void {
    // 统计物理指标
    for (const s of snapshot) {
      const a = this.actors.find((a) => a.id === s.id)!;
      this.minimumSpeeds[a.id] = Math.min(this.minimumSpeeds[a.id]!, s.speed);
      this.maxBraking[a.id] = Math.max(this.maxBraking[a.id]!, -s.acceleration);

      if (
        this.eventRecords.some(
          (e) => e.startedAt !== undefined && time > e.startedAt,
        )
      ) {
        this.responseBraking[a.id] = Math.max(
          this.responseBraking[a.id]!,
          -s.acceleration,
        );
        if (
          s.acceleration <= -this.spec.objectives.minimumResponseBrakingMps2 &&
          this.brakingOnset[a.id] === undefined
        )
          this.brakingOnset[a.id] = time;
      }
    }

    // 碰撞检测
    for (let i = 0; i < snapshot.length; i++)
      for (let j = i + 1; j < snapshot.length; j++) {
        const a = snapshot[i]!;
        const b = snapshot[j]!;
        if (
          overlaps(
            { ...a, ...dimensions(this.actors[i]!.vehicleType) },
            { ...b, ...dimensions(this.actors[j]!.vehicleType) },
          )
        ) {
          const key = `${a.id}/${b.id}`;
          if (!this.collisions.has(key))
            this.collisions.set(key, {
              actors: [a.id, b.id],
              time,
              expected: this.spec.constraints.allowedCollisionPairs.some(
                (pair) => pair.includes(a.id) && pair.includes(b.id),
              ),
            });
        }
      }

    // 保存紧凑帧
    this.compactFrames.push({ t: time, states: snapshot });
  }
}
