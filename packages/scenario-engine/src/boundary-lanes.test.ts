import { describe, expect, it } from "vitest";
import { boundaryLanes } from "./boundary-lanes.js";
import {
  loadMap,
  createMultiVehicleTemplate,
  simulateMultiVehicle,
  type MapModel,
} from "./index.js";
import { bodyWithinLanes, lanePoint } from "./multi-vehicle/geometry.js";
import { resolve } from "node:path";

function fixture() {
  const boundaries = Array.from({ length: 5 }, (_, i) => ({
    properties: {
      id: i + 1,
      line_type: i === 0 || i === 4 ? "solid" : "broken",
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [0, i * 3.5],
        [600, i * 3.5],
      ],
    },
  }));
  const groups = [
    {
      properties: { id: 7, boundrys: "1,2,3,4,5" },
      geometry: { type: "Polygon" },
    },
  ];
  const parse = () => boundaryLanes(groups, boundaries, (p) => p);
  return { boundaries, groups, parse };
}
describe("boundary-backed lanes", () => {
  it("splits a four-lane road group and keeps each center between two boundaries", () => {
    const { parse } = fixture();
    const m = parse();
    expect(m.roads).toHaveLength(4);
    expect(m.roads.map((r) => r.centerline[0]![1])).toEqual([
      1.75, 5.25, 8.75, 12.25,
    ]);
    expect(m.roads.every((r) => r.widthM === 3.5)).toBe(true);
    expect(m.adjacentSameDirection).toHaveLength(6);
    expect(
      m.adjacentSameDirection.some(
        (l) => l.from === m.roads[0]!.id && l.to === m.roads[2]!.id,
      ),
    ).toBe(false);
  });
  it("does not allow crossing solid or unknown boundaries", () => {
    const f = fixture();
    f.boundaries[2]!.properties.line_type = "solid";
    expect(f.parse().adjacentSameDirection).toHaveLength(4);
    f.boundaries[2]!.properties.line_type = "unknown";
    expect(f.parse().adjacentSameDirection).toHaveLength(4);
  });
  it("normalizes reversed boundaries and skips incomplete groups and unclassified strips", () => {
    const f = fixture();
    f.boundaries[2]!.geometry.coordinates.reverse();
    expect(f.parse().roads).toHaveLength(4);
    f.groups[0]!.properties.boundrys = "1,99,5";
    expect(f.parse().roads).toHaveLength(0);
    expect(f.parse().diagnostics[0]).toContain("missing");
    f.groups[0]!.properties.boundrys = "1,2";
    expect(f.parse().roads).toHaveLength(0);
  });
  it("checks the car body, including an allowed lane-change corridor", () => {
    const m = fixture().parse(),
      a = m.roads[0]!,
      b = m.roads[1]!;
    const body = { x: 100, y: 1.75, heading: 0, lengthM: 4.7, widthM: 1.9 };
    expect(bodyWithinLanes(body, [a])).toBe(true);
    expect(bodyWithinLanes({ ...body, widthM: 4 }, [a])).toBe(false);
    expect(bodyWithinLanes({ ...body, y: 3.2 }, [a])).toBe(false);
    expect(bodyWithinLanes({ ...body, y: 3.5 }, [a, b])).toBe(true);
    expect(bodyWithinLanes({ ...body, y: 0.5 }, [a, b])).toBe(false);
    expect(bodyWithinLanes({ ...body, x: 1 }, [a])).toBe(false);
  });
  it("detects later boundary excursions even when the initial body is inside", () => {
    const parsed = fixture().parse();
    const map: MapModel = { mapId: "road", origin: [116, 40], ...parsed };
    const spec = createMultiVehicleTemplate(map);
    const lane = map.roads.find((r) => r.id === spec.actors[0]!.laneId)!;
    // Narrow only the later corridor, leaving the initial pose valid.
    lane.polygon = [
      [0, lane.centerline[0]![1] - 1.75],
      [100, lane.centerline[0]![1] - 1.75],
      [200, lane.centerline[0]![1] - 0.5],
      [600, lane.centerline[0]![1] - 0.5],
      [600, lane.centerline[0]![1] + 0.5],
      [200, lane.centerline[0]![1] + 0.5],
      [100, lane.centerline[0]![1] + 1.75],
      [0, lane.centerline[0]![1] + 1.75],
    ];
    const result = simulateMultiVehicle(map, spec).properties.validationReport;
    expect(result.passed).toBe(false);
    expect(
      result.physical.violations.some((v) => v.kind === "lane_boundary"),
    ).toBe(true);
  });
  it("keeps real Xushui cruising trajectories inside individual lanes for 5, 10 and 20 cars", async () => {
    const map = await loadMap(
      resolve(import.meta.dirname, "../../../apps/api/data/maps"),
      "xushui-expressway",
    );
    expect(map.roads.filter((r) => r.sourceLaneId === "21")).toHaveLength(4);
    expect(map.roads.some((r) => r.sourceLaneId === "22")).toBe(false);
    for (const n of [5, 10, 20]) {
      const spec = createMultiVehicleTemplate(map, n);
      const result = simulateMultiVehicle(map, spec);
      expect(result.properties.validationReport.passed).toBe(true);
      expect(
        result.properties.validationReport.roadGeometry.boundaryBacked,
      ).toBe(true);
      for (const actor of spec.actors.filter((a) => a.id !== "CutIn")) {
        const lane = map.roads.find((r) => r.id === actor.laneId)!;
        expect(lane.widthM).toBeGreaterThan(3.6);
        expect(lane.widthM).toBeLessThan(4);
        expect(
          bodyWithinLanes(
            { ...lanePoint(lane, actor.positionM), lengthM: 4.7, widthM: 1.9 },
            [lane],
          ),
        ).toBe(true);
      }
    }
  }, 15000);
});
