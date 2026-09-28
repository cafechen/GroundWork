export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Metres, radians; counterclockwise heading, +x east and +y north. */
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function rectangle(
  x: number,
  y: number,
  length: number,
  width: number,
  yaw = 0,
) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: x + ((a * length) / 2) * c - ((b * width) / 2) * s,
    y: y + ((a * length) / 2) * s + ((b * width) / 2) * c,
  }));
}

export function obstaclePolygon(o: Rect) {
  return rectangle(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h);
}

/** Convex polygon SAT. Touching is conservatively counted as contact. */
export function intersects(a: Point[], b: Point[]) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length];
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      const aa = a.map((v) => v.x * axis.x + v.y * axis.y);
      const bb = b.map((v) => v.x * axis.x + v.y * axis.y);
      if (
        Math.max(...aa) < Math.min(...bb) ||
        Math.max(...bb) < Math.min(...aa)
      )
        return false;
    }
  }
  return true;
}

export function pointSegmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = clamp(
    ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function polygonDistance(a: Point[], b: Point[]) {
  if (intersects(a, b)) return 0;
  let result = Infinity;
  for (const [left, right] of [
    [a, b],
    [b, a],
  ])
    for (const p of left)
      for (let i = 0; i < right.length; i++)
        result = Math.min(
          result,
          pointSegmentDistance(p, right[i], right[(i + 1) % right.length]),
        );
  return result;
}

export function pathDistance(p: Point, route: Point[]) {
  return Math.min(
    ...route.slice(1).map((b, i) => pointSegmentDistance(p, route[i], b)),
  );
}
