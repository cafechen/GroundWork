/**
 * 路口左转模型（intersection left turn）。
 *
 * 模拟车辆在路口左转的行为：
 *   接近路口减速 → 进入待转区 → 等待对向间隙 → 左转 → 加速汇入
 *
 * 从真实数据可以学的参数：
 *   - approachSpeedMps: 接近速度
 *   - turningSpeedMps: 转弯速度
 *   - oncomingGapAcceptanceS: 对向车流间隙接受阈值
 *   - waitInJunction: 是否进入路口中间等待（中国式左转）
 *   - yieldToPedestrian: 是否礼让行人
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

export type LeftTurnParams = {
  /** 接近路口的速度 m/s */
  approachSpeedMps: number;
  /** 转弯时的速度 m/s */
  turningSpeedMps: number;
  /** 对向车流可接受间隙 s */
  oncomingGapAcceptanceS: number;
  /** 减速开始距离 m */
  decelStartDistanceM: number;
  /** 汇入后加速度 m/s² */
  mergeAccelMps2: number;
  /** 是否进入路口中间等待 */
  waitInJunction: boolean;
  /** 路口等待速度 m/s（waitInJunction=true 时） */
  junctionWaitSpeedMps: number;
  /** 最大等待时间 s（超时强行转） */
  maxWaitTimeS: number;
};

export const leftTurnMetadata: ModelMetadata = {
  name: "left-turn",
  description: "路口左转模型。含对向间隙接受和路口等待行为。",
  params: {
    approachSpeedMps: {
      default: 10,
      unit: "m/s",
      description: "接近路口的速度",
      distribution: { type: "uniform", min: 6, max: 15 },
    },
    turningSpeedMps: {
      default: 5,
      unit: "m/s",
      description: "转弯时的速度",
      distribution: { type: "uniform", min: 2, max: 8 },
    },
    oncomingGapAcceptanceS: {
      default: 5,
      unit: "s",
      description: "对向车流可接受间隙",
      distribution: { type: "normal", mean: 5, std: 1.5, min: 2, max: 10 },
    },
    decelStartDistanceM: {
      default: 60,
      unit: "m",
      description: "距离路口多远开始减速",
      distribution: { type: "uniform", min: 30, max: 120 },
    },
    mergeAccelMps2: {
      default: 2,
      unit: "m/s²",
      description: "汇入后加速度",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
    waitInJunction: {
      default: true,
      description: "是否进入路口中间等待",
    },
    junctionWaitSpeedMps: {
      default: 2,
      unit: "m/s",
      description: "路口等待时的蠕行速度",
      distribution: { type: "uniform", min: 0, max: 4 },
    },
    maxWaitTimeS: {
      default: 15,
      unit: "s",
      description: "最大等待时间（超时强行转）",
      distribution: { type: "uniform", min: 5, max: 30 },
    },
  },
};

type TurnPhase =
  | "approaching"
  | "decelerating"
  | "entering_junction"
  | "waiting_in_junction"
  | "turning"
  | "merging"
  | "done";

export class LeftTurnModel extends BehaviorModel<LeftTurnParams> {
  private phase: TurnPhase = "approaching";
  private phaseStartedAt: number | null = null;
  private waitStartedAt: number | null = null;

  override get name() {
    return "left-turn";
  }

  private switchPhase(phase: TurnPhase, time: number) {
    this.phase = phase;
    this.phaseStartedAt = time;
    if (phase === "waiting_in_junction" && this.waitStartedAt === null) {
      this.waitStartedAt = time;
    }
  }

  private distanceToIntersection(
    ego: { s: number; laneId: string },
    map: Parameters<typeof distanceToNextJunction>[1],
    route: readonly string[],
    routeIndex: number,
  ): number {
    const { dist, inJunction } = distanceToNextJunction(
      ego,
      map,
      route,
      routeIndex,
    );
    return inJunction ? 0 : dist;
  }

  /**
   * 估算对向车流间隙。
   * 简化：找冲突车道中最近的车辆，估算到达冲突点的时间差。
   */
  private estimateOncomingGap(
    ego: { id: string; laneId: string },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
    map: Parameters<typeof getConflictLanesInJunction>[1],
  ): number {
    const conflictLaneIds = getConflictLanesInJunction(ego.laneId, map);

    let minTimeToConflict = Infinity;

    for (const other of others) {
      if (other.id === ego.id) continue;
      if (!conflictLaneIds.includes(other.laneId)) continue;

      const timeToConflict =
        other.speed > 0.1 ? other.s / other.speed : Infinity;
      if (timeToConflict < minTimeToConflict)
        minTimeToConflict = timeToConflict;
    }

    // 没有对向车 → 间隙无限大
    if (minTimeToConflict === Infinity) return 999;
    return minTimeToConflict;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, map, route, routeIndex, dt } = ctx;
    const {
      approachSpeedMps,
      turningSpeedMps,
      oncomingGapAcceptanceS,
      decelStartDistanceM,
      mergeAccelMps2,
      waitInJunction,
      junctionWaitSpeedMps,
      maxWaitTimeS,
    } = this.params;

    const distToJunction = this.distanceToIntersection(
      ego,
      map,
      route,
      routeIndex,
    );
    const oncomingGap = this.estimateOncomingGap(ego, others, map);
    const waited = this.waitStartedAt ? time - this.waitStartedAt : 0;
    const forced = waited >= maxWaitTimeS; // 超时强行转

    // 阶段切换
    if (this.phase === "approaching" && distToJunction < decelStartDistanceM) {
      this.switchPhase("decelerating", time);
    }

    if (this.phase === "decelerating" && ego.speed <= turningSpeedMps * 1.2) {
      if (waitInJunction) {
        this.switchPhase("entering_junction", time);
      } else {
        this.switchPhase("waiting_in_junction", time);
      }
    }

    if (this.phase === "entering_junction" && distToJunction < 10) {
      this.switchPhase("waiting_in_junction", time);
    }

    if (
      this.phase === "waiting_in_junction" &&
      (oncomingGap >= oncomingGapAcceptanceS || forced)
    ) {
      this.switchPhase("turning", time);
    }

    const elapsed = this.phaseStartedAt ? time - this.phaseStartedAt : 0;
    if (this.phase === "turning" && elapsed > 4) {
      this.switchPhase("merging", time);
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
          debug: { phase: this.phase, distToJunction },
        };
      }

      case "decelerating": {
        const targetSpeed = turningSpeedMps;
        const error = targetSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(3, Math.abs(error / dt) * 0.15);
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, targetSpeed, distToJunction },
        };
      }

      case "entering_junction": {
        // 低速驶入路口
        const error = junctionWaitSpeedMps - ego.speed;
        const accel =
          Math.sign(error) * Math.min(1.5, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.8,
          debug: { phase: this.phase, oncomingGap, distToJunction },
        };
      }

      case "waiting_in_junction": {
        const targetSpeed = waitInJunction ? junctionWaitSpeedMps : 0;
        const error = targetSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.8,
          debug: {
            phase: this.phase,
            oncomingGap,
            gapRequired: oncomingGapAcceptanceS,
            waited,
            forced,
          },
        };
      }

      case "turning": {
        const error = turningSpeedMps - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, elapsed, oncomingGap, forced },
        };
      }

      case "merging":
      case "done": {
        return {
          acceleration: mergeAccelMps2,
          confidence: 0.9,
          debug: { phase: this.phase },
        };
      }
    }
  }
}
