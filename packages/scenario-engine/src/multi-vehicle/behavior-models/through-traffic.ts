/**
 * 路口直行模型（intersection through traffic）。
 *
 * 模拟车辆直行通过路口的行为：
 *   接近路口 → 根据信号灯/优先权调整速度 → 通过路口 → 加速恢复
 *
 * 从真实数据可以学的参数：
 *   - approachSpeedMps: 接近速度
 *   - crossingSpeedMps: 通过路口速度
 *   - yieldPriority: 是否让行（有优先权的车不减速）
 *   - decelStartDistanceM: 减速开始距离
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";
import {
  distanceToNextJunction,
  getConflictLanesInJunction,
} from "./map-utils.js";

export type ThroughTrafficParams = {
  /** 接近速度 m/s */
  approachSpeedMps: number;
  /** 通过路口速度 m/s */
  crossingSpeedMps: number;
  /** 减速开始距离 m */
  decelStartDistanceM: number;
  /** 路口后加速度 m/s² */
  postJunctionAccelMps2: number;
  /** 是否有优先权（有优先权不减速） */
  hasPriority: boolean;
  /** 横向干扰反应（看见横向车辆时的减速程度） */
  crossTrafficReaction: number;
};

export const throughTrafficMetadata: ModelMetadata = {
  name: "through-traffic",
  description: "路口直行模型。模拟直行车辆通过路口的速度调整。",
  params: {
    approachSpeedMps: {
      default: 12,
      unit: "m/s",
      description: "接近路口速度",
      distribution: { type: "uniform", min: 8, max: 18 },
    },
    crossingSpeedMps: {
      default: 10,
      unit: "m/s",
      description: "通过路口速度",
      distribution: { type: "uniform", min: 5, max: 15 },
    },
    decelStartDistanceM: {
      default: 40,
      unit: "m",
      description: "距离路口多远开始减速",
      distribution: { type: "uniform", min: 20, max: 80 },
    },
    postJunctionAccelMps2: {
      default: 2,
      unit: "m/s²",
      description: "通过路口后加速度",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
    hasPriority: {
      default: true,
      description: "是否有优先通行权",
    },
    crossTrafficReaction: {
      default: 0.5,
      description: "横向干扰反应强度（0=无视，1=强烈减速）",
      distribution: { type: "uniform", min: 0, max: 1 },
    },
  },
};

type Phase =
  "approaching" | "decelerating" | "crossing" | "accelerating" | "done";

export class ThroughTrafficModel extends BehaviorModel<ThroughTrafficParams> {
  private phase: Phase = "approaching";
  private phaseStartedAt: number | null = null;
  private junctionEnteredAt: number | null = null;

  override get name() {
    return "through-traffic";
  }

  private switchPhase(phase: Phase, time: number) {
    this.phase = phase;
    this.phaseStartedAt = time;
  }

  private distanceToJunction(
    ego: { s: number; laneId: string },
    map: Parameters<typeof distanceToNextJunction>[1],
    route: readonly string[],
    routeIndex: number,
  ): { dist: number; inJunction: boolean } {
    return distanceToNextJunction(ego, map, route, routeIndex);
  }

  /**
   * 检查横向交通干扰程度。
   */
  private crossTrafficIntensity(
    ego: { id: string; laneId: string },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
    map: Parameters<typeof getConflictLanesInJunction>[1],
  ): number {
    const conflictLaneIds = getConflictLanesInJunction(ego.laneId, map);

    let intensity = 0;
    for (const other of others) {
      if (other.id === ego.id) continue;
      if (!conflictLaneIds.includes(other.laneId)) continue;
      if (other.speed < 1) continue;

      // 简化：横向车辆越多、速度越快，干扰越大
      intensity += 0.2 + other.speed / 30;
    }
    return Math.min(1, intensity);
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, map, route, routeIndex, dt } = ctx;
    const {
      approachSpeedMps,
      crossingSpeedMps,
      decelStartDistanceM,
      postJunctionAccelMps2,
      hasPriority,
      crossTrafficReaction,
    } = this.params;

    const { dist, inJunction } = this.distanceToJunction(
      ego,
      map,
      route,
      routeIndex,
    );
    const crossIntensity = this.crossTrafficIntensity(ego, others, map);
    const effectiveCrossingSpeed = hasPriority
      ? crossingSpeedMps
      : crossingSpeedMps * (1 - crossIntensity * crossTrafficReaction * 0.5);

    // 阶段切换
    if (
      this.phase === "approaching" &&
      dist < decelStartDistanceM &&
      !hasPriority
    ) {
      this.switchPhase("decelerating", time);
    }

    if (inJunction && this.junctionEnteredAt === null) {
      this.junctionEnteredAt = time;
      if (this.phase !== "crossing") this.switchPhase("crossing", time);
    }

    // 出路口判断：离开 junction 道路
    if (
      this.junctionEnteredAt !== null &&
      !inJunction &&
      this.phase === "crossing"
    ) {
      this.switchPhase("accelerating", time);
    }

    // 各阶段输出
    switch (this.phase) {
      case "approaching": {
        const error = approachSpeedMps - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, dist },
        };
      }

      case "decelerating": {
        const error = effectiveCrossingSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2.5, Math.abs(error / dt) * 0.15);
        return {
          acceleration: accel,
          confidence: 0.8,
          debug: {
            phase: this.phase,
            targetSpeed: effectiveCrossingSpeed,
            dist,
            crossIntensity,
          },
        };
      }

      case "crossing": {
        const error = effectiveCrossingSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, crossIntensity, effectiveCrossingSpeed },
        };
      }

      case "accelerating":
      case "done": {
        return {
          acceleration: postJunctionAccelMps2,
          confidence: 0.9,
          debug: { phase: this.phase },
        };
      }
    }
  }
}
