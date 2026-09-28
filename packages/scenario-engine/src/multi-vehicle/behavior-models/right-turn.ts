/**
 * 路口右转模型（intersection right turn）。
 *
 * 模拟车辆在路口右转的行为：
 *   接近路口减速 → 观察对向/横向交通 → 接受间隙 → 转向 → 加速汇入
 *
 * 从真实数据可以学的参数：
 *   - approachSpeedMps: 接近路口的速度
 *   - turningSpeedMps: 转弯时的速度
 *   - gapAcceptanceS: 可接受的横向车流间隙（秒）
 *   - stopLineDistanceM: 距离停止线多远开始减速
 *   - mergeAccelMps2: 汇入时的加速度
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

export type RightTurnParams = {
  /** 接近路口的速度 m/s */
  approachSpeedMps: number;
  /** 转弯时的速度 m/s */
  turningSpeedMps: number;
  /** 可接受间隙 s（横向车流中多大的空当敢转） */
  gapAcceptanceS: number;
  /** 距离停止线多远开始减速 m */
  decelStartDistanceM: number;
  /** 汇入后的加速度 m/s² */
  mergeAccelMps2: number;
  /** 是否完全停车让行（true=停一下再走，false=减速观察） */
  fullStop: boolean;
  /** 停车等待时间 s（fullStop=true 时） */
  stopWaitTimeS: number;
};

export const rightTurnMetadata: ModelMetadata = {
  name: "right-turn",
  description: "路口右转模型。模拟右转车辆的减速-观察-转向-汇入全过程。",
  params: {
    approachSpeedMps: {
      default: 10,
      unit: "m/s",
      description: "接近路口的速度",
      distribution: { type: "uniform", min: 6, max: 15 },
    },
    turningSpeedMps: {
      default: 4,
      unit: "m/s",
      description: "转弯时的速度",
      distribution: { type: "uniform", min: 2, max: 8 },
    },
    gapAcceptanceS: {
      default: 3,
      unit: "s",
      description: "可接受间隙（横向车流）",
      distribution: { type: "normal", mean: 3, std: 1, min: 1, max: 8 },
    },
    decelStartDistanceM: {
      default: 50,
      unit: "m",
      description: "距离停止线多远开始减速",
      distribution: { type: "uniform", min: 20, max: 100 },
    },
    mergeAccelMps2: {
      default: 2,
      unit: "m/s²",
      description: "汇入后的加速度",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
    fullStop: {
      default: false,
      description: "是否完全停车让行",
    },
    stopWaitTimeS: {
      default: 2,
      unit: "s",
      description: "停车等待时间",
      distribution: { type: "uniform", min: 0.5, max: 5 },
    },
  },
};

/**
 * 右转模型状态机。
 *
 * 阶段：
 * 1. approaching: 接近路口，正常行驶
 * 2. decelerating: 检测到路口，开始减速
 * 3. waiting: 停车/低速等待间隙
 * 4. turning: 正在转向
 * 5. merging: 转向完成，加速汇入
 */
type TurnPhase =
  "approaching" | "decelerating" | "waiting" | "turning" | "merging" | "done";

export class RightTurnModel extends BehaviorModel<RightTurnParams> {
  private phase: TurnPhase = "approaching";
  private phaseStartedAt: number | null = null;
  private stopLineReached = false;

  override get name() {
    return "right-turn";
  }

  private switchPhase(phase: TurnPhase, time: number) {
    this.phase = phase;
    this.phaseStartedAt = time;
  }

  /**
   * 估算到路口停止线的距离。
   */
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
   * 检查横向/对向车流的间隙是否足够右转。
   * 简化：找冲突车道（路口横向车道）中最近车辆的时间间隙。
   */
  private checkCrossTrafficGap(
    ego: { id: string; s: number; speed: number; laneId: string },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
    map: Parameters<typeof getConflictLanesInJunction>[1],
  ): number {
    const conflictLaneIds = getConflictLanesInJunction(ego.laneId, map);
    let minGapS = Infinity;

    for (const other of others) {
      if (other.id === ego.id) continue;
      if (!conflictLaneIds.includes(other.laneId)) continue;

      // 简化：用对方速度和距离估算冲突时间
      const timeToConflict = other.speed > 0.1 ? 50 / other.speed : Infinity;
      if (timeToConflict < minGapS) minGapS = timeToConflict;
    }

    return minGapS === Infinity ? 999 : minGapS;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, map, route, routeIndex, dt } = ctx;
    const {
      approachSpeedMps,
      turningSpeedMps,
      gapAcceptanceS,
      decelStartDistanceM,
      mergeAccelMps2,
      fullStop,
      stopWaitTimeS,
    } = this.params;

    const distToJunction = this.distanceToIntersection(
      ego,
      map,
      route,
      routeIndex,
    );

    // 根据距离切换阶段
    if (this.phase === "approaching" && distToJunction < decelStartDistanceM) {
      this.switchPhase("decelerating", time);
    }

    if (this.phase === "decelerating") {
      if (fullStop && ego.speed < 0.5 && !this.stopLineReached) {
        this.stopLineReached = true;
        this.switchPhase("waiting", time);
      } else if (!fullStop && ego.speed <= turningSpeedMps) {
        this.switchPhase("waiting", time);
      }
    }

    if (this.phase === "waiting") {
      const gap = this.checkCrossTrafficGap(ego, others, map);
      const waited = this.phaseStartedAt ? time - this.phaseStartedAt : 0;

      if (gap >= gapAcceptanceS && (!fullStop || waited >= stopWaitTimeS)) {
        this.switchPhase("turning", time);
      }
    }

    // 各阶段的动作输出
    switch (this.phase) {
      case "approaching": {
        // 正常行驶到接近速度
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
        const targetSpeed = fullStop ? 0 : turningSpeedMps;
        const error = targetSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(3, Math.abs(error / dt) * 0.15);
        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, targetSpeed, distToJunction },
        };
      }

      case "waiting": {
        const gap = this.checkCrossTrafficGap(ego, others, map);
        const waited = this.phaseStartedAt ? time - this.phaseStartedAt : 0;
        if (fullStop) {
          return {
            acceleration: ego.speed > 0.1 ? -2 : 0,
            confidence: 0.8,
            debug: { phase: this.phase, gap, waited, gapAcceptanceS },
          };
        }
        // 不停车，慢速蠕行
        const creepSpeed = 2;
        const error = creepSpeed - ego.speed;
        const accel =
          Math.sign(error) * Math.min(1, Math.abs(error / dt) * 0.1);
        return {
          acceleration: accel,
          confidence: 0.7,
          debug: { phase: this.phase, gap, waited, gapAcceptanceS },
        };
      }

      case "turning": {
        // 保持转弯速度
        const error = turningSpeedMps - ego.speed;
        const accel =
          Math.sign(error) * Math.min(2, Math.abs(error / dt) * 0.1);
        const elapsed = this.phaseStartedAt ? time - this.phaseStartedAt : 0;

        // 假设 3 秒完成转弯（简化）
        if (elapsed > 3) {
          this.switchPhase("merging", time);
        }

        return {
          acceleration: accel,
          confidence: 0.9,
          debug: { phase: this.phase, elapsed, turningSpeedMps },
        };
      }

      case "merging":
      case "done": {
        // 加速汇入
        return {
          acceleration: mergeAccelMps2,
          confidence: 0.9,
          debug: { phase: this.phase },
        };
      }
    }
  }
}
