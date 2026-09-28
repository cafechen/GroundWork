import { randomUUID, createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  schemas,
  recordInput,
  mapSchema,
  modelSchema,
  gatewaySchema,
  parkSchema,
  type Resource,
  type Catalog,
  type Kind,
  type AnyResource,
  type ParkData,
  type DataByKind,
} from "../../contracts/platform";
import { PlatformError } from "../errors";
import { validatePark } from "../services/validation";
import { encodeJson, decodeJson } from "./json-codec";

type Tx = Prisma.TransactionClient;
export const json = encodeJson;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const contentHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
type Identity = {
  id: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
function resource<K extends Kind>(
  kind: K,
  row: Identity,
  version: number,
  data: DataByKind[K],
): Resource<K> {
  return {
    id: row.id,
    kind,
    name: row.name,
    version,
    archived: Boolean(row.archivedAt),
    data,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Dialect-independent Prisma queries only. All aggregate writes use Serializable.
// 仅使用 Prisma 通用查询；所有聚合写入采用可串行化事务。
export class PlatformRepository {
  constructor(private readonly db: PrismaClient) {}
  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 20000,
        });
      } catch (e) {
        if (!(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2034" &&
          attempt < 2
        ))
          throw e;
      }
    }
  }
  async list<K extends Kind>(
    kind: K,
    tx: Tx = this.db,
  ): Promise<Resource<K>[]> {
    let result: AnyResource[];
    if (kind === "maps") {
      const rows = await tx.mapAsset.findMany({
        include: { versions: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      result = rows.map((r) => {
        const v = r.versions.find((v) => v.version === r.currentVersion);
        if (!v) throw Error("Missing map version");
        return resource(
          "maps",
          r,
          r.currentVersion,
          mapSchema.parse(decodeJson(v.document)),
        );
      });
    } else if (kind === "models") {
      const rows = await tx.deviceModel.findMany({
        include: { versions: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      result = rows.map((r) => {
        const v = r.versions.find((v) => v.version === r.currentVersion);
        if (!v) throw Error("Missing model version");
        return resource("models", r, r.currentVersion, this.modelData(v));
      });
    } else if (kind === "gateways") {
      const rows = await tx.gateway.findMany({
        include: { channels: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      result = rows.map((r) =>
        resource(
          "gateways",
          r,
          r.version,
          gatewaySchema.parse({
            description: r.description,
            location: r.location,
            adapter: r.adapter,
            endpoint: r.endpoint ?? "",
            channels: r.channels.map((c) => ({
              name: c.name,
              kind: c.kind,
              topic: c.topic,
            })),
          }),
        ),
      );
    } else {
      const rows = await tx.park.findMany({
        include: {
          maps: true,
          models: true,
          gateways: true,
          objects: true,
          tasks: true,
          devices: { include: { channels: { include: { channel: true } } } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      result = rows.map((r) =>
        resource(
          "parks",
          r,
          r.version,
          parkSchema.parse({
            description: r.description,
            maps: r.maps.map((m) => ({
              id: m.mapId,
              version: m.mapVersion,
              pose: [m.x, m.y, m.yaw],
            })),
            models: r.models.map((m) => ({
              id: m.modelId,
              version: m.modelVersion,
            })),
            gateways: r.gateways.map((g) => g.gatewayId),
            objects: r.objects.map((o) => ({
              id: o.id,
              name: o.name,
              type: o.type,
              mapId: o.mapId,
              level: o.levelKey,
              x: o.x,
              y: o.y,
              yaw: o.yaw,
              w: o.width,
              h: o.height,
              value: o.value,
              points: decodeJson(o.points),
            })),
            devices: r.devices.map((d) => ({
              id: d.id,
              name: d.name,
              kind: d.kind,
              model: {
                id: d.modelId,
                version: r.models.find((m) => m.modelId === d.modelId)
                  ?.modelVersion,
              },
              mapId: d.mapId,
              level: d.levelKey,
              pose: [d.x, d.y, d.yaw],
              gatewayId: d.gatewayId ?? undefined,
              serial: d.serial ?? "",
              channels: d.channels.map((c) => c.channel.name),
            })),
            tasks: r.tasks.map((t) => ({
              id: t.id,
              name: t.name,
              deviceId: t.deviceId,
              routeId: t.routeId,
              duration: t.durationSeconds,
              speed: t.speedMps,
              engine: t.engine,
            })),
          }),
        ),
      );
    }
    // Each branch reconstructs and validates its specific domain schema.
    return result as Resource<K>[];
  }
  private modelData(v: Prisma.DeviceModelVersionGetPayload<object>) {
    return modelSchema.parse({
      category: v.category,
      description: v.description,
      length: v.length,
      width: v.width,
      height: v.height,
      wheelbase: v.wheelbase,
      maxSpeed: v.maxSpeed,
      maxSteer: v.maxSteer,
      mass: v.mass,
      trailers: v.trailers,
      trailerLength: v.trailerLength,
      trailerWidth: v.trailerWidth,
      hitchLength: v.hitchLength,
      sensors: decodeJson(v.sensors),
    });
  }
  async get<K extends Kind>(
    kind: K,
    id: string,
    version?: number,
    tx: Tx = this.db,
  ): Promise<Resource<K>> {
    const current = (await this.list(kind, tx)).find((r) => r.id === id);
    if (!current)
      throw new PlatformError(
        "Resource not found / 资源不存在",
        404,
        "NOT_FOUND",
      );
    if (version === undefined) return current;
    if (kind === "maps") {
      const v = await tx.mapVersion.findUnique({
        where: { mapId_version: { mapId: id, version } },
      });
      if (v)
        return {
          ...current,
          version,
          name: v.name,
          data: mapSchema.parse(decodeJson(v.document)),
          updatedAt: v.createdAt.toISOString(),
        } as Resource<K>;
    } else if (kind === "models") {
      const v = await tx.deviceModelVersion.findUnique({
        where: { modelId_version: { modelId: id, version } },
      });
      if (v)
        return {
          ...current,
          version,
          name: v.name,
          data: this.modelData(v),
          updatedAt: v.createdAt.toISOString(),
        } as Resource<K>;
    } else if (kind === "parks") {
      const v = await tx.parkRevision.findUnique({
        where: { parkId_version: { parkId: id, version } },
      });
      if (v) {
        const s = recordInput.parse(decodeJson(v.snapshot));
        return {
          ...current,
          name: s.name,
          version,
          data: parkSchema.parse(s.data),
          updatedAt: v.createdAt.toISOString(),
        } as Resource<K>;
      }
    } else {
      const v = await tx.auditEvent.findFirst({
        where: {
          entityKind: kind,
          entityId: id,
          entityVersion: version,
          action: { in: ["create", "update", "legacy.gateway.version"] },
        },
        orderBy: { id: "desc" },
      });
      if (v?.details) {
        const s = recordInput.parse(decodeJson(v.details));
        return {
          ...current,
          name: s.name,
          version,
          data: gatewaySchema.parse(s.data),
          updatedAt: v.at.toISOString(),
        } as Resource<K>;
      }
    }
    throw new PlatformError("Version not found / 版本不存在", 404, "NOT_FOUND");
  }
  async catalog(tx: Tx = this.db): Promise<Catalog> {
    return {
      maps: await this.list("maps", tx),
      models: await this.list("models", tx),
      gateways: await this.list("gateways", tx),
      parks: await this.list("parks", tx),
    };
  }
  async pinned(p: ParkData, tx: Tx): Promise<Catalog> {
    return {
      maps: await Promise.all(
        p.maps.map((r) => this.get("maps", r.id, r.version, tx)),
      ),
      models: await Promise.all(
        p.models.map((r) => this.get("models", r.id, r.version, tx)),
      ),
      gateways: await Promise.all(
        p.gateways.map((id) => this.get("gateways", id, undefined, tx)),
      ),
      parks: [],
    };
  }
  async history(kind: Kind, id: string) {
    const r = await this.get(kind, id);
    return Promise.all(
      Array.from({ length: r.version }, (_, i) => r.version - i).map(
        async (version) => ({
          version,
          updatedAt: (await this.get(kind, id, version)).updatedAt,
        }),
      ),
    );
  }
  async save<K extends Kind>(
    kind: K,
    input: unknown,
    id?: string,
  ): Promise<Resource<K>> {
    const parsed = recordInput.parse(input),
      data = schemas[kind].parse(parsed.data);
    if (Buffer.byteLength(JSON.stringify(data)) > 4 * 1024 * 1024)
      throw new PlatformError("Resource exceeds 4 MiB / 资源超过4MiB");
    return this.transaction(async (tx) => {
      const old = id ? await this.get(kind, id, undefined, tx) : null;
      if (old && (old.version !== parsed.version || old.archived))
        throw new PlatformError(
          "Revision conflict or archived; reload / 版本冲突或已归档，请重新载入",
          409,
          "REVISION_CONFLICT",
        );
      if (
        !old &&
        (await tx.mapAsset.count()) +
          (await tx.deviceModel.count()) +
          (await tx.gateway.count()) +
          (await tx.park.count()) >=
          2000
      )
        throw new PlatformError("Resource limit reached / 资源数量上限");
      const rid = id ?? randomUUID(),
        version = (old?.version ?? 0) + 1,
        now = new Date();
      const common = { name: parsed.name, updatedAt: now };
      if (kind === "maps") {
        const d = mapSchema.parse(data);
        await tx.mapAsset.upsert({
          where: { id: rid },
          create: { id: rid, ...common, currentVersion: version },
          update: { ...common, currentVersion: version },
        });
        await tx.mapVersion.create({
          data: {
            mapId: rid,
            version,
            name: parsed.name,
            document: json(d),
            contentHash: contentHash(d),
            createdAt: now,
          },
        });
      } else if (kind === "models") {
        const d = modelSchema.parse(data);
        await tx.deviceModel.upsert({
          where: { id: rid },
          create: { id: rid, ...common, currentVersion: version },
          update: { ...common, currentVersion: version },
        });
        await tx.deviceModelVersion.create({
          data: {
            modelId: rid,
            version,
            name: parsed.name,
            ...d,
            sensors: json(d.sensors),
            contentHash: contentHash(d),
            createdAt: now,
          },
        });
      } else if (kind === "gateways") {
        const d = gatewaySchema.parse(data);
        if (old)
          for (const p of (await this.list("parks", tx)).filter(
            (p) => !p.archived && p.data.gateways.includes(rid),
          )) {
            const previous = gatewaySchema.parse(old.data);
            if (d.adapter !== previous.adapter)
              throw new PlatformError(
                "Referenced gateway adapter cannot change / 已引用网关不可更换适配器",
              );
            if (
              p.data.devices
                .filter((x) => x.gatewayId === rid)
                .some((x) =>
                  x.channels.some((c) => !d.channels.some((n) => n.name === c)),
                )
            )
              throw new PlatformError(
                "Channel is referenced by a device / 通道仍被设备引用",
              );
          }
        const { channels, ...fields } = d;
        await tx.gateway.upsert({
          where: { id: rid },
          create: { id: rid, ...common, version, ...fields },
          update: { ...common, version, ...fields },
        });
        await tx.gatewayChannel.deleteMany({
          where: {
            gatewayId: rid,
            name: { notIn: channels.map((c) => c.name) },
          },
        });
        for (const c of channels)
          await tx.gatewayChannel.upsert({
            where: { gatewayId_name: { gatewayId: rid, name: c.name } },
            create: { gatewayId: rid, ...c },
            update: c,
          });
      } else {
        const d = parkSchema.parse(data);
        validatePark(d, await this.pinned(d, tx));
        await tx.park.upsert({
          where: { id: rid },
          create: { id: rid, ...common, version, description: d.description },
          update: { ...common, version, description: d.description },
        });
        await this.writePark(tx, rid, d);
        await tx.parkRevision.create({
          data: {
            parkId: rid,
            version,
            snapshot: json({ name: parsed.name, data: d }),
            contentHash: contentHash({ name: parsed.name, data: d }),
            createdAt: now,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          at: now,
          actor: "local-preview",
          action: old ? "update" : "create",
          entityKind: kind,
          entityId: rid,
          entityVersion: version,
          parkId: kind === "parks" ? rid : null,
          details:
            kind === "gateways"
              ? json({ name: parsed.name, data })
              : Prisma.DbNull,
        },
      });
      return this.get(kind, rid, undefined, tx);
    });
  }
  private async writePark(tx: Tx, parkId: string, p: ParkData) {
    // Reverse dependency order; historical snapshots/runs are never deleted.
    await tx.task.deleteMany({ where: { parkId } });
    await tx.deviceChannelBinding.deleteMany({ where: { parkId } });
    await tx.deviceInstance.deleteMany({ where: { parkId } });
    await tx.sceneObject.deleteMany({ where: { parkId } });
    await tx.parkMap.deleteMany({ where: { parkId } });
    await tx.parkModel.deleteMany({ where: { parkId } });
    await tx.parkGateway.deleteMany({ where: { parkId } });
    for (const m of p.maps)
      await tx.parkMap.create({
        data: {
          parkId,
          mapId: m.id,
          mapVersion: m.version,
          x: m.pose[0],
          y: m.pose[1],
          yaw: m.pose[2],
        },
      });
    for (const m of p.models)
      await tx.parkModel.create({
        data: { parkId, modelId: m.id, modelVersion: m.version },
      });
    for (const gatewayId of p.gateways)
      await tx.parkGateway.create({ data: { parkId, gatewayId } });
    for (const o of p.objects) {
      const { mapId, level, w, h, points, ...fields } = o;
      await tx.sceneObject.create({
        data: {
          parkId,
          mapId,
          levelKey: level,
          width: w,
          height: h,
          points: json(points),
          ...fields,
        },
      });
    }
    for (const d of p.devices) {
      await tx.deviceInstance.create({
        data: {
          parkId,
          id: d.id,
          name: d.name,
          kind: d.kind,
          modelId: d.model.id,
          mapId: d.mapId,
          levelKey: d.level,
          x: d.pose[0],
          y: d.pose[1],
          yaw: d.pose[2],
          gatewayId: d.gatewayId,
          serial: d.serial,
        },
      });
      for (const name of d.channels) {
        if (!d.gatewayId) throw new PlatformError("Missing gateway / 缺少网关");
        const channel = await tx.gatewayChannel.findUniqueOrThrow({
          where: { gatewayId_name: { gatewayId: d.gatewayId, name } },
        });
        await tx.deviceChannelBinding.create({
          data: {
            parkId,
            deviceId: d.id,
            gatewayId: d.gatewayId,
            channelId: channel.id,
          },
        });
      }
    }
    for (const t of p.tasks) {
      const { duration, speed, ...fields } = t;
      await tx.task.create({
        data: { parkId, ...fields, durationSeconds: duration, speedMps: speed },
      });
    }
  }
  // Only the explicit empty-target importer may call this; never exposed by HTTP.
  async restoreParkRows(tx: Tx, parkId: string, p: ParkData) {
    await this.writePark(tx, parkId, p);
  }
  async archive(kind: Kind, id: string, version: number) {
    return this.transaction(async (tx) => {
      const r = await this.get(kind, id, undefined, tx);
      if (r.version !== version)
        throw new PlatformError(
          "Revision conflict / 版本冲突",
          409,
          "REVISION_CONFLICT",
        );
      if (kind !== "parks")
        for (const p of (await this.list("parks", tx)).filter(
          (p) => !p.archived,
        )) {
          if (
            kind === "gateways"
              ? p.data.gateways.includes(id)
              : p.data[kind].some((x) => x.id === id)
          )
            throw new PlatformError(
              "Resource is referenced by an active park / 仍被园区引用",
              409,
              "REFERENCED",
            );
        }
      const data = { archivedAt: new Date() };
      if (kind === "maps") await tx.mapAsset.update({ where: { id }, data });
      else if (kind === "models")
        await tx.deviceModel.update({ where: { id }, data });
      else if (kind === "gateways")
        await tx.gateway.update({ where: { id }, data });
      else await tx.park.update({ where: { id }, data });
      await tx.auditEvent.create({
        data: {
          actor: "local-preview",
          action: "archive",
          entityKind: kind,
          entityId: id,
          entityVersion: version,
        },
      });
      return { ...r, archived: true };
    });
  }
}
