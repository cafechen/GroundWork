/**
 * 强制变道模型（mandatory lane change）。
 *
 * 当车辆必须变道才能继续路线时（比如前方车道消失、要进入转弯车道），
 * 寻找合适间隙并完成变道。这是 cut-in 场景的核心模型之一。
 *
 * 从真实数据可以学的参数：
 *   - gapAcceptanceFactor: 间隙接受系数（多大的 gap 才敢变）
 *   - lateralSpeedMps: 横向速度（变道需要多久）
 *   - lookAheadDistanceM: 提前多少米开始准备变道
 *   - minGapM: 最小可接受间隙
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";
import { getLeftNeighbor, getRightNeighbor, roadWidth } from "./map-utils.js";

export type MandatoryLaneChangeParams = {
  /** 提前多少米开始准备变道 */
  lookAheadDistanceM: number;
  /** 最小可接受间隙 m（后车跟车距离） */
  minGapM: number;
  /** 间隙接受系数（= 车头时距 × 后车速度） */
  gapAcceptanceFactor: number;
  /** 横向速度 m/s（变道快慢） */
  lateralSpeedMps: number;
  /** 变道后的目标速度比例（相对于当前速度） */
  targetSpeedRatio: number;
  /** 变道完成后是否回到原车道（false = 一直待在目标车道） */
  returnToOriginal: boolean;
  /** 返回原车道的延迟 s */
  returnDelayS: number;
};

export const mandatoryLaneChangeMetadata: ModelMetadata = {
  name: "mandatory-lane-change",
  description: "强制变道模型。用于 cut-in、汇入、车道消失等场景。",
  params: {
    lookAheadDistanceM: {
      default: 100,
      unit: "m",
      description: "提前多少米开始准备变道",
      distribution: { type: "uniform", min: 50, max: 200 },
    },
    minGapM: {
      default: 5,
      unit: "m",
      description: "最小可接受间隙",
      distribution: { type: "uniform", min: 2, max: 15 },
    },
    gapAcceptanceFactor: {
      default: 1.2,
      unit: "s",
      description: "间隙接受系数（车头时距）",
      distribution: { type: "normal", mean: 1.2, std: 0.4, min: 0.5, max: 3 },
    },
    lateralSpeedMps: {
      default: 1.5,
      unit: "m/s",
      description: "横向速度（变道快慢）",
      distribution: { type: "normal", mean: 1.5, std: 0.3, min: 0.5, max: 3 },
    },
    targetSpeedRatio: {
      default: 1.0,
      description: "变道后目标速度比例",
      distribution: { type: "uniform", min: 0.7, max: 1.2 },
    },
    returnToOriginal: {
      default: false,
      description: "是否返回原车道",
    },
    returnDelayS: {
      default: 3,
      unit: "s",
      description: "返回原车道的延迟",
      distribution: { type: "uniform", min: 1, max: 10 },
    },
  },
};

/**
 * 强制变道模型。
 *
 * 触发条件：需要变道（目标车道在 route 中下一个）
 * 决策过程：
 *   1. 检查目标车道前后间隙
 *   2. 间隙足够 → 开始变道
 *   3. 变道完成 → 保持目标速度
 *
 * 注意：这个模型主要输出 targetLaneId 和纵向加速度。
 * 实际的横向轨迹由仿真层根据 lateralSpeedMps 插值。
 */
export class MandatoryLaneChangeModel extends BehaviorModel<MandatoryLaneChangeParams> {
  private changeStartedAt: number | null = null;
  private originalLaneId: string | null = null;
  private returnedAt: number | null = null;
  private completed = false;

  override get name() {
    return "mandatory-lane-change";
  }

  /**
   * 检查目标车道的间隙是否足够。
   * 简化：只看目标车道中最近的前车和后车的距离。
   */
  private checkGap(
    ego: { id: string; s: number; speed: number },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
    targetLaneId: string,
  ): { frontGap: number; rearGap: number; acceptable: boolean } {
    let frontGap = Infinity;
    let rearGap = Infinity;

    for (const other of others) {
      if (other.id === ego.id) continue;
      if (other.laneId !== targetLaneId) continue;

      const dist = other.s - ego.s;
      if (dist > 0 && dist < frontGap) frontGap = dist;
      if (dist < 0 && -dist < rearGap) rearGap = -dist;
    }

    const requiredFrontGap = this.params.minGapM;
    const requiredRearGap =
      this.params.minGapM + this.params.gapAcceptanceFactor * ego.speed;

    const acceptable =
      frontGap >= requiredFrontGap && rearGap >= requiredRearGap;

    return { frontGap, rearGap, acceptable };
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, map, dt } = ctx;
    const {
      lateralSpeedMps,
      targetSpeedRatio,
      returnToOriginal,
      returnDelayS,
    } = this.params;

    // 目标车道：优先左邻，没有就右邻
    let targetLaneId = getLeftNeighbor(ego.laneId, map);
    if (!targetLaneId) {
      targetLaneId = getRightNeighbor(ego.laneId, map);
    }

    if (!targetLaneId) {
      return {
        acceleration: 0,
        confidence: 0,
        debug: { noAdjacentLane: true },
      };
    }

    const currentRoad = map.roads.find((r) => r.id === ego.laneId);
    if (!currentRoad) {
      return { acceleration: 0, confidence: 0 };
    }

    if (!this.originalLaneId) {
      this.originalLaneId = ego.laneId;
    }

    // 如果已经在目标车道了
    if (ego.laneId === targetLaneId) {
      if (!this.completed) {
        this.completed = true;
        if (returnToOriginal) {
          this.returnedAt = time + returnDelayS;
        }
      }

      // 需要返回原车道
      if (
        returnToOriginal &&
        this.returnedAt !== null &&
        time >= this.returnedAt
      ) {
        return {
          acceleration: 0,
          targetLaneId: this.originalLaneId ?? undefined,
          confidence: 0.9,
          debug: { returning: true, returnLane: this.originalLaneId },
        };
      }

      // 保持在目标车道，调整速度
      const targetSpeed = ego.speed * targetSpeedRatio;
      const accel = (targetSpeed - ego.speed) / Math.max(dt, 0.1);
      return {
        acceleration: Math.max(-3, Math.min(2, accel)),
        confidence: 0.8,
        debug: { cruising: true, targetSpeed },
      };
    }

    // 还在原车道，检查是否需要变道 + 间隙是否足够
    const gapCheck = this.checkGap(ego, others, targetLaneId);

    if (!gapCheck.acceptable) {
      // 间隙不够，减速等待
      const decel = -1.5;
      return {
        acceleration: decel,
        confidence: 0.6,
        debug: {
          waiting: true,
          frontGap: gapCheck.frontGap,
          rearGap: gapCheck.rearGap,
        },
      };
    }

    // 间隙足够，开始变道
    if (this.changeStartedAt === null) {
      this.changeStartedAt = time;
    }

    const laneWidth = roadWidth(currentRoad);
    const changeDuration = laneWidth / lateralSpeedMps;
    const elapsed = time - this.changeStartedAt;
    const progress = Math.min(1, elapsed / changeDuration);

    // 变道过程中调整速度
    const targetSpeed = ego.speed * targetSpeedRatio;
    const accel = (targetSpeed - ego.speed) / Math.max(dt, 0.1);

    return {
      acceleration: Math.max(-3, Math.min(2, accel)),
      targetLaneId,
      confidence: 0.9,
      debug: {
        changing: true,
        targetLaneId,
        progress,
        frontGap: gapCheck.frontGap,
        rearGap: gapCheck.rearGap,
      },
    };
  }
}
