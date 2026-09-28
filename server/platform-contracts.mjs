import { z } from "zod";
const text = z.string().trim().min(1).max(120);
const num = z.number().finite();
const coord = num.min(-100000).max(100000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const ref = z.object({ id, version: z.number().int().positive() }).strict();
const pose = z.tuple([coord, coord, num.min(-Math.PI * 2).max(Math.PI * 2)]);
export const modelSchema = z
  .object({
    category: z.enum(["tugger", "forklift", "amr", "quadruped", "custom"]),
    description: z.string().max(2000).default(""),
    length: num.min(0.1).max(15),
    width: num.min(0.1).max(5),
    height: num.min(0.1).max(8),
    wheelbase: num.min(0.1).max(10),
    maxSpeed: num.min(0.1).max(5),
    maxSteer: num.min(0.05).max(1.2),
    mass: num.min(1).max(100000),
    trailerLength: num.min(0.2).max(15).default(2.3),
    trailerWidth: num.min(0.1).max(5).default(1.65),
    hitchLength: num.min(0.2).max(15).default(2.5),
    trailers: z.number().int().min(0).max(1).default(0),
    sensors: z
      .array(
        z
          .object({
            name: text,
            kind: z.enum(["pose", "camera", "lidar", "imu", "custom"]),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .superRefine((m, c) => {
    if (m.wheelbase > m.length)
      c.addIssue({
        code: "custom",
        message: "Wheelbase must fit chassis / 轴距不能大于车长",
      });
    if (m.trailers && m.category !== "tugger")
      c.addIssue({
        code: "custom",
        message: "Only tugger supports this trailer topology",
      });
  });
export const gatewaySchema = z
  .object({
    location: z.enum(["local", "edge", "cloud"]),
    adapter: z.enum(["simulation", "external"]),
    endpoint: z.string().max(500).default(""),
    description: z.string().max(2000).default(""),
    channels: z
      .array(
        z
          .object({
            name: text,
            kind: z.enum([
              "telemetry",
              "events",
              "video",
              "pointcloud",
              "logs",
            ]),
            topic: z.string().max(200),
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .superRefine((g, c) => {
    if (g.endpoint) {
      try {
        const u = new URL(g.endpoint);
        if (
          !["https:", "wss:", "mqtts:"].includes(u.protocol) ||
          u.username ||
          u.password
        )
          throw 0;
      } catch {
        c.addIssue({
          code: "custom",
          message:
            "Use https/wss/mqtts without credentials; configuration only",
        });
      }
    }
    if (g.adapter === "simulation" && (g.location !== "local" || g.endpoint))
      c.addIssue({
        code: "custom",
        message: "Built-in simulation gateway is local and needs no endpoint",
      });
    if (new Set(g.channels.map((c) => c.name)).size !== g.channels.length)
      c.addIssue({ code: "custom", message: "Duplicate channel names" });
  });
const object = z
  .object({
    id,
    name: text,
    type: z.enum([
      "charging",
      "parking",
      "loading",
      "unloading",
      "waypoint",
      "door",
      "restricted",
      "speed",
      "route",
    ]),
    mapId: id,
    level: text,
    x: coord,
    y: coord,
    yaw: num
      .min(-Math.PI * 2)
      .max(Math.PI * 2)
      .default(0),
    w: num.min(0.1).max(1000).default(2),
    h: num.min(0.1).max(1000).default(2),
    value: num.min(0).max(300).default(0),
    points: z
      .array(z.tuple([coord, coord]))
      .max(500)
      .default([]),
  })
  .strict();
const device = z
  .object({
    id,
    name: text,
    kind: z.enum(["virtual", "physical"]),
    model: ref,
    mapId: id,
    level: text,
    pose,
    gatewayId: id.optional(),
    serial: z.string().max(120).default(""),
    channels: z.array(z.string().max(120)).max(30).default([]),
  })
  .strict();
const task = z
  .object({
    id,
    name: text,
    deviceId: id,
    routeId: id,
    duration: num.min(1).max(180).default(60),
    speed: num.min(0.1).max(5).default(1),
    engine: z.enum(["kinematic", "chrono"]).default("kinematic"),
  })
  .strict();
export const parkSchema = z
  .object({
    description: z.string().max(2000).default(""),
    maps: z
      .array(ref.extend({ pose: pose.default([0, 0, 0]) }))
      .min(1)
      .max(20),
    models: z.array(ref).min(1).max(40),
    gateways: z.array(id).min(1).max(20),
    objects: z.array(object).max(500).default([]),
    devices: z.array(device).max(100).default([]),
    tasks: z.array(task).max(100).default([]),
  })
  .strict();
// Map import is normalized local geometry, never an executable URDF/plugin/archive.
const point = z.object({
  id: z.number().int().min(0),
  x: coord,
  y: coord,
  z: coord.default(0),
  name: z.string().max(120).default(""),
  parameters: z.record(z.string(), z.unknown()).default({}),
});
const edge = z.object({
  id: z.number().int().min(0),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  parameters: z.record(z.string(), z.unknown()).default({}),
  graph: z.number().int().optional(),
  bidirectional: z.boolean().optional(),
});
const polygon = z.object({
  vertices: z.array(z.number().int().min(0)).min(3).max(5000),
  parameters: z.record(z.string(), z.unknown()).default({}),
});
export const mapSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().max(80),
    name: z.object({ zh: text, en: text }),
    units: z.object({ length: z.literal("m"), angle: z.literal("rad") }),
    source: z.unknown(),
    coordinateTransform: z.unknown(),
    capabilities: z.object({
      geometry: z.boolean(),
      navigation: z.boolean(),
      simulation: z.literal(false),
      liveControl: z.literal(false),
    }),
    warnings: z.array(z.string().max(200)).max(40),
    levels: z
      .array(
        z
          .object({
            id: text,
            elevation: coord,
            vertices: z.array(point).min(1).max(20000),
            lanes: z
              .array(
                edge.extend({
                  graph: z.number().int(),
                  bidirectional: z.boolean(),
                }),
              )
              .max(20000),
            walls: z.array(edge).max(20000),
            doors: z.array(edge).max(1000),
            floors: z.array(polygon).max(1000),
            holes: z.array(polygon).max(1000),
            models: z
              .array(
                z.object({
                  id: z.number().int(),
                  name: z.string(),
                  model: z.string(),
                  position: z.tuple([coord, coord, coord]),
                  yaw: num,
                }),
              )
              .max(5000),
            graphs: z.array(z.number().int()).max(100),
            bounds: z.object({
              x: coord,
              y: coord,
              w: num.positive().max(100000),
              h: num.positive().max(100000),
            }),
            transform: z.unknown().optional(),
            drawing: z
              .string()
              .regex(
                /^\/assets\/maps\/rmf\/source\/[a-z_]+\/[A-Za-z0-9_-]+\.png$/,
              )
              .optional(),
          })
          .passthrough(),
      )
      .min(1)
      .max(10),
    lifts: z
      .array(
        z
          .object({
            id: text,
            position: z.tuple([coord, coord]),
            width: num.positive().max(100),
            depth: num.positive().max(100),
            yaw: num,
            levels: z.array(text),
          })
          .passthrough(),
      )
      .max(100),
  })
  .strict()
  .superRefine((m, c) => {
    for (const l of m.levels) {
      if (
        l.vertices.some((v, i) => v.id !== i) ||
        [...l.lanes, ...l.walls, ...l.doors].some(
          (e) => !l.vertices[e.start] || !l.vertices[e.end],
        ) ||
        [...l.floors, ...l.holes].some((p) =>
          p.vertices.some((i) => !l.vertices[i]),
        )
      )
        c.addIssue({
          code: "custom",
          message: "Invalid map vertex references",
        });
    }
    if (new Set(m.levels.map((l) => l.id)).size !== m.levels.length)
      c.addIssue({ code: "custom", message: "Duplicate floor IDs" });
    if (
      m.lifts.some((l) =>
        l.levels.some((id) => !m.levels.some((x) => x.id === id)),
      )
    )
      c.addIssue({ code: "custom", message: "Invalid lift floor" });
  });
export const schemas = {
  maps: mapSchema,
  models: modelSchema,
  gateways: gatewaySchema,
  parks: parkSchema,
};
export const recordInput = z
  .object({
    name: text,
    data: z.unknown(),
    version: z.number().int().positive().optional(),
  })
  .strict();
export function modelCapability(m) {
  return ["tugger", "forklift", "amr"].includes(m.category)
    ? "planar-kinematics"
    : "definition-only";
}
