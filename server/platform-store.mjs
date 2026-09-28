import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { schemas, recordInput } from "./platform-contracts.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
export class PlatformError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export class PlatformStore {
  constructor(filename) {
    this.filename = filename;
  }
  async init() {
    await mkdir(path.dirname(this.filename), { recursive: true });
    this.db = new DatabaseSync(this.filename);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,version INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS versions(id TEXT NOT NULL,version INTEGER NOT NULL,record TEXT NOT NULL,PRIMARY KEY(id,version),FOREIGN KEY(id) REFERENCES records(id));
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    if (!this.db.prepare("SELECT id FROM records LIMIT 1").get())
      await this.seed();
  }
  decode(r) {
    return r
      ? { ...r, archived: Boolean(r.archived), data: JSON.parse(r.data) }
      : null;
  }
  list(kind) {
    this.kind(kind);
    return this.db
      .prepare("SELECT * FROM records WHERE kind=? ORDER BY createdAt,id")
      .all(kind)
      .map((r) => this.decode(r));
  }
  kind(kind) {
    if (!schemas[kind]) throw new PlatformError("Unknown resource kind", 404);
  }
  get(kind, id, version) {
    this.kind(kind);
    const r = this.decode(
      this.db
        .prepare("SELECT * FROM records WHERE kind=? AND id=?")
        .get(kind, id),
    );
    if (!r) throw new PlatformError("Resource not found / 资源不存在", 404);
    if (version !== undefined) {
      const v = this.db
        .prepare("SELECT record FROM versions WHERE id=? AND version=?")
        .get(id, version);
      if (!v) throw new PlatformError("Version not found", 404);
      return JSON.parse(v.record);
    }
    return r;
  }
  history(kind, id) {
    this.get(kind, id);
    return this.db
      .prepare(
        "SELECT version,record FROM versions WHERE id=? ORDER BY version DESC",
      )
      .all(id)
      .map((r) => ({
        version: r.version,
        updatedAt: JSON.parse(r.record).updatedAt,
      }));
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  validatePark(p) {
    for (const values of [
      p.maps.map((x) => x.id),
      p.models.map((x) => x.id),
      p.gateways,
      p.devices.map((x) => x.id),
      p.objects.map((x) => x.id),
      p.tasks.map((x) => x.id),
    ])
      if (new Set(values).size !== values.length)
        throw new PlatformError("Duplicate references / 重复标识");
    const maps = new Map(
      p.maps.map((r) => [r.id, this.get("maps", r.id, r.version)]),
    );
    const models = new Map(
      p.models.map((r) => [r.id, this.get("models", r.id, r.version)]),
    );
    for (const kind of ["maps", "models"])
      for (const r of p[kind])
        if (this.get(kind, r.id).archived)
          throw new PlatformError("Archived resource cannot be selected");
    for (const id of p.gateways)
      if (this.get("gateways", id).archived)
        throw new PlatformError("Gateway archived");
    const level = (x) => {
      const l = maps.get(x.mapId)?.data.levels.find((l) => l.id === x.level);
      if (!l)
        throw new PlatformError(
          "Map/floor must belong to park / 地图楼层不属于园区",
        );
      return l;
    };
    for (const d of p.devices) {
      level(d);
      if (models.get(d.model.id)?.version !== d.model.version)
        throw new PlatformError(
          "Device model must match selected park model version",
        );
      if (d.kind === "virtual" && d.serial)
        throw new PlatformError("Virtual devices must not claim a real serial");
      if (!d.gatewayId && d.channels.length)
        throw new PlatformError(
          "Bind a gateway before selecting channels / 请先绑定网关",
        );
      if (d.gatewayId) {
        if (!p.gateways.includes(d.gatewayId))
          throw new PlatformError("Gateway does not belong to park");
        const g = this.get("gateways", d.gatewayId).data;
        if ((d.kind === "physical") === (g.adapter === "simulation"))
          throw new PlatformError("Physical/virtual gateway mismatch");
        if (d.channels.some((c) => !g.channels.some((v) => v.name === c)))
          throw new PlatformError("Unknown gateway channel");
      }
    }
    for (const o of p.objects) {
      level(o);
      if (
        o.type === "route" &&
        (o.points.length < 2 ||
          o.points.some(
            (p, i) =>
              i &&
              Math.hypot(p[0] - o.points[i - 1][0], p[1] - o.points[i - 1][1]) <
                0.001,
          ))
      )
        throw new PlatformError(
          "Route needs distinct consecutive points / 路线至少两个不同坐标",
        );
    }
    for (const t of p.tasks) {
      const d = p.devices.find((v) => v.id === t.deviceId),
        o = p.objects.find((v) => v.id === t.routeId);
      if (
        !d ||
        !o ||
        o.type !== "route" ||
        d.mapId !== o.mapId ||
        d.level !== o.level
      )
        throw new PlatformError("Task device and route must share a map floor");
    }
  }
  save(kind, input, id) {
    this.kind(kind);
    const parsed = recordInput.parse(input);
    const data = schemas[kind].parse(parsed.data);
    if (Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024)
      throw new PlatformError("Resource exceeds 4 MiB");
    return this.transaction(() => {
      const old = id ? this.get(kind, id) : null;
      if (old && (parsed.version !== old.version || old.archived))
        throw new PlatformError(
          "Revision conflict or archived / 版本已变化或已归档，请重新载入",
          409,
        );
      if (
        !old &&
        this.db.prepare("SELECT count(*) AS n FROM records").get().n >= 2000
      )
        throw new PlatformError("Resource limit reached");
      if (kind === "parks") this.validatePark(data);
      if (kind === "gateways" && old)
        for (const p of this.list("parks").filter(
          (p) => !p.archived && p.data.gateways.includes(id),
        )) {
          if (data.adapter !== old.data.adapter)
            throw new PlatformError("Referenced gateway adapter cannot change");
          if (
            p.data.devices
              .filter((d) => d.gatewayId === id)
              .some((d) =>
                d.channels.some(
                  (c) => !data.channels.some((x) => x.name === c),
                ),
              )
          )
            throw new PlatformError("Channel is referenced by a device");
        }
      const now = new Date().toISOString(),
        r = {
          id: id || randomUUID(),
          kind,
          name: parsed.name,
          version: (old?.version || 0) + 1,
          archived: false,
          data,
          createdAt: old?.createdAt || now,
          updatedAt: now,
        };
      this.db
        .prepare(
          "INSERT INTO records VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=excluded.version,data=excluded.data,updatedAt=excluded.updatedAt",
        )
        .run(
          r.id,
          kind,
          r.name,
          r.version,
          0,
          JSON.stringify(data),
          r.createdAt,
          now,
        );
      this.db
        .prepare("INSERT INTO versions VALUES(?,?,?)")
        .run(r.id, r.version, JSON.stringify(r));
      this.db
        .prepare(
          "INSERT INTO audit(at,action,kind,id,version) VALUES(?,?,?,?,?)",
        )
        .run(now, old ? "update" : "create", kind, r.id, r.version);
      return r;
    });
  }
  archive(kind, id, version) {
    return this.transaction(() => {
      const r = this.get(kind, id);
      if (r.version !== version)
        throw new PlatformError("Revision conflict", 409);
      for (const p of this.list("parks").filter((p) => !p.archived))
        if (
          kind !== "parks" &&
          (kind === "gateways"
            ? p.data.gateways.includes(id)
            : p.data[kind]?.some((v) => v.id === id))
        )
          throw new PlatformError(
            "Resource is referenced by an active park / 仍被园区引用",
            409,
          );
      this.db.prepare("UPDATE records SET archived=1 WHERE id=?").run(id);
      this.db
        .prepare(
          "INSERT INTO audit(at,action,kind,id,version) VALUES(?,?,?,?,?)",
        )
        .run(new Date().toISOString(), "archive", kind, id, version);
      return { ...r, archived: true };
    });
  }
  audit() {
    return this.db
      .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT 100")
      .all();
  }
  async seed() {
    for (const id of [
      "hotel",
      "office",
      "airport_terminal",
      "clinic",
      "campus",
    ]) {
      const data = JSON.parse(
        await readFile(path.join(root, `assets/maps/rmf/${id}.json`), "utf8"),
      );
      this.save("maps", { name: data.name.zh, data });
    }
    const common = {
      length: 3,
      width: 1.5,
      height: 1.4,
      wheelbase: 1.8,
      maxSpeed: 1.2,
      maxSteer: 0.6,
      mass: 1000,
      trailers: 0,
      sensors: [{ name: "ground-truth", kind: "pose" }],
      description: "GroundWork generic, uncalibrated / 通用未标定模型",
    };
    for (const [category, name, extra] of [
      ["tugger", "通用牵引车 / Tugger", { trailers: 1 }],
      ["forklift", "通用叉车 / Forklift", {}],
      [
        "amr",
        "通用轮式机器人 / AMR",
        { length: 1.2, width: 0.7, height: 0.6, wheelbase: 0.6, mass: 80 },
      ],
      [
        "quadruped",
        "四足模型定义 / Quadruped",
        {
          length: 1,
          width: 0.5,
          height: 0.7,
          wheelbase: 0.5,
          mass: 30,
          description:
            "Definition only; no gait/dynamics adapter / 仅模型定义，未接入步态或动力学",
        },
      ],
    ])
      this.save("models", { name, data: { ...common, category, ...extra } });
    this.save("gateways", {
      name: "本地仿真网关 / Local simulation",
      data: {
        location: "local",
        adapter: "simulation",
        endpoint: "",
        description: "Internal run journal; not an external cloud connection",
        channels: [
          { name: "state", kind: "telemetry", topic: "simulation/state" },
          { name: "events", kind: "events", topic: "simulation/events" },
        ],
      },
    });
  }
  close() {
    this.db?.close();
  }
}
