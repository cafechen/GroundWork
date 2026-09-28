import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { connectJunctions, movementsConflict } from "./junction-paths.js";
import { createJunctionTemplate } from "./junction-template.js";
import { simulateMultiVehicle, validateSceneSpec } from "./simulation.js";
import { loadMap, type MapModel, type Road } from "../index.js";
import { lanePoint } from "./geometry.js";

function fixture() {
  const road = (
    id: string,
    a: [number, number],
    b: [number, number],
  ): Road => ({
    id,
    widthM: 3.5,
    centerline: [a, b],
    lengthM: Math.hypot(b[0] - a[0], b[1] - a[1]),
    entryHeadingDeg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
  });
  const map: MapModel = {
    mapId: "junction",
    origin: [116, 40],
    successors: [],
    adjacentSameDirection: [],
    roads: [
      road("west_in", [-160, -2], [-15, -2]),
      road("east_out", [15, -2], [160, -2]),
      road("south_in", [2, -160], [2, -15]),
      road("north_out", [2, 15], [2, 160]),
      road("east_in", [160, 2], [15, 2]),
      road("west_out", [-15, 2], [-160, 2]),
      road("north_in", [-2, 160], [-2, 15]),
      road("south_out", [-2, -15], [-2, -160]),
    ],
  };
  return connectJunctions(
    map,
    [
      {
        properties: { id: 1 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-15, -15],
              [15, -15],
              [15, 15],
              [-15, 15],
              [-15, -15],
            ],
          ],
        },
      },
    ],
    [],
    (p) => p,
  );
}
describe("junction paths and right-of-way", () => {
  it("constructs continuous straight/left/right connectors with bounded curvature", () => {
    const map = fixture(),
      connectors = map.roads.filter((r) => r.junction);
    expect(new Set(connectors.map((r) => r.junction!.turn))).toEqual(
      new Set(["straight", "left", "right"]),
    );
    for (const r of connectors) {
      expect(r.junction!.maxCurvature).toBeLessThanOrEqual(0.125);
      const from = map.roads.find((x) => x.id === r.junction!.from)!;
      const to = map.roads.find((x) => x.id === r.junction!.to)!;
      expect(r.centerline[0]).toEqual(from.centerline.at(-1));
      expect(r.centerline.at(-1)).toEqual(to.centerline[0]);
    }
    expect(() =>
      createJunctionTemplate(
        { ...map, roads: map.roads.filter((r) => !r.junction) },
        5,
      ),
    ).toThrow("路口冲突路径");
  });
  it("detects crossing movements and lets a waiting vehicle proceed after clearance", () => {
    const map = fixture(),
      spec = createJunctionTemplate(map, 5, 42, { turn: "straight" });
    const a = map.roads.find(
      (r) => r.id === spec.actors[0]!.route.find((id) => id.startsWith("jc_")),
    )!;
    const b = map.roads.find(
      (r) => r.id === spec.actors[1]!.route.find((id) => id.startsWith("jc_")),
    )!;
    expect(movementsConflict(a, b)).toBe(true);
    const result = simulateMultiVehicle(map, spec),
      r = result.properties.validationReport;
    expect(r.passed, JSON.stringify(r.physical)).toBe(true);
    const ego = r.junction!.traversals.find((t) => t.actorId === "Ego")!;
    const conflict = r.junction!.traversals.find(
      (t) => t.actorId === "Conflict",
    )!;
    expect(conflict.enteredAt!).toBeGreaterThan(ego.exitedAt!);
    expect(conflict.waitingS).toBeGreaterThan(0);
    expect(
      r.junction!.yields.some(
        (y) => y.actorId === "Conflict" && y.toActorId === "Ego",
      ),
    ).toBe(true);
    const points = result.features.filter(
      (f) =>
        f.geometry.type === "Point" &&
        f.properties.actor === "Conflict" &&
        Number(f.properties.t) < ego.exitedAt!,
    );
    expect(points.some((p) => Number(p.properties.speedMps) < 0.2)).toBe(true);
    expect(r.risk.collisionFree).toBe(true);
  });
  it("honors configured priority and is invariant to actor array order", () => {
    const map = fixture(),
      spec = createJunctionTemplate(map, 5);
    spec.junction!.priorities = { Conflict: 10 };
    const first = simulateMultiVehicle(map, spec).properties.validationReport;
    const reversed = simulateMultiVehicle(map, {
      ...spec,
      actors: [...spec.actors].reverse(),
    }).properties.validationReport;
    expect(first).toEqual(reversed);
    const ts = first.junction!.traversals;
    expect(ts.find((t) => t.actorId === "Conflict")!.enteredAt!).toBeLessThan(
      ts.find((t) => t.actorId === "Ego")!.enteredAt!,
    );
  });
  it("does not let a rear vehicle priority deadlock its queue leader", () => {
    const map = fixture(),
      spec = createJunctionTemplate(map, 5);
    spec.junction!.priorities = { Traffic3: 100 };
    const r = simulateMultiVehicle(map, spec).properties.validationReport;
    expect(r.junction!.passed).toBe(true);
    const t = r.junction!.traversals;
    expect(t.find((x) => x.actorId === "Ego")!.enteredAt!).toBeLessThan(
      t.find((x) => x.actorId === "Traffic3")!.enteredAt!,
    );
  });
  it("can deliberately disable yielding without disabling collision detection", () => {
    const map = fixture(),
      spec = createJunctionTemplate(map, 2, 42, {
        turn: "straight",
        nonYielding: true,
      });
    const r = simulateMultiVehicle(map, spec).properties.validationReport;
    expect(r.risk.collisions.length).toBeGreaterThan(0);
    expect(r.risk.collisions.every((c) => c.expected)).toBe(true);
    expect(r.junction!.yields).toEqual([]);
  });
  it("fails incomplete traversal objectives and disconnected routes", () => {
    const map = fixture(),
      spec = createJunctionTemplate(map, 5);
    spec.durationS = 5;
    expect(
      simulateMultiVehicle(map, spec).properties.validationReport.junction!
        .passed,
    ).toBe(false);
    spec.actors[0]!.route[2] = "north_out";
    expect(() => validateSceneSpec(map, spec)).toThrow("不连通");
  });
  it("validates straight, left and right five- and ten-car scenes on the real Kechuang map", async () => {
    const map = await loadMap(
      fileURLToPath(
        new URL("../../../../apps/api/data/maps/", import.meta.url),
      ),
      "kechuang-12-jinghai-9",
    );
    for (const turn of ["straight", "left", "right"] as const)
      for (const count of [5, 10]) {
        const spec = createJunctionTemplate(map, count, 42, { turn });
        const r = simulateMultiVehicle(map, spec).properties.validationReport;
        expect(r.passed, JSON.stringify({ turn, report: r })).toBe(true);
        expect(
          r.junction!.traversals.filter((t) => t.exitedAt !== undefined).length,
        ).toBeGreaterThanOrEqual(2);
        for (const a of spec.actors)
          expect(
            lanePoint(
              map.roads.find((r) => r.id === a.laneId)!,
              a.positionM,
            ).x,
          ).toBeTypeOf("number");
      }
  }, 20000);
});
