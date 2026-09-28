import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { boundaryLanes } from "./boundary-lanes.js";
import { connectJunctions } from "./multi-vehicle/junction-paths.js";
export * from "./multi-vehicle/junction-paths.js";
export * from "./multi-vehicle/junction-template.js";
export * from "./multi-vehicle/simulation.js";
export * from "./multi-vehicle/template.js";
export * from "./multi-vehicle/async.js";
export * from "./multi-vehicle/reference.js";
export * from "./multi-vehicle/risk-generation.js";
export * from "./multi-vehicle/risk-async.js";
export * from "./multi-vehicle/risk-metrics.js";
export * from "./multi-vehicle/risk-location.js";

const EARTH_RADIUS_M = 6_378_137;
type XY = [number, number];
type Wgs = [number, number];
export type LaneBoundary = {
  id: string;
  lineType: "solid" | "broken" | "unknown";
  points: XY[];
};
export type Road = {
  id: string;
  widthM: number;
  centerline: XY[];
  lengthM: number;
  entryHeadingDeg: number;
  sourceLaneId?: string;
  maxSpeedKmh?: number;
  geometrySource?:
    "boundary_pair" | "provided_centerline" | "junction_connector";
  junction?: {
    id: string;
    from: string;
    to: string;
    turn: "straight" | "left" | "right";
    maxCurvature: number;
    stopPositionM: number;
  };
  directionSource?: "boundary_order";
  leftBoundary?: LaneBoundary;
  rightBoundary?: LaneBoundary;
  polygon?: XY[];
};
export type LaneLink = { from: string; to: string };
export type MapModel = {
  mapId: string;
  origin: Wgs;
  roads: Road[];
  successors: LaneLink[];
  diagnostics?: string[];
  adjacentSameDirection: Array<
    LaneLink & {
      side: "left" | "right";
      entryDistanceM: number;
      headingDiffDeg: number;
      boundaryId?: string;
    }
  >;
};
type Keyframe = { t: number; s: number; speedMps: number };
type PlanActor = {
  name: string;
  role: "ego" | "danger";
  vehicleType: "car" | "heavy_truck";
  startLaneId: string;
  targetLaneId: string;
  keyframes: Keyframe[];
};
export type EnginePlan = {
  durationS: number;
  behaviorType: string;
  actors: PlanActor[];
  phases: Array<{ name: string; startTimeS: number; endTimeS: number }>;
  constraints: {
    maxAccelerationMps2: number;
    maxDecelerationMps2: number;
    maxSpeedMps: number;
    minimumGapM: number;
    collisionFree: boolean;
  };
};
type Frame = {
  t: number;
  x: number;
  y: number;
  headingRad: number;
  speedMps: number;
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const distance = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const length = (points: XY[]) =>
  points
    .slice(1)
    .reduce((sum, p, index) => sum + distance(points[index]!, p), 0);
const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
const coordinates = (value: any, result: Wgs[] = []): Wgs[] => {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  )
    result.push([value[0], value[1]]);
  else if (Array.isArray(value))
    for (const item of value) coordinates(item, result);
  return result;
};
const toLocal = (point: Wgs, origin: Wgs): XY => [
  (((point[0] - origin[0]) * Math.PI) / 180) *
    EARTH_RADIUS_M *
    Math.cos((origin[1] * Math.PI) / 180),
  (((point[1] - origin[1]) * Math.PI) / 180) * EARTH_RADIUS_M,
];
const toWgs = (point: XY, origin: Wgs): Wgs => [
  origin[0] +
    ((point[0] / (EARTH_RADIUS_M * Math.cos((origin[1] * Math.PI) / 180))) *
      180) /
      Math.PI,
  origin[1] + ((point[1] / EARTH_RADIUS_M) * 180) / Math.PI,
];

const laneId = (value: unknown) =>
  value === null ||
  value === undefined ||
  String(value).trim() === "" ||
  String(value) === "0"
    ? null
    : `lane_${String(value).trim()}`;

const laneIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(laneIds);
  if (typeof value === "string")
    return value
      .split(/[,;|\s]+/)
      .map(laneId)
      .filter((id): id is string => id !== null);
  const id = laneId(value);
  return id ? [id] : [];
};

const linkMetrics = (from: Road, to: Road) => {
  const heading = (from.entryHeadingDeg * Math.PI) / 180;
  const targetHeading = (to.entryHeadingDeg * Math.PI) / 180;
  const dx = to.centerline[0]![0] - from.centerline[0]![0];
  const dy = to.centerline[0]![1] - from.centerline[0]![1];
  return {
    entryDistanceM: round(
      Math.abs(Math.cos(heading) * dy - Math.sin(heading) * dx),
      1,
    ),
    headingDiffDeg: round(
      (Math.abs(angleDelta(heading, targetHeading)) * 180) / Math.PI,
      1,
    ),
  };
};

export async function loadMap(
  mapsRoot: string,
  mapId: string,
): Promise<MapModel> {
  if (!/^[\w-]+$/.test(mapId)) throw new Error("地图编号不合法");
  const dir = resolve(mapsRoot, mapId),
    layers = [
      "lane_group_ref",
      "junction",
      "crosswalk",
      "stop_line",
      "boundary",
    ];
  const docs: Record<string, any> = {};
  const all: Wgs[] = [];
  for (const layer of layers) {
    const doc = JSON.parse(
      await readFile(resolve(dir, `${layer}.geojson`), "utf8"),
    );
    docs[layer] = doc;
    for (const feature of doc.features ?? [])
      coordinates(feature.geometry?.coordinates, all);
  }
  const junction: Wgs[] = [];
  for (const feature of docs.junction.features ?? [])
    coordinates(feature.geometry?.coordinates, junction);
  const source = junction.length ? junction : all;
  if (!source.length) throw new Error(`地图 ${mapId} 没有坐标`);
  const origin: Wgs = [
    source.reduce((s, p) => s + p[0], 0) / source.length,
    source.reduce((s, p) => s + p[1], 0) / source.length,
  ];
  const roads: Road[] = [];
  const groupFeatures = docs.lane_group_ref.features ?? [];
  if (
    groupFeatures.some(
      (f: any) =>
        f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
    )
  ) {
    const lanes = boundaryLanes(
      groupFeatures,
      docs.boundary.features ?? [],
      (p) => toLocal(p, origin),
    );
    if (!lanes.roads.length)
      throw new Error(
        "地图缺少可确认的单车道边界，不能将车道组当作车道生成轨迹",
      );
    return connectJunctions(
      { mapId, origin, ...lanes },
      docs.junction.features ?? [],
      docs.stop_line.features ?? [],
      (p) => toLocal(p, origin),
    );
  }
  const propertiesByRoad = new Map<string, Record<string, unknown>>();
  const usedRoadIds = new Set<string>();
  let hasLineStrings = false;
  let hasExplicitTopology = false;
  for (const [index, feature] of (
    docs.lane_group_ref.features ?? []
  ).entries()) {
    const properties = feature.properties ?? {};
    if (feature.geometry?.type === "LineString") {
      hasLineStrings = true;
      const sourceId =
        properties.lane_id ?? properties.entity_handle ?? index + 1;
      const candidateId = laneId(sourceId) ?? `lane_${index + 1}`;
      const id = usedRoadIds.has(candidateId)
        ? `${candidateId}_${index + 1}`
        : candidateId;
      const points = (feature.geometry.coordinates ?? []).map((p: any) =>
        toLocal([p[0], p[1]], origin),
      );
      if (points.length < 2) continue;
      const span = Math.min(5, points.length - 1);
      const heading = Math.atan2(
        points[span]![1] - points[0]![1],
        points[span]![0] - points[0]![0],
      );
      const width = Number(properties.lane_width_m);
      const speed = Number(properties.max_speed_kmh);
      roads.push({
        id,
        sourceLaneId: String(sourceId),
        widthM: Number.isFinite(width) && width > 0 ? round(width) : 3.5,
        centerline: points,
        geometrySource: "provided_centerline",
        lengthM: round(length(points), 1),
        entryHeadingDeg: round((heading * 180) / Math.PI, 1),
        ...(Number.isFinite(speed) && speed > 0
          ? { maxSpeedKmh: round(speed, 1) }
          : {}),
      });
      usedRoadIds.add(id);
      propertiesByRoad.set(id, properties);
      hasExplicitTopology ||=
        "next_lane_ids" in properties ||
        "left_lane_id" in properties ||
        "right_lane_id" in properties;
      continue;
    }
  }
  roads.sort(
    (a, b) =>
      Math.min(...a.centerline.map((p) => Math.hypot(...p))) -
      Math.min(...b.centerline.map((p) => Math.hypot(...p))),
  );
  const selected = hasLineStrings ? roads : roads.slice(0, 12);
  const roadById = new Map(selected.map((road) => [road.id, road]));
  const successors: LaneLink[] = [];
  const adjacentSameDirection: MapModel["adjacentSameDirection"] = [];
  if (hasExplicitTopology) {
    for (const road of selected) {
      const properties = propertiesByRoad.get(road.id) ?? {};
      for (const to of laneIds(properties.next_lane_ids))
        if (roadById.has(to)) successors.push({ from: road.id, to });
      for (const [field, side] of [
        ["left_lane_id", "left"],
        ["right_lane_id", "right"],
      ] as const) {
        for (const to of laneIds(properties[field])) {
          const target = roadById.get(to);
          if (target)
            adjacentSameDirection.push({
              from: road.id,
              to,
              side,
              ...linkMetrics(road, target),
            });
        }
      }
    }
  } else {
    for (const ego of selected)
      for (const other of selected) {
        if (ego.id === other.id) continue;
        const eh = (ego.entryHeadingDeg * Math.PI) / 180,
          oh = (other.entryHeadingDeg * Math.PI) / 180,
          diff = Math.abs(angleDelta(eh, oh)),
          dx = other.centerline[0]![0] - ego.centerline[0]![0],
          dy = other.centerline[0]![1] - ego.centerline[0]![1],
          side = Math.cos(eh) * dy - Math.sin(eh) * dx,
          d = Math.hypot(dx, dy);
        if (diff <= (12 * Math.PI) / 180 && d >= 2 && d <= 15)
          adjacentSameDirection.push({
            from: ego.id,
            to: other.id,
            side: side < 0 ? "right" : "left",
            entryDistanceM: round(Math.abs(side), 1),
            headingDiffDeg: round((diff * 180) / Math.PI, 1),
          });
      }
    if (hasLineStrings) {
      const closestBySide = new Map<
        string,
        (typeof adjacentSameDirection)[number]
      >();
      for (const link of adjacentSameDirection) {
        const key = `${link.from}:${link.side}`;
        const current = closestBySide.get(key);
        if (!current || link.entryDistanceM < current.entryDistanceM)
          closestBySide.set(key, link);
      }
      adjacentSameDirection.splice(
        0,
        adjacentSameDirection.length,
        ...closestBySide.values(),
      );
    }
  }
  return { mapId, origin, roads: selected, successors, adjacentSameDirection };
}

export const describeMap = (map: MapModel) => ({
  mapId: map.mapId,
  roads: map.roads.map(
    ({
      centerline,
      polygon: _polygon,
      leftBoundary,
      rightBoundary,
      ...road
    }) => ({
      ...road,
      ...(leftBoundary
        ? {
            leftBoundary: {
              id: leftBoundary.id,
              lineType: leftBoundary.lineType,
            },
            rightBoundary: {
              id: rightBoundary!.id,
              lineType: rightBoundary!.lineType,
            },
          }
        : {}),
      start: centerline[0]!.map((v) => round(v)),
      end: centerline.at(-1)!.map((v) => round(v)),
    }),
  ),
  successors: map.successors,
  adjacentSameDirection: map.adjacentSameDirection,
});
export const laneLabels = (map: MapModel) => ({
  type: "FeatureCollection",
  features: map.roads.map((road) => ({
    type: "Feature",
    properties: { laneId: road.id },
    geometry: {
      type: "Point",
      coordinates: toWgs(
        road.centerline[Math.floor(road.centerline.length / 2)]!,
        map.origin,
      ),
    },
  })),
});

function pointAt(points: XY[], target: number): XY {
  const total = length(points);
  if (target <= 0) {
    const first = points[0]!,
      second = points[1]!,
      segment = distance(first, second);
    const ratio = target / Math.max(segment, 1e-9);
    return [
      first[0] + (second[0] - first[0]) * ratio,
      first[1] + (second[1] - first[1]) * ratio,
    ];
  }
  if (target >= total) {
    const last = points.at(-1)!,
      before = points.at(-2)!,
      segment = distance(before, last);
    const ratio = (target - total) / Math.max(segment, 1e-9);
    return [
      last[0] + (last[0] - before[0]) * ratio,
      last[1] + (last[1] - before[1]) * ratio,
    ];
  }
  const d = target;
  let traveled = 0;
  for (let i = 1; i < points.length; i++) {
    const segment = distance(points[i - 1]!, points[i]!);
    if (traveled + segment >= d) {
      const r = (d - traveled) / Math.max(segment, 1e-9);
      return [
        points[i - 1]![0] + (points[i]![0] - points[i - 1]![0]) * r,
        points[i - 1]![1] + (points[i]![1] - points[i - 1]![1]) * r,
      ];
    }
    traveled += segment;
  }
  return points.at(-1)!;
}
function interpolateKeyframes(frames: Keyframe[], t: number) {
  if (t <= frames[0]!.t) return frames[0]!;
  if (t >= frames.at(-1)!.t) return frames.at(-1)!;
  const right = frames.findIndex((frame) => frame.t >= t),
    a = frames[right - 1]!,
    b = frames[right]!,
    r = (t - a.t) / (b.t - a.t);
  return {
    t,
    s: a.s + (b.s - a.s) * r,
    speedMps: a.speedMps + (b.speedMps - a.speedMps) * r,
  };
}
function changeWindow(plan: EnginePlan, actor: PlanActor): [number, number] {
  if (actor.startLaneId === actor.targetLaneId) return [Infinity, Infinity];
  const phase = plan.phases.find((p) => /[换变]道|并线|并入/.test(p.name));
  return phase
    ? [phase.startTimeS, phase.endTimeS]
    : [
        actor.keyframes[1]?.t ?? plan.durationS * 0.3,
        actor.keyframes.at(-2)?.t ?? plan.durationS * 0.7,
      ];
}
function actorFrames(
  plan: EnginePlan,
  actor: PlanActor,
  map: MapModel,
  globalMin: number,
) {
  const start = map.roads.find((r) => r.id === actor.startLaneId),
    target = map.roads.find((r) => r.id === actor.targetLaneId);
  if (!start || !target) throw new Error(`${actor.name} 使用了不存在的车道`);
  const [changeStart, changeEnd] = changeWindow(plan, actor),
    frames: Frame[] = [];
  for (let i = 0; i <= Math.round(plan.durationS * 10); i++) {
    const t = Math.min(plan.durationS, i / 10),
      key = interpolateKeyframes(actor.keyframes, t),
      d = key.s - globalMin,
      a = pointAt(start.centerline, d),
      b = pointAt(target.centerline, d),
      raw = (t - changeStart) / Math.max(changeEnd - changeStart, 1e-6),
      p = Math.max(0, Math.min(1, raw)),
      blend = start.id === target.id ? 0 : p * p * (3 - 2 * p);
    frames.push({
      t,
      x: a[0] * (1 - blend) + b[0] * blend,
      y: a[1] * (1 - blend) + b[1] * blend,
      headingRad: 0,
      speedMps: key.speedMps,
    });
  }
  for (let i = 0; i < frames.length; i++) {
    const before = frames[Math.max(0, i - 1)]!,
      after = frames[Math.min(frames.length - 1, i + 1)]!;
    frames[i]!.headingRad = Math.atan2(after.y - before.y, after.x - before.x);
  }
  return frames;
}
function at(frames: Frame[], t: number) {
  const index = Math.min(frames.length - 1, Math.max(0, Math.round(t * 10)));
  return frames[index]!;
}
export function generateTrajectory(map: MapModel, plan: EnginePlan) {
  const values = plan.actors.flatMap((actor) =>
      actor.keyframes.map((frame) => frame.s),
    ),
    globalMin = Math.min(...values),
    generated = new Map<string, Frame[]>();
  for (const actor of plan.actors)
    generated.set(actor.name, actorFrames(plan, actor, map, globalMin));
  const features: any[] = [];
  for (const actor of plan.actors) {
    const frames = generated.get(actor.name)!,
      dimensions =
        actor.vehicleType === "heavy_truck"
          ? { lengthM: 12, widthM: 2.6, heightM: 3.6 }
          : { lengthM: 4.7, widthM: 1.9, heightM: 1.6 },
      base = {
        actor: actor.name,
        role: actor.role === "ego" ? "ego" : actor.name,
        routeId: actor.startLaneId,
        vehicleType: actor.vehicleType,
        ...dimensions,
      };
    features.push({
      type: "Feature",
      properties: { ...base, featureType: "trajectory" },
      geometry: {
        type: "LineString",
        coordinates: frames.map((frame) =>
          toWgs([frame.x, frame.y], map.origin),
        ),
      },
    });
    for (const frame of frames)
      features.push({
        type: "Feature",
        properties: {
          ...base,
          featureType: "trajectoryPoint",
          t: frame.t,
          speedMps: frame.speedMps,
          headingRad: frame.headingRad,
          localX: frame.x,
          localY: frame.y,
        },
        geometry: {
          type: "Point",
          coordinates: toWgs([frame.x, frame.y], map.origin),
        },
      });
  }
  const egoActor = plan.actors.find((actor) => actor.role === "ego"),
    dangerActor = plan.actors.find((actor) => actor.role === "danger"),
    ego = egoActor ? (generated.get(egoActor.name) ?? []) : [],
    danger = dangerActor ? (generated.get(dangerActor.name) ?? []) : [],
    gaps: Array<[number, number]> = [];
  for (let i = 0; i <= Math.round(plan.durationS * 10); i++) {
    const t = i / 10,
      e = at(ego, t),
      d = at(danger, t);
    gaps.push([Math.hypot(e.x - d.x, e.y - d.y), t]);
  }
  const [minimumGap, riskTime] = gaps.reduce(
    (best, item) => (item[0] < best[0] ? item : best),
    [999, 0],
  );
  const accelerations = [...generated.values()].flatMap((frames) =>
      frames
        .slice(1)
        .map(
          (frame, i) =>
            (frame.speedMps - frames[i]!.speedMps) /
            Math.max(frame.t - frames[i]!.t, 1e-9),
        ),
    ),
    maxAcceleration = Math.max(0, ...accelerations),
    maxDeceleration = Math.abs(Math.min(0, ...accelerations)),
    maxSpeed = Math.max(
      ...[...generated.values()].flatMap((frames) =>
        frames.map((f) => f.speedMps),
      ),
    ),
    semanticPassed = ego.length > 0 && danger.length > 0,
    physicalPassed =
      maxAcceleration <= plan.constraints.maxAccelerationMps2 + 0.2 &&
      maxDeceleration <= plan.constraints.maxDecelerationMps2 + 0.2 &&
      maxSpeed <= plan.constraints.maxSpeedMps,
    collisionFree =
      minimumGap >= Math.max(1, plan.constraints.minimumGapM ?? 1),
    report = {
      passed: semanticPassed && physicalPassed && collisionFree,
      semantic: {
        passed: semanticPassed,
        behaviorType: plan.behaviorType,
        selectedRoutes: [
          ...new Set(
            plan.actors.flatMap((a) => [a.startLaneId, a.targetLaneId]),
          ),
        ],
      },
      physical: {
        passed: physicalPassed,
        maxSpeedMps: round(maxSpeed),
        maxAccelerationMps2: round(maxAcceleration),
        maxDecelerationMps2: round(maxDeceleration),
      },
      risk: {
        passed: collisionFree,
        minimumGapM: round(minimumGap),
        riskPeakTimeS: round(riskTime),
        collisionFree,
      },
    };
  return {
    type: "FeatureCollection",
    properties: {
      originWgs84: map.origin,
      selectedRoutes: report.semantic.selectedRoutes,
      validationReport: report,
    },
    features,
  };
}

export {
  bodyWithinLanes,
  overlaps,
  project,
} from "./multi-vehicle/geometry.js";

export * from "./multi-vehicle/behavior-objective.js";
export * from "./multi-vehicle/scenario-plan.js";

// ─── 四层场景生成架构 ────────────────────────────────────────────────
// Layer 1：行为积木（跟车/制动/变道/转向/越线/VRU…，无 LLM）
export * from "./multi-vehicle/behavior-models/index.js";
// Layer 2：场景模板 + 地图拓扑绑定
export * from "./multi-vehicle/scene-templates/index.js";
// Layer 3：参数搜索引擎（LHS + GA）
export * from "./multi-vehicle/scene-search/index.js";
// 行为驱动仿真器：把行为积木积分成真实轨迹并评估危险度
export * from "./multi-vehicle/behavior-simulator.js";
// Layer 4 面向 LLM 的高层入口（选模板/选拓扑/语义参数 → 场景实例）
export * from "./multi-vehicle/scene-generator.js";
