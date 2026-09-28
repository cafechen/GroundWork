/**
 * 场景模板模块。
 *
 * 包含：
 *   - 场景模板定义（templates/）
 *   - 模板注册表（registry.ts）
 *   - 拓扑绑定器（topology-binding.ts）：根据地图生成候选位置
 *
 * 用法：
 *   1. sceneTemplates — 获取所有模板
 *   2. generateTopologyCandidates(template, map) — 为模板找地图上的候选位置
 *   3. 搜索引擎在候选位置上搜索参数
 */

// 类型
export type {
  SceneTemplate,
  RoleSpec,
  RoleDirection,
  LaneType,
  PositionRelation,
  SpeedSpec,
  TriggerSpec,
  DangerCriterion,
  TemplateBinding,
} from "./types.js";

// 注册表
export {
  sceneTemplates,
  getTemplate,
  getTemplatesByCategory,
  searchTemplates,
  getTemplateStats,
} from "./registry.js";

// 拓扑绑定
export {
  generateTopologyCandidates,
  generateAllTopologyCandidates,
  extractLaneInfo,
} from "./topology-binding.js";
