/** Metres, radians; counterclockwise heading, +x east and +y north. */
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function rectangle(x, y, length, width, yaw = 0) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => ({
    x: x + a * length / 2 * c - b * width / 2 * s,
    y: y + a * length / 2 * s + b * width / 2 * c,
  }));
}

export function obstaclePolygon(o) { return rectangle(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h); }

/** Convex polygon SAT. Touching is conservatively counted as contact. */
export function intersects(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const axis = { x: -(q.y - p.y), y: q.x - p.x };
      const aa = a.map(v => v.x * axis.x + v.y * axis.y);
      const bb = b.map(v => v.x * axis.x + v.y * axis.y);
      if (Math.max(...aa) < Math.min(...bb) || Math.max(...bb) < Math.min(...aa)) return false;
    }
  }
  return true;
}

export function pointSegmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx + dy*dy || 1), 0, 1);
  return distance(p, { x: a.x + t*dx, y: a.y + t*dy });
}

export function polygonDistance(a, b) {
  if (intersects(a,b)) return 0;
  let result = Infinity;
  for (const [left, right] of [[a,b],[b,a]]) for (const p of left)
    for (let i = 0; i < right.length; i++)
      result = Math.min(result, pointSegmentDistance(p, right[i], right[(i+1)%right.length]));
  return result;
}

export function pathDistance(p, route) {
  return Math.min(...route.slice(1).map((b,i) => pointSegmentDistance(p, route[i], b)));
}
