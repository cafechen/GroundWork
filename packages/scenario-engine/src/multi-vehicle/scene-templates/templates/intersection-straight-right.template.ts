/**
 * 路口直行-右转冲突场景模板（straight vs right turn in intersection）。
 *
 * 拓扑：同方向直行车与右转车在路口冲突（右转车抢行）。
 *
 * 对应 wanji-new 中的场景：
 *   - straight_right_conflict
 *   - same_direction_right_turn
 */

import type { SceneTemplate } from "../types.js";

export const intersectionStraightRightTemplate: SceneTemplate = {
  id: "intersection_straight_right",
  name: "路口直行右转冲突",
  description: "同方向右转车辆抢行，与直行车辆在路口内发生冲突。",
  tags: ["路口", "右转", "同向冲突", "抢行"],
  category: "intersection",
  dangerLevelRange: [2, 4],

  mapRequirements: {
    needsJunction: true,
    needsRightTurnLane: true,
    minThroughLanesPerDirection: 1,
  },

  roles: [
    {
      id: "ego",
      label: "直行车（被测）",
      laneType: "through",
      direction: "straight",
      behaviorModel: "through-traffic",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 12,
        distribution: { type: "uniform", min: 8, max: 18 },
      },
      modelParams: {
        hasPriority: true,
      },
      searchParams: {
        approachSpeedMps: { type: "uniform", min: 8, max: 18 },
        crossTrafficReaction: { type: "uniform", min: 0, max: 1 },
      },
    },
    {
      id: "rightTurner",
      label: "右转车",
      laneType: "right_turn",
      direction: "right_turn",
      behaviorModel: "right-turn",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "adjacent_right",
        distanceDistribution: { type: "uniform", min: -10, max: 30 },
      },
      initialSpeed: {
        default: 10,
        distribution: { type: "uniform", min: 6, max: 15 },
      },
      searchParams: {
        gapAcceptanceS: { type: "normal", mean: 2, std: 0.8, min: 0.5, max: 5 },
        turningSpeedMps: { type: "uniform", min: 2, max: 8 },
        fullStop: { type: "categorical", values: [true, false] } as any,
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 1 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "min_gap_below", threshold: 0.5 },
  ],

  durationS: {
    default: 10,
    distribution: { type: "uniform", min: 6, max: 15 },
  },
};
