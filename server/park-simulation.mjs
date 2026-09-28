import { z } from "zod";
import { createHash } from "node:crypto";
import { modelSchema, modelCapability } from "./platform-contracts.mjs";
import {
  rectangle,
  intersects,
  clamp,
  wrapAngle,
  pathDistance,
} from "../src/core/geometry.js";
const num = z.number().finite(),
  xy = z.tuple([num.min(-100000).max(100000), num.min(-100000).max(100000)]);
export const parkRunSchema = z
  .object({
    engine: z.literal("park"),
    duration: num.min(1).max(180),
    speed: num.min(0.1).max(5),
    snapshot: z
      .object({
        parkId: z.string(),
        parkVersion: z.number().int().positive(),
        parkName: z.string(),
        taskId: z.string(),
        taskName: z.string(),
        deviceId: z.string(),
        deviceName: z.string(),
        deviceKind: z.literal("virtual"),
        mapId: z.string(),
        mapVersion: z.number().int().positive(),
        mapName: z.string(),
        levelId: z.string(),
        modelId: z.string(),
        modelVersion: z.number().int().positive(),
        model: modelSchema,
        pose: z.tuple([num, num, num]),
        route: z.array(xy).min(2).max(500),
        bounds: z.object({
          x: num,
          y: num,
          w: num.positive(),
          h: num.positive(),
        }),
        walls: z.array(z.object({ a: xy, b: xy })).max(20000),
        objects: z.array(z.unknown()).max(500),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, c) => {
    if (modelCapability(r.snapshot.model) === "definition-only")
      c.addIssue({
        code: "custom",
        message: "No simulation adapter for this device model",
      });
    if (r.speed > r.snapshot.model.maxSpeed)
      c.addIssue({
        code: "custom",
        message: "Task speed exceeds model speed limit",
      });
    const p = r.snapshot.route;
    if (
      p.some(
        (v, i) =>
          i && Math.hypot(v[0] - p[i - 1][0], v[1] - p[i - 1][1]) < 0.001,
      )
    )
      c.addIssue({ code: "custom", message: "Duplicate route points" });
    if (
      Math.hypot(p[0][0] - r.snapshot.pose[0], p[0][1] - r.snapshot.pose[1]) > 2
    )
      c.addIssue({
        code: "custom",
        message:
          "Device must spawn within 2 m of route start / 设备初始位置须靠近路线起点",
      });
  });
export function compileParkRun(store, parkId, { version, taskId }) {
  const p = store.get("parks", parkId);
  if (p.archived || p.version !== version)
    throw Error("Park revision changed; reload / 园区版本变化，请重新载入");
  store.validatePark(p.data);
  const task = p.data.tasks.find((t) => t.id === taskId);
  if (!task) throw Error("Task not found");
  if (task.engine !== "kinematic")
    throw Error(
      "Park Chrono adapter is not connected; use the separate mechanics lab / 园区 Chrono 尚未接通",
    );
  const d = p.data.devices.find((d) => d.id === task.deviceId);
  if (d.kind !== "virtual")
    throw Error(
      "Physical devices cannot run in simulation / 实机不能作为仿真实例",
    );
  if (
    d.gatewayId &&
    store.get("gateways", d.gatewayId).data.adapter !== "simulation"
  )
    throw Error("Simulation must not access external gateways");
  const mref = p.data.maps.find((m) => m.id === d.mapId),
    map = store.get("maps", mref.id, mref.version),
    level = map.data.levels.find((l) => l.id === d.level),
    model = store.get("models", d.model.id, d.model.version);
  const route = p.data.objects.find((o) => o.id === task.routeId);
  const result = {
    engine: "park",
    duration: task.duration,
    speed: task.speed,
    snapshot: {
      parkId,
      parkVersion: p.version,
      parkName: p.name,
      taskId,
      taskName: task.name,
      deviceId: d.id,
      deviceName: d.name,
      deviceKind: d.kind,
      mapId: map.id,
      mapVersion: map.version,
      mapName: map.name,
      levelId: level.id,
      modelId: model.id,
      modelVersion: model.version,
      model: model.data,
      pose: d.pose,
      route: route.points,
      bounds: level.bounds,
      walls: level.walls.map((e) => ({
        a: [level.vertices[e.start].x, level.vertices[e.start].y],
        b: [level.vertices[e.end].x, level.vertices[e.end].y],
      })),
      objects: p.data.objects.filter(
        (o) => o.mapId === map.id && o.level === level.id,
      ),
    },
  };
  return parkRunSchema.parse(result);
}
const bbox = (p) => ({
  xmin: Math.min(...p.map((v) => v.x)),
  xmax: Math.max(...p.map((v) => v.x)),
  ymin: Math.min(...p.map((v) => v.y)),
  ymax: Math.max(...p.map((v) => v.y)),
});
const overlap = (a, b) =>
  !(a.xmax < b.xmin || b.xmax < a.xmin || a.ymax < b.ymin || b.ymax < a.ymin);
export function simulatePark(raw) {
  const request = parkRunSchema.parse(raw),
    s = request.snapshot,
    m = s.model,
    route = s.route.map(([x, y]) => ({ x, y }));
  const lengths = [0];
  for (let i = 1; i < route.length; i++)
    lengths.push(
      lengths.at(-1) +
        Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y),
    );
  if (lengths.at(-1) > 10000) throw Error("Route exceeds 10 km");
  const at = (pos) => {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < pos) i++;
    const a = route[i - 1],
      b = route[i],
      u = clamp((pos - lengths[i - 1]) / (lengths[i] - lengths[i - 1]), 0, 1);
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const obstacles = s.walls.map((e, i) => {
    const [x, y] = e.a,
      [u, v] = e.b;
    return {
      id: `wall-${i}`,
      polygon: rectangle(
        (x + u) / 2,
        (y + v) / 2,
        Math.hypot(u - x, v - y),
        0.1,
        Math.atan2(v - y, u - x),
      ),
    };
  });
  for (const o of s.objects)
    if (o.type === "restricted")
      obstacles.push({
        id: o.id,
        polygon: rectangle(o.x, o.y, o.w, o.h, o.yaw),
      });
  obstacles.forEach((o) => (o.box = bbox(o.polygon)));
  let [x, y, yaw] = s.pose,
    trailerYaw = yaw,
    v = 0,
    progress = 0,
    segment = 0,
    completed = false,
    stopped = false,
    maxError = 0,
    distance = 0,
    contactEpisodes = 0,
    priorContacts = new Set();
  const frames = [],
    events = [];
  const dt = 0.05;
  for (let i = 0; i <= Math.round(request.duration / dt); i++) {
    const t = i * dt,
      p = { x, y };
    let best = { error: Infinity, progress, segment };
    for (
      let j = Math.max(0, segment - 1);
      j < Math.min(route.length - 1, segment + 5);
      j++
    ) {
      const a = route[j],
        b = route[j + 1],
        dx = b.x - a.x,
        dy = b.y - a.y,
        l2 = dx * dx + dy * dy,
        u = clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1),
        e = Math.hypot(x - a.x - u * dx, y - a.y - u * dy);
      if (e < best.error)
        best = {
          error: e,
          progress: lengths[j] + u * Math.sqrt(l2),
          segment: j,
        };
    }
    segment = Math.max(segment, best.segment);
    progress = Math.max(progress, best.progress);
    maxError = Math.max(maxError, best.error);
    const target = at(progress + Math.max(0.5, m.wheelbase * 0.7));
    const delta = clamp(
      Math.atan2(
        2 *
          m.wheelbase *
          Math.sin(wrapAngle(Math.atan2(target.y - y, target.x - x) - yaw)),
        Math.max(0.3, Math.hypot(target.x - x, target.y - y)),
      ),
      -m.maxSteer,
      m.maxSteer,
    );
    const remaining = lengths.at(-1) - progress,
      goalDistance = Math.hypot(x - route.at(-1).x, y - route.at(-1).y);
    if (!completed && remaining < 0.3 && goalDistance < 0.35) {
      completed = true;
      v = 0;
      events.push({
        t,
        type: "task-completed",
        vehicle: s.deviceId,
        detail: "Within 0.35 m position tolerance; final heading not evaluated",
      });
    }
    const bodies = [
      {
        id: s.deviceId,
        actor: s.deviceId,
        kind: m.category,
        polygon: rectangle(x, y, m.length, m.width, yaw),
        height: m.height,
        z: 0,
      },
    ];
    if (m.trailers) {
      const tx = x - m.hitchLength * Math.cos(trailerYaw),
        ty = y - m.hitchLength * Math.sin(trailerYaw);
      bodies.push(
        {
          id: `${s.deviceId}-trailer`,
          actor: s.deviceId,
          kind: "trailer",
          polygon: rectangle(
            tx,
            ty,
            m.trailerLength,
            m.trailerWidth,
            trailerYaw,
          ),
          height: m.height * 0.6,
          z: 0,
        },
        {
          id: `${s.deviceId}-drawbar`,
          actor: s.deviceId,
          kind: "drawbar",
          polygon: rectangle(
            (x + tx) / 2,
            (y + ty) / 2,
            m.hitchLength,
            0.08,
            trailerYaw,
          ),
          height: 0.12,
          z: 0,
        },
      );
    }
    const contacts = [];
    for (const b of bodies) {
      const bb = bbox(b.polygon);
      for (const o of obstacles)
        if (overlap(bb, o.box) && intersects(b.polygon, o.polygon))
          contacts.push(`${b.id}:${o.id}`);
    }
    for (const id of contacts)
      if (!priorContacts.has(id)) {
        contactEpisodes++;
        events.push({
          t,
          type: "sampled-contact",
          vehicle: s.deviceId,
          detail: id,
        });
      }
    priorContacts = new Set(contacts);
    if (contacts.length) stopped = true;
    if (best.error > 5 && !stopped) {
      stopped = true;
      events.push({
        t,
        type: "tracking-limit",
        vehicle: s.deviceId,
        detail: "Reference path error exceeds 5 m",
      });
    }
    if (i % 2 === 0 || i === Math.round(request.duration / dt))
      frames.push({
        t,
        bodies,
        actors: [
          {
            id: s.deviceId,
            kind: m.category,
            x,
            y,
            yaw,
            trailerYaw,
            speed: v,
            steering: m.category === "forklift" ? -delta : delta,
            stage: stopped ? "stopped" : completed ? "completed" : "moving",
            state: stopped ? "stopped" : completed ? "completed" : "moving",
            source: "simulation-ground-truth",
          },
        ],
        contacts,
      });
    if (i === Math.round(request.duration / dt)) break;
    let limit = request.speed;
    for (const o of s.objects)
      if (o.type === "speed") {
        const dx = x - o.x,
          dy = y - o.y,
          c = Math.cos(o.yaw),
          q = Math.sin(o.yaw);
        if (
          Math.abs(c * dx + q * dy) <= o.w / 2 &&
          Math.abs(-q * dx + c * dy) <= o.h / 2
        )
          limit = Math.min(limit, o.value);
      }
    const desired =
      stopped || completed
        ? 0
        : Math.min(
            limit,
            m.maxSpeed,
            Math.sqrt(Math.max(0, 2 * (remaining - 0.12))),
          );
    v = stopped || completed ? 0 : clamp(desired, v - 1.5 * dt, v + 1 * dt);
    x += v * Math.cos(yaw) * dt;
    y += v * Math.sin(yaw) * dt;
    if (m.trailers)
      trailerYaw = wrapAngle(
        trailerYaw + (v / m.hitchLength) * Math.sin(yaw - trailerYaw) * dt,
      );
    yaw = wrapAngle(yaw + (v / m.wheelbase) * Math.tan(delta) * dt);
    distance += v * dt;
  }
  const hash = createHash("sha256")
    .update(JSON.stringify(s))
    .digest("hex")
    .slice(0, 16);
  return {
    schemaVersion: 2,
    engine: "park",
    engineVersion: "park-planar-1",
    caseKey: `${s.parkId}:${s.mapId}:${s.levelId}:${s.taskId}:${hash}`,
    request,
    verdict: contactEpisodes
      ? "CONTACT"
      : completed
        ? "COMPLETED"
        : "INCOMPLETE",
    validity: "PARTIAL_SCENE_SIMPLIFIED_MODEL",
    model:
      "Planar axle-centred chassis, bicycle steering; forklift front-axle reference/reversed rear steering; optional single on-axle trailer. Forward Euler 0.05 s. No fork lift, perception or full obstacle meshes.",
    map: {
      bounds: s.bounds,
      routes: [s.route],
      obstacles: [],
      wallPolygons: obstacles.map((o) => o.polygon),
    },
    frames,
    events,
    metrics: {
      completed: completed && !stopped ? 1 : 0,
      contactEpisodes,
      maxPathError: maxError,
      distanceM: distance,
      simulationSeconds: request.duration,
    },
    limitations: [
      "Only walls and restricted zones are obstacles; external models/doors/lifts omitted",
      "Door/charging/load stations are semantic annotations, not actuator models",
      "Mass and sensor configuration do not affect planar kinematics",
      "Sampled contact, not continuous collision or safety certification",
    ],
  };
}
