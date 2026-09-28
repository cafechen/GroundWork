/**
 * 高层场景生成器（Scene Generator）。
 *
 * 把整个流程串起来：
 *   1. 根据用户意图选模板（LLM 做的部分，这里提供候选列表给 LLM 选）
 *   2. 扫描地图生成拓扑候选
 *   3. 参数搜索（GA / 启发式）
 *   4. 输出场景实例
 *
 * 这个模块是给 LLM 层调用的。LLM 的角色：
 *   - 从模板列表中选一个最合适的模板
 *   - 从拓扑候选中选一个最合适的位置
 *   - 调整语义参数（危险等级、驾驶员风格等）
 *   - 调用 generateScene() 生成具体场景
 */

import type { MapModel } from "../index.js";
import type { SceneTemplate } from "./scene-templates/types.js";
import type { SceneInstance, SearchConfig } from "./scene-search/types.js";
import {
  sceneTemplates,
  getTemplate,
  searchTemplates,
  generateTopologyCandidates,
} from "./scene-templates/index.js";
import {
  searchScene,
  buildSceneInstance,
  heuristicEvaluator,
} from "./scene-search/index.js";
import {
  makeSimulationEvaluator,
  simulateBehaviorScene,
  type BehaviorSimulationResult,
} from "./behavior-simulator.js";

/**
 * 获取某张地图上支持的所有场景模板及其拓扑候选。
 * LLM 可以从这个列表里选模板和位置。
 */
export function getSceneCandidatesForMap(
  map: MapModel,
  options: { maxCandidatesPerTemplate?: number; keyword?: string } = {},
): Array<{
  template: SceneTemplate;
  topologyCandidates: ReturnType<typeof generateTopologyCandidates>;
}> {
  const { maxCandidatesPerTemplate = 5, keyword } = options;

  const templates = keyword ? searchTemplates(keyword) : sceneTemplates;

  return templates
    .map((template) => {
      const candidates = generateTopologyCandidates(
        template,
        map,
        maxCandidatesPerTemplate,
      );
      return { template, topologyCandidates: candidates };
    })
    .filter((item) => item.topologyCandidates.length > 0);
}

/**
 * 生成一个具体场景（从模板到实例）。
 *
 * @param templateId 模板 ID
 * @param map 地图
 * @param options.topologyIndex 选第几个拓扑候选（默认 0 = 质量最好的）
 * @param options.targetDangerLevel 目标危险等级 1-5
 * @param options.semanticParams 语义参数（会映射到具体模型参数）
 * @param options.customEvaluator 自定义评估器（比如用真实仿真）
 * @param options.useHeuristicEvaluator true 时用快速启发式打分（不跑物理），默认跑真实行为仿真
 */
export async function generateScene(
  templateId: string,
  map: MapModel,
  options: {
    topologyIndex?: number;
    targetDangerLevel?: number;
    semanticParams?: SemanticParams;
    customEvaluator?: Parameters<typeof searchScene>[3];
    useHeuristicEvaluator?: boolean;
    searchConfig?: Partial<SearchConfig>;
  } = {},
): Promise<{
  success: boolean;
  instance?: SceneInstance;
  template?: SceneTemplate;
  /** 对最佳样本跑的最终真实仿真（轨迹 + 危险度量），启发式模式下同样会补跑一次 */
  simulation?: BehaviorSimulationResult;
  failureReason?: string;
}> {
  const template = getTemplate(templateId);
  if (!template) {
    return { success: false, failureReason: `模板不存在: ${templateId}` };
  }

  const {
    topologyIndex = 0,
    targetDangerLevel = 3,
    semanticParams,
    customEvaluator,
    useHeuristicEvaluator = false,
    searchConfig: userSearchConfig,
  } = options;

  // 1. 拓扑绑定
  const candidates = generateTopologyCandidates(template, map, 10);
  if (candidates.length === 0) {
    return {
      success: false,
      template,
      failureReason: `地图 ${map.mapId} 不支持场景 ${template.name}：找不到匹配的拓扑结构`,
    };
  }

  const binding = candidates[Math.min(topologyIndex, candidates.length - 1)];
  if (!binding) {
    return {
      success: false,
      template,
      failureReason: `地图 ${map.mapId} 上找不到有效的拓扑绑定`,
    };
  }

  // 2. 语义参数映射
  const adjustedTemplate = applySemanticParams(template, semanticParams);

  // 3. 搜索配置
  const searchConfig: SearchConfig = {
    maxIterations: 20,
    populationSize: 30,
    algorithm: "genetic",
    goal: {
      targetDangerLevel,
      mode: "maximize",
      tolerance: 0.1,
    },
    timeoutMs: 5000,
    maxSuccessSamples: 3,
    ...userSearchConfig,
  };

  // 4. 搜索：默认注入真实行为仿真评估器，可退化为快速启发式
  const evaluator =
    customEvaluator ??
    (useHeuristicEvaluator ? heuristicEvaluator : makeSimulationEvaluator(map));
  const result = await searchScene(
    adjustedTemplate,
    binding,
    searchConfig,
    evaluator,
  );

  if (!result.bestSample) {
    return {
      success: false,
      template,
      failureReason: result.failureReason || "搜索失败",
    };
  }

  // 5. 构建场景实例
  const instance = buildSceneInstance(
    adjustedTemplate,
    binding,
    result.bestSample,
  );

  // 6. 对最佳样本跑一次完整真实仿真，产出轨迹与危险度量（无论搜索期用哪种评估器）
  const simulation = simulateBehaviorScene(
    map,
    adjustedTemplate,
    binding,
    result.bestSample.values,
  );
  // 用真实仿真结果回写危险等级（1-5）
  instance.dangerLevel = Math.max(
    1,
    Math.min(5, Math.round(simulation.fitness * 5)),
  );

  return {
    success: result.success,
    instance,
    template,
    simulation,
    ...(result.success
      ? {}
      : { failureReason: result.failureReason || "未找到达标样本" }),
  };
}

/**
 * 语义参数：用户说的"老司机"、"雨天"、"极端危险"等。
 * 这些会被映射到具体的模型参数偏置。
 */
export type SemanticParams = {
  /** 驾驶员风格 */
  driverStyle?: "conservative" | "normal" | "aggressive";
  /** 天气（影响摩擦/可见度） */
  weather?: "clear" | "rain" | "snow" | "fog";
  /** 光照 */
  lighting?: "day" | "night" | "tunnel";
  /** 交通密度 */
  trafficDensity?: "low" | "medium" | "high";
  /** 是否极端场景 */
  extreme?: boolean;
};

/**
 * 把语义参数映射到具体的模型参数偏置。
 * 目前是简化版的规则映射，未来可以从数据中学习。
 */
function applySemanticParams(
  template: SceneTemplate,
  params?: SemanticParams,
): SceneTemplate {
  if (!params) return template;

  // 深拷贝模板（简单版，只拷贝需要修改的部分）
  const adjusted: SceneTemplate = {
    ...template,
    roles: template.roles.map((r) => ({
      ...r,
      searchParams: { ...(r.searchParams || {}) },
    })),
  };

  // 驾驶员风格：影响 ego 的反应时间和保守程度
  if (params.driverStyle && adjusted.roles.some((r) => r.isEgo)) {
    const ego = adjusted.roles.find((r) => r.isEgo)!;
    const sp = ego.searchParams || {};

    switch (params.driverStyle) {
      case "conservative":
        // 保守：反应慢点，但刹得狠，TTC 阈值高
        sp.perceptionTimeS = {
          type: "normal",
          mean: 0.4,
          std: 0.1,
          min: 0.2,
          max: 1,
        };
        sp.decisionTimeS = {
          type: "normal",
          mean: 0.5,
          std: 0.15,
          min: 0.2,
          max: 1.5,
        };
        sp.ttcThresholdS = { type: "uniform", min: 2, max: 5 };
        break;
      case "aggressive":
        // 激进：反应快，但 TTC 阈值低，敢跟得近
        sp.perceptionTimeS = {
          type: "normal",
          mean: 0.2,
          std: 0.08,
          min: 0.05,
          max: 0.6,
        };
        sp.decisionTimeS = {
          type: "normal",
          mean: 0.25,
          std: 0.1,
          min: 0.05,
          max: 0.8,
        };
        sp.ttcThresholdS = { type: "uniform", min: 0.5, max: 2 };
        break;
      default:
      // normal 用默认
    }
  }

  // 天气：雨天 → 减速度降低，反应时间增长
  if (params.weather && params.weather !== "clear") {
    const factor =
      params.weather === "snow" ? 0.6 : params.weather === "rain" ? 0.8 : 0.9;
    for (const role of adjusted.roles) {
      const sp = role.searchParams || {};
      if ("maxDecelerationMps2" in sp) {
        const dist = sp.maxDecelerationMps2;
        if (dist.type === "uniform") {
          sp.maxDecelerationMps2 = {
            type: "uniform",
            min: dist.min * factor,
            max: dist.max * factor,
          };
        }
      }
    }
  }

  // 极端场景：向危险端偏移
  if (params.extreme) {
    for (const role of adjusted.roles) {
      if (role.isEgo) continue; // ego 不变，让对方更危险
      const sp = role.searchParams || {};
      if ("brakingDecelMps2" in sp) {
        const dist = sp.brakingDecelMps2;
        if (dist.type === "uniform") {
          sp.brakingDecelMps2 = {
            type: "uniform",
            min: dist.max * 0.8,
            max: dist.max,
          };
        }
      }
      if ("gapAcceptanceS" in sp || "oncomingGapAcceptanceS" in sp) {
        const key =
          "gapAcceptanceS" in sp ? "gapAcceptanceS" : "oncomingGapAcceptanceS";
        const dist = sp[key] as { type: string; min: number; max: number };
        if (dist.type === "uniform") {
          sp[key] = {
            type: "uniform",
            min: dist.min,
            max: dist.min + (dist.max - dist.min) * 0.3,
          };
        }
      }
    }
  }

  return adjusted;
}
