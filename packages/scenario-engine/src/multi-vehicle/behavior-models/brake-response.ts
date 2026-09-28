/**
 * 刹车响应模型（brake response model）。
 *
 * 模拟驾驶员（或被测算法）在发现危险后的制动响应过程：
 *   感知 → 判断 → 反应延迟 → 制动建立 → 稳定制动
 *
 * 这是被测车（ego）的核心行为模型，决定了危险场景的严重程度。
 *
 * 从真实数据可以学的参数：
 *   - perceptionTimeS: 感知时间（发现危险到开始反应）
 *   - decisionTimeS: 决策时间（判断要刹车到开始踩踏板）
 *   - brakeRampTimeS: 制动建立时间（踏板从 0 到最大）
 *   - maxDecelerationMps2: 最大减速度
 *   - ttcThresholdS: 触发制动的 TTC 阈值
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";

export type BrakeResponseParams = {
  /** 感知时间 s（发现危险需要多久） */
  perceptionTimeS: number;
  /** 决策时间 s（判断 + 反应） */
  decisionTimeS: number;
  /** 制动建立时间 s（减速度从 0 到最大） */
  brakeRampTimeS: number;
  /** 最大减速度 m/s²（正值） */
  maxDecelerationMps2: number;
  /** 触发制动的 TTC 阈值 s */
  ttcThresholdS: number;
  /** 最小制动减速度 m/s²（舒适制动水平） */
  minBrakeDecelMps2: number;
};

export const brakeResponseMetadata: ModelMetadata = {
  name: "brake-response",
  description: "驾驶员制动响应模型。模拟危险场景下被测车的制动过程。",
  params: {
    perceptionTimeS: {
      default: 0.3,
      unit: "s",
      description: "感知时间（发现危险）",
      distribution: { type: "normal", mean: 0.3, std: 0.1, min: 0.1, max: 1 },
    },
    decisionTimeS: {
      default: 0.4,
      unit: "s",
      description: "决策反应时间",
      distribution: {
        type: "normal",
        mean: 0.4,
        std: 0.15,
        min: 0.1,
        max: 1.5,
      },
    },
    brakeRampTimeS: {
      default: 0.3,
      unit: "s",
      description: "制动建立时间",
      distribution: { type: "normal", mean: 0.3, std: 0.1, min: 0.1, max: 1 },
    },
    maxDecelerationMps2: {
      default: 8,
      unit: "m/s²",
      description: "最大减速度（正值）",
      distribution: { type: "uniform", min: 5, max: 10 },
    },
    ttcThresholdS: {
      default: 2.5,
      unit: "s",
      description: "触发制动的 TTC 阈值",
      distribution: { type: "uniform", min: 1, max: 5 },
    },
    minBrakeDecelMps2: {
      default: 2,
      unit: "m/s²",
      description: "最小制动减速度（舒适制动）",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
  },
};

/**
 * 制动响应模型。
 *
 * 工作流程：
 * 1. 持续监测前方危险（TTC）
 * 2. TTC < 阈值 → 开始感知计时
 * 3. 感知完成 → 决策计时
 * 4. 决策完成 → 开始制动（按 ramp 建立减速度）
 * 5. 达到最大减速度后保持
 * 6. 危险解除后缓慢释放制动
 */
export class BrakeResponseModel extends BehaviorModel<BrakeResponseParams> {
  private dangerFirstNoticedAt: number | null = null;
  private brakingStartedAt: number | null = null;
  private isBraking = false;

  override get name() {
    return "brake-response";
  }

  /**
   * 计算前方最近障碍物的 TTC。
   * 可以是前车、路障、闯入车辆等。
   */
  private computeTTC(
    ego: { id: string; laneId: string; s: number; speed: number },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
  ): number {
    let minTtc = Infinity;

    for (const other of others) {
      if (other.id === ego.id) continue;
      if (other.laneId !== ego.laneId) continue; // 简化：只算同车道

      const gap = other.s - ego.s;
      if (gap <= 0) continue;

      const approachSpeed = ego.speed - other.speed;
      if (approachSpeed <= 0.1) continue; // 不在接近

      const ttc = gap / approachSpeed;
      if (ttc < minTtc) minTtc = ttc;
    }

    return minTtc;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time } = ctx;
    const {
      perceptionTimeS,
      decisionTimeS,
      brakeRampTimeS,
      maxDecelerationMps2,
      ttcThresholdS,
      minBrakeDecelMps2,
    } = this.params;

    const ttc = this.computeTTC(ego, others);
    const totalReactionTime = perceptionTimeS + decisionTimeS;

    // 检测危险
    if (ttc < ttcThresholdS && this.dangerFirstNoticedAt === null) {
      this.dangerFirstNoticedAt = time;
    }

    // 危险解除（TTC 又变大了，且还没开始制动）→ 重置
    if (ttc >= ttcThresholdS * 1.5 && !this.isBraking) {
      this.dangerFirstNoticedAt = null;
      return { acceleration: 0, confidence: 0.1, debug: { noThreat: true } };
    }

    // 还在反应期
    if (
      this.dangerFirstNoticedAt === null ||
      time < this.dangerFirstNoticedAt + totalReactionTime
    ) {
      return {
        acceleration: 0,
        confidence: 0.2,
        debug: { ttc, phase: "reacting" },
      };
    }

    // 开始制动
    if (this.brakingStartedAt === null) {
      this.brakingStartedAt = time;
      this.isBraking = true;
    }

    const brakingTime = time - this.brakingStartedAt;

    // 根据 TTC 调节制动强度：越紧急，刹得越狠
    const urgency = Math.min(
      1,
      (ttcThresholdS - Math.min(ttc, ttcThresholdS)) / ttcThresholdS,
    );
    const targetDecel =
      minBrakeDecelMps2 + (maxDecelerationMps2 - minBrakeDecelMps2) * urgency;

    // ramp up 阶段
    let currentDecel = targetDecel;
    if (brakingTime < brakeRampTimeS) {
      currentDecel = targetDecel * (brakingTime / brakeRampTimeS);
    }

    // 已经停了就不继续刹了
    if (ego.speed <= 0.1) {
      return {
        acceleration: 0,
        confidence: 1.0,
        debug: { stopped: true, ttc },
      };
    }

    return {
      acceleration: -currentDecel,
      confidence: 1.0,
      debug: {
        ttc,
        urgency,
        currentDecel,
        brakingTime,
        phase: brakingTime < brakeRampTimeS ? "ramp" : "steady",
      },
    };
  }
}
