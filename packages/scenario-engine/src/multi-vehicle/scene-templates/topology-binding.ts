/**
 * 拓扑候选生成器（Topology Candidate Generator）。
 *
 * 给定一张地图 + 一个场景模板，扫描地图找出所有能匹配模板拓扑结构的候选位置。
 * 每个候选 = 一组具体的 laneId 分配 + 初始位置。
 *
 * 设计原则：
 *   - 只做 O(车道数) 的扫描，不穷举所有组合
 *   - 输出候选数控制在 3~10 个（给 LLM 做选择题）
 *   - 候选质量从高到低排序
 */

import type { MapModel } from "../../index.js";
import type { SceneTemplate, RoleSpec, TemplateBinding } from "./types.js";
import { sceneTemplates } from "./registry.js";
import {
  getLeftNeighbor,
  getRightNeighbor,
  getSameRoadLanes,
  isJunctionRoad,
  roadLength,
} from "../behavior-models/map-utils.js";

/** 一条车道的简化信息（用于拓扑匹配） */
type LaneInfo = {
  id: string;
  lengthM: number;
  widthM: number;
  laneIndex: number; // 同道路内的编号（0 = 最右，越大越左）
  isJunction: boolean;
  /** 车道类型（推断的） */
  laneType: "through" | "left_turn" | "right_turn" | "shared";
};

/**
 * 从 MapModel 中提取车道信息，并推断车道类型。
 *
 * 车道类型推断规则（中国靠右行驶）：
 *   - 同一条道路有 N 条同向车道
 *   - 最右侧车道 = 右转/辅道
 *   - 最左侧车道 = 左转/快车道
 *   - 中间车道 = 直行车道
 *   - junction 道路根据 junction.turn 判断
 */
export function extractLaneInfo(map: MapModel): LaneInfo[] {
  // 用 BFS 从每条非路口车道出发，找到同一条道路的所有车道
  const visited = new Set<string>();
  const roadGroups: string[][] = []; // 每条道路的 laneId 列表

  for (const road of map.roads) {
    if (isJunctionRoad(road)) continue; // 路口车道单独处理
    if (visited.has(road.id)) continue;

    const group = getSameRoadLanes(road.id, map);
    if (group.length === 0) continue;
    for (const id of group) visited.add(id);

    // 按 left/right 关系排序（最右排最前）
    const sorted = sortLanesLeftToRight(group, map);
    roadGroups.push(sorted);
  }

  const lanes: LaneInfo[] = [];

  // 非路口车道
  for (const group of roadGroups) {
    const n = group.length;
    for (let i = 0; i < n; i++) {
      const laneId = group[i]!;
      const road = map.roads.find((r) => r.id === laneId);
      if (!road) continue;

      let laneType: LaneInfo["laneType"] = "through";
      if (n >= 2) {
        if (i === 0) laneType = "right_turn"; // 最右
        if (i === n - 1) laneType = "left_turn"; // 最左
        if (n >= 3 && i > 0 && i < n - 1) laneType = "through";
      }

      lanes.push({
        id: laneId,
        lengthM: roadLength(road),
        widthM: road.widthM,
        laneIndex: i,
        isJunction: false,
        laneType,
      });
    }
  }

  // 路口车道
  for (const road of map.roads) {
    if (!isJunctionRoad(road)) continue;
    let laneType: LaneInfo["laneType"] = "through";
    if (road.junction?.turn === "left") laneType = "left_turn";
    if (road.junction?.turn === "right") laneType = "right_turn";

    lanes.push({
      id: road.id,
      lengthM: roadLength(road),
      widthM: road.widthM,
      laneIndex: 0,
      isJunction: true,
      laneType,
    });
  }

  return lanes;
}

/**
 * 把一组同道路的车道按从右到左排序（0 = 最右）。
 * 通过 adjacentSameDirection 的 left/right 关系推断。
 */
function sortLanesLeftToRight(laneIds: string[], map: MapModel): string[] {
  if (laneIds.length <= 1) return [...laneIds];

  // 找最右边的车道（左边有邻居，但右边没有）
  const first = laneIds[0];
  if (!first) return [...laneIds];
  let rightmost = first;
  for (const id of laneIds) {
    if (!getRightNeighbor(id, map)) {
      rightmost = id;
      break;
    }
  }

  // 从最右开始，依次找左边邻居
  const sorted: string[] = [rightmost];
  let current = rightmost;
  while (sorted.length < laneIds.length) {
    const left = getLeftNeighbor(current, map);
    if (!left || !laneIds.includes(left)) break;
    sorted.push(left);
    current = left;
  }

  // 如果排序失败（关系不完整），退回原顺序
  if (sorted.length < laneIds.length) {
    return [...laneIds];
  }

  return sorted;
}

/**
 * 道路组 = 一组同向非路口车道 + 关联的路口车道。
 */
type RoadGroup = {
  /** 同向非路口车道（从右到左排序） */
  forwardLanes: LaneInfo[];
  /** 关联的路口车道 */
  junctionLanes: LaneInfo[];
};

/**
 * 把车道分成道路组（每组 = 一条道路的所有同向车道 + 关联路口车道）。
 */
function buildRoadGroups(lanes: LaneInfo[], map: MapModel): RoadGroup[] {
  const forwardLanes = lanes.filter((l) => !l.isJunction);
  const junctionLanes = lanes.filter((l) => l.isJunction);

  // 用 getSameRoadLanes 找到每条独立道路
  const visited = new Set<string>();
  const groups: RoadGroup[] = [];

  for (const lane of forwardLanes) {
    if (visited.has(lane.id)) continue;

    const sameRoadIds = getSameRoadLanes(lane.id, map);
    const groupLanes = forwardLanes.filter((l) => sameRoadIds.includes(l.id));

    // 按 laneIndex 排序（从右到左）
    const sorted = groupLanes.sort((a, b) => a.laneIndex - b.laneIndex);

    for (const l of sorted) visited.add(l.id);

    // 找关联的路口车道：junction.from 包含本道路某条车道的
    const relatedJunction = junctionLanes.filter((jl) => {
      const road = map.roads.find((r) => r.id === jl.id);
      if (!road?.junction) return false;
      return sameRoadIds.includes(road.junction.from);
    });

    groups.push({
      forwardLanes: sorted,
      junctionLanes: relatedJunction,
    });
  }

  return groups;
}

/**
 * 为给定模板和地图生成拓扑候选（绑定方案）。
 *
 * 返回的候选数控制在 maxCandidates 以内，按质量排序。
 */
export function generateTopologyCandidates(
  template: SceneTemplate,
  map: MapModel,
  maxCandidates = 8,
): TemplateBinding[] {
  const allLanes = extractLaneInfo(map);
  const roadGroups = buildRoadGroups(allLanes, map);

  if (roadGroups.length === 0) return [];

  const candidates: TemplateBinding[] = [];

  for (const group of roadGroups) {
    // 检查地图需求是否满足
    if (!checkMapRequirements(template, group)) continue;

    // 根据模板的角色定义，生成具体的车道分配
    const roleBindings = generateRoleBindings(template, group, map);
    for (const binding of roleBindings) {
      candidates.push({
        templateId: template.id,
        mapId: map.mapId,
        roleLanes: binding.roleLanes,
        initialDistances: binding.distances,
        bindingQuality: binding.quality,
      });
    }
  }

  // 按质量排序，取前 N 个
  candidates.sort((a, b) => b.bindingQuality - a.bindingQuality);
  return candidates.slice(0, maxCandidates);
}

/**
 * 检查模板的地图需求是否被满足。
 */
function checkMapRequirements(
  template: SceneTemplate,
  group: RoadGroup,
): boolean {
  const req = template.mapRequirements;
  const forwardCount = group.forwardLanes.length;
  const hasJunction = group.junctionLanes.length > 0;

  if (req.needsJunction && !hasJunction) return false;
  if (req.minLanesPerDirection && forwardCount < req.minLanesPerDirection)
    return false;
  if (req.minThroughLanesPerDirection) {
    const throughCount = group.forwardLanes.filter(
      (l) => l.laneType === "through" || l.laneType === "shared",
    ).length;
    // 如果车道少，把所有车道都当作可用
    if (
      throughCount < req.minThroughLanesPerDirection &&
      forwardCount < req.minThroughLanesPerDirection
    ) {
      return false;
    }
  }
  if (req.needsLeftTurnLane) {
    const hasLeft = group.forwardLanes.some((l) => l.laneType === "left_turn");
    const hasJunctionLeft = group.junctionLanes.some(
      (l) => l.laneType === "left_turn",
    );
    if (!hasLeft && !hasJunctionLeft) return false;
  }
  if (req.needsRightTurnLane) {
    const hasRight = group.forwardLanes.some(
      (l) => l.laneType === "right_turn",
    );
    const hasJunctionRight = group.junctionLanes.some(
      (l) => l.laneType === "right_turn",
    );
    if (!hasRight && !hasJunctionRight) return false;
  }
  if (req.needsOppositeLane) {
    // 简化：至少要有 2 条同向车道（一条可以近似当作对向）
    // 实际地图中对向车道的识别需要更复杂的拓扑判断
    if (forwardCount < 2 && !hasJunction) return false;
  }

  return true;
}

type RoleBindingResult = {
  roleLanes: Record<
    string,
    { laneId: string; initialS: number; route: string[] }
  >;
  distances: Record<string, number>;
  quality: number;
};

/**
 * 为模板的每个角色分配具体的车道和初始位置。
 * 根据角色之间的位置关系（same_lane / adjacent_left / opposite 等）生成组合。
 *
 * 为了控制候选数量，锚点角色遍历所有候选车道，其他角色按关系计算。
 */
function generateRoleBindings(
  template: SceneTemplate,
  group: RoadGroup,
  map: MapModel,
): RoleBindingResult[] {
  const roles = template.roles;
  if (roles.length === 0) return [];

  const results: RoleBindingResult[] = [];

  // 策略：以第一个角色为锚点，其他角色根据位置关系偏移
  const anchorRole = roles[0];
  if (!anchorRole) return [];
  const otherRoles = roles.slice(1);

  const anchorLanes = getCandidateLanesForRole(anchorRole, group);

  // 对每个锚点车道，生成其他角色的位置
  for (const anchorLane of anchorLanes) {
    const binding: RoleBindingResult["roleLanes"] = {};
    const distances: Record<string, number> = {};

    // 锚点初始位置（车道 30% 处，留够行驶距离）
    const anchorInitialS = Math.min(anchorLane.lengthM * 0.3, 50);

    binding[anchorRole.id] = {
      laneId: anchorLane.id,
      initialS: anchorInitialS,
      route: buildRoute(anchorLane, group, template, anchorRole, map),
    };

    let quality = 1.0;
    let valid = true;

    const anchorBinding = binding[anchorRole.id];
    if (!anchorBinding) {
      valid = false;
      break;
    }

    for (const role of otherRoles) {
      const placed = placeRoleRelativeTo(
        role,
        anchorRole.id,
        anchorBinding,
        group,
        map,
      );

      if (!placed) {
        valid = false;
        break;
      }

      binding[role.id] = placed.lane;
      distances[role.id] = placed.distance;
      quality *= placed.quality;
    }

    if (valid) {
      results.push({ roleLanes: binding, distances, quality });
    }
  }

  return results;
}

/**
 * 获取某个角色可以选的所有候选车道。
 */
function getCandidateLanesForRole(
  role: RoleSpec,
  group: RoadGroup,
): LaneInfo[] {
  switch (role.laneType) {
    case "through":
    case "shared": {
      const through = group.forwardLanes.filter(
        (l) => l.laneType === "through" || l.laneType === "shared",
      );
      // 如果没有明确的 through 车道，所有非路口车道都算
      return through.length > 0 ? through : group.forwardLanes;
    }
    case "left_turn": {
      const left = group.forwardLanes.filter((l) => l.laneType === "left_turn");
      if (left.length > 0) return left;
      // 没有明确左转车道，用最左车道
      if (group.forwardLanes.length > 0) {
        return [group.forwardLanes[group.forwardLanes.length - 1]!];
      }
      return [];
    }
    case "right_turn": {
      const right = group.forwardLanes.filter(
        (l) => l.laneType === "right_turn",
      );
      if (right.length > 0) return right;
      if (group.forwardLanes.length > 0) {
        return [group.forwardLanes[0]!];
      }
      return [];
    }
    case "opposite":
      // 对向：简化用最左车道近似（实际应该用另一方向的道路）
      if (group.forwardLanes.length >= 2) {
        return [group.forwardLanes[group.forwardLanes.length - 1]!];
      }
      return [];
    case "bicycle":
    case "sidewalk":
      // 简化：最右车道当作非机动车道
      if (group.forwardLanes.length > 0) {
        return [group.forwardLanes[0]!];
      }
      return [];
    default:
      return group.forwardLanes;
  }
}

/**
 * 根据相对位置关系，把一个角色放到相对于锚点的位置。
 */
function placeRoleRelativeTo(
  role: RoleSpec,
  _anchorId: string,
  anchorLane: { laneId: string; initialS: number; route: string[] },
  group: RoadGroup,
  map: MapModel,
): {
  lane: { laneId: string; initialS: number; route: string[] };
  distance: number;
  quality: number;
} | null {
  const pos = role.position;
  const anchorInfo =
    group.forwardLanes.find((l) => l.id === anchorLane.laneId) ||
    group.junctionLanes.find((l) => l.id === anchorLane.laneId);

  if (!anchorInfo) return null;

  let targetLane: LaneInfo | null = null;
  let distance = 30;
  let quality = 1.0;

  if (!pos) {
    targetLane = anchorInfo;
  } else {
    switch (pos.relation) {
      case "same_lane":
      case "ahead":
      case "behind":
        targetLane = anchorInfo;
        distance = pos.distanceM ?? (pos.relation === "behind" ? -20 : 30);
        break;

      case "adjacent_left": {
        const leftId = getLeftNeighbor(anchorLane.laneId, map);
        if (leftId) {
          targetLane = group.forwardLanes.find((l) => l.id === leftId) || null;
          if (!targetLane) {
            targetLane = {
              id: leftId,
              lengthM: 100,
              widthM: 3.5,
              laneIndex: 0,
              isJunction: false,
              laneType: "through",
            };
            quality = 0.7;
          }
        }
        if (!targetLane) {
          // 没有左边，用最左车道
          if (group.forwardLanes.length > 0) {
            targetLane = group.forwardLanes[group.forwardLanes.length - 1]!;
            quality = 0.5;
          }
        }
        distance = pos.distanceM ?? 10;
        break;
      }

      case "adjacent_right": {
        const rightId = getRightNeighbor(anchorLane.laneId, map);
        if (rightId) {
          targetLane = group.forwardLanes.find((l) => l.id === rightId) || null;
          if (!targetLane) {
            targetLane = {
              id: rightId,
              lengthM: 100,
              widthM: 3.5,
              laneIndex: 0,
              isJunction: false,
              laneType: "through",
            };
            quality = 0.7;
          }
        }
        if (!targetLane) {
          if (group.forwardLanes.length > 0) {
            targetLane = group.forwardLanes[0]!;
            quality = 0.5;
          }
        }
        distance = pos.distanceM ?? 10;
        break;
      }

      case "opposite_lane":
        // 对向车道：简化用最左车道近似
        if (group.forwardLanes.length >= 2) {
          targetLane = group.forwardLanes[group.forwardLanes.length - 1]!;
          quality = 0.6; // 近似
        } else if (group.junctionLanes.length > 0) {
          targetLane = group.junctionLanes[0] ?? null;
          quality = 0.4;
        }
        distance = pos.distanceM ?? 80;
        break;

      case "crossing": {
        // 交叉方向：用 junction 的横向道路
        if (group.junctionLanes.length > 0) {
          // 找一条和 anchor 方向不同的
          const cross = group.junctionLanes.find((jl) => {
            const road = map.roads.find((r) => r.id === jl.id);
            const anchorRoad = map.roads.find((r) => r.id === anchorInfo.id);
            if (!road?.junction || !anchorRoad) return false;
            return (
              road.junction.from !== anchorRoad.id &&
              road.junction.to !== anchorRoad.id
            );
          });
          targetLane = cross ?? group.junctionLanes[0] ?? null;
          quality = cross ? 0.9 : 0.6;
        } else {
          targetLane = anchorInfo;
          quality = 0.3;
        }
        distance = pos.distanceM ?? 50;
        break;
      }
    }
  }

  if (!targetLane) return null;

  // 计算初始 s：锚点 s + 距离（正向加，负向减）
  let initialS = anchorLane.initialS + distance;
  if (initialS < 5) initialS = 5;
  if (initialS > targetLane.lengthM - 10) {
    initialS = Math.max(5, targetLane.lengthM - 20);
  }

  return {
    lane: {
      laneId: targetLane.id,
      initialS,
      route: buildRoute(targetLane, group, templateFromRole(role), role, map),
    },
    distance,
    quality,
  };
}

/** 从单个角色构造一个"极简模板"用于 buildRoute */
function templateFromRole(_role: RoleSpec): SceneTemplate {
  return {
    id: "dummy",
    name: "",
    description: "",
    tags: [],
    mapRequirements: {},
    roles: [],
    dangerCriteria: [],
    durationS: { default: 10 },
    category: "other",
    dangerLevelRange: [1, 5],
  };
}

/**
 * 为一个角色构建 route（它会经过哪些车道）。
 * 简化：当前车道 + 路口车道 + 出口车道。
 */
function buildRoute(
  startLane: LaneInfo,
  group: RoadGroup,
  _template: SceneTemplate,
  role: RoleSpec,
  map: MapModel,
): string[] {
  const route: string[] = [startLane.id];

  // 如果是转弯/直行/掉头角色，加上对应的 junction 车道
  if (
    role.direction === "straight" ||
    role.direction === "left_turn" ||
    role.direction === "right_turn" ||
    role.direction === "u_turn"
  ) {
    if (group.junctionLanes.length > 0) {
      // 找一条方向匹配的 junction 车道
      const startRoad = map.roads.find((r) => r.id === startLane.id);
      let junctionLane: LaneInfo | undefined;

      if (startRoad) {
        // 通过 junction.from 匹配
        const matching = group.junctionLanes.find((jl) => {
          const jRoad = map.roads.find((r) => r.id === jl.id);
          return jRoad?.junction?.from === startRoad.id;
        });
        junctionLane = matching;
      }

      if (!junctionLane) {
        // 按方向匹配
        const turnMap: Record<string, string> = {
          straight: "through",
          left_turn: "left_turn",
          right_turn: "right_turn",
          u_turn: "left_turn",
        };
        const targetType = turnMap[role.direction];
        junctionLane =
          group.junctionLanes.find((jl) => jl.laneType === targetType) ||
          group.junctionLanes[0];
      }

      if (junctionLane) {
        route.push(junctionLane.id);

        // 出口车道：找 junction.to 对应的
        const jRoad = map.roads.find((r) => r.id === junctionLane!.id);
        if (jRoad?.junction?.to) {
          route.push(jRoad.junction.to);
        } else if (group.forwardLanes.length > 0) {
          // 简化：用一条 forward lane 当出口
          const exitLane =
            group.forwardLanes.find((l) => l.laneType === startLane.laneType) ||
            group.forwardLanes[0];
          if (exitLane && exitLane.id !== startLane.id) {
            route.push(exitLane.id);
          }
        }
      }
    }
  }

  return route;
}

/**
 * 为所有模板生成拓扑候选。
 * 返回 { templateId: candidates[] } 的 map。
 */
export function generateAllTopologyCandidates(
  map: MapModel,
  maxPerTemplate = 5,
): Record<string, TemplateBinding[]> {
  const result: Record<string, TemplateBinding[]> = {};
  for (const template of sceneTemplates) {
    const candidates = generateTopologyCandidates(
      template,
      map,
      maxPerTemplate,
    );
    if (candidates.length > 0) {
      result[template.id] = candidates;
    }
  }
  return result;
}
