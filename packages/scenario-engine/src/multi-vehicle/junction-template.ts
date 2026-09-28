import { sceneSpecV2Schema, type SceneSpecV2 } from "@groundwork/contracts";
import type { MapModel, Road } from "../index.js";
import { movementsConflict } from "./junction-paths.js";
import { mapFingerprint } from "./template.js";
import { validateSceneSpec } from "./simulation.js";
import { lanePoint } from "./geometry.js";

export type JunctionTemplateOptions = {
  turn?: "straight" | "left" | "right";
  nonYielding?: boolean;
};
export function createJunctionTemplate(
  map: MapModel,
  count = 5,
  seed = 42,
  options: JunctionTemplateOptions = {},
): SceneSpecV2 {
  if (!Number.isInteger(count) || count < 2 || count > 50)
    throw new Error("路口模板支持 2～50 辆车");
  const fingerprint = mapFingerprint(map);
  const roads = new Map(map.roads.map((r) => [r.id, r]));
  const approaches = (movement: Road) => {
    const path = [movement.junction!.from];
    while (path.reduce((s, id) => s + roads.get(id)!.lengthM, 0) < 400) {
      const candidates = map.successors
        .filter(
          (l) =>
            l.to === path[0] &&
            !path.includes(l.from) &&
            !roads.get(l.from)?.junction,
        )
        .map((l) => roads.get(l.from)!)
        .sort((a, b) => b.lengthM - a.lengthM);
      if (!candidates.length) break;
      path.unshift(candidates[0]!.id);
    }
    return path;
  };
  const candidates = map.roads.filter((r) => r.junction);
  for (const first of candidates.filter(
    (r) => !options.turn || r.junction!.turn === options.turn,
  )) {
    for (const second of candidates) {
      if (
        first.junction!.from === second.junction!.from ||
        first.junction!.to === second.junction!.to ||
        !movementsConflict(first, second)
      )
        continue;
      const h1 = lanePoint(first, 0).heading,
        h2 = lanePoint(second, 0).heading;
      if (
        Math.abs(Math.atan2(Math.sin(h1 - h2), Math.cos(h1 - h2))) <
        Math.PI / 6
      )
        continue;
      const entries = [approaches(first), approaches(second)],
        turns = [first, second];
      const lengths = entries.map((ids) =>
        ids.reduce((s, id) => s + roads.get(id)!.lengthM, 0),
      );
      const leadDistance = count > 5 ? 20 : 25,
        spacing = count > 5 ? 10 : 12;
      if (
        lengths.some(
          (n) => n < leadDistance + (Math.ceil(count / 2) - 1) * spacing + 3,
        )
      )
        continue;
      const actors = Array.from({ length: count }, (_, i) => {
        const group = i % 2,
          approach = entries[group]!,
          movement = turns[group]!;
        let position =
            lengths[group]! - leadDistance - Math.floor(i / 2) * spacing,
          index = 0;
        while (
          index < approach.length - 1 &&
          position >= roads.get(approach[index]!)!.lengthM
        ) {
          position -= roads.get(approach[index]!)!.lengthM;
          index++;
        }
        return {
          id: i === 0 ? "Ego" : i === 1 ? "Conflict" : `Traffic${i + 1}`,
          name:
            i === 0 ? "A · 被测车" : i === 1 ? "B · 冲突车" : `背景车 ${i + 1}`,
          role: i === 0 ? "ego" : i === 1 ? "event" : "background",
          laneId: approach[index],
          route: [...approach.slice(index), movement.id, movement.junction!.to],
          positionM: Math.max(
            2.8,
            Math.min(position, roads.get(approach[index]!)!.lengthM - 2.8),
          ),
          speedMps: 3,
          profile: {
            desiredSpeedMps: 4,
            reactionTimeS: 0.3,
            timeHeadwayS: 1.5,
          },
        };
      });
      const spec = sceneSpecV2Schema.parse({
        schemaVersion: 2,
        title: `${count} 车路口${first.junction!.turn === "left" ? "左转" : first.junction!.turn === "right" ? "右转" : "直行"}与让行`,
        mapId: map.mapId,
        mapVersion: fingerprint,
        seed,
        durationS: Math.min(60, Math.floor(1500 / count)),
        actors,
        events: [],
        objectives: { requiredEventIds: [] },
        junction: {
          priorities: { Ego: 1 },
          nonYieldingActorIds: options.nonYielding ? ["Conflict"] : [],
          requiredTraversalActorIds: ["Ego", "Conflict"],
        },
        constraints: {
          allowedCollisionPairs: options.nonYielding
            ? [["Ego", "Conflict"]]
            : [],
        },
      });
      try {
        return validateSceneSpec(map, spec);
      } catch {
        /* Try the next geometrically usable pair. */
      }
    }
  }
  throw new Error(
    `当前地图没有满足 ${count} 车布局的${options.turn ?? "任意转向"}路口冲突路径。需要连续进口/出口车道、可容纳车身且转弯半径至少 8 米的路口区域。`,
  );
}
