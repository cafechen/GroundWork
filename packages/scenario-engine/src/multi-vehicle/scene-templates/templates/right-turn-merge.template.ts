/**
 * 右转汇入冲突场景模板（right_turn_merge）。
 *
 * 拓扑：车辆在路口右转汇入主路，与主路直行车辆冲突。
 *
 * 对应 wanji-new 中的场景：
 *   - right_turn_merge
 *   - right_turn_conflict
 *   - crossing_conflict (右转与横向直行)
 */

import type { SceneTemplate } from "../types.js";

export const rightTurnMergeTemplate: SceneTemplate = {
  id: "right_turn_merge",
  name: "右转汇入冲突",
  description: "车辆右转汇入主路，与主路直行车辆或非机动车冲突。",
  tags: ["路口", "右转", "汇入", "横向冲突"],
  category: "intersection",
  dangerLevelRange: [2, 5],

  mapRequirements: {
    needsJunction: true,
    needsRightTurnLane: true,
  },

  roles: [
    {
      id: "ego",
      label: "右转车（被测）",
      laneType: "right_turn",
      direction: "right_turn",
      behaviorModel: "right-turn",
      isEgo: true,
      vehicleType: "car",
      initialSpeed: {
        default: 10,
        distribution: { type: "uniform", min: 6, max: 15 },
      },
      searchParams: {
        gapAcceptanceS: { type: "normal", mean: 3, std: 1, min: 1, max: 8 },
        turningSpeedMps: { type: "uniform", min: 2, max: 8 },
        fullStop: { type: "categorical", values: [true, false] } as any,
      },
    },
    {
      id: "through",
      label: "横向直行车",
      laneType: "through",
      direction: "cross",
      behaviorModel: "through-traffic",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "crossing",
        distanceDistribution: { type: "uniform", min: 20, max: 100 },
      },
      initialSpeed: {
        default: 12,
        distribution: { type: "uniform", min: 8, max: 18 },
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
    default: 10,
    distribution: { type: "uniform", min: 6, max: 15 },
  },
};
