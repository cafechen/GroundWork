/**
 * 前车刹停模型（lead vehicle braking）。
 *
 * 模拟前车突然制动的触发模式，用于生成追尾/危险跟车场景。
 * 不是每辆车都用这个模型，而是场景中特定的"事件车"用这个模型，
 * 在特定时机/条件下触发紧急制动。
 *
 * 从真实数据可以学的参数：
 *   - triggerTTC: 触发刹车的 TTC 阈值（什么时候开始刹）
 *   - brakingDecelMps2: 减速度大小（舒适制动 vs 紧急制动）
 *   - brakeRampTimeS: 减速度建立时间（制动踏板踩到多快）
 *   - triggerSpeedRatio: 基于速度比例触发（比如前车降到某速度开始刹）
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";

export type LeadVehicleBrakingParams = {
  /** 触发紧急制动的 TTC 阈值（秒），小于这个值就开刹 */
  triggerTtcS: number;
  /** 制动减速度 m/s²（正值，输出时取负） */
  brakingDecelMps2: number;
  /** 减速度建立时间 s（从 0 加到最大减速度需要多久） */
  brakeRampTimeS: number;
  /** 最低刹车速度 m/s（降到这个速度以下就不再继续减速） */
  minSpeedMps: number;
  /** 触发延迟 s（条件满足后等多久才刹车，模拟反应时间） */
  triggerDelayS: number;
  /** 是否保持刹停（true=一直刹到停，false=减速到目标速度后保持） */
  brakeToStop: boolean;
};

export const leadVehicleBrakingMetadata: ModelMetadata = {
  name: "lead-vehicle-braking",
  description: "前车紧急制动模型。用于追尾/危险跟车场景的触发。",
  params: {
    triggerTtcS: {
      default: 3,
      unit: "s",
      description: "触发紧急制动的 TTC 阈值",
      distribution: { type: "uniform", min: 1, max: 6 },
    },
    brakingDecelMps2: {
      default: 6,
      unit: "m/s²",
      description: "制动减速度（正值）",
      distribution: { type: "uniform", min: 3, max: 9 },
    },
    brakeRampTimeS: {
      default: 0.3,
      unit: "s",
      description: "减速度建立时间",
      distribution: { type: "normal", mean: 0.3, std: 0.1, min: 0.1, max: 1 },
    },
    minSpeedMps: {
      default: 0,
      unit: "m/s",
      description: "最低速度（0 = 完全停下）",
      distribution: { type: "uniform", min: 0, max: 10 },
    },
    triggerDelayS: {
      default: 0,
      unit: "s",
      description: "触发延迟（条件满足后的反应时间）",
      distribution: { type: "uniform", min: 0, max: 1 },
    },
    brakeToStop: {
      default: true,
      description: "是否一直刹到停",
    },
  },
};

/**
 * 前车刹停模型。
 *
 * 工作模式：
 * - 初始：跟车行驶（用基础跟车模型）
 * - 满足触发条件后（TTC 阈值/距离阈值），开始制动
 * - 制动按 ramp 时间建立到最大减速度
 * - 刹到 minSpeedMps 后保持（如果 brakeToStop=true 则保持 0）
 */
export class LeadVehicleBrakingModel extends BehaviorModel<LeadVehicleBrakingParams> {
  private brakingStartedAt: number | null = null;
  private triggered = false;

  override get name() {
    return "lead-vehicle-braking";
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time } = ctx;
    const {
      brakingDecelMps2,
      brakeRampTimeS,
      minSpeedMps,
      triggerDelayS,
      brakeToStop,
      triggerTtcS,
    } = this.params;

    // 找后车（计算 TTC 用——后车接近前车的速度差决定 TTC）
    let closestFollower: { speed: number; gap: number } | null = null;
    for (const other of others) {
      if (other.id === ego.id) continue;
      if (other.laneId !== ego.laneId) continue;
      const gap = ego.s - other.s;
      if (gap <= 0) continue; // 后车必须在后面
      if (!closestFollower || gap < closestFollower.gap) {
        closestFollower = { speed: other.speed, gap };
      }
    }

    // 检查是否触发制动
    if (!this.triggered) {
      // 触发条件 1：后车 TTC 小于阈值（从后车角度看，快要追尾了）
      if (closestFollower && closestFollower.speed > ego.speed) {
        const approachSpeed = closestFollower.speed - ego.speed;
        const ttc = closestFollower.gap / Math.max(0.1, approachSpeed);
        if (ttc < triggerTtcS) {
          this.triggered = true;
          this.brakingStartedAt = time + triggerDelayS;
        }
      }

      if (!this.triggered) {
        // 还没触发，正常加速/巡航
        return { acceleration: 0, confidence: 0.5 };
      }
    }

    // 制动阶段
    if (this.brakingStartedAt === null || time < this.brakingStartedAt) {
      return { acceleration: 0, confidence: 0.5 }; // 还在延迟期
    }

    const brakingTime = time - this.brakingStartedAt;

    // 计算当前减速度（ramp up）
    let currentDecel = brakingDecelMps2;
    if (brakingTime < brakeRampTimeS) {
      currentDecel = brakingDecelMps2 * (brakingTime / brakeRampTimeS);
    }

    // 如果已经降到目标速度以下，不再继续减速
    if (ego.speed <= minSpeedMps) {
      if (brakeToStop || ego.speed <= 0.1) {
        return { acceleration: 0, confidence: 1.0, debug: { stopped: true } };
      }
      // 保持 minSpeed
      return { acceleration: 0, confidence: 0.8, debug: { atMinSpeed: true } };
    }

    return {
      acceleration: -currentDecel,
      confidence: 1.0,
      debug: {
        brakingTime,
        currentDecel,
        phase: brakingTime < brakeRampTimeS ? "ramp" : "steady",
      },
    };
  }
}
