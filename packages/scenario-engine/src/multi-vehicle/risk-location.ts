import { riskLocationSchema, type RiskLocation } from "@groundwork/contracts";
import type { MapModel } from "../index.js";

export function junctionRegions(map: MapModel) {
  const regions = new Map<string, Array<[number, number][]>>();
  for (const road of map.roads) {
    if (!road.junction) continue;
    const polygons = regions.get(road.junction.id) ?? [];
    if (
      road.polygon &&
      road.polygon.length >= 4 &&
      road.polygon.every((p) => p.every(Number.isFinite))
    )
      polygons.push(road.polygon);
    regions.set(road.junction.id, polygons);
  }
  return regions;
}

export function resolveRiskLocation(
  map: MapModel,
  input: RiskLocation,
): RiskLocation {
  const location = riskLocationSchema.parse(input);
  const regions = junctionRegions(map);
  const ids = [...regions.keys()].sort();
  if (!location.junctionId && ids.length !== 1)
    throw new Error(
      ids.length
        ? `地图包含多个路口，请指定事故路口：${ids.join("、")}`
        : "当前地图没有可识别路口，无法满足事故位置要求",
    );
  const junctionId = location.junctionId ?? ids[0]!;
  if (!regions.get(junctionId)?.length)
    throw new Error(
      `路口 ${junctionId} 不存在或缺少真实区域边界，无法验收事故位置`,
    );
  return { ...location, junctionId };
}

function distanceToPolygon(x: number, y: number, polygon: [number, number][]) {
  let inside = false;
  let distance = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!,
      b = polygon[i]!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const u = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    distance = Math.min(
      distance,
      Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy),
    );
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 0 : distance;
}

/** The encounter point is the midpoint of the two vehicle centres at first
 * overlap, or closest approach for a non-collision. Never use lane labels or
 * model-provided success flags as evidence of the accident location. */
export function evaluateRiskLocation(
  map: MapModel | undefined,
  location: RiskLocation,
  encounter?: { x: number; y: number; timeS: number },
) {
  try {
    if (!map) throw new Error("缺少地图，无法验收事故位置");
    const resolved = resolveRiskLocation(map, location);
    if (
      !encounter ||
      ![encounter.x, encounter.y, encounter.timeS].every(Number.isFinite)
    )
      throw new Error("缺少有效的事故位置轨迹证据");
    const distanceM = Math.min(
      ...junctionRegions(map)
        .get(resolved.junctionId!)!
        .map((p) => distanceToPolygon(encounter.x, encounter.y, p)),
    );
    return {
      ...resolved,
      ...encounter,
      distanceM,
      passed: distanceM <= resolved.maxDistanceM + 1e-6,
    };
  } catch (error) {
    return {
      ...location,
      passed: false,
      reason: error instanceof Error ? error.message : "事故位置验收失败",
    };
  }
}
