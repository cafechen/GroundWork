import {
  sceneSpecV2Schema,
  riskCapabilities,
  riskRequestStrictSchema,
  type RiskRequest,
  type RiskMechanism,
  type SceneSpecV2,
} from "@groundwork/contracts";
import type { MapModel, Road } from "../index.js";
import { lanePoint, project, bodyWithinLanes, overlaps } from "./geometry.js";
import { mapFingerprint } from "./template.js";
import { referencePoint, simulateReference } from "./reference.js";
import {
  approachCruiseStats,
  circumRadius,
  crossingRisk,
  type RiskFrame,
} from "./risk-metrics.js";

type Sample = [number, number, number, number];
export type DrivingStyle = {
  actorId: string;
  sourceUuid: string;
  sourceOffsetS?: number;
  lateralOffsetsM: number[];
  speedRatios: number[];
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const angle = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
const interpolate = (values: number[], u: number) => {
  const v = clamp(u, 0, 1) * (values.length - 1),
    i = Math.floor(v);
  return (
    values[i]! +
    (values[Math.min(values.length - 1, i + 1)]! - values[i]!) * (v - i)
  );
};
function seededOrder<T>(values: readonly T[], seed: number, salt: number) {
  const result = [...values];
  let state = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
/** Extract persistent signed lane offsets and low-frequency speed changes, not XY noise. */
export function extractDrivingStyles(
  source: SceneSpecV2,
  map: MapModel,
): DrivingStyle[] {
  if (!source.reference) throw new Error("缺少真实驾驶参考片段");
  return source.reference.tracks
    .filter(
      (track) =>
        track.samples.reduce(
          (sum, p, i) =>
            sum +
            (i
              ? Math.hypot(
                  p[1] - track.samples[i - 1]![1],
                  p[2] - track.samples[i - 1]![2],
                )
              : 0),
          0,
        ) > 8,
    )
    .slice(0, 5)
    .map((track, i) => {
      const samples = track.samples.filter(
        (p) => p[0] >= 0 && p[0] <= source.reference!.sourceDurationS,
      );
      const offsets = samples
        .map((p) => {
          const heading = p[3];
          const roads = map.roads.filter(
            (r) =>
              !r.junction &&
              Math.abs(angle(lanePoint(r, 0).heading - heading)) < 0.7,
          );
          const nearest = roads
            .map((r) => ({ r, q: project(r, { x: p[1], y: p[2], heading }) }))
            .sort((a, b) => a.q.distance - b.q.distance)[0];
          if (!nearest || nearest.q.distance > 2) return null;
          const q = lanePoint(nearest.r, nearest.q.s);
          return clamp(
            -(p[1] - q.x) * Math.sin(q.heading) +
              (p[2] - q.y) * Math.cos(q.heading),
            -0.35,
            0.35,
          );
        })
        .filter((n): n is number => n !== null);
      const speeds = samples
        .slice(1)
        .map(
          (p, k) =>
            Math.hypot(p[1] - samples[k]![1], p[2] - samples[k]![2]) / 0.1,
        );
      const mean =
        speeds.reduce((s, n) => s + n, 0) / Math.max(1, speeds.length);
      const aggregate = (values: number[], fallback: number) =>
        Array.from({ length: 12 }, (_, k) => {
          const center = Math.round((k / 11) * (values.length - 1));
          const window = values.slice(
            Math.max(0, center - 8),
            Math.min(values.length, center + 9),
          );
          return window.length
            ? window.reduce((s, n) => s + n, 0) / window.length
            : fallback;
        });
      return {
        actorId: ["Ego", "Conflict", "Follower", "TurnFollower", "Background"][
          i
        ]!,
        sourceUuid: track.sourceUuid,
        lateralOffsetsM: aggregate(offsets, 0),
        speedRatios: aggregate(
          speeds.map((v) => (mean > 0.5 ? clamp(v / mean, 0.85, 1.15) : 1)),
          1,
        ),
      };
    });
}
/** 显式时机类锐度阈值（TTC/间隙/PET）的候选偏差；≤0 表示全部满足。 */
function explicitTimingMiss(
  risk: ReturnType<typeof crossingRisk>,
  request: RiskRequest,
): { miss: number; reason: string | null } {
  let miss = -Infinity;
  let reason: string | null = null;
  const consider = (slack: number, thisReason: string, normalizeBy: number) => {
    const normalized = slack / normalizeBy;
    if (normalized > miss) {
      miss = normalized;
      reason = thisReason;
    }
  };
  if (request.maxTtcS !== undefined && !risk.collision)
    consider(
      risk.minimumTtcS === null ? Infinity : risk.minimumTtcS - request.maxTtcS,
      "候选最小 TTC 未达到显式阈值",
      request.maxTtcS,
      // Infinity 归一化后仍为 Infinity
    );
  if (request.maxGapM !== undefined && !risk.collision)
    consider(
      risk.minimumGapM - request.maxGapM,
      "候选最近间隙大于显式上限",
      request.maxGapM,
    );
  if (request.minGapM !== undefined)
    consider(
      request.minGapM - risk.minimumGapM,
      "候选最近间隙小于显式近失下限",
      0.8,
    );
  if (request.maxPetS !== undefined)
    consider(
      risk.petS === null ? Infinity : risk.petS - request.maxPetS,
      "候选 PET 未达到显式阈值",
      request.maxPetS,
    );
  return { miss, reason };
}
export type Path = {
  ids: string[];
  samples: Sample[];
  length: number;
  entry: number;
  movement: Road;
};
export function makeRiskPath(map: MapModel, movement: Road): Path {
  const byId = new Map(map.roads.map((r) => [r.id, r]));
  const prefix = movement.junction ? [movement.junction.from] : [],
    suffix = movement.junction ? [movement.junction.to] : [];
  const extend = (ids: string[], before: boolean) => {
    for (
      let i = 0;
      i < 20 && ids.reduce((s, id) => s + byId.get(id)!.lengthM, 0) < 110;
      i++
    ) {
      const end = before ? ids[0]! : ids.at(-1)!;
      const links = map.successors.filter((l) =>
        before ? l.to === end : l.from === end,
      );
      const r = links
        .map((l) => byId.get(before ? l.from : l.to))
        .filter((r): r is Road => !!r && !r.junction && !ids.includes(r.id))
        .sort((a, b) => b.lengthM - a.lengthM)[0];
      if (!r) break;
      if (before) ids.unshift(r.id);
      else ids.push(r.id);
    }
  };
  if (movement.junction) {
    extend(prefix, true);
    extend(suffix, false);
  }
  const ids = [...prefix, movement.id, ...suffix],
    length = ids.reduce((s, id) => s + byId.get(id)!.lengthM, 0),
    entry = prefix.reduce((s, id) => s + byId.get(id)!.lengthM, 0);
  const at = (s: number) => {
    for (const id of ids) {
      const r = byId.get(id)!;
      if (s <= r.lengthM) return lanePoint(r, s);
      s -= r.lengthM;
    }
    return lanePoint(byId.get(ids.at(-1)!)!, byId.get(ids.at(-1)!)!.lengthM);
  };
  let samples: Sample[] = Array.from(
    { length: Math.floor(length * 2) + 1 },
    (_, i) => {
      const p = at(i / 2);
      return [i * 0.1, p.x, p.y, p.heading];
    },
  );
  for (let pass = 0; pass < 3; pass++)
    samples = samples.map((p, i) => {
      const window = [-2, -1, 0, 1, 2].map(
        (k) => samples[clamp(i + k, 0, samples.length - 1)]!,
      );
      const weights = [1, 4, 6, 4, 1];
      return [
        p[0],
        window.reduce((s, q, k) => s + q[1] * weights[k]!, 0) / 16,
        window.reduce((s, q, k) => s + q[2] * weights[k]!, 0) / 16,
        p[3],
      ];
    });
  return { ids, samples, length, entry, movement };
}
/**
 * 在既有路径末端沿非路口 successor 追加采样（不重建、不改变前段几何与横向对齐），
 * 供短进口道上的自由交通车继续驶离。无法延伸时原样返回。
 */
function extendPathSuffix(
  map: MapModel,
  path: Path,
  minLength = path.length + 60,
) {
  const byId = new Map(map.roads.map((r) => [r.id, r]));
  const ids = [...path.ids];
  let length = path.length;
  for (let i = 0; i < 20 && length < minLength; i++) {
    const links = map.successors.filter((l) => l.from === ids.at(-1));
    const r = links
      .map((l) => byId.get(l.to))
      .filter((x): x is Road => !!x && !x.junction && !ids.includes(x.id))
      .sort((a, b) => b.lengthM - a.lengthM)[0];
    if (!r) break;
    ids.push(r.id);
    length += r.lengthM;
  }
  if (ids.length === path.ids.length) return path;
  const at = (s: number) => {
    for (const id of ids) {
      const r = byId.get(id)!;
      if (s <= r.lengthM) return lanePoint(r, s);
      s -= r.lengthM;
    }
    return lanePoint(byId.get(ids.at(-1)!)!, byId.get(ids.at(-1)!)!.lengthM);
  };
  let samples: Sample[] = Array.from(
    { length: Math.floor(length * 2) + 1 },
    (_, i) => {
      const s = i / 2;
      if (s <= path.length)
        return path.samples[Math.min(i, path.samples.length - 1)]!;
      const p = at(s);
      return [i * 0.1, p.x, p.y, p.heading];
    },
  );
  for (let pass = 0; pass < 3; pass++)
    samples = samples.map((p, i) => {
      const window = [-2, -1, 0, 1, 2].map(
        (k) => samples[clamp(i + k, 0, samples.length - 1)]!,
      );
      const weights = [1, 4, 6, 4, 1];
      return [
        p[0],
        window.reduce((s, q, k) => s + q[1] * weights[k]!, 0) / 16,
        window.reduce((s, q, k) => s + q[2] * weights[k]!, 0) / 16,
        p[3],
      ];
    });
  return { ...path, ids, samples, length };
}

function pose(path: Path, s: number, style: DrivingStyle) {
  const p = referencePoint(path.samples, s / 5),
    m = referencePoint(path.samples, (s - 0.2) / 5),
    n = referencePoint(path.samples, (s + 0.2) / 5);
  const heading = Math.atan2(n.y - m.y, n.x - m.x),
    offset = interpolate(style.lateralOffsetsM, s / path.length);
  return {
    x: p.x - Math.sin(heading) * offset,
    y: p.y + Math.cos(heading) * offset,
    heading,
  };
}
type Run = {
  frames: RiskFrame[][];
  samples: Sample[][];
  braking: number[];
  initialS: number[];
};
/**
 * 全路径曲率限速剖面（0.5 m 网格，与采样间隔一致）：半径取车辆实际跟随的
 * B 样条中心线（±8 m 三点圆，与独立验收的曲率重建同源），再做两遍 [1,2,1]
 * 平滑消除入弯螺旋段的半径突变（否则减速度斜率阶跃会形成 jerk）；限速按
 * 舒适横向 3.0 m/s² 取 √(3·R)（给验收重建的螺旋段曲率峰值留余量），再按
 * 舒适制动 2 m/s² 反向传播——与纵向模型常规减速度上限相同，入弯减速平滑
 * 提前、出弯自动放开。按 Path 缓存。
 */
const curvatureProfileCache = new WeakMap<Path, Float64Array>();
function curvatureSpeedProfile(path: Path): Float64Array {
  const cached = curvatureProfileCache.get(path);
  if (cached) return cached;
  const n = path.samples.length;
  const center = (s: number) => {
    const p = referencePoint(path.samples, s / 5);
    return { x: p.x, y: p.y };
  };
  const radii = new Float64Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const s = i * 0.5;
    if (s - 8 >= 0 && s + 8 <= path.length)
      radii[i] = circumRadius(center(s - 8), center(s), center(s + 8));
  }
  // 两遍 [1,2,1] 平滑；∞ 按“保持直线”剔除，不参与均值。
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < n; i++) {
      let sum = 0,
        weight = 0;
      for (const [j, w] of [
        [i - 1, 1],
        [i, 2],
        [i + 1, 1],
      ] as const) {
        if (j >= 0 && j < n && Number.isFinite(radii[j]!)) {
          sum += radii[j]! * w;
          weight += w;
        }
      }
      if (weight) radii[i] = sum / weight;
    }
  const profile = new Float64Array(n);
  let limit = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    const radius = radii[i]!;
    const vlim = radius === Infinity ? Infinity : Math.sqrt(3 * radius);
    // Infinity 下 sqrt(∞²+2) 仍为 ∞，直线段保持无限速。
    limit = Math.min(vlim, Math.sqrt(limit * limit + 2 * 2 * 0.5));
    profile[i] = limit;
  }
  curvatureProfileCache.set(path, profile);
  return profile;
}
/** 按弧长连续插值读取曲率限速，避免高速时 0.5 m 网格跨步造成期望速度阶跃。 */
function profileLimitAt(profile: Float64Array, s: number) {
  const u = clamp(s / 0.5, 0, profile.length - 1),
    i = Math.floor(u),
    f = u - i;
  const a = profile[i]!,
    b = profile[Math.min(i + 1, profile.length - 1)]!;
  // 直线段限速为 ∞：∞·0 = NaN，须在乘权重前短路。
  if (f === 0 || a === Infinity) return a;
  if (b === Infinity) return b;
  return a * (1 - f) + b * f;
}
/** Simultaneous longitudinal updates; followers respond to the preceding actual state. */
export function runRiskInteraction(
  paths: Path[],
  styles: DrivingStyle[],
  cpS: number[],
  speed: number,
  delta: number,
  removeConflict = false,
  kind: RiskMechanism = "unprotected_left_turn",
  obstacle?: ReturnType<typeof pose>,
  /**
   * 背景车（索引 2/3/4）的绝对初始 s；缺省用冲突点后方的标准编队位置。
   * free=true 时解除跟驰绑定作为自由交通车巡航（短进口道地图的自适应放置）。
   */
  overrides: Partial<Record<number, { s: number; free?: boolean }>> = {},
  /**
   * 两名主角（Ego/事件车）的独立巡航基速；缺省沿用单标量 × 机制比例的旧行为。
   * governCurvature=true 时按全路径曲率限速剖面（√(3 m/s²·R)、2 m/s² 舒适
   * 制动反向传播）压低期望速度，使车辆高速接近、弯前平滑减速、弯后自然恢复。
   */
  bases?: { ego: number; event: number; governCurvature: boolean },
): Run {
  const duration = 16,
    dt = 0.05,
    leadTime = 5.5;
  const eventFactor =
    kind === "rear_end"
      ? 1
      : kind === "cut_in"
        ? 0.65
        : kind === "right_turn_merge"
          ? 0.5
          : 0.85;
  const egoBase = bases?.ego ?? speed,
    eventBase = bases?.event ?? speed * eventFactor;
  const freeRunning = new Set(
    Object.entries(overrides)
      .filter(([, o]) => o?.free)
      .map(([i]) => Number(i)),
  );
  const initialS = [
    cpS[0]! - egoBase * leadTime,
    kind === "rear_end"
      ? cpS[0]! - egoBase * leadTime + 22 + delta * 4
      : cpS[1]! - eventBase * (leadTime + delta),
    0,
    0,
    0,
  ];
  initialS[2] = initialS[0]! - 14;
  initialS[3] = initialS[1]! - 19;
  initialS[4] = initialS[0]! - 32;
  if (kind === "rear_end" || kind === "cut_in") initialS[3] = initialS[0]! - 48;
  for (const [i, o] of Object.entries(overrides))
    if (o) initialS[Number(i)] = o.s;
  const speeds = [
    egoBase,
    eventBase,
    speed * 0.97,
    speed * (kind === "right_turn_merge" ? 0.45 : 0.8),
    speed * 0.93,
  ];
  const state = initialS.map((s, i) => ({ s, v: speeds[i]!, a: 0 }));
  const curvatureProfiles = bases?.governCurvature
    ? paths.map((p) => curvatureSpeedProfile(p))
    : paths.map(() => null);
  const frames: RiskFrame[][] = styles.map(() => []),
    braking = styles.map(() => 0),
    hazards: boolean[] = [];
  for (let step = -6; step <= duration / dt + 6; step++) {
    const t = step * dt;
    if (step < 0) {
      state.forEach((p, i) => {
        const q =
          i === 4 && obstacle
            ? obstacle
            : pose(paths[i]!, initialS[i]! + p.v * t, styles[i]!);
        frames[i]!.push({ t, ...q, speed: i === 4 && obstacle ? 0 : p.v });
      });
      continue;
    }
    state.forEach((p, i) => {
      const q =
        i === 4 && obstacle ? obstacle : pose(paths[i]!, p.s, styles[i]!);
      frames[i]!.push({ t, ...q, speed: i === 4 && obstacle ? 0 : p.v });
    });
    const ego = state[0]!,
      event = state[1]!,
      eta = (cpS[0]! - ego.s) / Math.max(0.5, ego.v),
      eventEta = (cpS[1]! - event.s) / Math.max(0.5, event.v);
    const followingHazard =
      (kind === "rear_end" || kind === "cut_in") &&
      event.s - ego.s - 4.7 < Math.max(3, (ego.v - event.v) * 0.85) &&
      (kind !== "cut_in" || event.s > cpS[1]! - 4);
    hazards.push(
      !removeConflict &&
        (followingHazard ||
          (kind !== "rear_end" &&
            kind !== "cut_in" &&
            event.s < cpS[1]! + 4 &&
            ego.s < cpS[0]! + 3 &&
            eta < (kind === "right_turn_merge" ? 1.8 : 0.9) &&
            eta > -0.5 &&
            Math.abs(eta - eventEta) <
              (kind === "right_turn_merge" ? 2.5 : 1.3))),
    );
    const danger = hazards[Math.max(0, hazards.length - 8)]!;
    const next = state.map((p, i) => {
      let desired =
        speeds[i]! * interpolate(styles[i]!.speedRatios, t / duration);
      // 高速接近时按全路径曲率限速剖面行驶（舒适横向 3 m/s²、2 m/s² 舒适
      // 制动反向传播）：弯前平滑减速、弯中按曲率限速、出弯自然恢复；
      // 静止占道车不参与。
      if (curvatureProfiles[i] && !(i === 4 && obstacle)) {
        desired = Math.min(desired, profileLimitAt(curvatureProfiles[i]!, p.s));
      }
      let acceleration = clamp((desired - p.v) * 1.2, -2, 1.5);
      const remaining = paths[i]!.length - 5 - p.s;
      if (p.v > Math.sqrt(Math.max(0, 3 * remaining))) acceleration = -2;
      if (i === 0 && danger) acceleration = -4;
      if (i === 1 && kind === "rear_end" && !removeConflict && t > 2.8 + delta)
        acceleration = -4;
      const leader = freeRunning.has(i)
        ? -1
        : i === 2
          ? 0
          : i === 3
            ? kind === "rear_end" || kind === "cut_in"
              ? 4
              : 1
            : i === 4
              ? 2
              : -1;
      if (leader >= 0) {
        const other = state[leader]!,
          gap = other.s - p.s - 4.7;
        const wanted =
          2 +
          p.v * 1.2 +
          Math.max(0, (p.v * (p.v - other.v)) / (2 * Math.sqrt(1.5 * 3)));
        acceleration = Math.min(
          acceleration,
          1.5 *
            (1 -
              Math.pow(p.v / Math.max(1, desired), 4) -
              Math.pow(wanted / Math.max(0.5, gap), 2)),
        );
      }
      // Background traffic yields at the shared conflict area; only the selected
      // event actor deliberately violates this priority.
      if (
        i === 3 &&
        !freeRunning.has(3) &&
        ["crossing", "unprotected_left_turn", "right_turn_merge"].includes(kind)
      ) {
        const occupiedApproach = [0, 2, 4].some(
          (k) => state[k]!.s < cpS[0]! + 7 && state[k]!.s > cpS[0]! - 45,
        );
        const stopDistance = cpS[1]! - 8 - p.s;
        if (
          occupiedApproach &&
          stopDistance > -1 &&
          p.v > Math.sqrt(Math.max(0, 4 * stopDistance))
        )
          acceleration = Math.min(acceleration, -3);
      }
      acceleration = clamp(acceleration, -5, 1.5);
      acceleration = Math.max(acceleration, -0.5 * Math.sqrt(2 * 8 * p.v));
      const a = clamp(acceleration, p.a - 8 * dt, p.a + 8 * dt),
        v = Math.max(0, p.v + a * dt);
      if (t >= 0 && t <= duration) braking[i] = Math.max(braking[i]!, -a);
      return { s: p.s + ((p.v + v) * dt) / 2, v, a };
    });
    state.splice(0, state.length, ...next);
  }
  const samples = frames.map((fs) =>
    fs
      .filter((_, i) => i % 2 === 0)
      .map((p) => [Number(p.t.toFixed(3)), p.x, p.y, p.heading] as Sample),
  );
  return { frames, samples, braking, initialS };
}
/**
 * 背景车（2/3/4）自适应初始位置。标准编队要求冲突点后方有 ~50m 进口道；
 * 短进口道地图（如裁剪过的路口图）放不下时：
 *  1. 先在上游压缩跟车间距（仍由原 IDM 跟驰逻辑接管）；
 *  2. 仍放不下则把车移到同路径冲突点下游当自由交通车（free，解除跟驰绑定），
 *     初始即与被测车/事件车保持 ≥18m 纵向间隔，且不与任何同路径车重叠。
 * 返回 null 表示两个主角之外连一辆背景车都无处安放（该速度档不可行）。
 */
export function buildBackgroundPlacements(
  lengths: number[],
  actorCp: number[],
  kind: RiskMechanism,
  nominal: number[] | undefined,
): Partial<Record<number, { s: number; free?: boolean }>> | null {
  if (!nominal) return {};
  const overrides: Partial<Record<number, { s: number; free?: boolean }>> = {};
  // 按规范路径分组（paths 数组里 pa/pb 重复出现：[pa,pb,pa,pb|pa,pa]）。
  // pa 组：0/2/4（rear_end/cut_in 还有 3）；pb 组：1（+3）。
  const actorOnPb = [
    false,
    true,
    false,
    kind !== "rear_end" && kind !== "cut_in",
    false,
  ];
  const groups: Array<{ actors: number[]; length: number; cp: number }> = [
    {
      actors: [0, 1, 2, 3, 4].filter((i) => !actorOnPb[i]),
      length: lengths[0]!,
      cp: actorCp[0]!,
    },
    {
      actors: [0, 1, 2, 3, 4].filter((i) => actorOnPb[i]),
      length: lengths[1]!,
      cp: actorCp[1]!,
    },
  ];
  const GAP = 8;
  for (const group of groups) {
    const actors = group.actors.sort((a, b) => nominal[b]! - nominal[a]!);
    // 已安放位置，含主角；新位置必须与它们保持车长间隔
    const placed: Array<{ s: number; free?: boolean }> = [];
    const fits = (s: number) =>
      s >= 4 &&
      s <= group.length - 6 &&
      placed.every((p) => Math.abs(p.s - s) >= GAP);
    for (const i of actors) {
      const want = i < 2 ? nominal[i]! : (overrides[i]?.s ?? nominal[i]!);
      let s = want;
      let free = false;
      if (!fits(s)) {
        // 上游压缩：贴住冲突点前方最近车辆的后方
        const ahead = placed
          .filter((p) => p.s < group.cp + 18)
          .sort((a, b) => b.s - a.s)[0];
        s = ahead ? ahead.s - GAP : 4;
        if (!fits(s)) {
          // 下游自由交通车：冲突点后 18m 起，逐辆加 12m
          let d = 18;
          do {
            s = group.cp + d;
            d += 12;
          } while (!fits(s) && d < 120);
          free = true;
        }
      }
      if (!fits(s)) return null;
      placed.push({ s, free });
      if (i >= 2 && (s !== nominal[i]! || free))
        overrides[i] = { s, free: free || undefined };
    }
  }
  return overrides;
}

export function createDangerousLeftTurn(
  map: MapModel,
  source: SceneSpecV2,
  styles: DrivingStyle[],
  seed = 42,
): SceneSpecV2 {
  return createRiskScene(map, source, styles, seed, {
    mechanism: "unprotected_left_turn",
    count: 5,
    outcome: "danger",
  });
}

export function createRiskScene(
  map: MapModel,
  source: SceneSpecV2,
  styles: DrivingStyle[],
  seed = 42,
  request: RiskRequest = {
    mechanism: "unprotected_left_turn",
    count: 5,
    outcome: "danger",
  },
): SceneSpecV2 {
  // 引擎层自我防御：非法锐度组合（如 near_miss 之外给 minGapM、倒置走廊）
  // 直接拒绝，不浪费 25 秒搜索预算；API 边界也用同一 schema 校验。
  const parsed = riskRequestStrictSchema.safeParse(request);
  if (!parsed.success)
    throw new Error(
      `危险目标参数不合法：${parsed.error.issues
        .map((i) => i.message)
        .join("；")}`,
    );
  request = parsed.data;
  const kind = request.mechanism,
    capability = riskCapabilities[kind];
  if (styles.length !== 5) throw new Error("危险生成需要五份真实驾驶特征");
  if (request.minSpeedMps !== undefined && request.minSpeedMps > 17)
    // 与 schema 上限同源的引擎层防御：主角基速 20 m/s 扣除 0.85 速度纹理
    // 下探后，稳定接近段可核验的最高巡航下限约为 17 m/s。
    throw new Error(
      "危险目标参数不合法：巡航速度下限不能超过 17 m/s（约 61 km/h，当前生成能力上限）",
    );
  const straight = map.roads.filter((r) => r.junction?.turn === "straight"),
    left = map.roads.filter(
      (r) =>
        r.junction?.turn ===
        (kind === "crossing"
          ? "straight"
          : kind === "right_turn_merge"
            ? "right"
            : "left"),
    );
  let pairs = straight.flatMap((a) =>
    left
      .filter(
        (b) =>
          a.junction!.id === b.junction!.id &&
          a.junction!.from !== b.junction!.from &&
          (kind === "right_turn_merge"
            ? a.junction!.to === b.junction!.to
            : a.junction!.to !== b.junction!.to) &&
          Math.abs(angle(lanePoint(a, 0).heading - lanePoint(b, 0).heading)) >
            0.7 &&
          (kind !== "crossing" ||
            Math.abs(angle(lanePoint(a, 0).heading - lanePoint(b, 0).heading)) <
              2.5),
      )
      .map((b) => ({ a, b })),
  );
  const roadMode = [
    "rear_end",
    "cut_in",
    "oncoming_intrusion",
    "obstacle_bypass",
  ].includes(kind);
  if (roadMode) {
    const roads = map.roads.filter((r) => !r.junction && r.lengthM > 75);
    pairs = roads.flatMap((a) =>
      (kind === "rear_end"
        ? [a]
        : roads.filter((b) => {
            if (a.id === b.id) return false;
            if (kind === "cut_in")
              return map.adjacentSameDirection.some(
                (l) => l.from === b.id && l.to === a.id,
              );
            const p = lanePoint(a, a.lengthM / 2),
              q = project(b, p);
            return (
              q.distance < 10 &&
              q.distance > 1.5 &&
              Math.abs(angle(p.heading - lanePoint(b, q.s).heading)) > 2.6
            );
          })
      ).map((b) => ({ a, b })),
    );
  }
  if (!pairs.length)
    throw new Error(
      `当前地图不满足${capability.label}条件：${capability.mapRequirement}。地图选择保持不变。`,
    );
  pairs.sort((a, b) => (a.a.id + a.b.id).localeCompare(b.a.id + b.b.id));
  const shift = seed % pairs.length;
  pairs.push(...pairs.splice(0, shift));
  let attempts = 0,
    lastFailure = "没有车身路径相交的对向组合";
  // 显式巡航速度相关的失败（直线段不足、巡航速度不达标）在穷尽搜索后优先
  // 于“最后一个候选”的泛化原因，保证对用户如实指出真正的约束瓶颈。
  let speedSpecificFailure: string | null = null;
  const started = Date.now();
  const regions = map.roads.filter((r) => r.polygon);
  for (const [lanePairIndex, { a, b }] of pairs.slice(0, 30).entries()) {
    const pa = makeRiskPath(map, a);
    let pb = makeRiskPath(map, b);
    const originalPb = pb;
    let nearest = { distance: Infinity, sa: 0, sb: 0 };
    if (roadMode) {
      const sa =
          a.lengthM * (kind === "rear_end" || kind === "cut_in" ? 0.78 : 0.5),
        p = lanePoint(a, sa),
        projection = project(b, p),
        sb = kind === "rear_end" ? sa : projection.s;
      if (sb < 40 || sb > pb.length - 12) continue;
      nearest = { distance: 0, sa, sb };
      if (kind !== "rear_end") {
        const q = lanePoint(b, sb);
        let offset =
          -(p.x - q.x) * Math.sin(q.heading) +
          (p.y - q.y) * Math.cos(q.heading);
        if (
          request.outcome === "near_miss" &&
          (kind === "oncoming_intrusion" || kind === "obstacle_bypass")
        )
          offset -= Math.sign(offset) * 2.3;
        const smooth = (u: number) => {
          const v = clamp(u, 0, 1);
          return v * v * v * (10 - 15 * v + 6 * v * v);
        };
        // 显式巡航速度下切入变道按 14.5 m/s×约 2.8 s 的真实变道长度展开，
        // 否则 18 m 短变道在高速下横向加速度/jerk 不可能满足物理约束。
        const cutInLength =
          kind === "cut_in" && request.minSpeedMps !== undefined ? 40 : 18;
        pb = {
          ...pb,
          samples: pb.samples.map((s) => {
            const u =
              (s[0] * 5 - (sb - (kind === "cut_in" ? cutInLength : 40))) /
              (kind === "cut_in" ? cutInLength : 36);
            const fade =
              kind === "cut_in" ? 1 : 1 - smooth((s[0] * 5 - sb - 8) / 28);
            const d = offset * smooth(u) * fade;
            return [
              s[0],
              s[1] - Math.sin(s[3]) * d,
              s[2] + Math.cos(s[3]) * d,
              s[3],
            ] as Sample;
          }),
        };
      }
    }
    if (!roadMode)
      for (let sa = 3; sa < a.lengthM - 3; sa += 1)
        for (let sb = 3; sb < b.lengthM - 3; sb += 1) {
          const p = pose(pa, pa.entry + sa, styles[0]!),
            q = pose(pb, pb.entry + sb, styles[1]!);
          const distance = Math.hypot(p.x - q.x, p.y - q.y);
          if (distance < nearest.distance)
            nearest = { distance, sa: pa.entry + sa, sb: pb.entry + sb };
        }
    if (nearest.distance > 1.5) continue;
    if (kind === "right_turn_merge")
      nearest = {
        distance: 0,
        sa: pa.entry + a.lengthM - 5,
        sb: pb.entry + b.lengthM - 5,
      };
    const paths = [
        pa,
        pb,
        pa,
        kind === "cut_in" || kind === "rear_end" ? pa : originalPb,
        pa,
      ],
      cpS = [nearest.sa, nearest.sb],
      cpPoint = pose(pa, nearest.sa, styles[0]!);
    const obstacle =
      kind === "obstacle_bypass"
        ? pose(originalPb, nearest.sb - 2, {
            ...styles[4]!,
            lateralOffsetsM: [0, 0],
          })
        : undefined;
    // 自由交通车沿 successor 延伸路径驶离短进口道（按基础路径缓存）
    const extendedCache = new Map<Path, Path>();
    type SpeedCandidate = {
      scalar: number;
      bases?: { ego: number; event: number; governCurvature: boolean };
    };
    // 显式巡航速度下限时两名主角用独立高速基速（基速已含速度纹理 0.85 下探
    // 余量），背景车流仍按普通标量编队；否则保持原单标量速度网格不变。
    // 下限 >13.5 m/s 时追加 17.5/20 基速档（纹理下探后覆盖到约 17 m/s）。
    const cruiseCombos = [
      { ego: 13.5, event: 14.5 },
      { ego: 13.5, event: 16.5 },
      { ego: 15, event: 14.5 },
      { ego: 15, event: 16.5 },
    ];
    if ((request.minSpeedMps ?? 0) > 13.5)
      cruiseCombos.push(
        { ego: 17.5, event: 18.5 },
        { ego: 20, event: 18.5 },
        { ego: 17.5, event: 20 },
        { ego: 20, event: 20 },
      );
    const speedCandidates: SpeedCandidate[] =
      request.minSpeedMps !== undefined
        ? seededOrder(
            cruiseCombos.map((bases) => ({
              scalar: 8,
              bases: { ...bases, governCurvature: true },
            })),
            seed,
            lanePairIndex * 2,
          )
        : seededOrder(
            roadMode ? [10, 8, 6, 5] : [6, 5, 4],
            seed,
            lanePairIndex * 2,
          ).map((scalar) => ({ scalar }));
    const timings = seededOrder(
      request.outcome === "near_miss"
        ? Array.from({ length: 49 }, (_, i) => (i - 24) / 10)
        : [0.6, 0.3, 0, -0.3, -0.6, 0.9, -0.9, 1.2, -1.2],
      seed,
      lanePairIndex * 2 + 1,
    );
    // TTC/间隙/PET 对到达时机极敏感：粗网格全部仅差在这些时机类阈值时，
    // 在最接近可行的时机附近按 0.05 s（度量分辨率）细化再搜一轮。
    const timingSensitive =
      request.maxTtcS !== undefined ||
      request.maxGapM !== undefined ||
      request.minGapM !== undefined ||
      request.maxPetS !== undefined;
    for (const [speedOrderIndex, speedCandidate] of speedCandidates.entries()) {
      const speed = speedCandidate.scalar,
        eventFactor =
          kind === "rear_end"
            ? 1
            : kind === "cut_in"
              ? 0.65
              : kind === "right_turn_merge"
                ? 0.5
                : 0.85,
        egoBase = speedCandidate.bases?.ego ?? speed,
        eventBase = speedCandidate.bases?.event ?? speed * eventFactor;
      const timingList = [...timings];
      const coarseCount = timingList.length;
      let timingPhase: "coarse" | "fine" = "coarse";
      let nearestTiming: { delta: number; miss: number; gap: number } | null =
        null;
      let timingOrderIndex = 0;
      while (timingOrderIndex < timingList.length) {
        if (
          timingPhase === "coarse" &&
          timingOrderIndex === coarseCount &&
          timingSensitive &&
          nearestTiming
        ) {
          for (let k = -8; k <= 8; k++) {
            if (k === 0) continue;
            const refined =
              Math.round((nearestTiming.delta + k * 0.05) * 1000) / 1000;
            if (!timingList.some((value) => Math.abs(value - refined) < 1e-6))
              timingList.push(refined);
          }
          timingPhase = "fine";
        }
        const delta = timingList[timingOrderIndex]!;
        timingOrderIndex++;
        attempts++;
        if (Date.now() - started > 25000)
          throw new Error(
            `在当前地图上搜索了多种参数组合仍未找到合格${capability.label}场景，已超时停止（最后未满足：${speedSpecificFailure ?? lastFailure}）。建议更换更合适的地图或放宽显式危险阈值。`,
          );
        const s0 = cpS[0]! - egoBase * 5.5,
          s1 =
            kind === "rear_end"
              ? s0 + 22 + delta * 4
              : cpS[1]! - eventBase * (5.5 + delta);
        // 两个主角必须在冲突点前方的进口道上放得下
        if (s0 < 4 || s1 < 4) {
          lastFailure =
            request.minSpeedMps !== undefined
              ? "进口道直线段不足，无法在入弯/冲突前维持显式巡航速度"
              : "进口道路长度不足";
          if (request.minSpeedMps !== undefined)
            speedSpecificFailure = lastFailure;
          continue;
        }
        const nominal = [s0, s1, s0 - 14, s1 - 19, s0 - 32];
        if (kind === "rear_end" || kind === "cut_in") nominal[3] = s0 - 48;
        // 背景车（2/3/4）自适应放置：标准编队位放不下时，先在上游压缩间距，
        // 仍放不下则移到同路径冲突点下游当自由交通车，避免短进口道直接判失败。
        const overrides = obstacle
          ? {}
          : buildBackgroundPlacements(
              paths.map((p) => p.length),
              cpS,
              kind,
              nominal,
            );
        if (!overrides) {
          lastFailure = "进口道路长度不足";
          continue;
        }
        const positions = [
          s0,
          s1,
          overrides[2]?.s ?? nominal[2]!,
          overrides[3]?.s ?? nominal[3]!,
          overrides[4]?.s ?? nominal[4]!,
        ];
        const runPaths: Path[] = paths.map((p, i) => {
          if (!overrides[i]?.free) return p;
          let ext = extendedCache.get(p);
          if (!ext) {
            ext = extendPathSuffix(map, p);
            extendedCache.set(p, ext);
          }
          return ext;
        });
        const bodies = positions.map((s, i) => ({
          ...pose(runPaths[i]!, s, styles[i]!),
          lengthM: 4.7,
          widthM: 1.9,
        }));
        if (bodies.some((p) => !bodyWithinLanes(p, regions))) {
          lastFailure = "初始车身超出可用道路范围";
          continue;
        }
        const run = runRiskInteraction(
          runPaths,
          styles,
          cpS,
          speed,
          delta,
          false,
          kind,
          obstacle,
          overrides,
          speedCandidate.bases,
        );
        if (run.initialS.some((s) => s < 4)) {
          lastFailure = "进口道路长度不足";
          continue;
        }
        const initial = run.frames.map((fs) => fs[6]!);
        if (
          initial.some(
            (p) =>
              !bodyWithinLanes({ ...p, lengthM: 4.7, widthM: 1.9 }, regions),
          )
        ) {
          lastFailure = "初始车身超出可用道路范围";
          continue;
        }
        if (
          initial.some((p, i) =>
            initial
              .slice(i + 1)
              .some((q) =>
                overlaps(
                  { ...p, lengthM: 4.7, widthM: 1.9 },
                  { ...q, lengthM: 4.7, widthM: 1.9 },
                ),
              ),
          )
        ) {
          lastFailure = "初始车身重叠";
          continue;
        }
        const risk = crossingRisk(
          run.frames[0]!.filter((p) => p.t >= 0 && p.t <= 16),
          run.frames[1]!.filter((p) => p.t >= 0 && p.t <= 16),
        );
        if (!risk.achieved) {
          lastFailure = "候选未达到车身危险接近条件";
          continue;
        }
        if (
          (request.outcome === "collision" && !risk.collision) ||
          (request.outcome === "near_miss" && risk.collision)
        ) {
          lastFailure = "未满足碰撞结果要求";
          continue;
        }
        const timing = explicitTimingMiss(risk, request);
        if (timing.miss > 0) {
          if (timingPhase === "coarse") {
            // 偏差为 Infinity（TTC/PET 无预测值）时退化为按最小间隙选中心。
            const score = Number.isFinite(timing.miss) ? timing.miss : Infinity;
            if (
              !nearestTiming ||
              score < nearestTiming.miss ||
              (score === nearestTiming.miss &&
                risk.minimumGapM < nearestTiming.gap)
            )
              nearestTiming = {
                delta,
                miss: score,
                gap: risk.minimumGapM,
              };
          }
          lastFailure = timing.reason ?? "候选未达到显式危险阈值";
          continue;
        }
        if (
          request.minClosingSpeedMps !== undefined &&
          risk.closingSpeedMps + 1e-9 < request.minClosingSpeedMps
        ) {
          // 相对速度主要由车速档和交会角决定，时机细化帮助有限，不触发加密。
          lastFailure = "候选最近点相对速度未达到显式阈值";
          continue;
        }
        if (request.minSpeedMps !== undefined) {
          // 只核验两名主角入弯/冲突反应制动之前的稳定接近段，背景车不约束；
          // 窗口几何由 approachCruiseStats 按同一把尺子在独立验收中复算。
          const windowFrames = (frames: RiskFrame[]) =>
            frames.filter((p) => p.t >= 0 && p.t <= 16);
          const egoCruise = approachCruiseStats(
              windowFrames(run.frames[0]!),
              cpPoint,
            ),
            eventCruise = approachCruiseStats(
              windowFrames(run.frames[1]!),
              cpPoint,
            );
          if (!egoCruise.available || !eventCruise.available) {
            lastFailure = "入弯/冲突前直线段不足，无法维持显式巡航速度";
            speedSpecificFailure = lastFailure;
            continue;
          }
          if (
            Math.min(egoCruise.minSpeedMps!, eventCruise.minSpeedMps!) + 1e-9 <
            request.minSpeedMps
          ) {
            lastFailure = "主角接近段巡航速度未达到显式下限";
            speedSpecificFailure = lastFailure;
            continue;
          }
          // 有候选确实满足巡航门控时，速度不再是瓶颈，清除此前的速度类粘滞原因。
          speedSpecificFailure = null;
        }
        const duration = risk.collision
          ? Math.ceil((risk.peakTimeS - 1e-8) * 10) / 10
          : 16;
        if (duration < 5) {
          lastFailure = "冲突发生过早，不足最小场景时长";
          continue;
        }
        const brakingBefore = (frames: RiskFrame[]) =>
          frames.reduce(
            (peak, p, i) =>
              i && p.t >= 0 && p.t <= duration
                ? Math.max(peak, (frames[i - 1]!.speed - p.speed) / 0.05)
                : peak,
            0,
          );
        const baseline = runRiskInteraction(
            runPaths,
            styles,
            cpS,
            speed,
            delta,
            true,
            kind,
            obstacle,
            overrides,
            speedCandidate.bases,
          ),
          egoGain =
            brakingBefore(run.frames[0]!) - brakingBefore(baseline.frames[0]!);
        if (egoGain <= 0.5) {
          lastFailure = "冲突没有引起被测车有效响应";
          continue;
        }
        const ids = [
            "Ego",
            "Conflict",
            "Follower",
            "TurnFollower",
            "Background",
          ],
          names = [
            "A · 被测车",
            `B · ${capability.label}事件车`,
            "C · 后车",
            "D · 后车",
            obstacle ? "E · 静止占道车" : "E · 背景车",
          ];
        const cp = cpPoint;
        const spec = sceneSpecV2Schema.parse({
          schemaVersion: 2,
          title: `五车${capability.label}`,
          mapId: map.mapId,
          mapVersion: mapFingerprint(map),
          seed,
          durationS: duration,
          actors: ids.map((id, i) => ({
            id,
            name: names[i],
            role: i === 0 ? "ego" : i === 1 ? "event" : "background",
            controlMode: "replay",
            laneId: paths[i]!.ids[0],
            route: [],
            positionM: 0,
            speedMps: 0,
            profile: { maxAccelerationMps2: 3 },
            replay: [
              { t: 0, positionM: 0 },
              { t: duration, positionM: 100 },
            ],
          })),
          events: [],
          objectives: { requiredEventIds: [] },
          constraints: {
            maxJerkMps3: 20,
            maxYawRateRadS: 0.8,
            maxLateralAccelerationMps2: 6,
            allowedCollisionPairs: [["Ego", "Conflict"]],
          },
          reference: {
            ...source.reference!,
            mode: "risk_adapted_replay",
            sourceDurationS: duration,
            requestedSpeedFactor: 1,
            appliedSpeedFactor: 1,
            tracks: ids.map((actorId, i) => ({
              actorId,
              sourceUuid: styles[i]!.sourceUuid,
              samples: run.samples[i]!.filter((p) => p[0] <= duration + 0.301),
            })),
          },
          riskDesign: {
            kind,
            request,
            sourceMapId: source.mapId,
            movementIds: [a.id, b.id],
            conflictPoint: [cp.x, cp.y],
            attempts,
            arrivalOffsetS: delta,
            sampledParameters: {
              speedMps: egoBase,
              eventSpeedMps: eventBase,
              backgroundSpeedMps: speed,
              lanePairIndex,
              speedOrderIndex,
              timingOrderIndex,
            },
            sourceProfiles: styles,
            causalCheck: {
              egoBrakingGainMps2: egoGain,
              followerBrakingGainMps2:
                brakingBefore(run.frames[2]!) -
                brakingBefore(baseline.frames[2]!),
              removedActorId: "Conflict",
            },
          },
        });
        const report = simulateReference(map, spec).properties.validationReport;
        if (report.passed) return spec;
        lastFailure =
          report.physical.violations.map((v) => v.kind).join(",") ||
          (!report.risk.passed ? "非目标车辆碰撞" : "危险性或运动参与度不足");
      }
    }
  }
  const explainFailure = (reason: string) => {
    if (kind === "oncoming_intrusion" && reason.includes("lane_boundary"))
      return "对向车行道与本侧车道不直接相邻（中央分隔带或路间带过宽），越线过程落在真实车道之外，请换用对向车道紧邻的道路或在路口内构造";
    if (reason === "候选未达到车身危险接近条件")
      return "当前道路几何和车流下，两车间距没法进入危险范围";
    if (reason === "候选最小 TTC 未达到显式阈值")
      return "加密搜索冲突时机后，候选最近 TTC 仍大于要求阈值，可放宽 TTC 或更换地图";
    if (reason === "候选最近间隙大于显式上限")
      return "加密搜索冲突时机后，候选最近车身间隙仍大于要求上限，可放宽间隙或更换地图";
    if (reason === "候选最近间隙小于显式近失下限")
      return "加密搜索冲突时机后，候选近失间隙仍小于要求下限（走廊过窄），可放宽间隙走廊或允许碰撞";
    if (reason === "候选 PET 未达到显式阈值")
      return "加密搜索冲突时机后，候选 PET 仍大于要求阈值，可放宽 PET 或更换地图";
    if (reason === "候选最近点相对速度未达到显式阈值")
      return "当前地图速度域下候选最近点相对速度低于要求，可降低相对速度要求或更换高速交会道路";
    if (reason === "主角接近段巡航速度未达到显式下限")
      return "两名主角在入弯/冲突反应制动前的稳定接近段速度仍低于显式巡航速度下限，可降低速度要求或更换进口道更长、曲率更缓的地图";
    if (reason === "入弯/冲突前直线段不足，无法维持显式巡航速度")
      return "进口道直线段过短，主角来不及在入弯或冲突反应制动前维持足够时长的显式巡航速度，请更换进口道更长的地图或降低速度要求";
    if (reason === "进口道直线段不足，无法在入弯/冲突前维持显式巡航速度")
      return "进口道直线段放不下显式巡航速度所需的初始车距，请更换进口道更长的地图或降低速度要求";
    if (reason === "非目标车辆碰撞") return "其他车辆发生了意外碰撞";
    if (reason === "危险性或运动参与度不足")
      return "危险程度不够或涉事车辆未充分参与";
    if (reason === "lane_boundary") return "车辆越出了车道边界";
    if (reason === "speed") return "车速超过限制";
    if (reason === "acceleration") return "加减速超过物理限制";
    if (reason === "jerk") return "加减速变化过于剧烈";
    if (reason === "yaw_rate") return "转向速度过快";
    if (reason === "lateral_acceleration") return "横向加速度过大";
    if (reason === "road_end") return "车辆驶出了道路范围";
    return reason;
  };
  throw new Error(
    `当前地图无法构造${capability.label}场景：${explainFailure(
      speedSpecificFailure ?? lastFailure,
    )}。建议更换更合适的地图，或调整危险目标。`,
  );
}
