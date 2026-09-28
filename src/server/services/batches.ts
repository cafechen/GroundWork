import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  batchInputSchema,
  makeManifest,
  manifestSchema,
  summarizeBatch,
  type BatchManifest,
} from "../../simulation/batch-summary";
import { validateRequest } from "../../simulation/lab-domain";
import {
  PlatformRepository,
  json,
  contentHash,
} from "../repositories/platform";
import { decodeJson } from "../repositories/json-codec";
import { PlatformError } from "../errors";

// Atomic manifest + members, using existing append-only audit storage.
// 清单与成员在同一事务保存；不新增表，不在 HTTP 进程执行仿真。
export class BatchService {
  constructor(
    private db: PrismaClient,
    private repo: PlatformRepository,
  ) {}
  async submit(raw: unknown) {
    const { config } = batchInputSchema.parse(raw);
    const manifest = makeManifest(config, randomUUID, new Date().toISOString());
    await this.repo.transaction(async (tx) => {
      if (
        (await tx.simulationRun.count({ where: { status: "queued" } })) + 12 >
          12 ||
        (await tx.simulationRun.count()) + 12 > 200
      )
        throw new PlatformError(
          "Batch requires 12 free queue/storage slots / 批次需要 12 个空闲队列及存储名额",
          409,
        );
      for (const p of manifest.pairs)
        for (const [id, policy] of [
          [p.baselineId, "fifo"],
          [p.candidateId, "none"],
        ]) {
          const request = validateRequest({
            engine: "yard",
            config: {
              ...manifest.config,
              seed: p.seed,
              doorDelay: p.doorDelay,
              policy,
            },
          });
          await tx.simulationRun.create({
            data: {
              id,
              engine: "yard",
              engineVersion: "0.1.0",
              codeFingerprint: "pending-worker",
              status: "queued",
              inputSnapshot: json(request),
              inputHash: contentHash(request),
            },
          });
        }
      await tx.auditEvent.create({
        data: {
          actor: "local-preview",
          action: "batch.create",
          entityKind: "batches",
          entityId: manifest.id,
          entityVersion: 1,
          details: json(manifest),
        },
      });
    });
    return this.get(manifest.id);
  }
  private async manifest(id: string): Promise<BatchManifest> {
    const event = await this.db.auditEvent.findFirst({
      where: { entityKind: "batches", action: "batch.create", entityId: id },
    });
    if (!event) throw new PlatformError("Batch not found / 批次不存在", 404);
    return manifestSchema.parse(decodeJson(event.details));
  }
  async list() {
    const events = await this.db.auditEvent.findMany({
      where: { entityKind: "batches", action: "batch.create" },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: 20,
    });
    return events.map((e) => manifestSchema.parse(decodeJson(e.details)));
  }
  async get(id: string) {
    const manifest = await this.manifest(id);
    const rows = await this.db.simulationRun.findMany({
      where: {
        id: {
          in: manifest.pairs.flatMap((p) => [p.baselineId, p.candidateId]),
        },
      },
    });
    return summarizeBatch(
      manifest,
      rows.map((r) => ({
        ...r,
        inputSnapshot: decodeJson(r.inputSnapshot),
        metrics: decodeJson(r.metrics),
      })),
    );
  }
  async cancel(id: string) {
    const manifest = await this.manifest(id),
      now = new Date();
    await this.db.simulationRun.updateMany({
      where: {
        id: {
          in: manifest.pairs.flatMap((p) => [p.baselineId, p.candidateId]),
        },
        status: { in: ["queued", "running"] },
      },
      data: { status: "cancelled", cancelRequestedAt: now, finishedAt: now },
    });
    return this.get(id);
  }
}
