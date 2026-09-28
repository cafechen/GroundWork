import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  describeMap,
  generateTrajectory,
  laneLabels,
  loadMap,
  type EnginePlan,
} from "./index.js";

const mapsRoot = resolve(import.meta.dirname, "../../../apps/api/data/maps");

describe("TypeScript scenario engine", () => {
  it("rejects map identifiers that could escape the configured map root", async () => {
    await expect(loadMap(mapsRoot, "../cross_1301")).rejects.toThrow(
      "地图编号不合法",
    );
  });

  it("extracts the executable lanes and labels from GeoJSON", async () => {
    const map = await loadMap(mapsRoot, "cross_1301");
    const egoLane = map.adjacentSameDirection[0]!.to;
    const dangerLane = map.adjacentSameDirection[0]!.from;
    const description = describeMap(map);
    expect(description.roads.filter((r) => !r.junction)).toHaveLength(53);
    expect(description.roads.some((r) => r.junction)).toBe(true);
    expect(description.roads.map((road) => road.id)).toContain(egoLane);
    expect(map.adjacentSameDirection).toContainEqual(
      expect.objectContaining({
        from: dangerLane,
        to: egoLane,
        boundaryId: expect.any(String),
      }),
    );
    expect(laneLabels(map).features).toHaveLength(map.roads.length);
  });

  it("loads LineString lanes and preserves the map-provided topology", async () => {
    const map = await loadMap(mapsRoot, "hzw-jiudian");
    const description = describeMap(map);

    expect(map.roads).toHaveLength(313);
    expect(description.roads).toContainEqual(
      expect.objectContaining({ id: "lane_18", maxSpeedKmh: 50 }),
    );
    expect(map.successors).toContainEqual({ from: "lane_18", to: "lane_284" });
    expect(map.adjacentSameDirection).toContainEqual(
      expect.objectContaining({
        from: "lane_284",
        to: "lane_334",
        side: "right",
      }),
    );
    expect(laneLabels(map).features).toHaveLength(313);
  });

  it("assigns stable IDs to candidate LineStrings without lane topology fields", async () => {
    const map = await loadMap(mapsRoot, "weifang-rdc-slc");

    expect(map.roads).toHaveLength(1031);
    expect(map.roads.map((road) => road.id)).toContain("lane_324C");
    expect(map.adjacentSameDirection.length).toBeLessThanOrEqual(
      map.roads.length * 2,
    );
    expect(laneLabels(map).features).toHaveLength(1031);
  });

  it("generates dense, curved, heading-aware trajectories from a confirmed plan", async () => {
    const map = await loadMap(mapsRoot, "cross_1301");
    const egoLane = map.adjacentSameDirection[0]!.to;
    const dangerLane = map.adjacentSameDirection[0]!.from;
    const plan: EnginePlan = {
      durationS: 12,
      behaviorType: "overtake",
      actors: [
        {
          name: "Ego",
          role: "ego",
          vehicleType: "car",
          startLaneId: egoLane,
          targetLaneId: egoLane,
          keyframes: [
            { t: 0, s: 0, speedMps: 10 },
            { t: 12, s: 120, speedMps: 10 },
          ],
        },
        {
          name: "DangerVehicle",
          role: "danger",
          vehicleType: "heavy_truck",
          startLaneId: dangerLane,
          targetLaneId: egoLane,
          keyframes: [
            { t: 0, s: -20, speedMps: 10 },
            { t: 4, s: 20, speedMps: 12 },
            { t: 8, s: 80, speedMps: 16 },
            { t: 12, s: 140, speedMps: 16 },
          ],
        },
      ],
      phases: [
        { name: "接近", startTimeS: 0, endTimeS: 4 },
        { name: "并线超车", startTimeS: 4, endTimeS: 8 },
        { name: "完成", startTimeS: 8, endTimeS: 12 },
      ],
      constraints: {
        maxAccelerationMps2: 3,
        maxDecelerationMps2: 5,
        maxSpeedMps: 25,
        minimumGapM: 1,
        collisionFree: true,
      },
    };
    const result = generateTrajectory(map, plan);
    const points = result.features.filter(
      (feature: any) => feature.properties.featureType === "trajectoryPoint",
    );
    expect(points).toHaveLength(242);
    expect(
      points.every((feature: any) =>
        Number.isFinite(feature.properties.headingRad),
      ),
    ).toBe(true);
    expect(result.properties.validationReport.semantic.passed).toBe(true);
    expect(
      result.features.filter(
        (feature: any) => feature.properties.featureType === "trajectory",
      ),
    ).toHaveLength(2);
  });

  it("reports a collision when actor centers violate the configured minimum gap", async () => {
    const map = await loadMap(mapsRoot, "cross_1301");
    const egoLane = map.adjacentSameDirection[0]!.to;
    const plan: EnginePlan = {
      durationS: 2,
      behaviorType: "following",
      actors: [
        {
          name: "Ego",
          role: "ego",
          vehicleType: "car",
          startLaneId: egoLane,
          targetLaneId: egoLane,
          keyframes: [
            { t: 0, s: 0, speedMps: 5 },
            { t: 2, s: 10, speedMps: 5 },
          ],
        },
        {
          name: "DangerVehicle",
          role: "danger",
          vehicleType: "car",
          startLaneId: egoLane,
          targetLaneId: egoLane,
          keyframes: [
            { t: 0, s: 0.1, speedMps: 5 },
            { t: 2, s: 10.1, speedMps: 5 },
          ],
        },
      ],
      phases: [{ name: "跟车", startTimeS: 0, endTimeS: 2 }],
      constraints: {
        maxAccelerationMps2: 3,
        maxDecelerationMps2: 5,
        maxSpeedMps: 25,
        minimumGapM: 2,
        collisionFree: true,
      },
    };

    const result = generateTrajectory(map, plan);

    expect(result.properties.validationReport.passed).toBe(false);
    expect(result.properties.validationReport.risk.collisionFree).toBe(false);
  });

  it("preserves meter-based following gaps on short candidate lane segments", async () => {
    const map = await loadMap(mapsRoot, "weifang-rdc-slc");
    const lane = map.roads.find((road) => road.id === "lane_27742")!;
    const plan: EnginePlan = {
      durationS: 12,
      behaviorType: "following",
      actors: [
        {
          name: "Ego",
          role: "ego",
          vehicleType: "car",
          startLaneId: lane.id,
          targetLaneId: lane.id,
          keyframes: [
            { t: 0, s: -30, speedMps: 5 },
            { t: 12, s: 30, speedMps: 5 },
          ],
        },
        {
          name: "DangerVehicle",
          role: "danger",
          vehicleType: "car",
          startLaneId: lane.id,
          targetLaneId: lane.id,
          keyframes: [
            { t: 0, s: -10, speedMps: 5 },
            { t: 12, s: 50, speedMps: 5 },
          ],
        },
      ],
      phases: [{ name: "稳定跟车", startTimeS: 0, endTimeS: 12 }],
      constraints: {
        maxAccelerationMps2: 3,
        maxDecelerationMps2: 5,
        maxSpeedMps: 25,
        minimumGapM: 2,
        collisionFree: true,
      },
    };

    const report = generateTrajectory(map, plan).properties.validationReport;
    expect(report.risk.minimumGapM).toBeCloseTo(20, 1);
    expect(report.passed).toBe(true);
  });
});
