/**
 * 行为模型统一接口定义。
 *
 * 每个行为模型是一块"积木"：给定当前状态和参数，输出下一刻的动作。
 * 所有模型都遵循相同的输入/输出约定，便于在场景模板中组合。
 */

import type { VehicleState } from "../simulation/types.js";
import type { MapModel } from "../../index.js";

/** 行为模型的通用参数基类 — 每个模型有自己的具体参数 */
export type BehaviorParams = Record<string, number | string | boolean>;

/** 行为模型输出的纵向动作 */
export type LongitudinalAction = {
  acceleration: number; // m/s²，正加速负减速
};

/** 行为模型输出的横向动作 */
export type LateralAction = {
  targetLaneId?: string; // 目标车道（变道/转向时）
  lateralOffsetM?: number; // 横向偏移量（非机动车摆动等）
};

/** 行为模型的完整输出 */
export type BehaviorOutput = LongitudinalAction &
  LateralAction & {
    /** 模型置信度，用于多模型融合时加权 */
    confidence?: number;
    /** 调试信息 */
    debug?: Record<string, unknown>;
  };

/** 行为模型输入上下文 */
export type BehaviorContext = {
  /** 本车状态 */
  ego: VehicleState;
  /** 周围车辆状态（所有车） */
  others: readonly VehicleState[];
  /** 地图 */
  map: MapModel;
  /** 当前时间 */
  time: number;
  /** 仿真步长 */
  dt: number;
  /** 车辆路线（laneId 列表） */
  route: readonly string[];
  /** 当前 routeIndex */
  routeIndex: number;
};

/**
 * 行为模型基类。
 *
 * 每个模型实现 step 方法：给定上下文和参数，返回动作。
 * 参数是可配置的（模板/搜索器可调），支持分布采样。
 */
export abstract class BehaviorModel<T extends BehaviorParams = BehaviorParams> {
  readonly params: T;

  constructor(params: T) {
    this.params = params;
  }

  /**
   * 单步计算：根据当前上下文输出动作。
   * 子类必须实现。
   */
  abstract step(ctx: BehaviorContext): BehaviorOutput;

  /**
   * 模型名称（用于调试/日志）。
   */
  abstract get name(): string;
}

/**
 * 参数分布定义 — 用于搜索器采样和生成多样性。
 * uniform: 均匀分布，normal: 正态分布，categorical: 离散选项
 */
export type ParamDistribution =
  | { type: "uniform"; min: number; max: number }
  | { type: "normal"; mean: number; std: number; min?: number; max?: number }
  | { type: "categorical"; values: Array<number | string>; weights?: number[] };

/** 行为模型的参数描述 — 包括默认值和可调范围 */
export type ModelParamSpec = {
  default: number | string | boolean;
  /** 可调范围（搜索器可以在这个范围里采样） */
  distribution?: ParamDistribution;
  /** 单位，用于展示 */
  unit?: string;
  /** 说明 */
  description?: string;
};

/** 行为模型的元数据 — 描述模型有什么参数、各自的范围 */
export type ModelMetadata = {
  name: string;
  description: string;
  params: Record<string, ModelParamSpec>;
};
