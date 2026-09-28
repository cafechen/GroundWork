/**
 * 行为模型库（积木块）。
 *
 * 每个模型是独立的"积木"，场景模板通过组合这些积木来定义场景。
 *
 * 模型一览：
 *   纵向（跟车/制动）：
 *     - car-following: IDM 跟车模型（最基础）
 *     - lead-vehicle-braking: 前车紧急制动（追尾触发）
 *     - brake-response: 制动响应（被测车的刹车行为）
 *
 *   横向（变道/转向）：
 *     - mandatory-lane-change: 强制变道（cut-in / 汇入）
 *
 *   路口：
 *     - right-turn: 右转模型
 *     - left-turn: 左转模型
 *     - through-traffic: 直行通过路口
 *     - u-turn: 掉头模型
 *
 *   危险/异常：
 *     - opposite-intrusion: 对向越线闯入
 *     - obstacle-bypass: 占道绕行
 *
 *   VRU（弱势交通参与者）：
 *     - vru: 非机动车/行人模型
 */

// 类型
export type {
  BehaviorModel,
  BehaviorParams,
  BehaviorContext,
  BehaviorOutput,
  ModelMetadata,
  ModelParamSpec,
  ParamDistribution,
  LongitudinalAction,
  LateralAction,
} from "./types.js";

// 跟车模型
export { CarFollowingModel, carFollowingMetadata } from "./car-following.js";
export type { CarFollowingParams } from "./car-following.js";

// 前车制动模型
export {
  LeadVehicleBrakingModel,
  leadVehicleBrakingMetadata,
} from "./lead-vehicle-braking.js";
export type { LeadVehicleBrakingParams } from "./lead-vehicle-braking.js";

// 制动响应模型
export { BrakeResponseModel, brakeResponseMetadata } from "./brake-response.js";
export type { BrakeResponseParams } from "./brake-response.js";

// 强制变道模型
export {
  MandatoryLaneChangeModel,
  mandatoryLaneChangeMetadata,
} from "./mandatory-lane-change.js";
export type { MandatoryLaneChangeParams } from "./mandatory-lane-change.js";

// 右转模型
export { RightTurnModel, rightTurnMetadata } from "./right-turn.js";
export type { RightTurnParams } from "./right-turn.js";

// 左转模型
export { LeftTurnModel, leftTurnMetadata } from "./left-turn.js";
export type { LeftTurnParams } from "./left-turn.js";

// 直行通过路口模型
export {
  ThroughTrafficModel,
  throughTrafficMetadata,
} from "./through-traffic.js";
export type { ThroughTrafficParams } from "./through-traffic.js";

// 对向越线模型
export {
  OppositeIntrusionModel,
  oppositeIntrusionMetadata,
} from "./opposite-intrusion.js";
export type { OppositeIntrusionParams } from "./opposite-intrusion.js";

// VRU / 非机动车模型
export { VRUModel, vruMetadata } from "./vru.js";
export type { VRUParams } from "./vru.js";

// 掉头模型
export { UTurnModel, uTurnMetadata } from "./u-turn.js";
export type { UTurnParams } from "./u-turn.js";

// 占道绕行模型
export {
  ObstacleBypassModel,
  obstacleBypassMetadata,
} from "./obstacle-bypass.js";
export type { ObstacleBypassParams } from "./obstacle-bypass.js";

/**
 * 模型注册表 — 名字 → 构造函数 + 元数据。
 * 场景模板按名字引用模型，从这里查找。
 */
import type { BehaviorModel, BehaviorParams, ModelMetadata } from "./types.js";
import { CarFollowingModel, carFollowingMetadata } from "./car-following.js";
import {
  LeadVehicleBrakingModel,
  leadVehicleBrakingMetadata,
} from "./lead-vehicle-braking.js";
import { BrakeResponseModel, brakeResponseMetadata } from "./brake-response.js";
import {
  MandatoryLaneChangeModel,
  mandatoryLaneChangeMetadata,
} from "./mandatory-lane-change.js";
import { RightTurnModel, rightTurnMetadata } from "./right-turn.js";
import { LeftTurnModel, leftTurnMetadata } from "./left-turn.js";
import {
  ThroughTrafficModel,
  throughTrafficMetadata,
} from "./through-traffic.js";
import {
  OppositeIntrusionModel,
  oppositeIntrusionMetadata,
} from "./opposite-intrusion.js";
import { VRUModel, vruMetadata } from "./vru.js";
import { UTurnModel, uTurnMetadata } from "./u-turn.js";
import {
  ObstacleBypassModel,
  obstacleBypassMetadata,
} from "./obstacle-bypass.js";

type ModelEntry = {
  ctor: new (params: any) => BehaviorModel<any>;
  metadata: ModelMetadata;
};

export const behaviorModelRegistry: Record<string, ModelEntry> = {
  "car-following": {
    ctor: CarFollowingModel,
    metadata: carFollowingMetadata,
  },
  "lead-vehicle-braking": {
    ctor: LeadVehicleBrakingModel,
    metadata: leadVehicleBrakingMetadata,
  },
  "brake-response": {
    ctor: BrakeResponseModel,
    metadata: brakeResponseMetadata,
  },
  "mandatory-lane-change": {
    ctor: MandatoryLaneChangeModel,
    metadata: mandatoryLaneChangeMetadata,
  },
  "right-turn": {
    ctor: RightTurnModel,
    metadata: rightTurnMetadata,
  },
  "left-turn": {
    ctor: LeftTurnModel,
    metadata: leftTurnMetadata,
  },
  "through-traffic": {
    ctor: ThroughTrafficModel,
    metadata: throughTrafficMetadata,
  },
  "opposite-intrusion": {
    ctor: OppositeIntrusionModel,
    metadata: oppositeIntrusionMetadata,
  },
  vru: {
    ctor: VRUModel,
    metadata: vruMetadata,
  },
  "u-turn": {
    ctor: UTurnModel,
    metadata: uTurnMetadata,
  },
  "obstacle-bypass": {
    ctor: ObstacleBypassModel,
    metadata: obstacleBypassMetadata,
  },
};

/** 按名字获取模型元数据 */
export function getModelMetadata(name: string): ModelMetadata | undefined {
  return behaviorModelRegistry[name]?.metadata;
}

/** 按名字创建模型实例 */
export function createModel(
  name: string,
  params: Record<string, unknown>,
): BehaviorModel | null {
  const entry = behaviorModelRegistry[name];
  if (!entry) return null;
  return new entry.ctor(params as BehaviorParams);
}
