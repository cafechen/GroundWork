/**
 * 场景搜索引擎类型定义。
 *
 * 搜索引擎的核心思路：
 *   输入：场景模板 + 拓扑绑定（具体地图位置） + 危险目标
 *   过程：在参数空间里采样/搜索，运行仿真，评估危险程度
 *   输出：满足危险目标的场景实例（具体参数 + 仿真结果）
 */

import type { TemplateBinding } from "../scene-templates/types.js";
import type { ParamDistribution } from "../behavior-models/types.js";

/** 一个搜索维度 = 一个可调参数 */
export type SearchDimension = {
  /** 参数路径（角色ID.参数名，例如 "lead.brakingDecelMps2"） */
  path: string;
  /** 参数分布 */
  distribution: ParamDistribution;
};

/** 一个参数采样点（一组具体参数值） */
export type ParameterSample = {
  /** 各参数的值，key = path */
  values: Record<string, number | string | boolean>;
  /** 评估结果（危险度 0-1） */
  fitness?: number;
  /** 是否满足目标 */
  meetsGoal?: boolean;
};

/** 搜索目标 */
export type SearchGoal = {
  /** 目标危险等级（1-5） */
  targetDangerLevel: number;
  /** 容差（±多少算达标） */
  tolerance?: number;
  /** 最大化还是最小化还是接近目标 */
  mode: "maximize" | "minimize" | "target";
};

/** 搜索配置 */
export type SearchConfig = {
  /** 最大迭代次数 */
  maxIterations: number;
  /** 每代种群大小（GA 用） */
  populationSize?: number;
  /** 搜索算法 */
  algorithm: "random" | "genetic" | "grid" | "latin_hypercube";
  /** 目标危险等级 */
  goal: SearchGoal;
  /** 超时时间 ms */
  timeoutMs?: number;
  /** 找到 N 个合格样本就停止 */
  maxSuccessSamples?: number;
};

/** 搜索结果 */
export type SearchResult = {
  /** 是否成功找到达标场景 */
  success: boolean;
  /** 最佳参数样本 */
  bestSample?: ParameterSample;
  /** 所有测试过的样本（按 fitness 排序） */
  allSamples: ParameterSample[];
  /** 迭代次数 */
  iterations: number;
  /** 耗时 ms */
  elapsedMs: number;
  /** 失败原因（如果 success=false） */
  failureReason?: string;
};

/**
 * 场景实例 = 模板 + 拓扑绑定 + 具体参数值。
 * 这是搜索器的最终输出，可以直接拿去仿真。
 */
export type SceneInstance = {
  templateId: string;
  binding: TemplateBinding;
  params: Record<string, Record<string, unknown>>; // roleId → modelParams
  initialSpeeds: Record<string, number>; // roleId → speed
  durationS: number;
  dangerLevel: number;
};
