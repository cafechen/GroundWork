/**
 * 行为模型单元测试。
 *
 * 覆盖：
 *   - 参数采样器（uniform / normal / categorical）
 *   - 模型注册表
 *   - IDM 跟车模型
 *   - 制动响应模型
 *   - 前车制动模型
 *   - VRU 模型
 *   - 变道模型
 */

import { describe, it, expect } from "vitest";
import type { MapModel } from "../../index.js";
import type { VehicleState } from "../simulation/types.js";
import type { BehaviorContext } from "./types.js";
import {
  createModel,
  getModelMetadata,
  behaviorModelRegistry,
  CarFollowingModel,
  BrakeResponseModel,
  LeadVehicleBrakingModel,
  VRUModel,
  MandatoryLaneChangeModel,
} from "./index.js";
import {
  sampleFromDistribution,
  createRng,
} from "../scene-search/parameter-sampler.js";

/** 两车道直路 mock map */
const map: MapModel = {
  mapId: "test-road",
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

function makeVehicle(
  id: string,
  opts: Partial<VehicleState> = {},
): VehicleState {
  return {
    id,
    laneId: "right",
    s: 50,
    x: 50,
    y: 0,
    heading: 0,
    speed: 12,
    acceleration: 0,
    routeIndex: 0,
    ...opts,
  };
}

function makeContext(
  ego: VehicleState,
  others: VehicleState[] = [],
  time = 0,
): BehaviorContext {
  return {
    ego,
    others,
    map,
    time,
    dt: 0.05,
    route: [ego.laneId],
    routeIndex: 0,
  };
}

describe("parameter sampling", () => {
  it("uniform distribution samples within bounds", () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = sampleFromDistribution(
        { type: "uniform", min: 3, max: 9 },
        rng,
      );
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("normal distribution samples near mean and respects bounds", () => {
    const rng = createRng(42);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(
        sampleFromDistribution(
          { type: "normal", mean: 5, std: 1, min: 2, max: 8 },
          rng,
        ) as number,
      );
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(4.5);
    expect(mean).toBeLessThan(5.5);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...samples)).toBeLessThanOrEqual(8);
  });

  it("categorical distribution returns one of the values", () => {
    const rng = createRng(42);
    const values = [true, false] as unknown as (number | string)[];
    for (let i = 0; i < 50; i++) {
      const v = sampleFromDistribution({ type: "categorical", values }, rng);
      expect(values).toContain(v);
    }
  });

  it("seeded rng is reproducible", () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });
});

describe("model registry", () => {
  it("registers all 11 behavior models", () => {
    expect(Object.keys(behaviorModelRegistry).length).toBe(11);
  });

  it("returns metadata for a registered model", () => {
    const meta = getModelMetadata("car-following");
    expect(meta).toBeDefined();
    expect(meta?.name).toBe("car-following");
    expect(meta?.params.desiredSpeedMps.default).toBeDefined();
  });

  it("returns undefined for unknown model", () => {
    expect(getModelMetadata("nonexistent")).toBeUndefined();
  });

  it("creates a model instance by name", () => {
    const model = createModel("car-following", {
      desiredSpeedMps: 10,
      timeHeadwayS: 1.5,
      minimumGapM: 3,
      maxAccelerationMps2: 2,
      comfortableBrakingMps2: 2.5,
      reactionTimeS: 0.5,
    });
    expect(model).toBeInstanceOf(CarFollowingModel);
  });

  it("returns null for unknown model name", () => {
    expect(createModel("unknown", {})).toBeNull();
  });

  it("every registered model has metadata with at least one param", () => {
    for (const [name, entry] of Object.entries(behaviorModelRegistry)) {
      expect(entry.metadata.name, name).toBe(name);
      expect(Object.keys(entry.metadata.params).length, name).toBeGreaterThan(
        0,
      );
    }
  });
});

describe("car-following model (IDM)", () => {
  function makeModel(
    overrides: Partial<ConstructorParameters<typeof CarFollowingModel>[0]> = {},
  ) {
    return new CarFollowingModel({
      desiredSpeedMps: 12,
      timeHeadwayS: 1.5,
      minimumGapM: 3,
      maxAccelerationMps2: 2,
      comfortableBrakingMps2: 2.5,
      reactionTimeS: 0.5,
      ...overrides,
    });
  }

  it("accelerates toward desired speed on an empty road", () => {
    const model = makeModel({ desiredSpeedMps: 15 });
    const ego = makeVehicle("ego", { speed: 10 });
    const out = model.step(makeContext(ego, []));
    expect(out.acceleration).toBeGreaterThan(0);
  });

  it("decelerates when close behind a slower leader", () => {
    const model = makeModel();
    const ego = makeVehicle("ego", { speed: 15, s: 50 });
    const leader = makeVehicle("lead", { speed: 5, s: 60 }); // 10m gap
    const out = model.step(makeContext(ego, [leader]));
    expect(out.acceleration).toBeLessThan(0);
  });

  it("barely accelerates at desired speed with no leader", () => {
    const model = makeModel({ desiredSpeedMps: 12 });
    const ego = makeVehicle("ego", { speed: 12 });
    const out = model.step(makeContext(ego, []));
    expect(Math.abs(out.acceleration)).toBeLessThan(0.01);
  });

  it("ignores vehicles in other lanes", () => {
    const model = makeModel({ desiredSpeedMps: 12 });
    const ego = makeVehicle("ego", { speed: 12, laneId: "right" });
    const other = makeVehicle("other", { speed: 0, s: 55, laneId: "left" });
    const out = model.step(makeContext(ego, [other]));
    expect(Math.abs(out.acceleration)).toBeLessThan(0.01);
  });
});

describe("brake-response model", () => {
  function makeModel(overrides = {}) {
    return new BrakeResponseModel({
      perceptionTimeS: 0.3,
      decisionTimeS: 0.4,
      brakeRampTimeS: 0.3,
      maxDecelerationMps2: 8,
      ttcThresholdS: 2.5,
      minBrakeDecelMps2: 2,
      ...overrides,
    });
  }

  it("does not brake with no threat", () => {
    const model = makeModel();
    const ego = makeVehicle("ego");
    const out = model.step(makeContext(ego, []));
    expect(out.acceleration).toBe(0);
  });

  it("does not brake during reaction delay even with a threat", () => {
    const model = makeModel({ perceptionTimeS: 0.3, decisionTimeS: 0.5 });
    const ego = makeVehicle("ego", { speed: 20, s: 50 });
    const leader = makeVehicle("lead", { speed: 10, s: 60 }); // TTC = 1s
    // t = 0：刚发现危险，在反应期
    const out0 = model.step(makeContext(ego, [leader], 0));
    expect(out0.acceleration).toBe(0);
    // t = 0.5：还在 0.3+0.5=0.8s 反应期内
    const outMid = model.step(makeContext(ego, [leader], 0.5));
    expect(outMid.acceleration).toBe(0);
  });

  it("brakes after reaction delay when TTC is low", () => {
    const model = makeModel({
      perceptionTimeS: 0.1,
      decisionTimeS: 0.1,
      ttcThresholdS: 3,
    });
    const ego = makeVehicle("ego", { speed: 20, s: 50 });
    const leader = makeVehicle("lead", { speed: 10, s: 60 }); // TTC = 1s
    // t = 0：首次发现危险
    model.step(makeContext(ego, [leader], 0));
    // t = 0.3：感知 0.1 + 决策 0.1 已完成，制动开始建立（首步 ramp=0）
    model.step(makeContext(ego, [leader], 0.3));
    // t = 0.4：制动 ramp 进行中，减速度为负
    const out = model.step(makeContext(ego, [leader], 0.4));
    expect(out.acceleration).toBeLessThan(0);
  });

  it("stops braking once the vehicle is stopped", () => {
    const model = makeModel({ perceptionTimeS: 0.1, decisionTimeS: 0.1 });
    const ego = makeVehicle("ego", { speed: 0, s: 50 });
    const leader = makeVehicle("lead", { speed: 0, s: 55 });
    const out = model.step(makeContext(ego, [leader], 1));
    expect(out.acceleration).toBe(0);
  });
});

describe("lead-vehicle-braking model", () => {
  it("cruises normally when no follower is approaching", () => {
    const model = new LeadVehicleBrakingModel({
      triggerTtcS: 3,
      brakingDecelMps2: 6,
      brakeRampTimeS: 0.3,
      minSpeedMps: 0,
      triggerDelayS: 0,
      brakeToStop: true,
    });
    const ego = makeVehicle("lead", { speed: 12, s: 80 });
    // 没有后车
    const out = model.step(makeContext(ego, [], 0));
    expect(out.acceleration).toBe(0);
  });

  it("brakes when a follower approaches with low TTC", () => {
    const model = new LeadVehicleBrakingModel({
      triggerTtcS: 4,
      brakingDecelMps2: 7,
      brakeRampTimeS: 0.2,
      minSpeedMps: 0,
      triggerDelayS: 0,
      brakeToStop: true,
    });
    const lead = makeVehicle("lead", { speed: 10, s: 60 });
    const follower = makeVehicle("follower", { speed: 20, s: 50 }); // gap 10m, TTC 1s
    // 第一次 step 触发
    model.step(makeContext(lead, [follower], 0));
    // 后续 step 应该开始减速
    const out = model.step(makeContext(lead, [follower], 0.5));
    expect(out.acceleration).toBeLessThan(0);
  });
});

describe("VRU model", () => {
  it("produces bounded lateral swing", () => {
    const model = new VRUModel({
      avgSpeedMps: 5,
      speedVariation: 0.3,
      lateralSwingAmpM: 0.5,
      lateralSwingFreqHz: 0.3,
      reactionDelayS: 0.8,
      aggressiveness: 0.3,
      directionChangeProbPerSec: 0.1,
      startAccelMps2: 1.5,
      brakeDecelMps2: 3,
    });
    const ego = makeVehicle("vru", { speed: 5 });
    let maxOffset = 0;
    for (let t = 0; t < 200; t++) {
      const out = model.step(makeContext(ego, [], t * 0.05));
      if (out.lateralOffsetM !== undefined) {
        maxOffset = Math.max(maxOffset, Math.abs(out.lateralOffsetM));
      }
    }
    // 摆动应该在合理范围内（正弦 0.5 + 随机偏移）
    expect(maxOffset).toBeGreaterThan(0);
    expect(maxOffset).toBeLessThan(5);
  });
});

describe("mandatory lane change model", () => {
  it("reports no adjacent lane on a single-lane road", () => {
    const singleLaneMap: MapModel = {
      ...map,
      adjacentSameDirection: [],
    };
    const model = new MandatoryLaneChangeModel({
      lookAheadDistanceM: 100,
      minGapM: 5,
      gapAcceptanceFactor: 1.2,
      lateralSpeedMps: 1.5,
      targetSpeedRatio: 1,
      returnToOriginal: false,
      returnDelayS: 3,
    });
    const ego = makeVehicle("ego", { laneId: "solo" });
    const ctx = { ...makeContext(ego, []), map: singleLaneMap };
    const out = model.step(ctx);
    expect(out.debug).toMatchObject({ noAdjacentLane: true });
  });

  it("requests a target lane when an adjacent lane exists with enough gap", () => {
    const model = new MandatoryLaneChangeModel({
      lookAheadDistanceM: 100,
      minGapM: 2,
      gapAcceptanceFactor: 0.3,
      lateralSpeedMps: 1.5,
      targetSpeedRatio: 1,
      returnToOriginal: false,
      returnDelayS: 3,
    });
    const ego = makeVehicle("ego", { laneId: "right", s: 50, speed: 12 });
    // 左车道无车 → 间隙足够
    const out = model.step(makeContext(ego, [], 0));
    expect(out.targetLaneId).toBe("left");
  });
});
