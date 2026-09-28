/**
 * 行为驱动模拟器 + 端到端场景生成器测试。
 *
 * 验证 Layer-1 行为积木被真实积分成轨迹，并按模板危险判据给出物理危险度：
 *   - 安全参数 → 低适应度
 *   - 危险参数（近距、高速、急刹、慢反应）→ 碰撞或极低 TTC、高适应度
 *   - 初始重叠判无效
 *   - 评估器工厂与直接仿真一致
 *   - generateScene 端到端产出真实轨迹
 */

import { describe, it, expect } from "vitest";
import type { MapModel } from "../index.js";
import { rearEndTemplate } from "./scene-templates/templates/rear-end.template.js";
import { generateTopologyCandidates } from "./scene-templates/index.js";
import {
  simulateBehaviorScene,
  makeSimulationEvaluator,
} from "./behavior-simulator.js";
import { generateScene } from "./scene-generator.js";

/** 两车道直路 mock map */
const map: MapModel = {
  mapId: "test-sim",
  origin: [116, 40],
  roads: [
    {
      id: "right",
      widthM: 3.5,
      centerline: [
        [0, 0],
        [2000, 0],
      ],
      lengthM: 2000,
      entryHeadingDeg: 0,
    },
    {
      id: "left",
      widthM: 3.5,
      centerline: [
        [0, 3.5],
        [2000, 3.5],
      ],
      lengthM: 2000,
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

function binding() {
  return generateTopologyCandidates(rearEndTemplate, map, 1)[0]!;
}

describe("behavior simulator", () => {
  it("produces one trajectory point per timestep for every role", () => {
    const result = simulateBehaviorScene(
      map,
      rearEndTemplate,
      binding(),
      {},
      { dt: 0.1 },
    );
    expect(result.trajectories.ego!.length).toBe(101); // 10s / 0.1 + 初始帧
    expect(result.trajectories.lead!.length).toBe(101);
    const p = result.trajectories.ego![50]!;
    expect(p.t).toBeCloseTo(5, 5);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("rates a far, equal-speed cruise as safe", () => {
    const result = simulateBehaviorScene(map, rearEndTemplate, binding(), {
      "ego.__speed__": 8,
      "lead.__speed__": 8,
      "lead.__distance__": 60,
      "lead.triggerTtcS": 1,
      "ego.maxDecelerationMps2": 10,
    });
    expect(result.metrics.collided).toBe(false);
    expect(result.fitness).toBeLessThan(0.2);
  });

  it("rates a close high-speed hard-brake as dangerous", () => {
    const result = simulateBehaviorScene(map, rearEndTemplate, binding(), {
      "ego.__speed__": 20,
      "lead.__speed__": 8,
      "lead.__distance__": 12,
      "lead.triggerTtcS": 5,
      "lead.brakingDecelMps2": 9,
      "ego.perceptionTimeS": 0.05,
      "ego.decisionTimeS": 0.05,
      "ego.ttcThresholdS": 4,
      "ego.maxDecelerationMps2": 5,
    });
    // 要么撞上，要么 TTC 极低
    expect(result.metrics.collided || result.metrics.minTtc < 1.5).toBe(true);
    expect(result.fitness).toBeGreaterThan(0.6);
  });

  it("flags initial body overlap as an invalid sample", () => {
    const result = simulateBehaviorScene(map, rearEndTemplate, binding(), {
      "ego.__speed__": 20,
      "lead.__speed__": 20,
      "lead.__distance__": 0, // 几乎叠在一起
    });
    expect(result.invalid).toBe(true);
    expect(result.fitness).toBe(0);
  });

  it("evaluator factory matches a direct simulation run", async () => {
    const evaluator = makeSimulationEvaluator(map);
    const values = {
      "ego.__speed__": 20,
      "lead.__speed__": 8,
      "lead.__distance__": 12,
      "lead.brakingDecelMps2": 9,
    };
    const direct = simulateBehaviorScene(
      map,
      rearEndTemplate,
      binding(),
      values,
    ).fitness;
    const viaEvaluator = await evaluator(
      { values },
      rearEndTemplate,
      binding(),
    );
    expect(viaEvaluator).toBe(direct);
  });
});

describe("generateScene end-to-end", () => {
  it("returns an instance with real simulated trajectories and metrics", async () => {
    const out = await generateScene("rear_end", map, {
      targetDangerLevel: 3,
      searchConfig: { maxIterations: 2, populationSize: 16, timeoutMs: 10000 },
    });

    expect(out.instance).toBeDefined();
    expect(out.template?.id).toBe("rear_end");
    expect(out.simulation).toBeDefined();
    // 碰撞会提前终止：轨迹长度只需与实际仿真时长一致（每 0.1s 一帧 + 初始帧）
    const frames = Math.round(out.simulation!.durationS / 0.1) + 1;
    expect(out.simulation!.trajectories.ego!.length).toBe(frames);
    expect(out.simulation!.trajectories.lead!.length).toBe(frames);
    expect(frames).toBeGreaterThanOrEqual(2);
    expect(out.instance!.dangerLevel).toBeGreaterThanOrEqual(1);
    expect(out.instance!.dangerLevel).toBeLessThanOrEqual(5);

    // 搜索高危险目标，真实仿真应找到碰撞或极低 TTC，而不是只给启发式高分
    const dangerous = await generateScene("rear_end", map, {
      targetDangerLevel: 4,
      searchConfig: { maxIterations: 3, populationSize: 24, timeoutMs: 20000 },
    });
    const m = dangerous.simulation!.metrics;
    expect(m.collided || m.minTtc < 2).toBe(true);
    expect(dangerous.instance!.dangerLevel).toBeGreaterThanOrEqual(3);
  }, 30000);
});
