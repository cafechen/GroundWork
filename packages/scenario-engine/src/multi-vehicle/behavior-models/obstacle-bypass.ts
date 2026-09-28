/**
 * 占道绕行模型（obstacle bypass / swerve around）。
 *
 * 模拟前方有障碍物（占道车、路障、事故车等）时，
 * 车辆打方向绕行的行为。
 *
 * 从真实数据可以学的参数：
 *   - detectionDistanceM: 发现障碍物的距离
 *   - bypassSpeedMps: 绕行速度
 *   - lateralSpeedMps: 横向偏转速度
 *   - returnDelayS: 绕过障碍物后多久回原车道
 *   - minClearanceM: 最小安全余量
 */

import {
  BehaviorModel,
  type BehaviorContext,
  type BehaviorOutput,
  type ModelMetadata,
} from "./types.js";

export type ObstacleBypassParams = {
  /** 发现障碍物的距离 m */
  detectionDistanceM: number;
  /** 绕行速度 m/s */
  bypassSpeedMps: number;
  /** 横向速度 m/s（打方向的速度） */
  lateralSpeedMps: number;
  /** 绕行后返回原车道的延迟 s */
  returnDelayS: number;
  /** 最小安全余量 m（离障碍物多远开始绕行） */
  minClearanceM: number;
  /** 绕行偏移量 m（需要多少横向空间绕过） */
  bypassOffsetM: number;
  /** 是否加速超车绕行（false = 减速绕行） */
  accelerateToPass: boolean;
  /** 感知反应时间 s */
  reactionTimeS: number;
};

export const obstacleBypassMetadata: ModelMetadata = {
  name: "obstacle-bypass",
  description: "占道绕行模型。模拟车辆绕行前方障碍物的变道行为。",
  params: {
    detectionDistanceM: {
      default: 60,
      unit: "m",
      description: "发现障碍物的距离",
      distribution: { type: "uniform", min: 20, max: 120 },
    },
    bypassSpeedMps: {
      default: 8,
      unit: "m/s",
      description: "绕行时的速度",
      distribution: { type: "uniform", min: 4, max: 15 },
    },
    lateralSpeedMps: {
      default: 1.2,
      unit: "m/s",
      description: "横向速度（打方向快慢）",
      distribution: { type: "normal", mean: 1.2, std: 0.3, min: 0.5, max: 2.5 },
    },
    returnDelayS: {
      default: 2,
      unit: "s",
      description: "绕行后返回延迟",
      distribution: { type: "uniform", min: 0.5, max: 5 },
    },
    minClearanceM: {
      default: 3,
      unit: "m",
      description: "最小安全余量",
      distribution: { type: "uniform", min: 1, max: 8 },
    },
    bypassOffsetM: {
      default: 2,
      unit: "m",
      description: "绕行横向偏移量",
      distribution: { type: "uniform", min: 1, max: 4 },
    },
    accelerateToPass: {
      default: false,
      description: "是否加速绕行（vs 减速绕行）",
    },
    reactionTimeS: {
      default: 0.5,
      unit: "s",
      description: "感知反应时间",
      distribution: { type: "normal", mean: 0.5, std: 0.2, min: 0.1, max: 1.5 },
    },
  },
};

type Phase =
  | "cruising" // 正常行驶
  | "detected" // 发现障碍物，还在反应
  | "approaching_obstacle" // 接近障碍物，调整速度
  | "swerving_out" // 向外打方向
  | "passing" // 正在通过障碍物旁边
  | "swerving_back" // 回正方向
  | "done";

export class ObstacleBypassModel extends BehaviorModel<ObstacleBypassParams> {
  private phase: Phase = "cruising";
  private phaseStartedAt: number | null = null;
  private detectedAt: number | null = null;
  private obstaclePassedAt: number | null = null;
  private currentOffset = 0;

  override get name() {
    return "obstacle-bypass";
  }

  private switchPhase(phase: Phase, time: number) {
    this.phase = phase;
    this.phaseStartedAt = time;
  }

  /**
   * 找前方障碍物（包括静止车、低速车）。
   */
  private findObstacleAhead(
    ego: { id: string; laneId: string; s: number; speed: number },
    others: readonly { id: string; laneId: string; s: number; speed: number }[],
  ): { id: string; s: number; speed: number; distance: number } | null {
    let closest: {
      id: string;
      s: number;
      speed: number;
      distance: number;
    } | null = null;

    for (const other of others) {
      if (other.id === ego.id) continue;
      if (other.laneId !== ego.laneId) continue;

      const distance = other.s - ego.s;
      if (distance <= 0) continue;

      // 速度很慢或静止的车算障碍物
      if (other.speed < ego.speed * 0.3) {
        if (!closest || distance < closest.distance) {
          closest = { id: other.id, s: other.s, speed: other.speed, distance };
        }
      }
    }

    return closest;
  }

  override step(ctx: BehaviorContext): BehaviorOutput {
    const { ego, others, time, dt } = ctx;
    const {
      detectionDistanceM,
      bypassSpeedMps,
      lateralSpeedMps,
      returnDelayS,
      minClearanceM,
      bypassOffsetM,
      accelerateToPass,
      reactionTimeS,
    } = this.params;

    const obstacle = this.findObstacleAhead(ego, others);
    const obstacleDistance = obstacle?.distance ?? Infinity;

    // 阶段切换
    if (this.phase === "cruising" && obstacleDistance < detectionDistanceM) {
      this.detectedAt = time;
      this.switchPhase("detected", time);
    }

    if (
      this.phase === "detected" &&
      this.detectedAt !== null &&
      time - this.detectedAt >= reactionTimeS
    ) {
      this.switchPhase("approaching_obstacle", time);
    }

    if (
      this.phase === "approaching_obstacle" &&
      obstacleDistance < minClearanceM + ego.speed * 2
    ) {
      this.switchPhase("swerving_out", time);
    }

    if (this.phase === "swerving_out" && this.currentOffset >= bypassOffsetM) {
      this.switchPhase("passing", time);
    }

    // 判断是否已经过了障碍物
    if (
      obstacle &&
      obstacleDistance < -1 &&
      this.obstaclePassedAt === null &&
      (this.phase === "passing" || this.phase === "swerving_out")
    ) {
      this.obstaclePassedAt = time;
    }

    if (
      this.phase === "passing" &&
      this.obstaclePassedAt !== null &&
      time - this.obstaclePassedAt >= returnDelayS
    ) {
      this.switchPhase("swerving_back", time);
    }

    if (this.phase === "swerving_back" && this.currentOffset <= 0.1) {
      this.currentOffset = 0;
      this.switchPhase("done", time);
    }

    // 计算横向偏移
    switch (this.phase) {
      case "swerving_out":
        this.currentOffset = Math.min(
          bypassOffsetM,
          this.currentOffset + lateralSpeedMps * dt,
        );
        break;
      case "passing":
        this.currentOffset = bypassOffsetM;
        break;
      case "swerving_back":
        this.currentOffset = Math.max(
          0,
          this.currentOffset - lateralSpeedMps * dt,
        );
        break;
      default:
        // 保持当前偏移（平滑过渡）
        break;
    }

    // 纵向速度调整
    let longitudinalAccel = 0;
    switch (this.phase) {
      case "cruising":
      case "done":
        // 巡航
        longitudinalAccel = 0;
        break;

      case "detected":
        // 发现阶段，还没反应
        longitudinalAccel = 0;
        break;

      case "approaching_obstacle":
      case "swerving_out":
      case "passing": {
        const error = bypassSpeedMps - ego.speed;
        const maxAccel = accelerateToPass ? 2.5 : 1;
        const maxDecel = accelerateToPass ? -1 : -3;
        longitudinalAccel = Math.max(
          maxDecel,
          Math.min(maxAccel, (error / Math.max(dt, 0.1)) * 0.1),
        );
        break;
      }

      case "swerving_back": {
        // 回正后逐渐恢复速度
        const error = bypassSpeedMps * 1.2 - ego.speed;
        longitudinalAccel = Math.max(
          -2,
          Math.min(2, (error / Math.max(dt, 0.1)) * 0.1),
        );
        break;
      }
    }

    return {
      acceleration: longitudinalAccel,
      lateralOffsetM: this.currentOffset,
      confidence: 0.8,
      debug: {
        phase: this.phase,
        obstacleDistance,
        currentOffset: this.currentOffset,
        hasObstacle: !!obstacle,
      },
    };
  }
}
