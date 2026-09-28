import { createHash } from "node:crypto";
import { sceneSpecV2Schema, type SceneSpecV2 } from "@groundwork/contracts";
import type { MapModel } from "../index.js";
import { lanePoint, project } from "./geometry.js";
import { validateSceneSpec } from "./simulation.js";

export function mapFingerprint(map: MapModel) {
  return (
    "boundary-v1:" +
    createHash("sha256").update(JSON.stringify(map)).digest("hex")
  );
}
export function createMultiVehicleTemplate(
  map: MapModel,
  count = 5,
  seed = 42,
): SceneSpecV2 {
  if (!Number.isInteger(count) || count < 5 || count > 50)
    throw new Error("切入模板支持 5～50 辆车");
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  // Traffic is distributed across two lanes. Reserve the actual initial span
  // plus 12 seconds of forward travel rather than charging all cars to one lane.
  const base = Math.max(75, Math.ceil((count - 5) / 2) * 25 + 75);
  const requiredLength = Math.max(320, base + 200);
  const candidates = map.adjacentSameDirection
    .map((link) => ({
      link,
      source: map.roads.find((r) => r.id === link.from)!,
      target: map.roads.find((r) => r.id === link.to)!,
    }))
    .filter(
      (p) =>
        p.source.lengthM > requiredLength && p.target.lengthM > requiredLength,
    )
    .sort(
      (a, b) =>
        Math.min(b.source.lengthM, b.target.lengthM) -
        Math.min(a.source.lengthM, a.target.lengthM),
    );
  for (const { source, target } of candidates) {
    const targetBase = project(target, lanePoint(source, base)).s;
    const placements = [
      {
        id: "Ego",
        name: "A · 被测车",
        role: "ego",
        laneId: target.id,
        positionM: targetBase,
        speed: 11,
        desired: 12,
      },
      {
        id: "CutIn",
        name: "B · 切入车",
        role: "event",
        laneId: source.id,
        positionM: base + 32,
        speed: 9,
        desired: 8,
      },
      {
        id: "Follower",
        name: "C · 后方跟车",
        role: "background",
        laneId: target.id,
        positionM: targetBase - 27,
        speed: 11,
        desired: 12,
      },
      {
        id: "Leader",
        name: "D · 前方慢车",
        role: "background",
        laneId: source.id,
        positionM: base + 67,
        speed: 5,
        desired: 5,
      },
      {
        id: "Rear",
        name: "E · 后方跟车",
        role: "background",
        laneId: target.id,
        positionM: targetBase - 54,
        speed: 11,
        desired: 12,
      },
    ];
    for (let i = 5; i < count; i++)
      placements.push({
        id: `Traffic${i + 1}`,
        name: `背景车 ${i + 1}`,
        role: "background",
        laneId: i % 2 ? source.id : target.id,
        positionM:
          (i % 2 ? base : targetBase) - 75 - Math.floor((i - 5) / 2) * 25,
        speed: 9,
        desired: 10,
      });
    const spec = sceneSpecV2Schema.parse({
      schemaVersion: 2,
      title: `${count} 车切入与连锁减速`,
      mapId: map.mapId,
      mapVersion: mapFingerprint(map),
      seed,
      durationS: 12,
      actors: placements.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        laneId: a.laneId,
        route: [a.laneId],
        positionM: a.positionM,
        speedMps: a.speed,
        profile: {
          desiredSpeedMps: a.desired,
          reactionTimeS: a.id === "Ego" ? 0.6 : 0.25 + random() * 0.2,
          timeHeadwayS: 1.1 + random() * 0.05,
        },
      })),
      events: [
        {
          id: "cut-in",
          actorId: "CutIn",
          action: "lane_change",
          targetLaneId: target.id,
          trigger: { earliestS: 1, latestS: 4, leaderGapBelowM: 40 },
          durationS: 4,
          minimumTargetGapM: 5,
        },
      ],
      objectives: {
        requiredEventIds: ["cut-in"],
        respondingActorIds: ["Ego", "Follower", "Rear"],
      },
      constraints: {},
    });
    try {
      return validateSceneSpec(map, spec);
    } catch {
      /* Try another physically usable pair. */
    }
  }
  throw new Error(
    `当前地图没有足够长且连续的同向相邻车道来放置 ${count} 辆车。请选择长直路地图，或减少车辆数量。`,
  );
}
