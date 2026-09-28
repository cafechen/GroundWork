/**
 * 弱势交通参与者 / 非机动车模型（VRU / Non-motor Vehicle）。
 *
 * 模拟电动车、自行车、行人等的行为：
 *   - 速度慢、横向摆动大
 *   - 行为不可预测性强（突然变向、减速、加速）
 *   - 可能闯红灯、逆行、在机动车道行驶
 *
 * 从真实数据可以学的参数：
 *   - avgSpeedMps: 平均速度
 *   - speedVariation: 速度变化幅度
 *   - lateralSwingAmpM: 横向摆动幅度
 *   - lateralSwingFreqHz: 横向摆动频率
 *   - reactionDelayS: 反应时间
 *   - aggressiveness: 激进程度（闯红灯/逆行概率）
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";

export type VRUParams = {
  /** 平均速度 m/s */
  avgSpeedMps: number;
  /** 速度变化幅度（±比例） */
  speedVariation: number;
  /** 横向摆动幅度 m */
  lateralSwingAmpM: number;
  /** 横向摆动频率 Hz */
  lateralSwingFreqHz: number;
  /** 反应时间 s */
  reactionDelayS: number;
  /** 激进程度 0-1（越高越不守规矩） */
  aggressiveness: number;
  /** 变向概率（每秒） */
  directionChangeProbPerSec: number;
  /** 起步加速度 m/s² */
  startAccelMps2: number;
  /** 制动减速度 m/s² */
  brakeDecelMps2: number;
};

export const vruMetadata: ModelMetadata = {
  name: "vru",
  description: "非机动车/弱势交通参与者模型。模拟电动车、自行车的行为。",
  params: {
    avgSpeedMps: {
      default: 5,
      unit: "m/s",
      description: "平均行驶速度",
      distribution: { type: "normal", mean: 5, std: 1.5, min: 1, max: 10 },
    },
    speedVariation: {
      default: 0.3,
      description: "速度变化幅度（比例）",
      distribution: { type: "uniform", min: 0.1, max: 0.6 },
    },
    lateralSwingAmpM: {
      default: 0.5,
      unit: "m",
      description: "横向摆动幅度",
      distribution: { type: "normal", mean: 0.5, std: 0.2, min: 0.1, max: 1.5 },
    },
    lateralSwingFreqHz: {
      default: 0.3,
      unit: "Hz",
      description: "横向摆动频率",
      distribution: { type: "uniform", min: 0.1, max: 1 },
    },
    reactionDelayS: {
      default: 0.8,
      unit: "s",
      description: "反应时间",
      distribution: { type: "normal", mean: 0.8, std: 0.3, min: 0.2, max: 2 },
    },
    aggressiveness: {
      default: 0.3,
      description: "激进程度 0-1",
      distribution: { type: "uniform", min: 0, max: 0.8 },
    },
    directionChangeProbPerSec: {
      default: 0.1,
      description: "每秒变向概率",
      distribution: { type: "uniform", min: 0, max: 0.5 },
    },
    startAccelMps2: {
      default: 1.5,
      unit: "m/s²",
      description: "起步加速度",
      distribution: { type: "uniform", min: 0.5, max: 3 },
    },
    brakeDecelMps2: {
      default: 3,
      unit: "m/s²",
      description: "制动减速度",
      distribution: { type: "uniform", min: 1, max: 6 },
    },
  },
};

/**
 * VRU/非机动车模型。
 *
 * 特点：
 * 1. 速度波动大（不像汽车那么匀速）
 * 2. 有周期性横向摆动（蛇形行驶）
 * 3. 可能突然变向或停车
 * 4. 激进程度高的会更靠近机动车道
 */
export class VRUModel extends BehaviorModel<VRUParams> {
  private lastDirectionChangeAt = 0;
  private currentDirectionBias = 0; // 横向偏移目标
  private seed = Math.random() * 1000;

  override get name() {
    return "vru";
  }

  /** 确定性伪随机（基于时间，保证可复现） */
  private pseudoRandom(t: number, salt: number): number {
    const x = Math.sin(t * 12.9898 + salt * 78.233 + this.seed) * 43758.5453;
    return x - Math.floor(x);
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, time, dt, others } = ctx;
    const {
      avgSpeedMps,
      speedVariation,
      lateralSwingAmpM,
      lateralSwingFreqHz,
      aggressiveness,
      directionChangeProbPerSec,
      startAccelMps2,
      brakeDecelMps2,
    } = this.params;

    // 速度波动：正弦 + 随机扰动
    const speedOscillation =
      Math.sin(time * 0.5) * speedVariation * avgSpeedMps;
    const speedNoise =
      (this.pseudoRandom(time, 1) - 0.5) * speedVariation * avgSpeedMps * 0.5;
    const targetSpeed = avgSpeedMps + speedOscillation + speedNoise;

    // 纵向加速度
    const speedError = targetSpeed - ego.speed;
    let longitudinalAccel: number;
    if (speedError > 0) {
      longitudinalAccel = Math.min(
        startAccelMps2,
        speedError / Math.max(dt, 0.1),
      );
    } else {
      longitudinalAccel = Math.max(
        -brakeDecelMps2,
        speedError / Math.max(dt, 0.1),
      );
    }

    // 横向摆动：正弦波 + 随机偏移
    const swing =
      Math.sin(time * lateralSwingFreqHz * Math.PI * 2) * lateralSwingAmpM;

    // 随机变向：以一定概率突然改变横向目标
    const timeSinceLastChange = time - this.lastDirectionChangeAt;
    const changeProb = directionChangeProbPerSec * dt;
    if (this.pseudoRandom(time, 2) < changeProb && timeSinceLastChange > 1) {
      // 激进程度越高，变向幅度越大
      this.currentDirectionBias =
        (this.pseudoRandom(time, 3) - 0.5) *
        2 *
        aggressiveness *
        lateralSwingAmpM *
        3;
      this.lastDirectionChangeAt = time;
    }

    // 平滑过渡到目标偏移
    const lateralOffset = swing + this.currentDirectionBias;

    // 前方有障碍物时减速（反应时间简化）
    let frontObstacleDecel = 0;
    for (const other of others) {
      if (other.id === ego.id) continue;
      if (other.laneId !== ego.laneId) continue;
      const gap = other.s - ego.s;
      if (gap > 0 && gap < 10) {
        const approachSpeed = ego.speed - other.speed;
        if (approachSpeed > 0) {
          const ttc = gap / approachSpeed;
          if (ttc < 3) {
            frontObstacleDecel = -brakeDecelMps2 * (1 - ttc / 3);
          }
        }
      }
    }

    return {
      acceleration: longitudinalAccel + frontObstacleDecel,
      lateralOffsetM: lateralOffset,
      confidence: 0.6, // VRU 行为不确定性高
      debug: {
        targetSpeed,
        longitudinalAccel,
        lateralOffset,
        frontObstacleDecel,
        aggressiveness,
      },
    };
  }
}
