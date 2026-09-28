/**
 * 场景模板 + 搜索引擎单元测试。
 *
 * 覆盖：
 *   - 模板注册表（9 个模板）
 *   - 模板字段完整性
 *   - 拓扑候选生成（在 mock 地图上）
 *   - 参数维度提取
 *   - 拉丁超立方采样
 *   - GA 搜索引擎
 *   - 启发式危险度评估
 *   - 场景实例构建
 */

import { describe, it, expect } from "vitest";
import type { MapModel } from "../../index.js";
import {
  sceneTemplates,
  getTemplate,
  searchTemplates,
  getTemplateStats,
  generateTopologyCandidates,
  extractLaneInfo,
} from "./index.js";
import {
  extractSearchDimensions,
  latinHypercubeSample,
} from "../scene-search/parameter-sampler.js";
import {
  searchScene,
  buildSceneInstance,
  heuristicEvaluator,
} from "../scene-search/scene-searcher.js";
import type { SearchConfig } from "../scene-search/types.js";
import { rearEndTemplate } from "./templates/rear-end.template.js";

/** 两车道直路 mock map */
const twoLaneMap: MapModel = {
  mapId: "test-two-lane",
  origin: [116, 40],
  roads: [
    {
      id: "right",
      widthM: 3.5,
      centerline: [
        [0, 0],
        [1000, 0],
      ],
      lengthM: 1000,
      entryHeadingDeg: 0,
    },
    {
      id: "left",
      widthM: 3.5,
      centerline: [
        [0, 3.5],
        [1000, 3.5],
      ],
      lengthM: 1000,
      entryHeadingDeg: 0,
    },
  ],
  successors: [],
  adjacentSameDirection: [
    {
      from: "right",
      to: "left",
      side: "left",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
    {
      from: "left",
      to: "right",
      side: "right",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
  ],
};

/** 带路口的 mock map */
const junctionMap: MapModel = {
  mapId: "test-junction",
  origin: [116, 40],
  roads: [
    // 西进口两条车道
    {
      id: "west-right",
      widthM: 3.5,
      centerline: [
        [-500, 0],
        [0, 0],
      ],
      lengthM: 500,
      entryHeadingDeg: 90,
    },
    {
      id: "west-left",
      widthM: 3.5,
      centerline: [
        [-500, 3.5],
        [0, 3.5],
      ],
      lengthM: 500,
      entryHeadingDeg: 90,
    },
    // 路口直行连接线
    {
      id: "j-straight",
      widthM: 3.5,
      centerline: [
        [0, 0],
        [500, 0],
      ],
      lengthM: 500,
      entryHeadingDeg: 90,
      junction: {
        id: "j1",
        from: "west-right",
        to: "east-right",
        turn: "straight",
        maxCurvature: 0,
        stopPositionM: 0,
      },
    },
    // 路口左转连接线
    {
      id: "j-left",
      widthM: 3.5,
      centerline: [
        [0, 3.5],
        [0, -500],
      ],
      lengthM: 500,
      entryHeadingDeg: 180,
      junction: {
        id: "j1",
        from: "west-left",
        to: "south-right",
        turn: "left",
        maxCurvature: 0.01,
        stopPositionM: 0,
      },
    },
    // 东出口
    {
      id: "east-right",
      widthM: 3.5,
      centerline: [
        [500, 0],
        [1000, 0],
      ],
      lengthM: 500,
      entryHeadingDeg: 90,
    },
  ],
  successors: [
    { from: "west-right", to: "j-straight" },
    { from: "west-left", to: "j-left" },
  ],
  adjacentSameDirection: [
    {
      from: "west-right",
      to: "west-left",
      side: "left",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
    {
      from: "west-left",
      to: "west-right",
      side: "right",
      entryDistanceM: 3.5,
      headingDiffDeg: 0,
    },
  ],
};

describe("scene template registry", () => {
  it("registers 9 templates", () => {
    expect(sceneTemplates.length).toBe(9);
  });

  it("every template has a unique id", () => {
    const ids = sceneTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template has required fields", () => {
    for (const t of sceneTemplates) {
      expect(t.name, t.id).toBeTruthy();
      expect(t.description, t.id).toBeTruthy();
      expect(t.roles.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.dangerCriteria.length, t.id).toBeGreaterThanOrEqual(1);
      expect(t.dangerLevelRange[0], t.id).toBeGreaterThanOrEqual(1);
      expect(t.dangerLevelRange[1], t.id).toBeLessThanOrEqual(5);
    }
  });

  it("every template has an ego role", () => {
    for (const t of sceneTemplates) {
      const egos = t.roles.filter((r) => r.isEgo);
      expect(egos.length, t.id).toBe(1);
    }
  });

  it("getTemplate finds by id", () => {
    const t = getTemplate("rear_end");
    expect(t?.name).toContain("追尾");
  });

  it("searchTemplates matches Chinese keywords", () => {
    expect(searchTemplates("追尾").length).toBeGreaterThan(0);
    expect(searchTemplates("路口").length).toBeGreaterThan(0);
  });

  it("getTemplateStats groups by category", () => {
    const stats = getTemplateStats();
    expect(stats.total).toBe(9);
    expect(stats.byCategory.longitudinal).toBeGreaterThan(0);
    expect(stats.byCategory.intersection).toBeGreaterThan(0);
  });
});

describe("topology binding", () => {
  it("extracts lane info from a map", () => {
    const lanes = extractLaneInfo(twoLaneMap);
    expect(lanes.length).toBe(2);
    expect(lanes.every((l) => !l.isJunction)).toBe(true);
  });

  it("marks junction lanes", () => {
    const lanes = extractLaneInfo(junctionMap);
    const junctionLanes = lanes.filter((l) => l.isJunction);
    expect(junctionLanes.length).toBe(2);
  });

  it("generates candidates for rear_end on a two-lane road", () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      10,
    );
    expect(candidates.length).toBeGreaterThan(0);

    // 每个候选都包含 ego 和 lead 两个角色
    for (const c of candidates) {
      expect(c.roleLanes.ego).toBeDefined();
      expect(c.roleLanes.lead).toBeDefined();
      // lead 应该在 ego 前方
      expect(c.roleLanes.lead.initialS).toBeGreaterThan(
        c.roleLanes.ego.initialS,
      );
    }
  });

  it("assigns both roles to the same lane for rear_end", () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      10,
    );
    expect(candidates[0]!.roleLanes.ego.laneId).toBe(
      candidates[0]!.roleLanes.lead.laneId,
    );
  });

  it("caps the number of candidates", () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      2,
    );
    expect(candidates.length).toBeLessThanOrEqual(2);
  });
});

describe("search dimension extraction", () => {
  it("extracts dimensions from rear_end template", () => {
    const dims = extractSearchDimensions(rearEndTemplate);
    // ego 和 lead 的 searchParams + 速度 + lead 距离 + duration
    expect(dims.length).toBeGreaterThan(5);

    const paths = dims.map((d) => d.path);
    expect(paths).toContain("lead.brakingDecelMps2");
    expect(paths).toContain("ego.ttcThresholdS");
    expect(paths.some((p) => p.endsWith("__speed__"))).toBe(true);
    expect(paths).toContain("__duration__");
  });
});

describe("latin hypercube sampling", () => {
  it("produces the requested number of samples", () => {
    const dims = extractSearchDimensions(rearEndTemplate);
    const samples = latinHypercubeSample(dims, 20, 42);
    expect(samples.length).toBe(20);
  });

  it("every sample covers every dimension", () => {
    const dims = extractSearchDimensions(rearEndTemplate);
    const samples = latinHypercubeSample(dims, 10, 42);
    for (const s of samples) {
      for (const d of dims) {
        expect(s[d.path], d.path).toBeDefined();
      }
    }
  });

  it("uniform dimension values fall within bounds", () => {
    const dims = [
      {
        path: "x",
        distribution: { type: "uniform" as const, min: 0, max: 10 },
      },
    ];
    const samples = latinHypercubeSample(dims, 50, 1);
    for (const s of samples) {
      expect(s.x as number).toBeGreaterThanOrEqual(0);
      expect(s.x as number).toBeLessThanOrEqual(10);
    }
  });

  it("is reproducible with the same seed", () => {
    const dims = extractSearchDimensions(rearEndTemplate);
    const a = latinHypercubeSample(dims, 10, 99);
    const b = latinHypercubeSample(dims, 10, 99);
    expect(a).toEqual(b);
  });
});

describe("heuristic evaluator", () => {
  function makeSample(values: Record<string, number | string | boolean>) {
    return { values };
  }

  function makeBinding(template = rearEndTemplate) {
    const candidates = generateTopologyCandidates(template, twoLaneMap, 1);
    return candidates[0]!;
  }

  it("returns 0-1 fitness", () => {
    const binding = makeBinding();
    const score = heuristicEvaluator(makeSample({}), rearEndTemplate, binding);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("rates close fast scenarios as more dangerous", () => {
    const binding = makeBinding();
    const safe = heuristicEvaluator(
      makeSample({
        "ego.__speed__": 5,
        "lead.__speed__": 5,
        "lead.__distance__": 90,
        "ego.perceptionTimeS": 0.2,
        "ego.maxDecelerationMps2": 10,
      }),
      rearEndTemplate,
      binding,
    );
    const dangerous = heuristicEvaluator(
      makeSample({
        "ego.__speed__": 20,
        "lead.__speed__": 10,
        "lead.__distance__": 12,
        "ego.perceptionTimeS": 1.2,
        "ego.maxDecelerationMps2": 5,
        "lead.brakingDecelMps2": 9,
      }),
      rearEndTemplate,
      binding,
    );
    expect(dangerous).toBeGreaterThan(safe);
  });
});

describe("scene searcher", () => {
  const config: SearchConfig = {
    maxIterations: 3,
    populationSize: 20,
    algorithm: "genetic",
    goal: { targetDangerLevel: 3, mode: "maximize", tolerance: 0.2 },
    timeoutMs: 10000,
  };

  it("finds a dangerous scene for rear_end template", async () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      1,
    );
    const binding = candidates[0]!;
    const result = await searchScene(
      rearEndTemplate,
      binding,
      config,
      heuristicEvaluator,
    );

    expect(result.allSamples.length).toBeGreaterThan(0);
    expect(result.bestSample).toBeDefined();
    expect(result.bestSample!.fitness!).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("sorts all samples by fitness descending", async () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      1,
    );
    const result = await searchScene(
      rearEndTemplate,
      candidates[0]!,
      { ...config, maxIterations: 1 },
      heuristicEvaluator,
    );
    for (let i = 1; i < result.allSamples.length; i++) {
      expect(result.allSamples[i - 1]!.fitness!).toBeGreaterThanOrEqual(
        result.allSamples[i]!.fitness!,
      );
    }
  });

  it("respects timeout", async () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      1,
    );
    // 用一个很慢的评估器
    const slowEvaluator = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 0.5;
    };
    const result = await searchScene(
      rearEndTemplate,
      candidates[0]!,
      { ...config, timeoutMs: 100, populationSize: 50 },
      slowEvaluator,
    );
    expect(result.elapsedMs).toBeLessThan(2000);
  });

  it("builds a scene instance from the best sample", async () => {
    const candidates = generateTopologyCandidates(
      rearEndTemplate,
      twoLaneMap,
      1,
    );
    const binding = candidates[0]!;
    const result = await searchScene(
      rearEndTemplate,
      binding,
      { ...config, maxIterations: 1 },
      heuristicEvaluator,
    );
    const instance = buildSceneInstance(
      rearEndTemplate,
      binding,
      result.bestSample!,
    );

    expect(instance.templateId).toBe("rear_end");
    expect(instance.params.ego).toBeDefined();
    expect(instance.params.lead).toBeDefined();
    expect(instance.initialSpeeds.ego).toBeGreaterThan(0);
    expect(instance.durationS).toBeGreaterThan(0);
    expect(instance.dangerLevel).toBeGreaterThanOrEqual(1);
    expect(instance.dangerLevel).toBeLessThanOrEqual(5);
  });
});
