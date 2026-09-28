import { overlaps } from "./geometry.js";
type Body = {
  x: number;
  y: number;
  heading: number;
  lengthM: number;
  widthM: number;
};
export type RiskFrame = {
  t: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
};
function corners(p: Body) {
  const c = Math.cos(p.heading),
    s = Math.sin(p.heading);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => ({
    x: p.x + ((u! * p.lengthM) / 2) * c - ((v! * p.widthM) / 2) * s,
    y: p.y + ((u! * p.lengthM) / 2) * s + ((v! * p.widthM) / 2) * c,
  }));
}
export function bodyGap(a: Body, b: Body) {
  if (overlaps(a, b)) return 0;
  const aa = corners(a),
    bb = corners(b);
  let best = Infinity;
  for (const [points, edges] of [
    [aa, bb],
    [bb, aa],
  ])
    for (const p of points!)
      for (let i = 0; i < 4; i++) {
        const u = edges![i]!,
          v = edges![(i + 1) % 4]!,
          dx = v.x - u.x,
          dy = v.y - u.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - u.x) * dx + (p.y - u.y) * dy) / (dx * dx + dy * dy),
          ),
        );
        best = Math.min(
          best,
          Math.hypot(p.x - u.x - t * dx, p.y - u.y - t * dy),
        );
      }
  return best;
}
export function circumRadius(
  p: { x: number; y: number },
  q: { x: number; y: number },
  r: { x: number; y: number },
) {
  const a = Math.hypot(q.x - p.x, q.y - p.y),
    b = Math.hypot(r.x - q.x, r.y - q.y),
    c = Math.hypot(p.x - r.x, p.y - r.y),
    area = Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) / 2;
  if (area < 1e-6) return Infinity;
  return (a * b * c) / (4 * area);
}
export type CruiseStats = {
  /** 窗口长度是否足以代表“稳定接近段”（≥1.5 s）。 */
  available: boolean;
  windowDurationS: number;
  /** 窗口内实测最低速度；窗口不可用时为 null。 */
  minSpeedMps: number | null;
  /** 该参与者接近段是否检测到入弯。 */
  curveAhead: boolean;
};
/**
 * 接近段巡航速度：入弯减速/冲突反应制动之前的稳定接近窗口内的最低实测速度。
 * 窗口边界完全由存储轨迹几何决定（弧长、冲突点、三点曲率半径），使生成门控
 * 与独立验收共用同一把尺子。窗口为起点至“入弯点前 25 m / 冲突点前 30 m”
 * 中较早者（分别覆盖 2 m/s² 舒适入弯制动与冲突反应制动的起刹距离），
 * 至少要有 1.5 s 才算可核验。
 */
export function approachCruiseStats(
  frames: RiskFrame[],
  conflict: { x: number; y: number },
): CruiseStats {
  if (frames.length < 30)
    return {
      available: false,
      windowDurationS: frames.length * 0.05,
      minSpeedMps: null,
      curveAhead: false,
    };
  const arc = [0];
  for (let i = 1; i < frames.length; i++)
    arc.push(
      arc[i - 1]! +
        Math.hypot(
          frames[i]!.x - frames[i - 1]!.x,
          frames[i]!.y - frames[i - 1]!.y,
        ),
    );
  let conflictIndex = 0;
  for (let i = 1; i < frames.length; i++) {
    if (
      Math.hypot(frames[i]!.x - conflict.x, frames[i]!.y - conflict.y) <
      Math.hypot(
        frames[conflictIndex]!.x - conflict.x,
        frames[conflictIndex]!.y - conflict.y,
      )
    )
      conflictIndex = i;
  }
  // 从冲突点反向扫描连续弯道段（三点半径 <35 m，跨 0.5 s 采样抗噪）。
  const radiusAt = (i: number) => {
    const m = 10;
    if (i - m < 0 || i + m >= frames.length) return Infinity;
    return circumRadius(frames[i - m]!, frames[i]!, frames[i + m]!);
  };
  let curveEntry = -1,
    straightRun = 0;
  for (let i = conflictIndex; i >= 0; i--) {
    if (radiusAt(i) < 35) {
      curveEntry = i;
      straightRun = 0;
    } else if (++straightRun >= 5) break;
  }
  const limitArc =
    curveEntry >= 0 ? arc[curveEntry]! - 25 : arc[conflictIndex]! - 30;
  let end = 0;
  while (end < frames.length && arc[end]! <= Math.max(0, limitArc)) end++;
  const window = frames.slice(0, Math.max(0, end));
  if (window.length < 30)
    return {
      available: false,
      windowDurationS: window.length * 0.05,
      minSpeedMps: null,
      curveAhead: curveEntry >= 0,
    };
  return {
    available: true,
    windowDurationS: window.length * 0.05,
    minSpeedMps: Math.min(...window.map((p) => p.speed)),
    curveAhead: curveEntry >= 0,
  };
}
/** TTC uses current velocity/heading held constant, horizon 3 s, 0.05 s resolution. */
export function crossingRisk(a: RiskFrame[], b: RiskFrame[]) {
  let minimumGapM = Infinity,
    minimumTtcS: number | null = null,
    peakTimeS = 0,
    impact = false,
    closingSpeedMps = 0;
  const body = (p: RiskFrame) => ({ ...p, lengthM: 4.7, widthM: 1.9 });
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const p = a[i]!,
      q = b[i]!,
      gap = bodyGap(body(p), body(q));
    if (gap < minimumGapM) {
      minimumGapM = gap;
      peakTimeS = p.t;
      closingSpeedMps = Math.hypot(
        p.speed * Math.cos(p.heading) - q.speed * Math.cos(q.heading),
        p.speed * Math.sin(p.heading) - q.speed * Math.sin(q.heading),
      );
    }
    if (overlaps(body(p), body(q))) impact = true;
    if (gap > 15 || Math.max(p.speed, q.speed) < 1 || gap === 0) continue;
    for (let dt = 0.05; dt <= 3; dt += 0.05)
      if (
        overlaps(
          {
            ...body(p),
            x: p.x + dt * p.speed * Math.cos(p.heading),
            y: p.y + dt * p.speed * Math.sin(p.heading),
          },
          {
            ...body(q),
            x: q.x + dt * q.speed * Math.cos(q.heading),
            y: q.y + dt * q.speed * Math.sin(q.heading),
          },
        )
      ) {
        minimumTtcS = minimumTtcS === null ? dt : Math.min(minimumTtcS, dt);
        break;
      }
  }
  // PET at the fixed closest-encounter location, with each oriented vehicle's full footprint.
  const index = a.reduce(
    (best, p, i) =>
      Math.abs(p.t - peakTimeS) < Math.abs(a[best]!.t - peakTimeS) ? i : best,
    0,
  );
  const center = {
    x: (a[index]!.x + b[index]!.x) / 2,
    y: (a[index]!.y + b[index]!.y) / 2,
  };
  const occupy = (frames: RiskFrame[]) =>
    frames.filter((p) => {
      const dx = center.x - p.x,
        dy = center.y - p.y;
      return (
        Math.abs(dx * Math.cos(p.heading) + dy * Math.sin(p.heading)) <= 2.35 &&
        Math.abs(-dx * Math.sin(p.heading) + dy * Math.cos(p.heading)) <= 0.95
      );
    });
  const aa = occupy(a),
    bb = occupy(b);
  let petS: number | null = null;
  if (aa.length && bb.length) {
    if (aa.at(-1)!.t < bb[0]!.t) petS = bb[0]!.t - aa.at(-1)!.t;
    else if (bb.at(-1)!.t < aa[0]!.t) petS = aa[0]!.t - bb.at(-1)!.t;
    else petS = 0;
  }
  if (impact) petS = 0;
  return {
    minimumGapM,
    minimumTtcS,
    petS,
    peakTimeS,
    collision: impact,
    closingSpeedMps,
    achieved: (impact || minimumGapM < 0.8) && closingSpeedMps > 2,
    definition:
      "车身多边形最小间隙；TTC 为恒速恒航向预测（3 秒窗口）；PET 为最近相遇位置的车身占用间隔，未共同占用该位置时为空。",
  };
}
