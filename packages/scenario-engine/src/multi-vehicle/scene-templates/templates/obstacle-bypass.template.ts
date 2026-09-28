/**
 * 占道绕行场景模板（obstacle_bypass）。
 *
 * 拓扑：前方有静止/低速障碍物（占道车、路障），本车绕行。
 * 对向有来车时，绕行 + 对向来车 = 危险。
 *
 * 对应 wanji-new 中的场景：
 *   - obstacle_bypass
 *   - parked_vehicle_swerve
 *   - road_hazard
 */

import type { SceneTemplate } from "../types.js";

export const obstacleBypassTemplate: SceneTemplate = {
  id: "obstacle_bypass",
  name: "占道绕行",
  description: "前方有占道障碍物，车辆绕行时与相邻车道或对向来车冲突。",
  tags: ["纵向", "障碍物", "绕行", "占道"],
  category: "longitudinal",
  dangerLevelRange: [2, 4],

  mapRequirements: {
    minLanesPerDirection: 1,
  },

  roles: [
    {
      id: "ego",
      label: "本车（被测）",
      laneType: "through",
      direction: "straight",
      behaviorModel: "obstacle-bypass",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 12,
        distribution: { type: "uniform", min: 8, max: 18 },
      },
      searchParams: {
        detectionDistanceM: { type: "uniform", min: 20, max: 120 },
        bypassSpeedMps: { type: "uniform", min: 4, max: 15 },
        lateralSpeedMps: {
          type: "normal",
          mean: 1.2,
          std: 0.3,
          min: 0.5,
          max: 2.5,
        },
        bypassOffsetM: { type: "uniform", min: 1, max: 4 },
        reactionTimeS: {
          type: "normal",
          mean: 0.5,
          std: 0.2,
          min: 0.1,
          max: 1.5,
        },
      },
    },
    {
      id: "obstacle",
      label: "障碍物/占道车",
      laneType: "through",
      direction: "static",
      behaviorModel: "car-following",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "ahead",
        distanceDistribution: { type: "uniform", min: 30, max: 100 },
      },
      initialSpeed: {
        default: 0,
      },
      modelParams: {
        desiredSpeedMps: 0,
        maxAccelerationMps2: 0,
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 2 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "min_gap_below", threshold: 0.3 },
    { type: "lane_intrusion", depth: 0.5, direction: "left" },
  ],

  durationS: {
    default: 8,
    distribution: { type: "uniform", min: 5, max: 12 },
  },
};
