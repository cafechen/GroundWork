import type { MapModel, Road } from "../index.js";
export type Point = { x: number; y: number; heading: number };
function inPolygon(x: number, y: number, polygon: [number, number][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
// Check the whole perimeter, not just the center; sampling also catches a
// vehicle straddling the outer edge of a curved two-lane change corridor.
export function bodyWithinLanes(
  body: Point & { lengthM: number; widthM: number },
  lanes: Road[],
) {
  const inside = (x: number, y: number) =>
    lanes.some((road) =>
      road.polygon
        ? inPolygon(x, y, road.polygon)
        : project(road, { x, y, heading: body.heading }).distance <=
          road.widthM / 2,
    );
  const c = Math.cos(body.heading),
    s = Math.sin(body.heading);
  const test = (u: number, v: number) =>
    inside(body.x + u * c - v * s, body.y + u * s + v * c);
  if (!test(0, 0)) return false;
  const along = Math.ceil(body.lengthM / 0.25),
    across = Math.ceil(body.widthM / 0.25);
  for (let i = 0; i <= along; i++)
    for (const side of [-1, 1])
      if (
        !test(
          -body.lengthM / 2 + (body.lengthM * i) / along,
          (side * body.widthM) / 2,
        )
      )
        return false;
  for (let i = 0; i <= across; i++)
    for (const end of [-1, 1])
      if (
        !test(
          (end * body.lengthM) / 2,
          -body.widthM / 2 + (body.widthM * i) / across,
        )
      )
        return false;
  return true;
}
export function lanePoint(road: Road, s: number): Point {
  let remaining = Math.max(0, Math.min(s, road.lengthM));
  for (let i = 1; i < road.centerline.length; i++) {
    const a = road.centerline[i - 1]!,
      b = road.centerline[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= length || i === road.centerline.length - 1) {
      const u = Math.min(1, remaining / Math.max(length, 1e-9));
      return {
        x: a[0] + (b[0] - a[0]) * u,
        y: a[1] + (b[1] - a[1]) * u,
        heading: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    }
    remaining -= length;
  }
  throw new Error(`车道 ${road.id} 缺少有效中心线`);
}
export function project(road: Road, p: Point) {
  let best = { s: 0, distance: Infinity },
    offset = 0;
  for (let i = 1; i < road.centerline.length; i++) {
    const a = road.centerline[i - 1]!,
      b = road.centerline[i]!;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = Math.hypot(dx, dy);
    const u = Math.max(
      0,
      Math.min(
        1,
        ((p.x - a[0]) * dx + (p.y - a[1]) * dy) /
          Math.max(length * length, 1e-9),
      ),
    );
    const distance = Math.hypot(p.x - a[0] - u * dx, p.y - a[1] - u * dy);
    if (distance < best.distance) best = { s: offset + u * length, distance };
    offset += length;
  }
  return best;
}
export function wgs(map: MapModel, p: Point): [number, number] {
  return [
    map.origin[0] +
      ((p.x / (6378137 * Math.cos((map.origin[1] * Math.PI) / 180))) * 180) /
        Math.PI,
    map.origin[1] + ((p.y / 6378137) * 180) / Math.PI,
  ];
}
export const dimensions = (type: string) =>
  type === "heavy_truck"
    ? { lengthM: 12, widthM: 2.6, heightM: 3.6 }
    : { lengthM: 4.7, widthM: 1.9, heightM: 1.6 };
export function overlaps(
  a: Point & { lengthM: number; widthM: number },
  b: Point & { lengthM: number; widthM: number },
) {
  // Separating axis test for oriented vehicle footprints, not center distance.
  for (const h of [
    a.heading,
    a.heading + Math.PI / 2,
    b.heading,
    b.heading + Math.PI / 2,
  ]) {
    const radius = (p: typeof a) =>
      (Math.abs(Math.cos(p.heading - h)) * p.lengthM) / 2 +
      (Math.abs(Math.sin(p.heading - h)) * p.widthM) / 2;
    if (
      Math.abs((b.x - a.x) * Math.cos(h) + (b.y - a.y) * Math.sin(h)) >=
      radius(a) + radius(b)
    )
      return false;
  }
  return true;
}
