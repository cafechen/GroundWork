/**
 * Cut-in 场景模板（强制变道汇入）。
 *
 * 拓扑：两车同向相邻车道，旁车突然变道插入 ego 前方。
 * 触发：旁车以小间隙变道 → ego 紧急制动。
 *
 * 对应 wanji-new 中的场景：
 *   - cut_in
 *   - lane_change_conflict
 *   - side_collision (变道导致的侧碰)
 */

import type { SceneTemplate } from "../types.js";

export const cutInTemplate: SceneTemplate = {
  id: "cut_in",
  name: "Cut-in 强制变道",
  description: "相邻车道车辆以较小间隙切入本车道，导致本车紧急制动。",
  tags: ["横向", "变道", "Cut-in", "侧碰"],
  category: "lateral",
  dangerLevelRange: [2, 5],

  mapRequirements: {
    minLanesPerDirection: 2, // 至少两条同向车道
  },

  roles: [
    {
      id: "ego",
      label: "本车（被测）",
      laneType: "through",
      direction: "straight",
      behaviorModel: "brake-response",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 12,
        distribution: { type: "uniform", min: 8, max: 20 },
      },
      searchParams: {
        perceptionTimeS: {
          type: "normal",
          mean: 0.3,
          std: 0.1,
          min: 0.1,
          max: 1,
        },
        decisionTimeS: {
          type: "normal",
          mean: 0.4,
          std: 0.15,
          min: 0.1,
          max: 1.5,
        },
        maxDecelerationMps2: { type: "uniform", min: 5, max: 10 },
        ttcThresholdS: { type: "uniform", min: 1, max: 4 },
      },
    },
    {
      id: "cutter",
      label: "变道车",
      laneType: "through",
      direction: "straight",
      behaviorModel: "mandatory-lane-change",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "adjacent_left", // 左边相邻车道（也可以是右边）
        distanceDistribution: { type: "uniform", min: -20, max: 30 }, // 可前可后
      },
      initialSpeed: {
        default: 13,
        distribution: { type: "uniform", min: 8, max: 20 },
      },
      searchParams: {
        minGapM: { type: "uniform", min: 1, max: 10 },
        gapAcceptanceFactor: { type: "uniform", min: 0.3, max: 1.5 },
        lateralSpeedMps: { type: "uniform", min: 0.8, max: 2.5 },
        targetSpeedRatio: { type: "uniform", min: 0.8, max: 1.2 },
      },
      modelParams: {
        returnToOriginal: false,
      },
      trigger: {
        type: "distance",
        distanceM: 50,
        distanceDistribution: { type: "uniform", min: 20, max: 100 },
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 1 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "min_gap_below", threshold: 0.5 },
  ],

  durationS: {
    default: 8,
    distribution: { type: "uniform", min: 5, max: 12 },
  },
};
