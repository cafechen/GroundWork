/**
 * 行为驱动模拟器（behavior-driven simulator）。
 *
 * 这是四层架构的"执行层"：
 *   模板（Layer 2）+ 拓扑绑定 + 搜索引擎给出的一组具体参数（Layer 3）
 *     → 为每个角色实例化行为积木（Layer 1）
 *     → 逐积分行为模型输出的动作（纵向加速度 / 目标车道 / 横向偏移）
 *     → 产出真实轨迹，并按模板的危险判据评估危险度
 *
 * 与 simulation.ts 的区别：
 *   - simulation.ts 消费契约层的 SceneSpecV2（事件触发 + 内置 IDM），用于既有的 7 个固定场景；
 *   - 本模块直接消费"行为模型 + 参数"，模型即策略，搜索空间即模型参数，
 *     是新架构"调用行为 + 生成轨迹"的落地。
 *
 * 行为与轨迹在这里解耦：模型只输出动作（加速度/目标车道/横向偏移），
 * 本模块负责把动作积分为物理轨迹。同一个模型 + 不同参数/周边 → 不同轨迹。
 */

import type { MapModel, Road } from "../index.js";
import { lanePoint, dimensions, overlaps } from "./geometry.js";
import {
  getLeftNeighbor,
  getRightNeighbor,
  roadWidth,
} from "./behavior-models/map-utils.js";
import { createModel, getModelMetadata } from "./behavior-models/index.js";
import type {
  BehaviorModel,
  BehaviorContext,
} from "./behavior-models/index.js";
import type { VehicleState } from "./simulation/types.js";
import type {
  SceneTemplate,
  TemplateBinding,
  DangerCriterion,
} from "./scene-templates/types.js";
import type { FitnessEvaluator } from "./scene-search/scene-searcher.js";

/** 默认积分步长 s（行为模型不需要 0.05 那么细，0.1 足够且快） */
export const BEHAVIOR_DT = 0.1;
/** 一次变道的持续时间 s */
const LANE_CHANGE_TIME_S = 2.5;

/** 轨迹点 */
export type TrajectoryPoint = {
  t: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  s: number;
  laneId: string;
};

/** 一次仿真测到的危险度量 */
export type DangerMetrics = {
  /** 是否发生碰撞（footprint 重叠） */
  collided: boolean;
  collisionTime?: number;
  collisionPair?: [string, string];
  /** 碰撞时刻的相对速度 m/s */
  collisionSpeedDelta?: number;
  /** 全程最小接近 TTC（不接近为 Infinity） */
  minTtc: number;
  /** 全程最小边缘间距 m（中心距减车长） */
  minGapM: number;
  /** 最大接近速度 m/s */
  maxClosingSpeed: number;
  /** 对向越线模型的最大越线深度 m */
  maxIntrusionM: number;
  /** 命中的危险判据类型 */
  criteriaHit: string[];
};

/** 行为仿真结果 */
export type BehaviorSimulationResult = {
  /** 危险适应度 0-1（供搜索引擎排序） */
  fitness: number;
  metrics: DangerMetrics;
  /** roleId → 轨迹 */
  trajectories: Record<string, TrajectoryPoint[]>;
  /** 实际仿真结束时刻；碰撞提前终止时小于模板计划时长 */
  durationS: number;
  /** 参数本身无效（初始重叠/超出车道等），fitness 记 0 */
  invalid?: boolean;
  invalidReason?: string;
};

/** 运行期角色状态 */
type Runtime = {
  roleId: string;
  modelName: string;
  isEgo: boolean;
  model: BehaviorModel;
  route: string[];
  routeIndex: number;
  laneId: string;
  s: number;
  speed: number;
  x: number;
  y: number;
  heading: number;
  lengthM: number;
  widthM: number;
  /** 变道引入的横向位移（0 → ±laneWidth） */
  baseLat: number;
  /** 模型自身输出的横向偏移（VRU 摆动 / 越线深度） */
  extraLat: number;
  /** 变道过程 */
  change: { to: string; dir: 1 | -1; t: number; w: number } | null;
  /** 越线方向（朝 ego 的一侧），首次越线时确定 */
  intrusionDir: 1 | -1 | 0;
};

/** 组装单个角色的模型参数：元数据默认值 ← 模板固定覆盖 ← 搜索采样值 */
function buildModelParams(
  template: SceneTemplate,
  roleId: string,
  values: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> | null {
  const role = template.roles.find((r) => r.id === roleId);
  if (!role) return null;

  const meta = getModelMetadata(role.behaviorModel);
  const out: Record<string, number | string | boolean> = {};

  // 1. 模型元数据默认值
  if (meta) {
    for (const [k, spec] of Object.entries(meta.params)) out[k] = spec.default;
  }
  // 2. 模板固定参数
  Object.assign(out, role.modelParams ?? {});
  // 3. 搜索采样到的该角色参数
  const prefix = `${roleId}.`;
  for (const [key, val] of Object.entries(values)) {
    if (!key.startsWith(prefix)) continue;
    const paramName = key.slice(prefix.length);
    if (paramName === "__speed__" || paramName === "__distance__") continue;
    out[paramName] = val;
  }
  return out;
}

/**
 * 运行一次完整的行为场景仿真。
 *
 * @param map      仿真所在地图
 * @param template 场景模板
 * @param binding  拓扑绑定（具体车道/初始位置/路线）
 * @param values   一组具体参数值（搜索样本的 values，或空对象用默认值）
 */
export function simulateBehaviorScene(
  map: MapModel,
  template: SceneTemplate,
  binding: TemplateBinding,
  values: Record<string, number | string | boolean> = {},
  options: { dt?: number } = {},
): BehaviorSimulationResult {
  const dt = options.dt ?? BEHAVIOR_DT;
  const durationS =
    (values["__duration__"] as number | undefined) ??
    template.durationS.default;

  const emptyMetrics = (): DangerMetrics => ({
    collided: false,
    minTtc: Infinity,
    minGapM: Infinity,
    maxClosingSpeed: 0,
    maxIntrusionM: 0,
    criteriaHit: [],
  });

  const roadMap = new Map(map.roads.map((r) => [r.id, r]));

  // ─── 1. 实例化角色 ────────────────────────────────────────────────
  const runtimes: Runtime[] = [];
  for (const role of template.roles) {
    const lane = binding.roleLanes[role.id];
    if (!lane) {
      return invalid(`角色 ${role.id} 缺少拓扑绑定`, durationS, emptyMetrics());
    }
    const road = roadMap.get(lane.laneId);
    if (!road) {
      return invalid(
        `角色 ${role.id} 绑定的车道 ${lane.laneId} 不在地图上`,
        durationS,
        emptyMetrics(),
      );
    }

    const params = buildModelParams(template, role.id, values);
    const model = params && createModel(role.behaviorModel, params);
    if (!model) {
      return invalid(
        `角色 ${role.id} 的行为模型 ${role.behaviorModel} 不可用`,
        durationS,
        emptyMetrics(),
      );
    }

    const speed =
      (values[`${role.id}.__speed__`] as number | undefined) ??
      role.initialSpeed.default;
    const dims = dimensions(role.vehicleType ?? "car");
    const route = lane.route.length ? lane.route : [lane.laneId];

    const point = lanePoint(road, lane.initialS);
    runtimes.push({
      roleId: role.id,
      modelName: role.behaviorModel,
      isEgo: !!role.isEgo,
      model,
      route,
      routeIndex: 0,
      laneId: lane.laneId,
      s: lane.initialS,
      speed,
      x: point.x,
      y: point.y,
      heading: point.heading,
      lengthM: dims.lengthM,
      widthM: dims.widthM,
      baseLat: 0,
      extraLat: 0,
      change: null,
      intrusionDir: 0,
    });
  }

  // ─── 2. 用搜索到的相对距离覆盖初始纵向间距 ─────────────────────────
  for (const role of template.roles) {
    const dist = values[`${role.id}.__distance__`];
    if (typeof dist !== "number" || !role.position) continue;
    const rt = runtimes.find((r) => r.roleId === role.id);
    const anchor = runtimes.find((r) => r.roleId === role.position!.relativeTo);
    if (!rt || !anchor) continue;

    const rel = role.position.relation;
    let targetS: number;
    if (rel === "behind") targetS = anchor.s - dist;
    else if (rel === "adjacent_left" || rel === "adjacent_right")
      targetS = anchor.s;
    else targetS = anchor.s + dist; // same_lane / ahead / opposite_lane / crossing 默认在前

    const road = roadMap.get(rt.laneId);
    const halfLen = rt.lengthM / 2;
    if (!road) continue;
    rt.s = Math.max(halfLen, Math.min(road.lengthM - halfLen, targetS));
    const p = lanePoint(road, rt.s);
    rt.x = p.x;
    rt.y = p.y;
    rt.heading = p.heading;
  }

  // ─── 3. 初始状态合法性（出生即碰撞 → 无效样本）──────────────────────
  if (anyOverlap(runtimes)) {
    return invalid("初始位置车身重叠", durationS, emptyMetrics());
  }

  // ─── 4. 轨迹记录 + 主循环 ─────────────────────────────────────────
  const trajectories: Record<string, TrajectoryPoint[]> = {};
  for (const rt of runtimes) trajectories[rt.roleId] = [];
  recordFrame(trajectories, runtimes, 0);

  const metrics = emptyMetrics();
  const egoRuntime = runtimes.find((r) => r.isEgo) ?? null;
  const steps = Math.max(1, Math.round(durationS / dt));
  // 碰撞会提前终止；记录实际结束时刻，返回的 durationS 即轨迹真实时长
  let endTimeS = 0;

  for (let stepI = 1; stepI <= steps; stepI++) {
    const time = Math.min(durationS, stepI * dt);

    // 4.1 每个角色产出动作并积分纵向
    for (const rt of runtimes) {
      const egoState = toVehicleState(rt);
      const others = runtimes.filter((r) => r !== rt).map(toVehicleState);
      const ctx: BehaviorContext = {
        ego: egoState,
        others,
        map,
        time,
        dt,
        route: rt.route,
        routeIndex: rt.routeIndex,
      };
      const out = rt.model.step(ctx);

      // 纵向积分
      rt.speed = Math.max(0, rt.speed + out.acceleration * dt);

      // 目标车道 → 启动/推进变道
      updateLaneChange(rt, out.targetLaneId, roadMap, map, dt);

      // 横向偏移（越线模型按"朝 ego"定向，其余原样使用）
      const raw = out.lateralOffsetM ?? 0;
      if (rt.modelName === "opposite-intrusion") {
        if (
          raw !== 0 &&
          rt.intrusionDir === 0 &&
          egoRuntime &&
          egoRuntime !== rt
        ) {
          const nx = -Math.sin(rt.heading);
          const ny = Math.cos(rt.heading);
          const lateral =
            (egoRuntime.x - rt.x) * nx + (egoRuntime.y - rt.y) * ny;
          rt.intrusionDir = lateral >= 0 ? 1 : -1;
        }
        rt.extraLat = raw * (rt.intrusionDir === 0 ? 1 : rt.intrusionDir);
        metrics.maxIntrusionM = Math.max(metrics.maxIntrusionM, Math.abs(raw));
      } else {
        rt.extraLat = raw;
      }

      // 纵向前进
      rt.s += rt.speed * dt;

      // 沿路线进入下一条车道（路口连接段）
      advanceAlongRoute(rt, roadMap);
    }

    // 4.2 由车道坐标 + 横向偏移重算世界坐标
    for (const rt of runtimes) {
      const road = roadMap.get(rt.laneId);
      if (!road) continue;
      const base = lanePoint(road, Math.max(0, Math.min(rt.s, road.lengthM)));
      const w = roadWidth(road);
      const lat = Math.max(
        -w * 1.5,
        Math.min(w * 1.5, rt.baseLat + rt.extraLat),
      );
      rt.heading = base.heading;
      rt.x = base.x - Math.sin(base.heading) * lat;
      rt.y = base.y + Math.cos(base.heading) * lat;
    }

    recordFrame(trajectories, runtimes, time);
    endTimeS = time;

    // 4.3 两两测危险信号
    scanPairs(runtimes, time, metrics);
    if (metrics.collided) break;
  }

  // ─── 5. 按模板判据判定命中 ────────────────────────────────────────
  metrics.criteriaHit = evaluateCriteria(template.dangerCriteria, metrics);

  const fitness = metricsToFitness(metrics);
  // 碰撞提前结束时返回实际时长（模板时长表示计划时长，未截断时二者相等）
  return { fitness, metrics, trajectories, durationS: endTimeS };
}

// ─── 内部辅助 ───────────────────────────────────────────────────────

function invalid(
  reason: string,
  durationS: number,
  metrics: DangerMetrics,
): BehaviorSimulationResult {
  return {
    fitness: 0,
    metrics,
    trajectories: {},
    durationS,
    invalid: true,
    invalidReason: reason,
  };
}

function toVehicleState(rt: Runtime): VehicleState {
  return {
    id: rt.roleId,
    laneId: rt.laneId,
    s: rt.s,
    x: rt.x,
    y: rt.y,
    heading: rt.heading,
    speed: rt.speed,
    acceleration: 0,
    routeIndex: rt.routeIndex,
  };
}

function recordFrame(
  trajectories: Record<string, TrajectoryPoint[]>,
  runtimes: Runtime[],
  t: number,
) {
  for (const rt of runtimes) {
    trajectories[rt.roleId]!.push({
      t,
      x: rt.x,
      y: rt.y,
      heading: rt.heading,
      speed: rt.speed,
      s: rt.s,
      laneId: rt.laneId,
    });
  }
}

function anyOverlap(runtimes: Runtime[]): boolean {
  for (let i = 0; i < runtimes.length; i++) {
    for (let j = i + 1; j < runtimes.length; j++) {
      const a = runtimes[i]!;
      const b = runtimes[j]!;
      if (
        overlaps(
          {
            x: a.x,
            y: a.y,
            heading: a.heading,
            lengthM: a.lengthM,
            widthM: a.widthM,
          },
          {
            x: b.x,
            y: b.y,
            heading: b.heading,
            lengthM: b.lengthM,
            widthM: b.widthM,
          },
        )
      )
        return true;
    }
  }
  return false;
}

/** 处理变道：启动、推进、完成时切换 laneId 并把世界位置投影回新车道 */
function updateLaneChange(
  rt: Runtime,
  targetLaneId: string | undefined,
  roadMap: Map<string, Road>,
  map: MapModel,
  dt: number,
) {
  if (!rt.change && targetLaneId && targetLaneId !== rt.laneId) {
    const left = getLeftNeighbor(rt.laneId, map);
    const right = getRightNeighbor(rt.laneId, map);
    let dir: 1 | -1 | null = null;
    if (targetLaneId === left) dir = 1;
    else if (targetLaneId === right) dir = -1;
    const road = roadMap.get(rt.laneId);
    if (dir && road) {
      rt.change = { to: targetLaneId, dir, t: 0, w: roadWidth(road) };
    }
  }

  if (!rt.change) {
    rt.baseLat = 0;
    return;
  }

  const ch = rt.change;
  ch.t += dt;
  const k = Math.min(1, ch.t / LANE_CHANGE_TIME_S);

  if (k >= 1) {
    // 完成变道：切换车道并把 s 投影到新车道
    const newRoad = roadMap.get(ch.to);
    rt.laneId = ch.to;
    if (newRoad)
      rt.s = Math.max(
        0,
        Math.min(newRoad.lengthM, projectS(newRoad, rt.x, rt.y)),
      );
    if (rt.route[rt.routeIndex] && rt.route[rt.routeIndex] !== ch.to) {
      rt.route[rt.routeIndex] = ch.to;
    }
    rt.change = null;
    rt.baseLat = 0;
  } else {
    rt.baseLat = ch.dir * ch.w * k;
  }
}

/** 点到车道中心线的纵向投影（局部投影，避免与 geometry.project 的 Point 类型耦合） */
function projectS(road: Road, x: number, y: number): number {
  let bestS = 0;
  let bestDist = Infinity;
  let offset = 0;
  for (let i = 1; i < road.centerline.length; i++) {
    const a = road.centerline[i - 1]!;
    const b = road.centerline[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const u = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (y - a[1]) * dy) / Math.max(len * len, 1e-9),
      ),
    );
    const px = a[0] + u * dx;
    const py = a[1] + u * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < bestDist) {
      bestDist = d;
      bestS = offset + u * len;
    }
    offset += len;
  }
  return bestS;
}

/** 到路线末端后进入下一条车道（路口连接器），否则停在末端 */
function advanceAlongRoute(rt: Runtime, roadMap: Map<string, Road>) {
  let road = roadMap.get(rt.laneId);
  while (road && rt.s >= road.lengthM && rt.routeIndex < rt.route.length - 1) {
    rt.s -= road.lengthM;
    rt.routeIndex += 1;
    rt.laneId = rt.route[rt.routeIndex]!;
    rt.change = null;
    rt.baseLat = 0;
    road = roadMap.get(rt.laneId);
  }
  const finalRoad = roadMap.get(rt.laneId);
  if (
    finalRoad &&
    rt.routeIndex >= rt.route.length - 1 &&
    rt.s > finalRoad.lengthM
  ) {
    rt.s = finalRoad.lengthM;
    rt.speed = 0;
  }
}

/** 两两扫描：碰撞（footprint）、TTC、边缘间距、接近速度 */
function scanPairs(runtimes: Runtime[], time: number, metrics: DangerMetrics) {
  for (let i = 0; i < runtimes.length; i++) {
    for (let j = i + 1; j < runtimes.length; j++) {
      const a = runtimes[i]!;
      const b = runtimes[j]!;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1e-6, Math.hypot(dx, dy));
      const edgeGap = dist - (a.lengthM + b.lengthM) / 2;
      if (edgeGap < metrics.minGapM) metrics.minGapM = Math.max(0, edgeGap);

      // 速度矢量
      const avx = Math.cos(a.heading) * a.speed;
      const avy = Math.sin(a.heading) * a.speed;
      const bvx = Math.cos(b.heading) * b.speed;
      const bvy = Math.sin(b.heading) * b.speed;
      // 沿 a→b 连线的接近速度（正 = 在靠近）
      const closing = -((bvx - avx) * dx + (bvy - avy) * dy) / dist;
      if (closing > 0.1) {
        metrics.maxClosingSpeed = Math.max(metrics.maxClosingSpeed, closing);
        const ttc = dist / closing;
        metrics.minTtc = Math.min(metrics.minTtc, ttc);
      }

      if (
        !metrics.collided &&
        overlaps(
          {
            x: a.x,
            y: a.y,
            heading: a.heading,
            lengthM: a.lengthM,
            widthM: a.widthM,
          },
          {
            x: b.x,
            y: b.y,
            heading: b.heading,
            lengthM: b.lengthM,
            widthM: b.widthM,
          },
        )
      ) {
        metrics.collided = true;
        metrics.collisionTime = time;
        metrics.collisionPair = [a.roleId, b.roleId];
        metrics.collisionSpeedDelta = closing;
      }
    }
  }
}

function evaluateCriteria(
  criteria: DangerCriterion[],
  m: DangerMetrics,
): string[] {
  const hit: string[] = [];
  for (const c of criteria) {
    switch (c.type) {
      case "collision":
        if (
          m.collided &&
          (m.collisionSpeedDelta ?? 0) >= (c.minSpeedDelta ?? 0)
        )
          hit.push("collision");
        break;
      case "ttc_below":
        if (m.minTtc < c.threshold) hit.push("ttc_below");
        break;
      case "min_gap_below":
        if (m.minGapM < c.threshold) hit.push("min_gap_below");
        break;
      case "lane_intrusion":
        if (m.maxIntrusionM >= c.depth) hit.push("lane_intrusion");
        break;
      case "speed_difference":
        if (m.maxClosingSpeed >= c.threshold) hit.push("speed_difference");
        break;
      case "red_light_running":
        // 行为层不模拟信号灯，跳过
        break;
    }
  }
  return hit;
}

/** 物理危险度量 → 0-1 适应度，碰撞主导，近危次之 */
function metricsToFitness(m: DangerMetrics): number {
  let f = 0;
  if (m.collided) {
    const severity = Math.max(
      0,
      Math.min(1, (m.collisionSpeedDelta ?? 0) / 20),
    );
    f = Math.max(f, 0.7 + 0.3 * severity);
  }
  if (Number.isFinite(m.minTtc)) {
    f = Math.max(f, Math.max(0, 1 - m.minTtc / 4) * 0.75);
  }
  if (Number.isFinite(m.minGapM)) {
    f = Math.max(f, Math.max(0, 1 - m.minGapM / 12) * 0.6);
  }
  if (m.maxIntrusionM > 0) {
    f = Math.max(f, Math.max(0, Math.min(1, m.maxIntrusionM / 3.5)) * 0.6);
  }
  if (m.maxClosingSpeed > 0) {
    f = Math.max(f, Math.max(0, Math.min(1, m.maxClosingSpeed / 30)) * 0.4);
  }
  return Math.max(0, Math.min(1, f));
}

/**
 * 构造一个基于真实行为仿真的评估器（工厂）。
 *
 * 搜索引擎只持有 (sample, template, binding)，地图通过闭包注入：
 *   const evaluator = makeSimulationEvaluator(map);
 *   await searchScene(template, binding, config, evaluator);
 *
 * 每个样本真实跑一遍行为模型 + 物理积分，用危险度量算适应度，
 * 用于替代纯参数启发式 heuristicEvaluator，做物理验证。
 */
export function makeSimulationEvaluator(map: MapModel): FitnessEvaluator {
  return (sample, template, binding) =>
    simulateBehaviorScene(map, template, binding, sample.values).fitness;
}
