import type { MultiActor, ScenarioEvent } from "@groundwork/contracts";
import { dimensions, project } from "../geometry.js";
import type { VehicleState } from "./types.js";
import type { MapModel } from "../../index.js";

/**
 * 判断当前车辆是否可以执行变道事件。
 *
 * 检查：
 * - 横向距离是否可达
 * - 剩余距离是否足够完成变道 + 安全余量
 * - 目标车道的前后车距是否满足 minimumTargetGapM
 */
export function canChangeLane(
  s: VehicleState,
  e: ScenarioEvent,
  roads: Map<string, MapModel["roads"][number]>,
  byLane: Map<string, VehicleState[]>,
  actors: readonly MultiActor[],
): boolean {
  const road = roads.get(e.targetLaneId!)!;
  const p = project(road, s);
  if (
    p.distance > roads.get(s.laneId)!.widthM + road.widthM ||
    p.s + s.speed * e.durationS + 8 > road.lengthM
  )
    return false;

  const targetGroup = byLane.get(e.targetLaneId!);
  if (!targetGroup) return true;

  const stateActor = actors.find((a) => a.id === s.id)!;
  for (const other of targetGroup) {
    if (other.id === s.id) continue;
    const q = project(road, other);
    if (q.distance > road.widthM / 2 + 0.25) continue;
    const otherActor = actors.find((a) => a.id === other.id)!;
    const halfLengths =
      (dimensions(stateActor.vehicleType).lengthM +
        dimensions(otherActor.vehicleType).lengthM) /
      2;
    if (Math.abs(q.s - p.s) - halfLengths < e.minimumTargetGapM)
      return false;
  }
  return true;
}
