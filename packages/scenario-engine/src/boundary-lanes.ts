import type { Road, MapModel, LaneBoundary } from "./index.js";
type XY = [number, number];
const distance = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = (p: XY[]) =>
  p.slice(1).reduce((s, b, i) => s + distance(p[i]!, b), 0);
function at(p: XY[], s: number): XY {
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!,
      b = p[i]!,
      d = distance(a, b);
    if (s <= d || i === p.length - 1) {
      const t = Math.max(0, Math.min(1, s / Math.max(d, 1e-9)));
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    s -= d;
  }
  return p[0]!;
}
export function boundaryLanes(
  groups: any[],
  features: any[],
  local: (p: XY) => XY,
) {
  const boundaries = new Map<string, LaneBoundary>();
  const diagnostics: string[] = [];
  for (const f of features) {
    if (f.geometry?.type !== "LineString") continue;
    const p = f.properties ?? {},
      id = String(p.id ?? f.fid ?? "");
    const points: XY[] = f.geometry.coordinates.map(local);
    if (!id || points.length < 2 || length(points) < 1) continue;
    const raw = String(p.line_type ?? "unknown").toLowerCase();
    boundaries.set(id, {
      id,
      points,
      lineType:
        raw === "broken" || raw === "dashed"
          ? "broken"
          : raw === "solid" || raw === "sold"
            ? "solid"
            : "unknown",
    });
  }
  const roads: Road[] = [];
  for (const f of groups) {
    const p = f.properties ?? {},
      groupId = String(p.id ?? f.fid);
    const ids = String(p.boundrys ?? "")
      .split(/[,;\s]+/)
      .filter(Boolean);
    if (ids.length < 2 || ids.some((id) => !boundaries.has(id))) {
      diagnostics.push(`group ${groupId}: missing boundary references`);
      continue;
    }
    if (new Set(ids).size !== ids.length) {
      diagnostics.push(`group ${groupId}: duplicate boundaries`);
      continue;
    }
    const source = ids.map((id) => boundaries.get(id)!);
    const reference = source.reduce((a, b) =>
      length(a.points) >= length(b.points) ? a : b,
    ).points;
    const start = reference[0]!,
      end = reference.at(-1)!,
      span = distance(start, end);
    if (span < 1) {
      diagnostics.push(`group ${groupId}: ambiguous direction`);
      continue;
    }
    const dx = (end[0] - start[0]) / span,
      dy = (end[1] - start[1]) / span;
    const aligned = source
      .map((b) => {
        const points = [...b.points];
        const first = points[0]!,
          last = points.at(-1)!;
        if ((last[0] - first[0]) * dx + (last[1] - first[1]) * dy < 0)
          points.reverse();
        const mid = at(points, length(points) / 2);
        return {
          ...b,
          points,
          offset: -dy * (mid[0] - start[0]) + dx * (mid[1] - start[1]),
        };
      })
      .sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < aligned.length; i++) {
      const right = aligned[i - 1]!,
        left = aligned[i]!;
      const explicitDriving =
        p.lane_type === "driving" || p.usage === "driving";
      if (aligned.length === 2 && !explicitDriving) {
        diagnostics.push(
          `group ${groupId}: two-boundary strip without driving classification`,
        );
        continue;
      }
      const rightLength = length(right.points),
        leftLength = length(left.points);
      const count = Math.max(
        2,
        Math.ceil(Math.max(rightLength, leftLength) / 2),
      );
      const r: XY[] = [],
        l: XY[] = [],
        centerline: XY[] = [],
        widths: number[] = [];
      let invalid = false;
      for (let j = 0; j <= count; j++) {
        const a = at(right.points, (rightLength * j) / count),
          b = at(left.points, (leftLength * j) / count);
        const width = distance(a, b),
          longitudinalSkew = Math.abs((b[0] - a[0]) * dx + (b[1] - a[1]) * dy);
        if (
          width < 2.8 ||
          width > 4.5 ||
          longitudinalSkew > 1 ||
          (b[0] - a[0]) * -dy + (b[1] - a[1]) * dx <= 0
        )
          invalid = true;
        r.push(a);
        l.push(b);
        centerline.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        widths.push(width);
      }
      if (invalid) {
        diagnostics.push(
          `group ${groupId}: boundaries ${right.id}/${left.id} not a regular driving lane`,
        );
        continue;
      }
      const heading = Math.atan2(
        centerline[1]![1] - centerline[0]![1],
        centerline[1]![0] - centerline[0]![0],
      );
      roads.push({
        id: `lane_g${groupId}_b${right.id}_${left.id}`,
        sourceLaneId: groupId,
        geometrySource: "boundary_pair",
        directionSource: "boundary_order",
        widthM: Math.min(...widths),
        centerline,
        lengthM: length(centerline),
        entryHeadingDeg: (heading * 180) / Math.PI,
        leftBoundary: { id: left.id, lineType: left.lineType, points: l },
        rightBoundary: { id: right.id, lineType: right.lineType, points: r },
        polygon: [...r, ...[...l].reverse(), r[0]!],
      });
    }
  }
  const adjacentSameDirection: MapModel["adjacentSameDirection"] = [];
  const successors: MapModel["successors"] = [];
  for (const a of roads)
    for (const b of roads) {
      if (a === b) continue;
      const diff =
        (Math.abs(
          Math.atan2(
            Math.sin(((b.entryHeadingDeg - a.entryHeadingDeg) * Math.PI) / 180),
            Math.cos(((b.entryHeadingDeg - a.entryHeadingDeg) * Math.PI) / 180),
          ),
        ) *
          180) /
        Math.PI;
      if (diff > 15) continue;
      const side =
        a.leftBoundary!.id === b.rightBoundary!.id
          ? "left"
          : a.rightBoundary!.id === b.leftBoundary!.id
            ? "right"
            : undefined;
      if (side && a.sourceLaneId === b.sourceLaneId) {
        const shared = side === "left" ? a.leftBoundary! : a.rightBoundary!;
        if (shared.lineType === "broken")
          adjacentSameDirection.push({
            from: a.id,
            to: b.id,
            side,
            entryDistanceM: distance(a.centerline[0]!, b.centerline[0]!),
            headingDiffDeg: diff,
            boundaryId: shared.id,
          });
      }
      if (
        a.sourceLaneId !== b.sourceLaneId &&
        distance(a.centerline.at(-1)!, b.centerline[0]!) <= 0.3 &&
        distance(a.leftBoundary!.points.at(-1)!, b.leftBoundary!.points[0]!) <=
          0.3 &&
        distance(
          a.rightBoundary!.points.at(-1)!,
          b.rightBoundary!.points[0]!,
        ) <= 0.3
      )
        successors.push({ from: a.id, to: b.id });
    }
  return { roads, adjacentSameDirection, successors, diagnostics };
}
