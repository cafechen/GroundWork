import { z } from "zod";
import { createHash } from "node:crypto";
import { rectangle } from "../src/core/geometry.js";
import { DEFAULT_CONFIG, makeScenario } from "../src/core/scenario.js";
import { parkRunSchema } from './park-simulation.mjs';

export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
const requestSchema = z
  .object({
    engine: z.enum(["yard", "road", "chrono"]),
    duration: z.number().min(5).max(180).default(60),
    vehicles: z.number().int().min(1).max(5).default(1),
    trailers: z.number().int().min(1).max(3).default(3),
    speed: z.number().min(0.4).max(2.5).default(1.3),
    friction: z.number().min(0.2).max(1.2).default(0.8),
    seed: z.number().int().min(1).max(1000000).default(42),
    config: z.record(z.string(), z.unknown()).optional(),
    plan: z.unknown().optional(),
    map: z.unknown().optional(),
  })
  .strict();
export function validateRequest(input) {
  if (input?.engine === 'park') return parkRunSchema.parse(input);
  const r = requestSchema.parse(input);
  if (r.engine === "yard") makeScenario({ ...DEFAULT_CONFIG, ...r.config });
  return r;
}

export function syntheticMap() {
  return {
    mapId: "synthetic-yard-road",
    origin: [0, 0],
    roads: [0, 4].map((y, i) => ({
      id: i ? "left" : "right",
      widthM: 4,
      lengthM: 180,
      entryHeadingDeg: 0,
      centerline: [
        [0, y],
        [180, y],
      ],
    })),
    successors: [],
    adjacentSameDirection: [
      {
        from: "left",
        to: "right",
        side: "right",
        entryDistanceM: 4,
        headingDiffDeg: 0,
      },
      {
        from: "right",
        to: "left",
        side: "left",
        entryDistanceM: 4,
        headingDiffDeg: 0,
      },
    ],
  };
}
// Deliberately requires local metres. WGS84/AEQD source maps must be converted
// explicitly first; numerically similar coordinates must not be silently mixed.
export function importMap(input) {
  if (
    input?.type !== "FeatureCollection" ||
    input.properties?.coordinateSystem !== "local-metres" ||
    !Array.isArray(input.features) ||
    !input.features.length ||
    input.features.length > 48
  )
    throw Error("Expected 1–48 local-metres LineString roads");
  const roads = input.features.map((f, i) => {
    const id = f.properties?.id ?? `road-${i}`;
    const widthM = f.properties?.widthM ?? 4;
    const line = f.geometry?.coordinates;
    if (
      !/^[\w-]{1,64}$/.test(id) ||
      f.geometry?.type !== "LineString" ||
      !Array.isArray(line) ||
      line.length < 2 ||
      line.length > 2000 ||
      !Number.isFinite(widthM) ||
      widthM < 2 ||
      widthM > 30
    )
      throw Error("Invalid road");
    if (
      line.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          p.some((v) => !Number.isFinite(v) || Math.abs(v) > 10000),
      )
    )
      throw Error("Invalid local coordinate");
    const lengthM = line
      .slice(1)
      .reduce(
        (s, p, j) => s + Math.hypot(p[0] - line[j][0], p[1] - line[j][1]),
        0,
      );
    if (lengthM < 10 || lengthM > 10000)
      throw Error("Road length must be 10–10000 m");
    return {
      id,
      widthM,
      lengthM,
      entryHeadingDeg:
        (Math.atan2(line[1][1] - line[0][1], line[1][0] - line[0][0]) * 180) /
        Math.PI,
      centerline: line,
    };
  });
  if (new Set(roads.map((r) => r.id)).size !== roads.length)
    throw Error("Duplicate road id");
  return {
    mapId: `import-${digest(roads)}`,
    origin: [0, 0],
    roads,
    successors: [],
    adjacentSameDirection: [],
  };
}
export function makeChronoScene(r) {
  // Smooth capsule loops, analytic centreline sampled at <= 1 m, ample train clearance.
  const loop = [];
  for (let x = 0; x <= 18; x++) loop.push([x, 0]);
  for (let i = 1; i <= 24; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 24;
    loop.push([18 + 6 * Math.cos(a), 6 + 6 * Math.sin(a)]);
  }
  for (let x = 17; x >= 0; x--) loop.push([x, 12]);
  for (let i = 1; i <= 24; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 24;
    loop.push([6 * Math.cos(a), 6 + 6 * Math.sin(a)]);
  }
  return {
    schemaVersion: 1,
    mode: "train",
    map: "synthetic-depot-loop",
    origin: [0, 0],
    coordinateSystem: "local-metres",
    robots: Array.from({ length: r.vehicles }, (_, i) => {
      const route = loop.map(([x, y]) => [x, y + i * 18]);
      const half = Math.floor(route.length / 2);
      return {
        name: `TUG-${String(i + 1).padStart(2, "0")}`,
        spawn: [0, i * 18, 0, 0, 0, 0],
        outbound: route.slice(0, half + 1),
        return: route.slice(half),
        trailers: r.trailers,
        speed: r.speed,
      };
    }),
  };
}
function bounds(points) {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  return {
    x: Math.min(...xs) - 7,
    y: Math.min(...ys) - 7,
    w: Math.max(...xs) - Math.min(...xs) + 14,
    h: Math.max(...ys) - Math.min(...ys) + 14,
  };
}
export function normalizeYard(run, request) {
  return {
    schemaVersion: 2,
    engine: "yard",
    engineVersion: run.engineVersion,
    caseKey: "crossing-yard",
    request,
    verdict: run.status,
    validity: "SIMPLIFIED_MODEL",
    model:
      "Planar bicycle / rear-steer forklift / single on-axle trailer; sampled footprints",
    map: {
      bounds: { x: 0, y: 0, ...run.scenario.bounds },
      routes: run.scenario.routes.map((r) => r.map((p) => [p.x, p.y])),
      obstacles: run.scenario.obstacles,
      resource: run.scenario.resource,
    },
    frames: run.frames.map((f) => ({
      t: f.t,
      bodies: f.vehicles.flatMap((v) =>
        v.bodies.map((b) => ({
          id: b.id,
          kind: b.kind,
          actor: v.id,
          polygon: b.polygon,
          z: 0,
          height: b.kind === "drawbar" ? 0.12 : 0.8,
        })),
      ),
      actors: f.vehicles.map((v) => ({ ...v, stage: v.state })),
      owner: f.owner,
      doorOpen: f.doorOpen,
      queue: f.queue,
      contacts: f.contacts,
    })),
    metrics: run.metrics,
    events: run.events,
    raw: run,
  };
}
export function normalizeChrono(rows, summary, request) {
  const frames = rows
    .filter((_, i) => i % 5 === 0 || i === rows.length - 1)
    .map((row) => ({
      t: row.time,
      actors: row.robots,
      bodies: row.robots.flatMap((r) => {
        const poses = [
          { pose: r.poses[0], kind: "tractor", index: 0 },
          ...Array.from({ length: r.trailer_count ?? 1 }, (_, i) => ({
            pose: r.poses[1 + 2 * i],
            kind: "trailer",
            index: i + 1,
          })),
        ];
        return poses
          .filter((p) => p.pose)
          .map(({ pose: p, kind, index }) => {
            const yaw = Math.atan2(
              2 * (p[3] * p[6] + p[4] * p[5]),
              1 - 2 * (p[5] * p[5] + p[6] * p[6]),
            );
            const x = p[0] + (index ? 0 : 0.1725) * Math.cos(yaw),
              y = p[1] + (index ? 0 : 0.1725) * Math.sin(yaw);
            return {
              id: index
                ? (r.wagons?.[index - 1]?.id ?? `${r.name}-slot-${index}`)
                : `${r.name}-tractor`,
              actor: r.name,
              kind,
              polygon: rectangle(
                x,
                y,
                index ? 1.15 : 0.75,
                index ? 0.7 : 0.465,
                yaw,
              ),
              pose: p,
              z: p[2],
              height: index ? 0.4 : 0.24,
            };
          });
      }),
      groundInclusiveContacts: row.contacts,
    }));
  const scene = makeChronoScene({
    ...{ vehicles: 1, trailers: 3, speed: 1.3 },
    ...request,
  });
  const routes = scene.robots.map((r) => [...r.outbound, ...r.return.slice(1)]);
  const robots = summary.robots ?? [];
  const failed = robots.some((r) => r.error);
  const completed = robots.length > 0 && robots.every((r) => r.cycles > 0);
  return {
    schemaVersion: 2,
    engine: "chrono",
    engineVersion: `chrono-${rows[0]?.chrono_version ?? "unknown"}-groundwork-2`,
    caseKey: scene.map,
    request,
    validity: "UNCALIBRATED_RIGID_BODY",
    verdict: failed ? "FAIL" : completed ? "MISSION_COMPLETE" : "NOT_EVALUATED",
    model:
      "Torque-driven differential tractor, rigid wheels, 0–3 revolute-jointed trailers. No obstacle mesh; self-contact disabled; depot handling abstracted; SOC illustrative.",
    map: { bounds: bounds(routes.flat()), routes, obstacles: [] },
    frames,
    metrics: {
      duration: summary.seconds,
      cycles: robots.reduce((s, r) => s + r.cycles, 0),
      maxTrackingError: Math.max(0, ...robots.map((r) => r.max_route_error_m)),
      maxHitchError: Math.max(0, ...robots.map((r) => r.max_hitch_error_m)),
      maxTrailerAngle: Math.max(
        0,
        ...robots.map((r) => r.max_trailer_angle_deg),
      ),
      groundInclusiveContactsMax: rows.reduce(
        (m, r) => Math.max(m, r.contacts ?? 0),
        0,
      ),
      attached: robots.reduce((s, r) => s + (r.attached ?? 0), 0),
      detached: robots.reduce((s, r) => s + (r.detached ?? 0), 0),
      wallSeconds: summary.wall_seconds,
    },
    events: robots.flatMap((r) =>
      (r.events ?? []).map((e) => ({
        t: e.time,
        type: e.kind,
        vehicle: r.name,
        detail: `${e.count} trailers · ${e.speed.toFixed(3)} m/s`,
      })),
    ),
    summary,
  };
}
export function normalizeRoad(trajectory, map, request) {
  const grouped = new Map();
  for (const f of trajectory.features) {
    const p = f.properties;
    if (p.featureType !== "trajectoryPoint") continue;
    const frame = grouped.get(p.t) ?? { t: p.t, bodies: [], actors: [] };
    frame.bodies.push({
      id: p.actor,
      actor: p.actor,
      kind: p.vehicleType ?? "car",
      polygon: rectangle(
        p.localX,
        p.localY,
        p.lengthM ?? 4.7,
        p.widthM ?? 1.86,
        p.headingRad,
      ),
      height: 1.4,
      z: 0,
    });
    frame.actors.push({ name: p.actor, speed: p.speedMps, stage: p.laneId });
    grouped.set(p.t, frame);
  }
  const report = trajectory.properties.validationReport;
  return {
    schemaVersion: 2,
    engine: "road",
    engineVersion: "migrated-6538e7c",
    caseKey: digest(map),
    request,
    validity: "ROAD_BEHAVIOR_MODEL",
    verdict: report.passed ? "PASS" : "FAIL",
    model:
      "Road car/heavy-truck trajectory model, not an industrial forklift or articulated tugger model",
    map: {
      bounds: bounds(map.roads.flatMap((r) => r.centerline)),
      routes: map.roads.map((r) => r.centerline),
      obstacles: [],
    },
    frames: [...grouped.values()].sort((a, b) => a.t - b.t),
    metrics: report.physical ?? {},
    events: (report.events ?? []).map((e) => ({
      t: e.startedAt ?? e.scheduledAt ?? 0,
      type: e.status,
      vehicle: e.actorId,
      detail: e.eventId ?? e.id,
    })),
    report,
    trajectory,
  };
}
export function compareResults(a, b) {
  if (a.provenance?.codeFingerprint !== b.provenance?.codeFingerprint)
    throw Error("Comparison requires the same executed code fingerprint");
  if (
    a.engine !== b.engine ||
    !a.caseKey ||
    a.caseKey !== b.caseKey ||
    a.engineVersion !== b.engineVersion
  )
    throw Error("Comparison requires the same engine version and map/case");
  const deltas = {};
  for (const [key, v] of Object.entries(a.metrics ?? {}))
    if (
      typeof v === "number" &&
      Number.isFinite(v) &&
      typeof b.metrics?.[key] === "number"
    )
      deltas[key] = b.metrics[key] - v;
  return {
    baseline: a.verdict,
    candidate: b.verdict,
    deltas,
    changedInputs: Object.keys({ ...a.request, ...b.request }).filter(
      (k) => JSON.stringify(a.request?.[k]) !== JSON.stringify(b.request?.[k]),
    ),
    note: "Numeric deltas, not a safety verdict. Inputs may differ.",
  };
}
export const escapeHtml = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function reportHtml(run) {
  return `<!doctype html><meta charset="utf-8"><title>GroundWork evidence</title><style>body{font:16px system-ui;max-width:960px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>GroundWork · ${escapeHtml(run.engine)}</h1><p>${escapeHtml(run.verdict)} / ${escapeHtml(run.validity)}</p><p>${escapeHtml(run.model)}</p><p>Simulation evidence only. Not a safety certification. / 仿真证据，不构成安全认证。</p><h2>Provenance / 溯源</h2><pre>${escapeHtml(JSON.stringify(run.provenance, null, 2))}</pre><h2>Inputs / 输入</h2><pre>${escapeHtml(JSON.stringify(run.request, null, 2))}</pre><h2>Metrics / 指标</h2><pre>${escapeHtml(JSON.stringify(run.metrics, null, 2))}</pre><h2>Events / 事件</h2><pre>${escapeHtml(JSON.stringify(run.events, null, 2))}</pre>`;
}
