import { errorMessage } from "../../lib/error-message";
import path from "node:path";
import { readFile, realpath } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import {
  PlatformRepository,
  json,
  contentHash,
} from "../repositories/platform";
import { PlatformError } from "../errors";
import { compileParkRun } from "../../simulation/park";
import { decodeJson } from "../repositories/json-codec";
import { validateRequest, type Evidence } from "../../simulation/lab-domain";
import { compilePlan } from "../../simulation/planning";
import { createHash } from "node:crypto";
export class RunService {
  constructor(
    private db: PrismaClient,
    private repo: PlatformRepository,
  ) {}
  async submitLab(raw: unknown) {
    const request = validateRequest(raw);
    if (request.engine === "park")
      throw new PlatformError(
        "Compile park tasks through the park endpoint / 园区任务必须通过园区接口编译",
      );
    if (request.engine === "chrono" && !process.env.GROUNDWORK_CHRONO_PYTHON)
      throw new PlatformError(
        "Chrono Python is not configured / 未配置 Chrono Python",
      );
    if (request.engine === "road") compilePlan(request);
    return this.repo.transaction(async (tx) => {
      if (
        (await tx.simulationRun.count({ where: { status: "queued" } })) >= 12 ||
        (await tx.simulationRun.count()) >= 200
      )
        throw new PlatformError(
          "Preview queue/storage limit / 预览队列或存储上限",
          409,
        );
      return tx.simulationRun.create({
        data: {
          engine: request.engine,
          engineVersion:
            request.engine === "yard"
              ? "0.1.0"
              : request.engine === "road"
                ? "migrated-6538e7c"
                : "pending-worker",
          codeFingerprint: "pending-worker",
          status: "queued",
          inputSnapshot: json(request),
          inputHash: contentHash(request),
        },
      });
    });
  }
  async submit(parkId: string, input: { version: number; taskId: string }) {
    return this.repo.transaction(async (tx) => {
      if (
        (await tx.simulationRun.count({ where: { status: "queued" } })) >= 12 ||
        (await tx.simulationRun.count()) >= 200
      )
        throw new PlatformError(
          "Preview queue/storage limit reached / 预览任务数量已达上限",
          409,
        );
      const p = await this.repo.get("parks", parkId, undefined, tx);
      if (p.version !== input.version || p.archived)
        throw new PlatformError(
          "Park revision changed or archived / 园区版本变化或已归档",
          409,
          "REVISION_CONFLICT",
        );
      let request;
      try {
        request = compileParkRun(p, await this.repo.pinned(p.data, tx), input);
      } catch (e) {
        throw new PlatformError(errorMessage(e));
      }
      return tx.simulationRun.create({
        data: {
          parkId,
          parkVersion: p.version,
          taskId: input.taskId,
          engine: "park",
          engineVersion: "park-planar-1",
          codeFingerprint: "pending-worker",
          status: "queued",
          inputSnapshot: json(request),
          inputHash: contentHash(request),
        },
      });
    });
  }
  async list(parkId?: string) {
    const rows = await this.db.simulationRun.findMany({
      where: parkId ? { parkId } : {},
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        parkId: true,
        parkVersion: true,
        taskId: true,
        engine: true,
        status: true,
        verdict: true,
        metrics: true,
        error: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      metrics: decodeJson(row.metrics),
      error: decodeJson(row.error),
    }));
  }
  async cancel(id: string) {
    const now = new Date();
    const changed = await this.db.simulationRun.updateMany({
      where: { id, status: { in: ["queued", "running"] } },
      data: { status: "cancelled", cancelRequestedAt: now, finishedAt: now },
    });
    if (
      !changed.count &&
      !(await this.db.simulationRun.findUnique({ where: { id } }))
    )
      throw new PlatformError("Run not found / 实验不存在", 404);
    return {
      id,
      status: (await this.db.simulationRun.findUniqueOrThrow({ where: { id } }))
        .status,
    };
  }
  async result(id: string) {
    const run = await this.db.simulationRun.findUnique({
      where: { id },
      include: { artifacts: { where: { role: "result" }, take: 1 } },
    });
    if (!run) throw new PlatformError("Run not found / 实验不存在", 404);
    if (run.status !== "completed")
      throw new PlatformError("Result not complete / 结果尚未完成", 409);
    const artifact = run.artifacts[0];
    if (
      !artifact ||
      !/^[a-zA-Z0-9_-]{1,80}\/result\.json$/.test(artifact.storageKey)
    )
      throw new PlatformError("Result file unavailable / 结果文件不可用", 404);
    const root = await realpath(
      /* turbopackIgnore: true */ path.resolve(
        /* turbopackIgnore: true */ process.env.GROUNDWORK_ARTIFACTS ||
          "data/next-runs",
      ),
    );
    const filename = await realpath(path.resolve(root, artifact.storageKey));
    if (!filename.startsWith(root + path.sep))
      throw new PlatformError("Invalid artifact path / 非法文件路径", 403);
    const bytes = await readFile(filename);
    if (
      createHash("sha256").update(bytes).digest("hex") !== artifact.contentHash
    )
      throw new PlatformError(
        "Artifact checksum mismatch / 文件校验失败",
        409,
        "ARTIFACT_INTEGRITY",
      );
    return JSON.parse(bytes.toString("utf8")) as Evidence;
  }
}
