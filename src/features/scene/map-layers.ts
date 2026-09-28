import type { MapData } from "../../contracts/platform";
export type MapLevel = MapData["levels"][number];
export type LayerOptions = {
  graph: string;
  lanes: boolean;
  walls: boolean;
  facilities: boolean;
  models: boolean;
  labels: boolean;
};
export const DEFAULT_LAYERS: Readonly<LayerOptions> = Object.freeze({
  graph: "all",
  lanes: true,
  walls: true,
  facilities: true,
  models: true,
  labels: false,
});
export function mapLayers(
  map: MapData,
  levelId: string,
  options: Partial<LayerOptions> = {},
) {
  const level = map.levels.find((l) => l.id === levelId);
  if (!level) throw Error("Unknown map floor / 地图楼层不存在");
  const opts = { ...DEFAULT_LAYERS, ...options };
  const graphs = [...new Set(level.lanes.map((e) => e.graph))].sort(
    (a, b) => a - b,
  );
  const graph = graphs.some((g) => String(g) === opts.graph)
    ? opts.graph
    : "all";
  return {
    graph,
    graphs,
    lanes: opts.lanes
      ? level.lanes.filter((e) => graph === "all" || String(e.graph) === graph)
      : [],
    walls: opts.walls ? level.walls : [],
    doors: opts.facilities ? level.doors : [],
    lifts: opts.facilities
      ? map.lifts.filter((l) => l.levels.includes(levelId))
      : [],
    models: opts.models ? level.models : [],
    labels: opts.labels ? level.vertices.filter((v) => v.name) : [],
  };
}
export function liftPolygon(lift: MapData["lifts"][number]) {
  const c = Math.cos(lift.yaw),
    s = Math.sin(lift.yaw);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: lift.position[0] + (c * a * lift.width) / 2 - (s * b * lift.depth) / 2,
    y: lift.position[1] + (s * a * lift.width) / 2 + (c * b * lift.depth) / 2,
  }));
}
type XY = { x: number; y: number };
function inside(p: XY, vertices: XY[]) {
  let yes = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i],
      b = vertices[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      yes = !yes;
  }
  return yes;
}
export function floorPolygons(
  level: Pick<MapLevel, "vertices" | "floors" | "holes">,
) {
  return level.floors.map((f) => {
    const outer = f.vertices.map((i) => level.vertices[i]);
    return {
      outer,
      holes: level.holes
        .map((h) => h.vertices.map((i) => level.vertices[i]))
        .filter((h) => h.every((p) => inside(p, outer))),
    };
  });
}
export function floorPath(polygon: ReturnType<typeof floorPolygons>[number]) {
  return [polygon.outer, ...polygon.holes]
    .map(
      (v) =>
        v.map((p, i) => `${i ? "L" : "M"} ${p.x} ${-p.y}`).join(" ") + " Z",
    )
    .join(" ");
}
