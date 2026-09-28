import type { MultiActor } from "@groundwork/contracts";
import { dimensions, project } from "../geometry.js";
import type { VehicleState } from "./types.js";
import type { MapModel } from "../../index.js";

/**
 * 查找指定车道上 state 前方最近的车辆（前车）。
 *
 * @param state 本车状态
 * @param snapshot 当前所有车辆状态快照
 * @param roads 道路 Map（id → road）
 * @param actors 所有 actor 配置
 * @param laneId 目标车道（默认 state.laneId）
 * @param laneGroup 可选：该车道的预分组，传入则直接扫描该组，避免 O(n) 全量过滤
 * @param specJunction 是否为路口模式（用 route 计算累积距离）
 */
export function findLeader(
  state: VehicleState,
  snapshot: VehicleState[],
  roads: Map<string, MapModel["roads"][number]>,
  actors: readonly MultiActor[],
  laneId = state.laneId,
  laneGroup?: VehicleState[],
  specJunction = false,
):
  | {
      state: VehicleState;
      gap: number;
      offset: number;
      distance: number;
    }
  | undefined {
  const road = roads.get(laneId)!;
  const own = project(road, state).s;
  const candidates = laneGroup ?? snapshot;
  const stateActor = actors.find((a) => a.id === state.id)!;
  let best:
    | {
        state: VehicleState;
        gap: number;
        offset: number;
        distance: number;
      }
    | undefined;

  for (const other of candidates) {
    if (other.id === state.id) continue;
    const p = project(road, other);
    let offset = p.s - own;
    let distance = p.distance;

    if (specJunction && !state.change) {
      const route = stateActor.route;
      const otherIndex = route.indexOf(other.laneId, state.routeIndex);
      if (otherIndex < 0) {
        distance = Infinity;
      } else {
        offset =
          route
            .slice(state.routeIndex, otherIndex)
            .reduce((sum: number, id: string) => sum + roads.get(id)!.lengthM, 0) +
          other.s -
          state.s;
        distance = 0;
      }
    }

    if (offset <= 0 || distance >= road.widthM / 2 + 0.25) continue;

    const actor = actors.find((a) => a.id === other.id)!;
    const gap =
      offset -
      (dimensions(actor.vehicleType).lengthM +
        dimensions(stateActor.vehicleType).lengthM) /
        2;

    if (!best || gap < best.gap)
      best = { state: other, gap, offset, distance };
  }
  return best;
}
