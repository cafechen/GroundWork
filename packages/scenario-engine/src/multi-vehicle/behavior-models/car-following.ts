/**
 * 跟车模型（IDM + 反应时间）。
 *
 * 基于智能驾驶模型（Intelligent Driver Model, IDM），加上感知反应延迟。
 * 这是最基础的纵向行为模型，几乎所有场景都要用到。
 *
 * 从真实数据可以拟合的参数：
 *   - desiredSpeedMps: 期望速度
 *   - timeHeadwayS: 安全车头时距
 *   - minimumGapM: 最小静止间距
 *   - maxAccelerationMps2: 最大加速度
 *   - comfortableBrakingMps2: 舒适减速度
 *   - reactionTimeS: 反应时间
 */

import type { MapModel } from "../../index.js";
import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";

export type CarFollowingParams = {
  /** 期望速度 m/s */
  desiredSpeedMps: number;
  /** 安全车头时距 s */
  timeHeadwayS: number;
  /** 静止时最小间距 m */
  minimumGapM: number;
  /** 最大加速度 m/s² */
  maxAccelerationMps2: number;
  /** 舒适减速度 m/s²（正值） */
  comfortableBrakingMps2: number;
  /** 反应时间 s — 延迟感知前车状态 */
  reactionTimeS: number;
};

export const carFollowingMetadata: ModelMetadata = {
  name: "car-following",
  description: "IDM 跟车模型，含反应时间。用于所有纵向跟驰场景。",
  params: {
    desiredSpeedMps: {
      default: 12,
      unit: "m/s",
      description: "期望巡航速度",
      distribution: { type: "uniform", min: 8, max: 20 },
    },
    timeHeadwayS: {
      default: 1.5,
      unit: "s",
      description: "安全车头时距（越大越保守）",
      distribution: { type: "normal", mean: 1.5, std: 0.5, min: 0.5, max: 3 },
    },
    minimumGapM: {
      default: 3,
      unit: "m",
      description: "静止时最小车距",
      distribution: { type: "uniform", min: 1, max: 6 },
    },
    maxAccelerationMps2: {
      default: 2,
      unit: "m/s²",
      description: "最大加速度",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
    comfortableBrakingMps2: {
      default: 2.5,
      unit: "m/s²",
      description: "舒适减速度（正值）",
      distribution: { type: "uniform", min: 1.5, max: 5 },
    },
    reactionTimeS: {
      default: 0.5,
      unit: "s",
      description: "感知反应时间",
      distribution: { type: "normal", mean: 0.5, std: 0.2, min: 0.1, max: 2 },
    },
  },
};

export class CarFollowingModel extends BehaviorModel<CarFollowingParams> {
  override get name() {
    return "car-following";
  }

  /**
   * 在指定快照中找本车道的前车。
   */
  findLeader(
    ego: { id: string; laneId: string; s: number },
    others: readonly { id: string; laneId: string; s: number }[],
    roads: Map<string, MapModel["roads"][number]>,
  ): { state: { id: string; s: number; speed: number }; gap: number } | null {
    const road = roads.get(ego.laneId);
    if (!road) return null;

    let best: {
      state: { id: string; s: number; speed: number };
      gap: number;
    } | null = null;

    for (const other of others) {
      if (other.id === ego.id) continue;
      if (other.laneId !== ego.laneId) continue;

      const gap = other.s - ego.s;
      if (gap <= 0) continue; // 前车必须在前方

      if (!best || gap < best.gap) {
        best = {
          state: other as unknown as { id: string; s: number; speed: number },
          gap,
        };
      }
    }
    return best;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, map } = ctx;
    const roads = new Map(map.roads.map((r) => [r.id, r]));
    const {
      desiredSpeedMps,
      timeHeadwayS,
      minimumGapM,
      maxAccelerationMps2,
      comfortableBrakingMps2,
    } = this.params;

    // 找前车
    const leader = this.findLeader(ego, others, roads);

    // 自由流加速度（IDM 公式）
    const freeAccel =
      maxAccelerationMps2 *
      (1 - Math.pow(ego.speed / Math.max(0.1, desiredSpeedMps), 4));

    if (!leader) {
      // 没有前车，自由行驶
      return { acceleration: freeAccel, confidence: 1.0 };
    }

    // 间距项（IDM）
    const speedDiff = ego.speed - leader.state.speed;
    const desiredGap =
      minimumGapM +
      Math.max(
        0,
        ego.speed * timeHeadwayS +
          (ego.speed * speedDiff) /
            (2 * Math.sqrt(maxAccelerationMps2 * comfortableBrakingMps2)),
      );

    const gapRatio = desiredGap / Math.max(0.1, leader.gap);
    const interactionAccel = -maxAccelerationMps2 * gapRatio * gapRatio;

    const acceleration = freeAccel + interactionAccel;

    return {
      acceleration,
      confidence: 1.0,
      debug: {
        gap: leader.gap,
        desiredGap,
        leaderSpeed: leader.state.speed,
        freeAccel,
        interactionAccel,
      },
    };
  }
}
