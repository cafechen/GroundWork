/**
 * 参数采样器。
 *
 * 从分布中采样参数值。支持：
 *   - uniform: 均匀分布
 *   - normal: 正态分布（Box-Muller 变换）
 *   - categorical: 分类分布
 *
 * 采样器是无状态的（纯函数），便于搜索器调用。
 */

import type { ParamDistribution } from "../behavior-models/types.js";

/** 带种子的伪随机数生成器（Mulberry32），保证可复现 */
export function createRng(seed: number) {
  let t = seed >>> 0;
  return function rng(): number {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller 变换：均匀分布 → 标准正态分布 */
function boxMuller(u1: number, u2: number): number {
  return (
    Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
  );
}

/**
 * 从一个分布中采样一个值。
 */
export function sampleFromDistribution(
  dist: ParamDistribution,
  rng: () => number = Math.random,
): number | string {
  switch (dist.type) {
    case "uniform": {
      return dist.min + rng() * (dist.max - dist.min);
    }

    case "normal": {
      const u1 = rng();
      const u2 = rng();
      const z = boxMuller(u1, u2);
      let value = dist.mean + z * dist.std;
      if (dist.min !== undefined) value = Math.max(dist.min, value);
      if (dist.max !== undefined) value = Math.min(dist.max, value);
      return value;
    }

    case "categorical": {
      const values = dist.values;
      if (!values || values.length === 0) return 0;

      if (dist.weights && dist.weights.length === values.length) {
        // 加权采样
        const total = dist.weights.reduce((a: number, b: number) => a + b, 0);
        let r = rng() * total;
        for (let i = 0; i < values.length; i++) {
          r -= dist.weights[i] ?? 0;
          if (r <= 0) return values[i] ?? 0;
        }
        return values[values.length - 1] ?? 0;
      }

      // 等概率
      const idx = Math.floor(rng() * values.length);
      return values[idx] ?? 0;
    }
  }
}

/**
 * 从模板定义中提取所有可搜索的参数维度。
 * 包括：
 *   - 每个角色的 searchParams
 *   - 角色初始速度分布
 *   - 角色位置距离分布
 *   - 持续时间分布
 */
import type { SceneTemplate } from "../scene-templates/types.js";
import type { SearchDimension } from "./types.js";

export function extractSearchDimensions(
  template: SceneTemplate,
): SearchDimension[] {
  const dims: SearchDimension[] = [];

  for (const role of template.roles) {
    // 模型搜索参数
    if (role.searchParams) {
      for (const [paramName, dist] of Object.entries(role.searchParams)) {
        dims.push({
          path: `${role.id}.${paramName}`,
          distribution: dist,
        });
      }
    }

    // 初始速度
    if (role.initialSpeed.distribution) {
      dims.push({
        path: `${role.id}.__speed__`,
        distribution: role.initialSpeed.distribution,
      });
    }

    // 位置距离
    if (role.position?.distanceDistribution) {
      dims.push({
        path: `${role.id}.__distance__`,
        distribution: role.position.distanceDistribution,
      });
    }
  }

  // 持续时间
  if (template.durationS.distribution) {
    dims.push({
      path: "__duration__",
      distribution: template.durationS.distribution,
    });
  }

  return dims;
}

/**
 * 从维度中采样一个完整的参数样本。
 */
export function sampleDimensions(
  dims: SearchDimension[],
  rng: () => number = Math.random,
): Record<string, number | string | boolean> {
  const values: Record<string, number | string | boolean> = {};
  for (const dim of dims) {
    values[dim.path] = sampleFromDistribution(dim.distribution, rng);
  }
  return values;
}

/**
 * 拉丁超立方采样（Latin Hypercube Sampling）。
 * 在每个维度上分成 n 个区间，每个区间只采一个点，且每行每列只有一个点。
 * 比纯随机采样覆盖更均匀，适合初始种群。
 */
export function latinHypercubeSample(
  dims: SearchDimension[],
  n: number,
  seed = 42,
): Array<Record<string, number | string | boolean>> {
  const rng = createRng(seed);
  const result: Array<Record<string, number | string | boolean>> = [];

  // 对每个数值维度，生成 [0, 1) 区间内的拉丁超立方样本
  const numericDims = dims.filter((d) => d.distribution.type !== "categorical");
  const categoricalDims = dims.filter(
    (d) => d.distribution.type === "categorical",
  );

  const nd = numericDims.length;

  // 每个维度生成 [0, 1) 的打乱区间
  const perDimShuffled: number[][] = [];
  for (let d = 0; d < nd; d++) {
    const positions: number[] = [];
    for (let i = 0; i < n; i++) {
      positions.push((i + rng()) / n);
    }
    // 打乱 (Fisher-Yates)
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = positions[i]!;
      positions[i] = positions[j]!;
      positions[j] = tmp;
    }
    perDimShuffled.push(positions);
  }

  // 组装
  for (let i = 0; i < n; i++) {
    const sample: Record<string, number | string | boolean> = {};

    for (let d = 0; d < nd; d++) {
      const dim = numericDims[d]!;
      const p = perDimShuffled[d]![i]!;

      if (dim.distribution.type === "uniform") {
        const { min, max } = dim.distribution;
        sample[dim.path] = min + p * (max - min);
      } else if (dim.distribution.type === "normal") {
        const { mean, std, min, max } = dim.distribution;
        const z = (p - 0.5) * 6; // -3σ 到 3σ（近似正态分位数）
        let value = mean + z * std;
        if (min !== undefined) value = Math.max(min, value);
        if (max !== undefined) value = Math.min(max, value);
        sample[dim.path] = value;
      }
    }

    // 分类维度直接随机
    for (const dim of categoricalDims) {
      sample[dim.path] = sampleFromDistribution(dim.distribution, rng);
    }

    result.push(sample);
  }

  return result;
}
