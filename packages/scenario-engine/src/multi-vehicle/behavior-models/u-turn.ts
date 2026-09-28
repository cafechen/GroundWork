/**
 * 掉头模型（U-turn）。
 *
 * 模拟车辆在路口或路段掉头的行为：
 *   减速 → 观察对向间隙 → 掉头 → 加速进入对向车道
 *
 * 从真实数据可以学的参数：
 *   - turningSpeedMps: 掉头速度
 *   - approachSpeedMps: 接近速度
 *   - gapAcceptanceS: 对向间隙接受
 *   - turnDurationS: 掉头持续时间
 *   - accelerationMps2: 完成后加速
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

export type UTurnParams = {
  /** 接近速度 m/s */
  approachSpeedMps: number;
  /** 掉头速度 m/s */
  turningSpeedMps: number;
  /** 对向可接受间隙 s */
  oncomingGapAcceptanceS: number;
  /** 减速开始距离 m */
  decelStartDistanceM: number;
  /** 掉头持续时间 s */
  turnDurationS: number;
  /** 完成后加速度 m/s² */
  accelerationMps2: number;
  /** 是否完全停车再掉头 */
  fullStopBeforeTurn: boolean;
  /** 最大等待时间 s（超时强行掉头） */
  maxWaitTimeS: number;
};

export const uTurnMetadata: ModelMetadata = {
  name: "u-turn",
  description: "掉头模型。模拟车辆在路口掉头的减速-等待-转向-加速过程。",
  params: {
    approachSpeedMps: {
      default: 10,
      unit: "m/s",
      description: "接近掉头点速度",
      distribution: { type: "uniform", min: 6, max: 15 },
    },
    turningSpeedMps: {
      default: 3,
      unit: "m/s",
      description: "掉头时速度",
      distribution: { type: "uniform", min: 1, max: 6 },
    },
    oncomingGapAcceptanceS: {
      default: 6,
      unit: "s",
      description: "对向车流可接受间隙",
      distribution: { type: "normal", mean: 6, std: 2, min: 2, max: 12 },
    },
    decelStartDistanceM: {
      default: 50,
      unit: "m",
      description: "距离掉头点多远开始减速",
      distribution: { type: "uniform", min: 20, max: 100 },
    },
    turnDurationS: {
      default: 5,
      unit: "s",
      description: "掉头持续时间",
      distribution: { type: "normal", mean: 5, std: 1, min: 3, max: 10 },
    },
    accelerationMps2: {
      default: 2,
      unit: "m/s²",
      description: "完成后加速度",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
    fullStopBeforeTurn: {
      default: false,
      description: "是否先停车再掉头",
    },
    maxWaitTimeS: {
      default: 20,
      unit: "s",
      description: "最大等待时间（超时强行掉头）",
      distribution: { type: "uniform", min: 5, max: 40 },
    },
  },
};

type Phase =
  | "approaching"
  | "decelerating"
  | "waiting_gap"
  | "turning"
  | "accelerating"
  | "done";

export class UTurnModel extends BehaviorModel<UTurnParams> {
  private phase: Phase = "approaching";
  private phaseStartedAt: number | null = null;
  private waitStartedAt: number | null = null;

  override get name() {
    return "u-turn";
  }

  private switchPhase(phase: Phase, time: number) {
    this.phase = phase;
    this.phaseStartedAt = time;
    if (phase === "waiting_gap" && this.waitStartedAt === null) {
      this.waitStartedAt = time;
    }
  }

  /**
   * 估算到掉头点的距离。
   * 简化：到下一个 junction 的距离作为掉头点距离。
   */
  private distanceToTurnPoint(
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
   */
  private estimateOncomingGap(
    ego: { id: string; laneId: string },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
    map: Parameters<typeof getConflictLanesInJunction>[1],
  ): number {
    const conflictLaneIds = getConflictLanesInJunction(ego.laneId, map);

    let minTimeToTurn = Infinity;
    for (const other of others) {
      if (other.id === ego.id) continue;
      if (!conflictLaneIds.includes(other.laneId)) continue;

      // 粗略估算对向车到达掉头点的时间
      const timeToTurn = other.speed > 0.1 ? other.s / other.speed : Infinity;
      if (timeToTurn < minTimeToTurn) minTimeToTurn = timeToTurn;
    }

    return minTimeToTurn === Infinity ? 999 : minTimeToTurn;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, map, route, routeIndex, dt } = ctx;
    const {
      approachSpeedMps,
      turningSpeedMps,
      oncomingGapAcceptanceS,
      decelStartDistanceM,
      turnDurationS,
      accelerationMps2,
      fullStopBeforeTurn,
      maxWaitTimeS,
    } = this.params;

    const distToTurn = this.distanceToTurnPoint(ego, map, route, routeIndex);
    const oncomingGap = this.estimateOncomingGap(ego, others, map);
    const waited = this.waitStartedAt ? time - this.waitStartedAt : 0;
    const forcedTurn = waited >= maxWaitTimeS;

    // 阶段切换
    if (this.phase === "approaching" && distToTurn < decelStartDistanceM) {
      this.switchPhase("decelerating", time);
    }

    if (this.phase === "decelerating") {
      const targetSpeed = fullStopBeforeTurn ? 0 : turningSpeedMps;
      if (ego.speed <= targetSpeed + 0.3) {
        this.switchPhase("waiting_gap", time);
      }
    }

    if (
      this.phase === "waiting_gap" &&
      (oncomingGap >= oncomingGapAcceptanceS || forcedTurn)
    ) {
      this.switchPhase("turning", time);
    }

    if (this.phase === "turning" && this.phaseStartedAt !== null) {
      const elapsed = time - this.phaseStartedAt;
      if (elapsed >= turnDurationS) {
        this.switchPhase("accelerating", time);
      }
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
          debug: { phase: this.phase, distToTurn },
        };
      }

      case "decelerating": {
        const targetSpeed = fullStopBeforeTurn ? 0 : turningSpeedMps;
        const error = targetSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(3, Math.abs(error / dt) * 0.15);
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, targetSpeed, distToTurn },
        };
      }

      case "waiting_gap": {
        const targetSpeed = fullStopBeforeTurn ? 0 : turningSpeedMps * 0.5;
        const error = targetSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.7,
          debug: {
            phase: this.phase,
            oncomingGap,
            gapRequired: oncomingGapAcceptanceS,
            waited,
            forcedTurn,
          },
        };
      }

      case "turning": {
        const error = turningSpeedMps - ego.speed;
        const accel =
          Math.sign(error) * Math.min(1.5, Math.abs(error / dt) * 0.1);
        const elapsed = this.phaseStartedAt ? time - this.phaseStartedAt : 0;
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, elapsed, turnDurationS },
        };
      }

      case "accelerating":
      case "done": {
        return {
          acceleration: accelerationMps2,
          confidence: 0.9,
          debug: { phase: this.phase },
        };
      }
    }
  }
}
