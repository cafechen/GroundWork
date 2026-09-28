/**
 * 追尾场景模板（rear_end）。
 *
 * 拓扑：两车同向同车道行驶，前车在前，后车在后。
 * 触发：前车紧急制动 → 后车制动响应 → 可能追尾。
 *
 * 对应 wanji-new 中的场景：
 *   - rear_end_collision
 *   - dangerous_following
 */

import type { SceneTemplate } from "../types.js";

export const rearEndTemplate: SceneTemplate = {
  id: "rear_end",
  name: "追尾/危险跟车",
  description: "同车道前车紧急制动，后车反应不及导致追尾或危险跟驰。",
  tags: ["纵向", "追尾", "紧急制动", "跟驰危险"],
  category: "longitudinal",
  dangerLevelRange: [2, 5],

  mapRequirements: {
    minLanesPerDirection: 1,
  },

  roles: [
    {
      id: "ego",
      label: "后车（被测）",
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
      id: "lead",
      label: "前车",
      laneType: "through",
      direction: "straight",
      behaviorModel: "lead-vehicle-braking",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "ahead",
        distanceDistribution: { type: "uniform", min: 10, max: 80 },
      },
      initialSpeed: {
        default: 12,
        distribution: { type: "uniform", min: 8, max: 18 },
      },
      searchParams: {
        brakingDecelMps2: { type: "uniform", min: 3, max: 9 },
        triggerTtcS: { type: "uniform", min: 1, max: 5 },
        brakeRampTimeS: {
          type: "normal",
          mean: 0.3,
          std: 0.1,
          min: 0.1,
          max: 1,
        },
      },
      trigger: {
        type: "ttc",
        threshold: 3,
        thresholdDistribution: { type: "uniform", min: 1, max: 5 },
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 2 },
    { type: "ttc_below", threshold: 1.0 },
    { type: "min_gap_below", threshold: 1.0 },
  ],

  durationS: {
    default: 10,
    distribution: { type: "uniform", min: 6, max: 15 },
  },
};
