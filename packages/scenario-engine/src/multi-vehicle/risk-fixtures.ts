import { sceneSpecV2Schema } from "@groundwork/contracts";
import type { DrivingStyle } from "./risk-generation.js";
const ids = ["Ego", "Conflict", "Follower", "TurnFollower", "Background"];
export const styles: DrivingStyle[] = ids.map((actorId, i) => ({
  actorId,
  sourceUuid: String(i),
  lateralOffsetsM: Array.from(
    { length: 12 },
    (_, k) => 0.12 + 0.04 * Math.sin(k / 3 + i),
  ),
  speedRatios: Array.from(
    { length: 12 },
    (_, k) => 1 + 0.05 * Math.sin(k / 3 + i),
  ),
}));
export function source() {
  return sceneSpecV2Schema.parse({
    schemaVersion: 2,
    title: "test source",
    mapId: "cross_0001",
    mapVersion: "test",
    seed: 42,
    durationS: 10,
    actors: ids.map((id, i) => ({
      id,
      name: id,
      role: i ? "background" : "ego",
      controlMode: "replay",
      laneId: "lane",
      positionM: 0,
      speedMps: 0,
      profile: {},
      replay: [
        { t: 0, positionM: 0 },
        { t: 10, positionM: 50 },
      ],
    })),
    events: [],
    objectives: { requiredEventIds: [] },
    constraints: {},
    reference: {
      mode: "indexed_reference_replay",
      dataset: "wanji-50",
      sourceId: "test",
      sourceKey: "test/optimized_data.json",
      sourceSha256: "a".repeat(64),
      sourceStartMs: 0,
      sourceOffsetS: 0,
      sourceDurationS: 10,
      requestedSpeedFactor: 1,
      appliedSpeedFactor: 1,
      tracks: ids.map((actorId, i) => ({
        actorId,
        sourceUuid: String(i),
        samples: Array.from({ length: 107 }, (_, k) => [
          (k - 3) / 10,
          k / 2,
          i * 4,
          0,
        ]),
      })),
    },
  });
}
