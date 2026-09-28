/**
 * 场景模板类型定义。
 *
 * 场景模板 = 场景的"配方"：
 *   - 需要什么样的地图拓扑（车道数量、路口类型...）
 *   - 有几个角色，各自用什么行为模型
 *   - 角色之间的相对位置关系
 *   - 危险判定标准
 *   - 可搜索的参数空间
 *
 * 模板不包含具体的 laneId、坐标，这些由"地图绑定"阶段决定。
 */

import type { ParamDistribution } from "../behavior-models/types.js";

/** 角色的行驶方向语义 */
export type RoleDirection =
  | "straight" // 直行
  | "left_turn" // 左转
  | "right_turn" // 右转
  | "u_turn" // 掉头
  | "opposite" // 对向直行
  | "cross" // 横向直行（从左右穿过路口）
  | "static"; // 静止（障碍物）

/** 角色的车道类型 */
export type LaneType =
  | "through" // 直行车道
  | "left_turn" // 左转车道
  | "right_turn" // 右转车道
  | "shared" // 混合车道
  | "opposite" // 对向车道
  | "bicycle" // 非机动车道
  | "sidewalk"; // 人行道

/** 角色之间的位置关系 */
export type PositionRelation = {
  /** 参照物角色 ID */
  relativeTo: string;
  /** 相对位置类型 */
  relation:
    | "same_lane" // 同一车道
    | "adjacent_left" // 左边相邻车道
    | "adjacent_right" // 右边相邻车道
    | "opposite_lane" // 对向车道
    | "crossing" // 交叉方向（路口横向）
    | "ahead" // 同一车道前方
    | "behind"; // 同一车道后方
  /** 相对距离 m（正值 = 前方，负值 = 后方） */
  distanceM?: number;
  /** 相对距离的分布（搜索范围） */
  distanceDistribution?: ParamDistribution;
};

/** 角色初始速度分布 */
export type SpeedSpec = {
  /** 默认速度 m/s */
  default: number;
  /** 可搜索的分布 */
  distribution?: ParamDistribution;
};

/** 一个角色定义 */
export type RoleSpec = {
  /** 角色 ID（在模板内唯一） */
  id: string;
  /** 显示名（用于日志/调试） */
  label?: string;
  /** 车道类型 */
  laneType: LaneType;
  /** 行驶方向 */
  direction: RoleDirection;
  /** 使用的行为模型名字 */
  behaviorModel: string;
  /** 行为模型的参数覆盖（只写需要覆盖的，其余用模型默认值） */
  modelParams?: Record<string, unknown>;
  /** 模型参数的搜索空间 */
  searchParams?: Record<string, ParamDistribution>;
  /** 初始速度 */
  initialSpeed: SpeedSpec;
  /** 位置关系（相对于其他角色） */
  position?: PositionRelation;
  /** 是否是被测车（ego） */
  isEgo?: boolean;
  /** 车辆类型 */
  vehicleType?: "car" | "truck" | "bus" | "ebike" | "bicycle" | "pedestrian";
  /** 触发条件（什么时机激活这个模型） */
  trigger?: TriggerSpec;
};

/** 触发条件 */
export type TriggerSpec =
  | {
      type: "ttc";
      threshold: number;
      thresholdDistribution?: ParamDistribution;
    }
  | {
      type: "distance";
      distanceM: number;
      distanceDistribution?: ParamDistribution;
    }
  | { type: "time"; timeS: number; timeDistribution?: ParamDistribution }
  | { type: "manual" }; // 外部手动触发

/** 危险判定标准 */
export type DangerCriterion =
  | {
      type: "collision";
      /** 碰撞时最小速度差 m/s（低于这个不算危险碰撞） */
      minSpeedDelta?: number;
    }
  | {
      type: "ttc_below";
      threshold: number;
      thresholdDistribution?: ParamDistribution;
    }
  | {
      type: "min_gap_below";
      threshold: number;
      thresholdDistribution?: ParamDistribution;
    }
  | {
      type: "lane_intrusion";
      /** 侵入深度阈值 m */
      depth: number;
      /** 侵入方向 */
      direction: "opposite" | "left" | "right" | "any";
    }
  | {
      type: "red_light_running";
    }
  | {
      type: "speed_difference";
      threshold: number;
    };

/** 场景模板定义 */
export type SceneTemplate = {
  /** 模板 ID（全局唯一） */
  id: string;
  /** 显示名 */
  name: string;
  /** 中文描述 */
  description: string;
  /** 场景类型标签（用于搜索/分类） */
  tags: string[];
  /**
   * 地图需求：模板需要什么样的地图拓扑才能成立。
   * 地图绑定时检查这些条件。
   */
  mapRequirements: {
    /** 是否需要路口 */
    needsJunction?: boolean;
    /** 最少直行车道数（每个方向） */
    minThroughLanesPerDirection?: number;
    /** 是否需要左转车道 */
    needsLeftTurnLane?: boolean;
    /** 是否需要右转车道 */
    needsRightTurnLane?: boolean;
    /** 是否需要对向车道 */
    needsOppositeLane?: boolean;
    /** 是否需要非机动车道 */
    needsBicycleLane?: boolean;
    /** 最少车道数（单向） */
    minLanesPerDirection?: number;
  };
  /** 角色列表 */
  roles: RoleSpec[];
  /** 危险判定条件列表（任一满足即算危险场景） */
  dangerCriteria: DangerCriterion[];
  /** 场景持续时间 s */
  durationS: {
    default: number;
    distribution?: ParamDistribution;
  };
  /**
   * 场景类别：
   *   longitudinal - 纵向（跟车/追尾）
   *   lateral - 横向（变道/侧碰）
   *   intersection - 路口
   *   opposite - 对向
   *   vru - 弱势交通参与者
   */
  category:
    "longitudinal" | "lateral" | "intersection" | "opposite" | "vru" | "other";
  /**
   * 危险等级范围（1-5，5最危险）
   * 搜索器会尝试在这个范围里找匹配的危险程度
   */
  dangerLevelRange: [number, number];
};

/**
 * 场景模板编译后的结果（绑定到具体地图后的实例）。
 *
 * 地图绑定过程：
 *   模板 + 地图 → 候选绑定列表（每个候选 = 一组具体 laneId + 初始位置）
 */
export type TemplateBinding = {
  /** 模板 ID */
  templateId: string;
  /** 绑定的地图 ID */
  mapId: string;
  /** 每个角色的具体车道分配 */
  roleLanes: Record<
    string,
    {
      laneId: string;
      initialS: number;
      route: string[];
    }
  >;
  /** 初始相对距离（用于验证拓扑正确） */
  initialDistances: Record<string, number>;
  /** 置信度（绑定质量，0-1） */
  bindingQuality: number;
};
