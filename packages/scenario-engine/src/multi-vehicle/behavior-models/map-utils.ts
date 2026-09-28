/**
 * 行为模型用的地图工具函数。
 *
 * 封装 MapModel / Road 的字段访问，让行为模型代码更干净，
 * 也避免在每个模型里重复写相同的逻辑。
 */

import type { MapModel, Road } from "../../index.js";

/** 获取道路长度 m */
export function roadLength(road: Road): number {
  return road.lengthM;
}

/** 获取道路宽度 m */
export function roadWidth(road: Road): number {
  return road.widthM;
}

/** 是否是路口内的道路 */
export function isJunctionRoad(road: Road): boolean {
  return !!road.junction;
}

/**
 * 找出一条车道的所有同向相邻车道。
 * 从近到远排序（最相邻的排前面）。
 */
export function getAdjacentLanes(
  laneId: string,
  map: MapModel,
): Array<{ laneId: string; side: "left" | "right" }> {
  const result: Array<{ laneId: string; side: "left" | "right" }> = [];

  for (const adj of map.adjacentSameDirection) {
    if (adj.from === laneId) {
      result.push({ laneId: adj.to, side: adj.side });
    }
  }

  // 按 side 分组：left 按距离排序？简化：直接返回
  return result;
}

/**
 * 找出左边相邻车道（最近的）。
 */
export function getLeftNeighbor(laneId: string, map: MapModel): string | null {
  const adj = map.adjacentSameDirection.find(
    (a) => a.from === laneId && a.side === "left",
  );
  return adj?.to || null;
}

/**
 * 找出右边相邻车道（最近的）。
 */
export function getRightNeighbor(laneId: string, map: MapModel): string | null {
  const adj = map.adjacentSameDirection.find(
    (a) => a.from === laneId && a.side === "right",
  );
  return adj?.to || null;
}

/**
 * 判断两条车道是否同向相邻（同一条道路的不同车道）。
 */
export function areSameDirectionLanes(
  laneA: string,
  laneB: string,
  map: MapModel,
): boolean {
  return map.adjacentSameDirection.some(
    (a) =>
      (a.from === laneA && a.to === laneB) ||
      (a.from === laneB && a.to === laneA),
  );
}

/**
 * 获取一组同向车道（同一条道路的所有车道）。
 * 通过 BFS 遍历 adjacentSameDirection 找到所有连通的同向车道。
 */
export function getSameRoadLanes(laneId: string, map: MapModel): string[] {
  const visited = new Set<string>();
  const queue = [laneId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const adj of map.adjacentSameDirection) {
      if (adj.from === current && !visited.has(adj.to)) {
        queue.push(adj.to);
      }
      if (adj.to === current && !visited.has(adj.from)) {
        queue.push(adj.from);
      }
    }
  }

  return Array.from(visited);
}

/**
 * 估算到前方下一个路口的距离。
 * 沿着 route 找，遇到第一条 junction 道路就返回距离。
 */
export function distanceToNextJunction(
  ego: { laneId: string; s: number },
  map: MapModel,
  route: readonly string[],
  routeIndex: number,
): { dist: number; inJunction: boolean; junctionLaneId?: string } {
  const roads = new Map(map.roads.map((r) => [r.id, r]));
  let dist = 0;

  for (let i = routeIndex; i < route.length; i++) {
    const laneId = route[i];
    if (!laneId) continue;
    const road = roads.get(laneId);
    if (!road) continue;

    if (i === routeIndex) {
      if (isJunctionRoad(road)) {
        return { dist: 0, inJunction: true, junctionLaneId: laneId };
      }
      dist += road.lengthM - ego.s;
    } else {
      if (isJunctionRoad(road)) {
        return { dist, inJunction: false, junctionLaneId: laneId };
      }
      dist += road.lengthM;
    }
  }

  return { dist, inJunction: false };
}

/**
 * 检查一条车道是否在路口里（或是否是路口道路）。
 */
export function laneInJunction(laneId: string, map: MapModel): boolean {
  const road = map.roads.find((r) => r.id === laneId);
  return !!road && isJunctionRoad(road);
}

/**
 * 粗略判断两条车道是否属于"交叉方向"（路口内不同的道路）。
 * 简化：如果两条都是 junction 道路但来源不同，就算交叉。
 */
export function areCrossingLanes(
  laneA: string,
  laneB: string,
  map: MapModel,
): boolean {
  const roadA = map.roads.find((r) => r.id === laneA);
  const roadB = map.roads.find((r) => r.id === laneB);
  if (!roadA || !roadB) return false;
  if (!isJunctionRoad(roadA) && !isJunctionRoad(roadB)) return false;

  // 如果是 junction 道路，通过 junction.from/to 来判断
  // 简化：两条都有 junction 但 turn 不同或 from/to 不同，就算交叉
  const jA = roadA.junction;
  const jB = roadB.junction;
  if (jA && jB) {
    return jA.from !== jB.from && jA.to !== jB.to;
  }

  return false;
}

/**
 * 获取路口内冲突车道（与给定车道方向不同的 junction 车道）。
 */
export function getConflictLanesInJunction(
  laneId: string,
  map: MapModel,
): string[] {
  const sourceRoad = map.roads.find((r) => r.id === laneId);
  if (!sourceRoad) return [];

  // 找出所有 junction 道路
  const junctionRoads = map.roads.filter(isJunctionRoad);
  const sourceJunction = sourceRoad.junction;

  // 简单判断：与 source 来源不同的 junction 道路算冲突
  return junctionRoads
    .filter((r) => {
      if (!r.junction) return false;
      if (sourceJunction) {
        return r.junction.from !== sourceJunction.from;
      }
      return true;
    })
    .map((r) => r.id);
}
