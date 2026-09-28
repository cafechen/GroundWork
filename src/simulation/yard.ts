import type { YardConfig, YardScenario } from "./yard-scenario";
import type { Point } from "./geometry";
interface YardVehicle {
  id: string;
  kind: string;
  x: number;
  y: number;
  yaw: number;
  trailerYaw: number;
  route: Point[];
  target: number;
  release: number;
  state: string;
  reason: string;
  entered: boolean;
  passedResource?: boolean;
  speed: number;
  steering: number;
  distance: number;
  wait: number;
  finishedAt: number | null;
  maxError: number;
}
export interface YardEvent {
  t: number;
  type: string;
  vehicle: string;
  detail: string;
}
export interface YardFrame {
  t: number;
  doorOpen: boolean;
  owner: string | null;
  queue: string[];
  contacts: string[];
  vehicles: (Pick<
    YardVehicle,
    | "id"
    | "kind"
    | "x"
    | "y"
    | "yaw"
    | "trailerYaw"
    | "steering"
    | "speed"
    | "state"
    | "reason"
  > & { bodies: ReturnType<typeof bodies> })[];
}
import { makeScenario, random, ENGINE_VERSION } from "./yard-scenario";
import {
  clamp,
  distance,
  wrapAngle,
  rectangle,
  obstaclePolygon,
  intersects,
  polygonDistance,
  pathDistance,
} from "./geometry";

const round = (n: number) => Math.round(n * 10000) / 10000;

export function bodies(vehicle: YardVehicle, config: YardConfig) {
  const c = Math.cos(vehicle.yaw),
    s = Math.sin(vehicle.yaw);
  const main = {
    id: vehicle.id,
    kind: vehicle.kind,
    polygon: rectangle(
      vehicle.x + 0.5 * c,
      vehicle.y + 0.5 * s,
      3,
      1.5,
      vehicle.yaw,
    ),
  };
  if (vehicle.kind !== "tug") return [main];
  // A single on-axle hitch trailer, not a caster-wheeled industrial cart train.
  const l = config.trailerLength;
  const tx = vehicle.x - l * Math.cos(vehicle.trailerYaw),
    ty = vehicle.y - l * Math.sin(vehicle.trailerYaw);
  const trailer = {
    id: `${vehicle.id}-T`,
    kind: "trailer",
    polygon: rectangle(tx, ty, 2.3, 1.65, vehicle.trailerYaw),
  };
  const drawbar = {
    id: `${vehicle.id}-H`,
    kind: "drawbar",
    polygon: rectangle(
      (vehicle.x + tx) / 2,
      (vehicle.y + ty) / 2,
      l,
      0.12,
      vehicle.trailerYaw,
    ),
  };
  return [main, trailer, drawbar];
}

function createVehicles(scenario: YardScenario): YardVehicle[] {
  const rng = random(scenario.config.seed);
  return scenario.routes
    .slice(0, scenario.config.vehicleCount)
    .map((route, i) => {
      const yaw = Math.atan2(route[1].y - route[0].y, route[1].x - route[0].x);
      return {
        id: i === 0 ? "TUG-01" : "FLT-02",
        kind: i === 0 ? "tug" : "forklift",
        x: route[0].x,
        y: route[0].y,
        yaw,
        trailerYaw: yaw,
        route,
        target: 1,
        release: i === 0 ? 0 : 4 + rng(),
        state: "queued",
        reason: "",
        entered: false,
        speed: 0,
        steering: 0,
        distance: 0,
        wait: 0,
        finishedAt: null,
        maxError: 0,
      };
    });
}

function advance(v: YardVehicle, config: YardConfig) {
  const dt = config.dt;
  while (v.target < v.route.length - 1 && distance(v, v.route[v.target]) < 1.7)
    v.target++;
  const target = v.route[v.target];
  const d = distance(v, target);
  if (v.target === v.route.length - 1 && d < 0.6) {
    v.state = "completed";
    v.speed = 0;
    return;
  }
  const alpha = wrapAngle(Math.atan2(target.y - v.y, target.x - v.x) - v.yaw);
  const wheelbase = 1.8;
  const virtualSteering = clamp(
    Math.atan2(2 * wheelbase * Math.sin(alpha), Math.max(1.2, d)),
    -0.6,
    0.6,
  );
  // Rear-steered forklift: physical steering sign is reversed in the yaw equation.
  v.steering = v.kind === "forklift" ? -virtualSteering : virtualSteering;
  v.speed = config.speed * Math.max(0.4, 1 - Math.abs(virtualSteering));
  const oldYaw = v.yaw;
  v.x += v.speed * Math.cos(oldYaw) * dt;
  v.y += v.speed * Math.sin(oldYaw) * dt;
  v.yaw = wrapAngle(
    v.yaw + (v.speed / wheelbase) * Math.tan(virtualSteering) * dt,
  );
  if (v.kind === "tug")
    v.trailerYaw = wrapAngle(
      v.trailerYaw +
        (v.speed / config.trailerLength) * Math.sin(oldYaw - v.trailerYaw) * dt,
    );
  v.distance += v.speed * dt;
  v.maxError = Math.max(v.maxError, pathDistance(v, v.route));
}

/** Deterministic, synchronous, low-speed planar simulation. No wall-clock input. */
export function simulate(
  input: Partial<YardConfig> | { config: Partial<YardConfig> } = {},
) {
  const scenario = makeScenario("config" in input ? input.config : input);
  const config = scenario.config,
    vehicles = createVehicles(scenario);
  const region = obstaclePolygon(scenario.resource);
  const approach = obstaclePolygon({ x: 14, y: 2, w: 12, h: 12 });
  const obstacles = scenario.obstacles.map((o) => ({
    ...o,
    polygon: obstaclePolygon(o),
  }));
  const events: YardEvent[] = [],
    frames: YardFrame[] = [];
  let owner: string | null = null;
  const queue: string[] = [];
  let previousContacts = new Set<string>(),
    collisionEpisodes = 0,
    minClearance = Infinity;
  const event = (t: number, type: string, vehicle = "", detail = "") =>
    events.push({ t: round(t), type, vehicle, detail });
  event(0, "run.started", "", `seed=${config.seed}`);
  if (config.doorDelay > 0) event(0, "door.closed", "", "D-01");
  let doorWasOpen = config.doorDelay === 0;
  const steps = Math.floor(config.duration / config.dt);
  for (let step = 0; step <= steps; step++) {
    const t = round(step * config.dt),
      doorOpen = t >= config.doorDelay;
    if (doorOpen && !doorWasOpen) {
      event(t, "door.opened", "", "D-01");
      doorWasOpen = true;
    }
    const bodySets = vehicles.map((v) => bodies(v, config));
    // Release only after tractor, trailer AND drawbar have cleared the resource.
    if (owner) {
      const index = vehicles.findIndex((v) => v.id === owner),
        v = vehicles[index];
      if (bodySets[index].some((b) => intersects(b.polygon, region)))
        v.entered = true;
      if (
        v.entered &&
        bodySets[index].every((b) => !intersects(b.polygon, region))
      ) {
        event(t, "resource.released", v.id, "J-01");
        owner = null;
        v.passedResource = true;
      }
    }
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.state === "completed" || t < v.release) continue;
      if (v.state === "queued") {
        v.state = "moving";
        event(t, "task.started", v.id, `JOB-0${i + 1}`);
      }
      const approaching =
        !v.passedResource && intersects(bodySets[i][0].polygon, approach);
      if (
        config.policy === "fifo" &&
        approaching &&
        !queue.includes(v.id) &&
        owner !== v.id
      ) {
        queue.push(v.id);
        event(t, "resource.requested", v.id, "J-01");
      }
    }
    if (config.policy === "fifo" && doorOpen && !owner && queue.length) {
      owner = queue.shift()!;
      event(t, "resource.acquired", owner, "J-01");
    }
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.state === "completed" || t < v.release) continue;
      const approaching =
        !v.passedResource && intersects(bodySets[i][0].polygon, approach);
      let reason = "";
      if (approaching && !doorOpen) reason = "door";
      else if (approaching && config.policy === "fifo" && owner !== v.id)
        reason = "resource";
      if (reason !== v.reason) {
        event(
          t,
          reason ? "vehicle.waiting" : "vehicle.resumed",
          v.id,
          reason || v.reason,
        );
        v.reason = reason;
      }
      v.state = reason ? "waiting" : "moving";
      if (reason) v.speed = 0;
    }
    const contacts = new Set<string>();
    for (let i = 0; i < vehicles.length; i++) {
      for (const b of bodySets[i]) {
        for (const o of obstacles) {
          const d = polygonDistance(b.polygon, o.polygon);
          minClearance = Math.min(minClearance, d);
          if (d === 0) contacts.add(`${b.id}/${o.id}`);
        }
        if (
          b.polygon.some(
            (p) =>
              p.x < 0 ||
              p.y < 0 ||
              p.x > scenario.bounds.w ||
              p.y > scenario.bounds.h,
          )
        )
          contacts.add(`${b.id}/boundary`);
        for (let j = i + 1; j < vehicles.length; j++)
          for (const other of bodySets[j]) {
            const d = polygonDistance(b.polygon, other.polygon);
            minClearance = Math.min(minClearance, d);
            if (d === 0) contacts.add(`${b.id}/${other.id}`);
          }
      }
    }
    for (const contact of contacts)
      if (!previousContacts.has(contact)) {
        collisionEpisodes++;
        event(t, "collision", "", contact);
      }
    previousContacts = contacts;
    frames.push({
      t,
      doorOpen,
      owner,
      queue: [...queue],
      contacts: [...contacts],
      vehicles: vehicles.map((v, i) => ({
        id: v.id,
        kind: v.kind,
        x: v.x,
        y: v.y,
        yaw: v.yaw,
        trailerYaw: v.trailerYaw,
        steering: v.steering,
        speed: v.speed,
        state: v.state,
        reason: v.reason,
        bodies: bodySets[i],
      })),
    });
    if (vehicles.every((v) => v.state === "completed") || step === steps) break;
    for (const v of vehicles) {
      if (v.state === "waiting") v.wait += config.dt;
      if (v.state === "moving") {
        advance(v, config);
        if (String(v.state) === "completed") {
          v.finishedAt = round(t + config.dt);
          event(v.finishedAt, "task.completed", v.id);
        }
      }
    }
  }
  const completed = vehicles.filter((v) => v.state === "completed").length;
  const status =
    collisionEpisodes === 0 && completed === vehicles.length ? "PASS" : "FAIL";
  const end = frames[frames.length - 1].t;
  if (completed < vehicles.length) event(end, "run.timeout");
  event(end, "run.finished", "", status);
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    scenario,
    status,
    frames,
    events,
    metrics: {
      completed,
      total: vehicles.length,
      collisionEpisodes,
      minClearance: round(minClearance),
      duration: end,
      totalWait: round(vehicles.reduce((sum, v) => sum + v.wait, 0)),
      maxTrackingError: round(Math.max(...vehicles.map((v) => v.maxError))),
    },
    tasks: vehicles.map((v) => ({
      vehicle: v.id,
      state: v.state,
      finishedAt: v.finishedAt,
      wait: round(v.wait),
      distance: round(v.distance),
    })),
  };
}

export type YardRun = ReturnType<typeof simulate>;
