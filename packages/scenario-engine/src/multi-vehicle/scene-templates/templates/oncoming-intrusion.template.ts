/**
 * 对向越线闯入场景模板（oncoming_intrusion / opposite intrusion）。
 *
 * 拓扑：对向车辆越过中心线闯入本车道，与本车冲突。
 *
 * 对应 wanji-new 中的场景：
 *   - oncoming_intrusion
 *   - opposite_lane_intrusion
 *   - head_on_risk
 */

import type { SceneTemplate } from "../types.js";

export const oncomingIntrusionTemplate: SceneTemplate = {
  id: "oncoming_intrusion",
  name: "对向越线闯入",
  description: "对向车辆越过中心线闯入本车道，造成迎面碰撞风险。",
  tags: ["对向", "越线", "迎面碰撞", "占道"],
  category: "opposite",
  dangerLevelRange: [3, 5],

  mapRequirements: {
    needsOppositeLane: true,
    minThroughLanesPerDirection: 1,
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
      id: "intruder",
      label: "对向越线车",
      laneType: "opposite",
      direction: "opposite",
      behaviorModel: "opposite-intrusion",
      vehicleType: "car",
      position: {
        relativeTo: "ego",
        relation: "opposite_lane",
        distanceDistribution: { type: "uniform", min: 50, max: 200 },
      },
      initialSpeed: {
        default: 12,
        distribution: { type: "uniform", min: 8, max: 20 },
      },
      searchParams: {
        triggerTtcS: { type: "uniform", min: 1, max: 5 },
        intrusionDepthM: { type: "uniform", min: 0.3, max: 3.5 },
        intrusionDurationS: { type: "uniform", min: 0.5, max: 5 },
        lateralSpeedMps: {
          type: "normal",
          mean: 1,
          std: 0.3,
          min: 0.3,
          max: 2.5,
        },
        returnToLane: { type: "categorical", values: [true, false] } as any,
      },
    },
  ],

  dangerCriteria: [
    { type: "collision", minSpeedDelta: 5 },
    { type: "ttc_below", threshold: 1.5 },
    { type: "lane_intrusion", depth: 0.5, direction: "opposite" },
  ],

  durationS: {
    default: 8,
    distribution: { type: "uniform", min: 5, max: 15 },
  },
};
