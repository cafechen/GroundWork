/**
 * 掉头冲突场景模板（u-turn conflict）。
 *
 * 拓扑：车辆在路口或路段掉头，与对向/同向车辆冲突。
 *
 * 对应 wanji-new 中的场景：
 *   - u_turn_conflict
 *   - intersection_u_turn
 */

import type { SceneTemplate } from "../types.js";

export const uTurnConflictTemplate: SceneTemplate = {
  id: "u_turn_conflict",
  name: "掉头冲突",
  description: "车辆在路口或路段掉头，与对向直行车辆发生冲突。",
  tags: ["路口", "掉头", "对向冲突"],
  category: "intersection",
  dangerLevelRange: [3, 5],

  mapRequirements: {
    needsJunction: true,
    needsOppositeLane: true,
  },

  roles: [
    {
      id: "ego",
      label: "掉头车（被测）",
      laneType: "left_turn",
      direction: "u_turn",
      behaviorModel: "u-turn",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 10,
        distribution: { type: "uniform", min: 6, max: 15 },
      },
      searchParams: {
        oncomingGapAcceptanceS: {
          type: "normal",
          mean: 6,
          std: 2,
          min: 2,
          max: 12,
        },
        turningSpeedMps: { type: "uniform", min: 1, max: 6 },
        turnDurationS: { type: "normal", mean: 5, std: 1, min: 3, max: 10 },
        maxWaitTimeS: { type: "uniform", min: 5, max: 40 },
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
        distanceDistribution: { type: "uniform", min: 30, max: 150 },
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
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 2 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "min_gap_below", threshold: 1.0 },
  ],

  durationS: {
    default: 15,
    distribution: { type: "uniform", min: 10, max: 25 },
  },
};
