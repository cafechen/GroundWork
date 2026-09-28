/**
 * 对向越线/闯入模型（oncoming intrusion / opposite direction intrusion）。
 *
 * 模拟对向车辆越过中心线闯入本车道的行为。
 * 用于对向刮蹭、迎面碰撞等场景。
 *
 * 从真实数据可以学的参数：
 *   - intrusionStartDistanceM: 开始越线的距离
 *   - intrusionDepthM: 越线深度（闯入本车道多少米）
 *   - intrusionDurationS: 越线持续时间
 *   - returnSpeedMps: 返回原车道的横向速度
 *   - triggerTtcS: 基于 TTC 的越线触发
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";
import {
  getConflictLanesInJunction,
  isJunctionRoad,
  roadLength,
} from "./map-utils.js";

export type OppositeIntrusionParams = {
  /** 触发越线的 TTC s（与本车的相遇时间） */
  triggerTtcS: number;
  /** 越线深度 m（0.5 = 压线，3.5 = 完全占道） */
  intrusionDepthM: number;
  /** 越线持续时间 s（闯入后多久回来） */
  intrusionDurationS: number;
  /** 横向速度 m/s（越线和返回的速度） */
  lateralSpeedMps: number;
  /** 越线时的减速度 m/s²（紧张导致减速） */
  intrusionDecelMps2: number;
  /** 越线后是否返回原车道 */
  returnToLane: boolean;
  /** 触发延迟 s */
  triggerDelayS: number;
};

export const oppositeIntrusionMetadata: ModelMetadata = {
  name: "opposite-intrusion",
  description: "对向越线模型。模拟对向车辆越过中心线的危险行为。",
  params: {
    triggerTtcS: {
      default: 3,
      unit: "s",
      description: "触发越线的相遇时间 (TTC)",
      distribution: { type: "uniform", min: 1, max: 6 },
    },
    intrusionDepthM: {
      default: 1.5,
      unit: "m",
      description: "越线深度（0.5=压线，3.5=完全占道）",
      distribution: { type: "uniform", min: 0.3, max: 3.5 },
    },
    intrusionDurationS: {
      default: 2,
      unit: "s",
      description: "越线持续时间",
      distribution: { type: "uniform", min: 0.5, max: 5 },
    },
    lateralSpeedMps: {
      default: 1,
      unit: "m/s",
      description: "横向速度",
      distribution: { type: "normal", mean: 1, std: 0.3, min: 0.3, max: 2.5 },
    },
    intrusionDecelMps2: {
      default: 1,
      unit: "m/s²",
      description: "越线时的减速度",
      distribution: { type: "uniform", min: 0, max: 4 },
    },
    returnToLane: {
      default: true,
      description: "越线后是否返回原车道",
    },
    triggerDelayS: {
      default: 0,
      unit: "s",
      description: "触发延迟",
      distribution: { type: "uniform", min: 0, max: 1 },
    },
  },
};

type Phase =
  | "approaching" // 正常对向行驶
  | "intruding" // 正在越线
  | "intruded" // 已到达最大越线深度，保持
  | "returning" // 返回原车道
  | "done";

export class OppositeIntrusionModel extends BehaviorModel<OppositeIntrusionParams> {
  private phase: Phase = "approaching";
  private phaseStartedAt: number | null = null;
  private triggered = false;
  private triggerTime: number | null = null;

  override get name() {
    return "opposite-intrusion";
  }

  private switchPhase(phase: Phase, time: number) {
    this.phase = phase;
    this.phaseStartedAt = time;
  }

  /**
   * 估算与最近对向车辆的相遇时间。
   * 简化：找冲突车道中最近的车，用相对速度算 TTC。
   */
  private computeMeetingTime(
    ego: { id: string; laneId: string; s: number; speed: number },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
    map: Parameters<typeof getConflictLanesInJunction>[1],
  ): number {
    const currentRoad = map.roads.find((r) => r.id === ego.laneId);
    if (!currentRoad) return Infinity;

    const conflictLaneIds = getConflictLanesInJunction(ego.laneId, map);

    let minTtc = Infinity;

    for (const other of others) {
      if (other.id === ego.id) continue;
      const otherRoad = map.roads.find((r) => r.id === other.laneId);
      if (!otherRoad) continue;

      // 冲突车道（路口内不同方向），或者非同向的都算对向
      const isOncoming =
        conflictLaneIds.includes(other.laneId) ||
        (!isJunctionRoad(otherRoad) &&
          !isJunctionRoad(currentRoad) &&
          conflictLaneIds.length === 0);

      if (!isOncoming) continue;

      // 估算两车之间的距离（假设相向而行）
      const approachSpeed = ego.speed + other.speed;
      if (approachSpeed < 0.1) continue;

      // 简化：用当前 s 值和道路长度估算距离
      const egoRemaining = roadLength(currentRoad) - ego.s;
      // 假设在路口相遇，距离是各自到路口的距离之和（粗略）
      const meetingDist = egoRemaining + other.s;

      const ttc = Math.max(0, meetingDist) / approachSpeed;
      if (ttc < minTtc) minTtc = ttc;
    }

    return minTtc;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, map } = ctx;
    const {
      triggerTtcS,
      intrusionDepthM,
      intrusionDurationS,
      lateralSpeedMps,
      intrusionDecelMps2,
      returnToLane,
      triggerDelayS,
    } = this.params;

    const meetingTtc = this.computeMeetingTime(ego, others, map);

    // 触发越线
    if (!this.triggered && meetingTtc < triggerTtcS) {
      this.triggered = true;
      this.triggerTime = time + triggerDelayS;
    }

    // 阶段切换
    if (
      this.triggered &&
      this.triggerTime !== null &&
      time >= this.triggerTime &&
      this.phase === "approaching"
    ) {
      this.switchPhase("intruding", time);
    }

    if (this.phase === "intruding" && this.phaseStartedAt !== null) {
      const elapsed = time - this.phaseStartedAt;
      const timeToFullDepth = intrusionDepthM / lateralSpeedMps;
      if (elapsed >= timeToFullDepth) {
        this.switchPhase("intruded", time);
      }
    }

    if (this.phase === "intruded" && this.phaseStartedAt !== null) {
      const elapsed = time - this.phaseStartedAt;
      if (elapsed >= intrusionDurationS) {
        if (returnToLane) {
          this.switchPhase("returning", time);
        }
      }
    }

    if (this.phase === "returning" && this.phaseStartedAt !== null) {
      const elapsed = time - this.phaseStartedAt;
      const returnTime = intrusionDepthM / lateralSpeedMps;
      if (elapsed >= returnTime) {
        this.switchPhase("done", time);
      }
    }

    // 计算横向偏移
    let lateralOffset = 0;
    switch (this.phase) {
      case "intruding": {
        const elapsed = this.phaseStartedAt ? time - this.phaseStartedAt : 0;
        lateralOffset = Math.min(intrusionDepthM, elapsed * lateralSpeedMps);
        break;
      }
      case "intruded":
        lateralOffset = intrusionDepthM;
        break;
      case "returning": {
        const elapsed = this.phaseStartedAt ? time - this.phaseStartedAt : 0;
        const returnTime = intrusionDepthM / lateralSpeedMps;
        const progress = Math.min(1, elapsed / returnTime);
        lateralOffset = intrusionDepthM * (1 - progress);
        break;
      }
      default:
        lateralOffset = 0;
    }

    // 纵向：越线时轻微减速
    let accel = 0;
    if (this.phase === "intruding" || this.phase === "intruded") {
      // 越线过程中减速
      accel = -intrusionDecelMps2;
    } else if (this.phase === "done" || this.phase === "approaching") {
      // 正常巡航（保持当前速度）
      accel = 0;
    }

    return {
      acceleration: accel,
      lateralOffsetM: lateralOffset,
      confidence: 0.9,
      debug: {
        phase: this.phase,
        meetingTtc,
        lateralOffset,
        triggered: this.triggered,
      },
    };
  }
}
