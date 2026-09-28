import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  schemas,
  kindSchema,
  type AnyResource,
} from "../../contracts/platform";
import {
  contentHash,
  json,
  PlatformRepository,
} from "../repositories/platform";
const recordSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  kind: kindSchema,
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  archived: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  data: z.unknown(),
});
function parseRecord(raw: unknown): AnyResource {
  const r = recordSchema.parse(raw);
  return { ...r, data: schemas[r.kind].parse(r.data) } as AnyResource;
}
const auditSchema = z.object({
  seq: z.number().int(),
  at: z.string().datetime(),
  action: z.string(),
  kind: kindSchema,
  id: z.string(),
  version: z.number().int().positive(),
});
export function readLegacy(filename: string) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    db.exec("BEGIN");
    const records = db
      .prepare("SELECT * FROM records ORDER BY createdAt,id")
      .all()
      .map((r) =>
        parseRecord({
          ...r,
          archived: Boolean(r.archived),
          data: JSON.parse(String(r.data)),
        }),
      );
    const versions = db
      .prepare("SELECT record FROM versions ORDER BY id,version")
      .all()
      .map((r) => parseRecord(JSON.parse(String(r.record))));
    const audit = db
      .prepare("SELECT * FROM audit ORDER BY seq")
      .all()
      .map((r) => auditSchema.parse(r));
    db.exec("COMMIT");
    for (const r of records) {
      const history = versions.filter(
        (v) => v.kind === r.kind && v.id === r.id,
      );
      if (
        history.length !== r.version ||
        !history.every((v, i) => v.version === i + 1)
      )
        throw Error(`Incomplete version history: ${r.kind}/${r.id}`);
    }
    for (const v of versions)
      if (!records.some((r) => r.id === v.id && r.kind === v.kind))
        throw Error("Orphan historical record");
    return {
      records,
      versions,
      audit,
      sourceHash: contentHash({ records, versions, audit }),
    };
  } finally {
    db.close();
  }
}
export type LegacyBundle = ReturnType<typeof readLegacy>;
export async function restoreLegacy(
  repo: PlatformRepository,
  bundle: LegacyBundle,
) {
  return repo.transaction(async (tx) => {
    const counts = await Promise.all([
      tx.mapAsset.count(),
      tx.mapVersion.count(),
      tx.deviceModel.count(),
      tx.deviceModelVersion.count(),
      tx.gateway.count(),
      tx.gatewayChannel.count(),
      tx.park.count(),
      tx.parkRevision.count(),
      tx.parkMap.count(),
      tx.parkModel.count(),
      tx.parkGateway.count(),
      tx.deviceInstance.count(),
      tx.deviceChannelBinding.count(),
      tx.sceneObject.count(),
      tx.task.count(),
      tx.simulationRun.count(),
      tx.runArtifact.count(),
      tx.auditEvent.count(),
    ]);
    if (counts.some(Boolean))
      throw Error("Import target must be empty / 导入目标必须为空");
    for (const r of bundle.records) {
      const archivedAt = r.archived
        ? new Date(
            bundle.audit.findLast(
              (a) => a.id === r.id && a.action === "archive",
            )?.at ?? r.updatedAt,
          )
        : null;
      const common = {
        id: r.id,
        name: r.name,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        archivedAt,
      };
      if (r.kind === "maps")
        await tx.mapAsset.create({
          data: { ...common, currentVersion: r.version },
        });
      if (r.kind === "models")
        await tx.deviceModel.create({
          data: { ...common, currentVersion: r.version },
        });
      if (r.kind === "parks")
        await tx.park.create({
          data: {
            ...common,
            version: r.version,
            description: r.data.description,
          },
        });
      if (r.kind === "gateways") {
        const { channels, ...data } = r.data;
        await tx.gateway.create({
          data: { ...common, version: r.version, ...data },
        });
        for (const c of channels)
          await tx.gatewayChannel.create({ data: { gatewayId: r.id, ...c } });
      }
    }
    for (const v of bundle.versions) {
      if (v.kind === "maps")
        await tx.mapVersion.create({
          data: {
            mapId: v.id,
            version: v.version,
            name: v.name,
            document: json(v.data),
            contentHash: contentHash(v.data),
            createdAt: new Date(v.updatedAt),
          },
        });
      if (v.kind === "models")
        await tx.deviceModelVersion.create({
          data: {
            modelId: v.id,
            version: v.version,
            name: v.name,
            ...v.data,
            sensors: json(v.data.sensors),
            contentHash: contentHash(v.data),
            createdAt: new Date(v.updatedAt),
          },
        });
      if (v.kind === "parks")
        await tx.parkRevision.create({
          data: {
            parkId: v.id,
            version: v.version,
            snapshot: json({ name: v.name, data: v.data }),
            contentHash: contentHash({ name: v.name, data: v.data }),
            createdAt: new Date(v.updatedAt),
          },
        });
    }
    for (const r of bundle.records)
      if (r.kind === "parks") await repo.restoreParkRows(tx, r.id, r.data);
    for (const a of bundle.audit)
      await tx.auditEvent.create({
        data: {
          at: new Date(a.at),
          actor: "legacy-preview",
          action: a.action,
          entityKind: a.kind,
          entityId: a.id,
          entityVersion: a.version,
          details: json({ legacySequence: a.seq }),
        },
      });
    for (const v of bundle.versions)
      if (v.kind === "gateways")
        await tx.auditEvent.create({
          data: {
            at: new Date(v.updatedAt),
            actor: "legacy-import",
            action: "legacy.gateway.version",
            entityKind: "gateways",
            entityId: v.id,
            entityVersion: v.version,
            details: json({ name: v.name, data: v.data }),
          },
        });
    await tx.auditEvent.create({
      data: {
        actor: "local-import",
        action: "migration.source",
        entityKind: "migration",
        entityId: bundle.sourceHash,
        details: json({
          sourceHash: bundle.sourceHash,
          records: bundle.records.length,
          versions: bundle.versions.length,
        }),
      },
    });
    return {
      records: bundle.records.length,
      versions: bundle.versions.length,
      audit: bundle.audit.length,
      sourceHash: bundle.sourceHash,
    };
  });
}
// Keep Prisma imported only as a type boundary for the shared transaction contract.
export type ImportTransaction = Prisma.TransactionClient;
