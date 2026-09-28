/**
 * 无保护左转冲突场景模板（unprotected_left_turn）。
 *
 * 拓扑：路口场景在路口左转，与对向直行车辆冲突。
 *
 * 对应 wanji-new 中的场景：
 *   - left_turn_conflict
 *   - unprotected_left_turn
 */

import type { SceneTemplate } from "../types.js";

export const unprotectedLeftTurnTemplate: SceneTemplate = {
  id: "unprotected_left_turn",
  name: "无保护左转冲突",
  description: "车辆在无保护路口左转，与对向直行车辆发生冲突或险些碰撞。",
  tags: ["路口", "左转", "对向冲突", "无保护"],
  category: "intersection",
  dangerLevelRange: [3, 5],

  mapRequirements: {
    needsJunction: true,
    needsLeftTurnLane: true,
    needsOppositeLane: true,
  },

  roles: [
    {
      id: "ego",
      label: "左转车（被测）",
      laneType: "left_turn",
      direction: "left_turn",
      behaviorModel: "left-turn",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 10,
        distribution: { type: "uniform", min: 6, max: 15 },
      },
      searchParams: {
        oncomingGapAcceptanceS: {
          type: "normal",
          mean: 5,
          std: 1.5,
          min: 2,
          max: 10,
        },
        turningSpeedMps: { type: "uniform", min: 2, max: 8 },
        waitInJunction: { type: "categorical", values: [true, false] } as any,
        maxWaitTimeS: { type: "uniform", min: 5, max: 30 },
      },
    },
    {
      id: "oncoming",
      label: "对向直行车",
      laneType: "through",
      direction: "opposite",
      behaviorModel: "through-traffic",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "opposite_lane",
        distanceDistribution: { type: "uniform", min: 30, max: 120 },
      },
      initialSpeed: {
        default: 14,
        distribution: { type: "uniform", min: 8, max: 20 },
      },
      modelParams: {
        hasPriority: true,
      },
      searchParams: {
        approachSpeedMps: { type: "uniform", min: 8, max: 18 },
        crossTrafficReaction: { type: "uniform", min: 0, max: 1 },
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 2 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "min_gap_below", threshold: 1.0 },
  ],

  durationS: {
    default: 12,
    distribution: { type: "uniform", min: 8, max: 20 },
  },
};
