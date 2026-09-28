import type { MultiActor } from "@groundwork/contracts";
import { dimensions, wgs } from "../geometry.js";
import type { CompactFrame } from "./types.js";
import type { MapModel } from "../../index.js";

export type TrajectoryFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Point"; coordinates: [number, number] };
};

export type TrajectoryLine = {
  type: "Feature";
  properties: { actor: string; role: string; featureType: string };
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

/**
 * 从紧凑帧构建 GeoJSON 输出（FeatureCollection）。
 *
 * 包含：每辆车的轨迹 LineString + 每步的 Point Feature。
 * 在仿真循环结束后统一调用，避免在热循环中创建大量 GeoJSON 对象。
 */
export function buildGeoJsonOutput<P extends Record<string, unknown>>(
  compactFrames: CompactFrame[],
  actors: readonly MultiActor[],
  map: MapModel,
  properties: P,
): {
  type: "FeatureCollection";
  properties: P;
  features: (TrajectoryLine | TrajectoryFeature)[];
} {
  const points: TrajectoryFeature[] = [];

  for (const frame of compactFrames) {
    const { t, states: frameStates } = frame;
    for (const s of frameStates) {
      const a = actors.find((a) => a.id === s.id)!;
      points.push({
        type: "Feature",
        properties: {
          actor: a.id,
          name: a.name,
          role: a.role === "ego" ? "ego" : a.id,
          actorRole: a.role,
          featureType: "trajectoryPoint",
          t,
          localX: s.x,
          localY: s.y,
          headingRad: s.heading,
          speedMps: s.speed,
          accelerationMps2: s.acceleration,
          laneId: s.laneId,
          ...dimensions(a.vehicleType),
        },
        geometry: { type: "Point", coordinates: wgs(map, s) },
      });
    }
  }

  const lines = actors.map((a) => ({
    type: "Feature" as const,
    properties: {
      actor: a.id,
      role: a.role === "ego" ? "ego" : a.id,
      featureType: "trajectory",
    },
    geometry: {
      type: "LineString" as const,
      coordinates: points
        .filter((f) => f.properties.actor === a.id)
        .map((f) => f.geometry.coordinates),
    },
  }));

  return {
    type: "FeatureCollection",
    properties,
    features: [...lines, ...points],
  };
}
