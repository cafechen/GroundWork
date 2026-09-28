/**
 * 场景搜索引擎。
 *
 * 给定：
 *   - 场景模板（拓扑 + 行为模型 + 搜索维度）
 *   - 拓扑绑定（具体地图上的位置）
 *   - 搜索目标（危险等级）
 *
 * 在参数空间里搜索，找到满足危险目标的场景实例。
 *
 * 算法：
 *   1. 用拉丁超立方采样生成初始种群（均匀覆盖）
 *   2. 评估每个样本的危险度（fitness）
 *   3. 如果达标，直接返回
 *   4. 不达标，用遗传算法迭代：选择 → 交叉 → 变异 → 评估
 *   5. 达到最大迭代或超时停止
 *
 * 为了保证性能，每个样本的评估是"轻量的"—— 这里只做参数层面的启发式评估，
 * 真正的仿真由调用方决定是否运行（因为仿真开销大）。
 * 也提供了 evaluator 接口，可以注入真实仿真评估。
 */

import type {
  SceneTemplate,
  TemplateBinding,
} from "../scene-templates/types.js";
import {
  extractSearchDimensions,
  latinHypercubeSample,
  sampleFromDistribution,
  createRng,
} from "./parameter-sampler.js";
import type {
  SearchConfig,
  SearchResult,
  ParameterSample,
  SearchDimension,
  SceneInstance,
} from "./types.js";

/**
 * 评估器接口：给定参数样本，评估危险度（0-1）。
 * 可以是启发式的快速评估，也可以是真实仿真。
 */
export type FitnessEvaluator = (
  sample: ParameterSample,
  template: SceneTemplate,
  binding: TemplateBinding,
) => Promise<number> | number;

/**
 * 默认的启发式评估器（快速估算，不运行仿真）。
 *
 * 基于场景类型和参数做一个粗略的危险度估算：
 *   - 速度越高 → 越危险
 *   - 距离越近 → 越危险
 *   - 减速度越大 → 越危险
 *   - 反应时间越长 → 越危险
 *
 * 这是一个粗略的"排序器"，用来在大量样本中先筛出 promising 的，
 * 然后再用真实仿真验证。
 */
export function heuristicEvaluator(
  sample: ParameterSample,
  template: SceneTemplate,
  _binding: TemplateBinding,
): number {
  const v = sample.values;
  let dangerScore = 0;
  let factorCount = 0;

  // 速度因子：速度越高越危险
  for (const role of template.roles) {
    const speed = v[`${role.id}.__speed__`];
    if (typeof speed === "number") {
      // 归一化：20 m/s 以上算高危险
      dangerScore += Math.min(1, speed / 20);
      factorCount++;
    }
  }

  // 距离因子：距离越小越危险
  for (const role of template.roles) {
    const dist = v[`${role.id}.__distance__`];
    if (typeof dist === "number") {
      // 归一化：10m 以内高危险，100m 以上低危险
      dangerScore += Math.max(0, 1 - Math.abs(dist) / 100);
      factorCount++;
    }
  }

  // ego 反应时间：越长越危险
  const egoRole = template.roles.find((r) => r.isEgo);
  if (egoRole) {
    const percepTime = v[`${egoRole.id}.perceptionTimeS`];
    const decTime = v[`${egoRole.id}.decisionTimeS`];
    if (typeof percepTime === "number") {
      dangerScore += Math.min(1, percepTime / 1.5);
      factorCount++;
    }
    if (typeof decTime === "number") {
      dangerScore += Math.min(1, decTime / 2);
      factorCount++;
    }

    // ego 最大减速度：越小越危险（刹不住）
    const maxDecel = v[`${egoRole.id}.maxDecelerationMps2`];
    if (typeof maxDecel === "number") {
      dangerScore += 1 - Math.min(1, maxDecel / 10);
      factorCount++;
    }
  }

  // 前车/触发车的减速度：越大越危险
  for (const role of template.roles) {
    if (role.isEgo) continue;
    const decel = v[`${role.id}.brakingDecelMps2`];
    if (typeof decel === "number") {
      dangerScore += Math.min(1, decel / 10);
      factorCount++;
    }
  }

  // 越线深度：越大越危险
  for (const role of template.roles) {
    const depth = v[`${role.id}.intrusionDepthM`];
    if (typeof depth === "number") {
      dangerScore += Math.min(1, depth / 3);
      factorCount++;
    }
  }

  // 间隙接受：越小越危险（敢抢小间隙）
  for (const role of template.roles) {
    const gap =
      v[`${role.id}.gapAcceptanceS`] || v[`${role.id}.oncomingGapAcceptanceS`];
    if (typeof gap === "number") {
      dangerScore += Math.max(0, 1 - gap / 8);
      factorCount++;
    }
  }

  if (factorCount === 0) return 0.5;
  return Math.min(1, dangerScore / factorCount);
}

/**
 * 遗传算法：选择 + 交叉 + 变异。
 */
function tournamentSelect(
  population: ParameterSample[],
  tournamentSize: number,
  rng: () => number,
): ParameterSample {
  let best = population[0];
  if (!best) return { values: {} };
  for (let i = 1; i < tournamentSize; i++) {
    const idx = Math.floor(rng() * population.length);
    const candidate = population[idx];
    if (!candidate) continue;
    if ((candidate.fitness ?? 0) > (best.fitness ?? 0)) {
      best = candidate;
    }
  }
  return best;
}

function crossover(
  parent1: ParameterSample,
  parent2: ParameterSample,
  rng: () => number,
): ParameterSample {
  const childValues: Record<string, number | string | boolean> = {};
  for (const key of Object.keys(parent1.values)) {
    const v1 = parent1.values[key];
    const v2 = parent2.values[key];
    childValues[key] = (rng() < 0.5 ? v1 : v2) ?? 0;
  }
  return { values: childValues };
}

function mutate(
  sample: ParameterSample,
  dims: SearchDimension[],
  mutationRate: number,
  rng: () => number,
): ParameterSample {
  const newValues = { ...sample.values };
  for (const dim of dims) {
    if (rng() < mutationRate) {
      newValues[dim.path] = sampleFromDistribution(dim.distribution, rng);
    }
  }
  return { values: newValues };
}

/**
 * 场景搜索引擎主函数。
 *
 * @param template 场景模板
 * @param binding 拓扑绑定（具体地图位置）
 * @param config 搜索配置
 * @param evaluator 危险度评估函数
 */
export async function searchScene(
  template: SceneTemplate,
  binding: TemplateBinding,
  config: SearchConfig,
  evaluator: FitnessEvaluator = heuristicEvaluator,
): Promise<SearchResult> {
  const startTime = Date.now();
  const {
    goal,
    maxIterations,
    algorithm,
    populationSize = 30,
    timeoutMs,
    maxSuccessSamples,
  } = config;

  const dims = extractSearchDimensions(template);
  if (dims.length === 0) {
    // 没有可调参数，直接评估默认值
    const defaultSample: ParameterSample = { values: {} };
    const fitness = await evaluator(defaultSample, template, binding);
    const meetsGoal = checkGoal(fitness, goal);
    return {
      success: meetsGoal,
      bestSample: { ...defaultSample, fitness, meetsGoal },
      allSamples: [{ ...defaultSample, fitness, meetsGoal }],
      iterations: 0,
      elapsedMs: Date.now() - startTime,
      failureReason: meetsGoal ? undefined : "默认参数不满足目标",
    };
  }

  const rng = createRng(Math.floor(Math.random() * 100000));
  const allSamples: ParameterSample[] = [];
  const successSamples: ParameterSample[] = [];
  let bestSample: ParameterSample | undefined;
  let bestFitness = -Infinity;

  // 1. 初始化种群
  let population: ParameterSample[];
  if (algorithm === "latin_hypercube" || algorithm === "genetic") {
    const lhSamples = latinHypercubeSample(
      dims,
      populationSize,
      Math.floor(rng() * 100000),
    );
    population = lhSamples.map((values) => ({ values }));
  } else if (algorithm === "random") {
    population = [];
    for (let i = 0; i < populationSize; i++) {
      const values: Record<string, number | string | boolean> = {};
      for (const dim of dims) {
        values[dim.path] = sampleFromDistribution(dim.distribution, rng);
      }
      population.push({ values });
    }
  } else {
    // grid 等其他算法，暂时用随机
    population = [];
    for (let i = 0; i < populationSize; i++) {
      const values: Record<string, number | string | boolean> = {};
      for (const dim of dims) {
        values[dim.path] = sampleFromDistribution(dim.distribution, rng);
      }
      population.push({ values });
    }
  }

  // 2. 评估初始种群
  for (const sample of population) {
    const fitness = await evaluator(sample, template, binding);
    sample.fitness = fitness;
    sample.meetsGoal = checkGoal(fitness, goal);
    allSamples.push(sample);

    if (fitness > bestFitness) {
      bestFitness = fitness;
      bestSample = sample;
    }
    if (sample.meetsGoal) {
      successSamples.push(sample);
    }

    if (maxSuccessSamples && successSamples.length >= maxSuccessSamples) {
      return finish(true, bestSample, allSamples, 0, startTime);
    }
    if (timeoutMs && Date.now() - startTime > timeoutMs) {
      return finish(
        successSamples.length > 0,
        bestSample,
        allSamples,
        0,
        startTime,
        "超时",
      );
    }
  }

  // 3. 迭代搜索（GA）
  const isGA = algorithm === "genetic";
  const iterations = isGA ? maxIterations : 1;
  const mutationRate = 0.1;
  const tournamentSize = 3;

  for (let gen = 0; gen < iterations; gen++) {
    if (!isGA) break;

    const nextGeneration: ParameterSample[] = [];

    // 精英保留：把最好的直接保留
    const sorted = [...population].sort(
      (a, b) => (b.fitness ?? 0) - (a.fitness ?? 0),
    );
    if (sorted[0]) nextGeneration.push(sorted[0]);
    if (sorted[1]) nextGeneration.push(sorted[1]);

    // 选择 + 交叉 + 变异
    while (nextGeneration.length < populationSize) {
      const p1 = tournamentSelect(population, tournamentSize, rng);
      const p2 = tournamentSelect(population, tournamentSize, rng);
      const child = crossover(p1, p2, rng);
      const mutated = mutate(child, dims, mutationRate, rng);
      nextGeneration.push(mutated);
    }

    // 评估新一代
    for (const sample of nextGeneration.slice(2)) {
      // 跳过已评估的精英
      const fitness = await evaluator(sample, template, binding);
      sample.fitness = fitness;
      sample.meetsGoal = checkGoal(fitness, goal);
      allSamples.push(sample);

      if (fitness > bestFitness) {
        bestFitness = fitness;
        bestSample = sample;
      }
      if (sample.meetsGoal) {
        successSamples.push(sample);
      }
    }

    population = nextGeneration;

    if (maxSuccessSamples && successSamples.length >= maxSuccessSamples) {
      return finish(true, bestSample, allSamples, gen + 1, startTime);
    }
    if (timeoutMs && Date.now() - startTime > timeoutMs) {
      return finish(
        successSamples.length > 0,
        bestSample,
        allSamples,
        gen + 1,
        startTime,
        "超时",
      );
    }
  }

  return finish(
    successSamples.length > 0,
    bestSample,
    allSamples,
    iterations,
    startTime,
  );
}

function checkGoal(fitness: number, goal: SearchConfig["goal"]): boolean {
  const tol = goal.tolerance ?? 0.1;
  const target = goal.targetDangerLevel / 5; // 归一化到 0-1

  switch (goal.mode) {
    case "maximize":
      return fitness >= target - tol;
    case "minimize":
      return fitness <= target + tol;
    case "target":
      return Math.abs(fitness - target) <= tol;
  }
}

function finish(
  success: boolean,
  bestSample: ParameterSample | undefined,
  allSamples: ParameterSample[],
  iterations: number,
  startTime: number,
  failureReason?: string,
): SearchResult {
  const sorted = [...allSamples].sort(
    (a, b) => (b.fitness ?? 0) - (a.fitness ?? 0),
  );
  return {
    success,
    bestSample: bestSample || sorted[0],
    allSamples: sorted,
    iterations,
    elapsedMs: Date.now() - startTime,
    failureReason: success ? undefined : failureReason || "未找到达标样本",
  };
}

/**
 * 把搜索结果（参数样本 + 模板 + 绑定）转换为完整的场景实例。
 * 场景实例可以直接用来构建仿真输入。
 */
export function buildSceneInstance(
  template: SceneTemplate,
  binding: TemplateBinding,
  sample: ParameterSample,
): SceneInstance {
  const params: Record<string, Record<string, unknown>> = {};
  const initialSpeeds: Record<string, number> = {};

  for (const role of template.roles) {
    const roleParams: Record<string, unknown> = { ...(role.modelParams || {}) };

    // 搜索参数覆盖
    if (role.searchParams) {
      for (const paramName of Object.keys(role.searchParams)) {
        const key = `${role.id}.${paramName}`;
        if (key in sample.values) {
          roleParams[paramName] = sample.values[key];
        }
      }
    }

    params[role.id] = roleParams;

    // 初始速度
    const speedKey = `${role.id}.__speed__`;
    initialSpeeds[role.id] =
      (sample.values[speedKey] as number) ?? role.initialSpeed.default;
  }

  // 持续时间
  const durationS =
    (sample.values["__duration__"] as number) ?? template.durationS.default;

  // 估算危险等级
  const dangerLevel = Math.round((sample.fitness ?? 0.5) * 5);

  return {
    templateId: template.id,
    binding,
    params,
    initialSpeeds,
    durationS,
    dangerLevel,
  };
}
