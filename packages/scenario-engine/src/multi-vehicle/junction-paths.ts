import type { MapModel, Road } from "../index.js";
import { bodyWithinLanes, lanePoint, project } from "./geometry.js";
type XY = [number, number];
const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Generate geometric candidates, never inferred legal turning permissions. */
export function connectJunctions(
  map: MapModel,
  features: any[],
  stopLines: any[],
  local: (p: XY) => XY,
): MapModel {
  const additions: Road[] = [];
  const links = [...map.successors];
  const diagnostics = [...(map.diagnostics ?? [])];
  for (const [index, feature] of features.entries()) {
    if (feature.geometry?.type !== "Polygon") continue;
    const polygon: XY[] = feature.geometry.coordinates[0].map(local);
    if (polygon.length < 4 || feature.geometry.coordinates.length > 1) continue;
    const id = String(feature.properties?.id ?? index);
    const near = (p: XY) => {
      let best = Infinity;
      for (let i = 1; i < polygon.length; i++) {
        const a = polygon[i - 1]!,
          b = polygon[i]!,
          dx = b[0] - a[0],
          dy = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) /
              Math.max(1e-9, dx * dx + dy * dy),
          ),
        );
        best = Math.min(best, distance(p, [a[0] + t * dx, a[1] + t * dy]));
      }
      return best;
    };
    const center: XY = [
      polygon.reduce((s, p) => s + p[0], 0) / polygon.length,
      polygon.reduce((s, p) => s + p[1], 0) / polygon.length,
    ];
    const incoming = map.roads.filter((r) => {
      const p = lanePoint(r, r.lengthM);
      return (
        near([p.x, p.y]) < 8 &&
        (center[0] - p.x) * Math.cos(p.heading) +
          (center[1] - p.y) * Math.sin(p.heading) >
          3
      );
    });
    const outgoing = map.roads.filter((r) => {
      const p = lanePoint(r, 0);
      return (
        near([p.x, p.y]) < 8 &&
        (p.x - center[0]) * Math.cos(p.heading) +
          (p.y - center[1]) * Math.sin(p.heading) >
          3
      );
    });
    for (const from of incoming)
      for (const to of outgoing) {
        if (from.id === to.id) continue;
        const a = lanePoint(from, from.lengthM),
          b = lanePoint(to, 0);
        const delta = angle(b.heading - a.heading),
          span = Math.hypot(b.x - a.x, b.y - a.y);
        if (span < 5 || span > 120 || Math.abs(delta) > Math.PI * 0.85)
          continue;
        const turn =
          Math.abs(delta) < Math.PI / 6
            ? "straight"
            : delta > 0
              ? "left"
              : "right";
        const widthM = Math.min(from.widthM, to.widthM);
        // Cubic Bezier matches both endpoint tangents. Dense arc samples bound
        // heading changes at integration time, and curvature rejects tight loops.
        const handle = span * (turn === "straight" ? 1 / 3 : 0.4);
        const c: XY = [
          a.x + handle * Math.cos(a.heading),
          a.y + handle * Math.sin(a.heading),
        ];
        const d: XY = [
          b.x - handle * Math.cos(b.heading),
          b.y - handle * Math.sin(b.heading),
        ];
        const points: XY[] = [];
        let curvature = 0,
          valid = true;
        const region: Road = { ...from, polygon };
        const n = Math.ceil(span / 0.08);
        for (let i = 0; i <= n; i++) {
          const t = i / n,
            u = 1 - t;
          const x =
            u * u * u * a.x +
            3 * u * u * t * c[0] +
            3 * u * t * t * d[0] +
            t * t * t * b.x;
          const y =
            u * u * u * a.y +
            3 * u * u * t * c[1] +
            3 * u * t * t * d[1] +
            t * t * t * b.y;
          const dx =
            3 * u * u * (c[0] - a.x) +
            6 * u * t * (d[0] - c[0]) +
            3 * t * t * (b.x - d[0]);
          const dy =
            3 * u * u * (c[1] - a.y) +
            6 * u * t * (d[1] - c[1]) +
            3 * t * t * (b.y - d[1]);
          const ddx =
            6 * u * (d[0] - 2 * c[0] + a.x) + 6 * t * (b.x - 2 * d[0] + c[0]);
          const ddy =
            6 * u * (d[1] - 2 * c[1] + a.y) + 6 * t * (b.y - 2 * d[1] + c[1]);
          curvature = Math.max(
            curvature,
            Math.abs(dx * ddy - dy * ddx) /
              Math.max(1e-9, Math.pow(dx * dx + dy * dy, 1.5)),
          );
          if (curvature > 0.125) {
            valid = false;
            break;
          }
          if (
            i % 10 === 0 &&
            !bodyWithinLanes(
              { x, y, heading: Math.atan2(dy, dx), lengthM: 4.7, widthM: 1.9 },
              [from, region, to],
            )
          ) {
            valid = false;
            break;
          }
          points.push([x, y]);
        }
        if (!valid) continue;
        let stopPositionM = from.lengthM - 3;
        for (const stop of stopLines) {
          const coordinates =
            stop.geometry?.type === "Polygon"
              ? stop.geometry.coordinates[0]
              : stop.geometry?.type === "LineString"
                ? stop.geometry.coordinates
                : [];
          const projected = coordinates.map((p: XY) => {
            const q = local(p);
            return project(from, { x: q[0], y: q[1], heading: 0 });
          });
          const hit = projected.filter(
            (p: { s: number; distance: number }) =>
              p.distance < widthM / 2 + 1 &&
              p.s > from.lengthM - 20 &&
              p.s < from.lengthM - 0.5,
          );
          if (hit.length)
            stopPositionM = Math.min(
              stopPositionM,
              ...hit.map((p: { s: number }) => p.s),
            );
        }
        const connector: Road = {
          id: `jc_${id}_${additions.length}`,
          widthM,
          centerline: points,
          lengthM: points
            .slice(1)
            .reduce((s, p, i) => s + distance(p, points[i]!), 0),
          entryHeadingDeg: (a.heading * 180) / Math.PI,
          geometrySource: "junction_connector",
          polygon,
          junction: {
            id,
            from: from.id,
            to: to.id,
            turn,
            maxCurvature: curvature,
            stopPositionM,
          },
        };
        additions.push(connector);
        links.push(
          { from: from.id, to: connector.id },
          { from: connector.id, to: to.id },
        );
      }
    diagnostics.push(
      `junction ${id}: geometric connectors ${additions.filter((r) => r.junction!.id === id).length}; legal directions/turn permissions require map confirmation`,
    );
  }
  return additions.length
    ? {
        ...map,
        roads: [...map.roads, ...additions],
        successors: links,
        diagnostics,
      }
    : map;
}

/** Conservatively intersect swept centerline corridors, including merge exits. */
export function movementsConflict(a: Road, b: Road) {
  if (a.junction?.id !== b.junction?.id) return false;
  if (
    a.id === b.id ||
    a.junction?.from === b.junction?.from ||
    a.junction?.to === b.junction?.to
  )
    return true;
  const spacing = 1;
  const aa = Array.from(
    { length: Math.ceil(a.lengthM / spacing) + 1 },
    (_, i) => lanePoint(a, Math.min(a.lengthM, i * spacing)),
  );
  const bb = Array.from(
    { length: Math.ceil(b.lengthM / spacing) + 1 },
    (_, i) => lanePoint(b, Math.min(b.lengthM, i * spacing)),
  );
  const clearance = (a.widthM + b.widthM) / 2 + spacing;
  return aa.some((p) =>
    bb.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < clearance),
  );
}
