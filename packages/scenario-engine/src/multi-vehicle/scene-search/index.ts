/**
 * 场景搜索引擎。
 *
 * 核心流程：
 *   场景模板 + 地图 → 拓扑候选 → 参数搜索 → 场景实例
 *
 * 子模块：
 *   - parameter-sampler.ts: 参数采样（uniform/normal/categorical + LHS）
 *   - scene-searcher.ts: 搜索主逻辑（GA / 随机 / LHS）
 */

// 类型
export type {
  SearchDimension,
  ParameterSample,
  SearchGoal,
  SearchConfig,
  SearchResult,
  SceneInstance,
} from "./types.js";

// 采样器
export {
  sampleFromDistribution,
  extractSearchDimensions,
  sampleDimensions,
  latinHypercubeSample,
  createRng,
} from "./parameter-sampler.js";

// 搜索器
export {
  searchScene,
  buildSceneInstance,
  heuristicEvaluator,
} from "./scene-searcher.js";
export type { FitnessEvaluator } from "./scene-searcher.js";
