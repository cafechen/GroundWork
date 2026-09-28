/**
 * 非机动车冲突场景模板（VRU / e-bike conflict）。
 *
 * 拓扑：机动车与非机动车混行场景，非机动车突然变向/减速/闯入。
 *
 * 对应 wanji-new 中的场景：
 *   - non_motor_vehicle_conflict
 *   - e_bike_cut_in
 *   - bicycle_swerve
 *   - pedestrian_crossing
 */

import type { SceneTemplate } from "../types.js";

export const vruConflictTemplate: SceneTemplate = {
  id: "vru_conflict",
  name: "非机动车冲突",
  description:
    "非机动车（电动车/自行车）突然变向、闯入机动车道或减速，与机动车冲突。",
  tags: ["VRU", "非机动车", "电动车", "横向干扰"],
  category: "vru",
  dangerLevelRange: [2, 4],

  mapRequirements: {
    minLanesPerDirection: 1,
  },

  roles: [
    {
      id: "ego",
      label: "机动车（被测）",
      laneType: "through",
      direction: "straight",
      behaviorModel: "brake-response",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 10,
        distribution: { type: "uniform", min: 6, max: 16 },
      },
      searchParams: {
        perceptionTimeS: {
          type: "normal",
          mean: 0.4,
          std: 0.15,
          min: 0.1,
          max: 1.2,
        },
        decisionTimeS: {
          type: "normal",
          mean: 0.5,
          std: 0.2,
          min: 0.1,
          max: 2,
        },
        maxDecelerationMps2: { type: "uniform", min: 5, max: 10 },
        ttcThresholdS: { type: "uniform", min: 1, max: 4 },
      },
    },
    {
      id: "vru",
      label: "非机动车",
      laneType: "through",
      direction: "straight",
      behaviorModel: "vru",
      vehicleType: "ebike",
      position: {
        relativeTo: "ego",
        relation: "ahead",
        distanceDistribution: { type: "uniform", min: 10, max: 60 },
      },
      initialSpeed: {
        default: 5,
        distribution: { type: "normal", mean: 5, std: 1.5, min: 1, max: 10 },
      },
      searchParams: {
        avgSpeedMps: { type: "normal", mean: 5, std: 1.5, min: 1, max: 10 },
        lateralSwingAmpM: {
          type: "normal",
          mean: 0.5,
          std: 0.2,
          min: 0.1,
          max: 1.5,
        },
        aggressiveness: { type: "uniform", min: 0.1, max: 0.8 },
        directionChangeProbPerSec: { type: "uniform", min: 0.05, max: 0.5 },
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 2 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "min_gap_below", threshold: 0.5 },
  ],

  durationS: {
    default: 8,
    distribution: { type: "uniform", min: 5, max: 12 },
  },
};
