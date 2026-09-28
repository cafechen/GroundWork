import { randomUUID, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PlatformRepository, json } from "../src/server/repositories/platform";
import {
  validateRequest,
  makeChronoScene,
  normalizeChrono,
  chronoRowSchema,
  chronoSummarySchema,
  type Evidence,
} from "../src/simulation/lab-domain";
import { decodeJson } from "../src/server/repositories/json-codec";

const db = new PrismaClient(),
  repo = new PlatformRepository(db),
  owner = randomUUID();
const root = process.cwd(),
  artifacts = path.resolve(
    process.env.GROUNDWORK_ARTIFACTS || "data/next-runs",
  );
let closing = false;
process.on("SIGTERM", () => {
  closing = true;
});
process.on("SIGINT", () => {
  closing = true;
});
async function fingerprint() {
  const h = createHash("sha256");
  async function include(directory: string) {
    for (const e of (
      await readdir(path.join(root, directory), { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = path.join(directory, e.name);
      if (e.isDirectory() && e.name !== "__pycache__") await include(name);
      else if (/\.(ts|js|py)$/.test(name)) {
        h.update(name);
        h.update(await readFile(path.join(root, name)));
      }
    }
  }
  for (const directory of [
    "src/simulation",
    "packages/contracts/dist",
    "packages/scenario-engine/dist",
    "engines/chrono",
  ])
    await include(directory);
  for (const file of [
    "src/simulation/park.ts",
    "src/simulation/geometry.ts",
    "src/contracts/platform.ts",
    "workers/park-child.ts",
  ]) {
    h.update(file);
    h.update(await readFile(path.join(root, file)));
  }
  return h.digest("hex");
}
async function tick() {
  const now = new Date();
  await db.simulationRun.updateMany({
    where: { status: "running", leaseExpiresAt: { lt: now } },
    data: {
      status: "interrupted",
      finishedAt: now,
      error: json({ message: "Worker lease expired / 执行进程租约过期" }),
    },
  });
  // Serializable read+claim prevents concurrent workers selecting separate jobs
  // while the single preview slot is occupied. No vendor-specific locking SQL.
  const job = await repo.transaction(async (tx) => {
    if (
      await tx.simulationRun.count({
        where: {
          OR: [
            { status: "running" },
            { leaseOwner: { not: null }, leaseExpiresAt: { gt: now } },
          ],
        },
      })
    )
      return null;
    const next = await tx.simulationRun.findFirst({
      where: { status: "queued" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!next) return null;
    const claimed = await tx.simulationRun.updateMany({
      where: { id: next.id, status: "queued", cancelRequestedAt: null },
      data: {
        status: "running",
        startedAt: now,
        leaseOwner: owner,
        leaseExpiresAt: new Date(Date.now() + 30000),
      },
    });
    return claimed.count ? next : null;
  });
  if (!job) return false;
  const where = { id: job.id, status: "running" as const, leaseOwner: owner };
  try {
    const input = validateRequest(decodeJson(job.inputSnapshot));
    if (job.engine !== input.engine) throw Error("Engine identity mismatch");
    const executedFingerprint = await fingerprint();
    const directory = path.join(artifacts, job.id);
    await mkdir(directory, { recursive: true });
    const inputFile = path.join(directory, "input.json"),
      output = path.join(directory, "result.pending.json");
    await writeFile(inputFile, JSON.stringify(input));
    const chrono = input.engine === "chrono";
    const python = process.env.GROUNDWORK_CHRONO_PYTHON;
    if (chrono && !python) throw Error("Chrono Python is not configured");
    if (chrono)
      await writeFile(
        path.join(directory, "scene.json"),
        JSON.stringify(makeChronoScene(input)),
      );
    const current = await db.simulationRun.findUniqueOrThrow({
      where: { id: job.id },
    });
    if (current.status !== "running" || current.leaseOwner !== owner || closing)
      return true;
    const child = spawn(
      chrono ? python! : process.execPath,
      chrono
        ? [
            path.join(root, "engines/chrono/physics.py"),
            "--offline-seconds",
            String(input.duration),
            "--friction",
            String(input.friction),
            "--scene",
            path.join(directory, "scene.json"),
            "--output",
            directory,
          ]
        : [
            "--import",
            path.join(root, "node_modules/tsx/dist/loader.mjs"),
            path.join(root, "workers/park-child.ts"),
            inputFile,
            output,
          ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let terminateAt: number | null = null;
    let log = "",
      heartbeatError = false;
    child.stdout.on("data", (c) => {
      log = (log + String(c)).slice(-64000);
    });
    child.stderr.on("data", (c) => {
      log = (log + String(c)).slice(-64000);
    });
    let heartbeat: Promise<void> = Promise.resolve();
    const poll = setInterval(() => {
      heartbeat = heartbeat
        .then(async () => {
          const row = await db.simulationRun.findUniqueOrThrow({
            where: { id: job.id },
          });
          if (row.status !== "running" || row.leaseOwner !== owner || closing) {
            terminateAt ??= Date.now();
            child.kill(Date.now() - terminateAt > 2000 ? "SIGKILL" : "SIGTERM");
          } else
            await db.simulationRun.updateMany({
              where,
              data: { leaseExpiresAt: new Date(Date.now() + 30000) },
            });
        })
        .catch(() => {
          heartbeatError = true;
          child.kill("SIGKILL");
        });
    }, 500);
    const timeout = setTimeout(() => child.kill("SIGKILL"), 600000);
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).finally(() => {
      clearInterval(poll);
      clearTimeout(timeout);
    });
    await heartbeat;
    await writeFile(path.join(directory, "worker.log"), log);
    if (closing) {
      await db.simulationRun.updateMany({
        where,
        data: { status: "interrupted", finishedAt: new Date() },
      });
      return true;
    }
    if (code !== 0 || heartbeatError)
      throw Error("Worker failed / 仿真进程失败");
    if (chrono) {
      const file = path.join(directory, "chrono.jsonl");
      if ((await stat(file)).size > 150 * 1024 * 1024)
        throw Error("Journal exceeds 150 MiB");
      const rows = (await readFile(file, "utf8"))
        .trim()
        .split("\n")
        .map((line) => chronoRowSchema.parse(JSON.parse(line)));
      const summary = chronoSummarySchema.parse(
        JSON.parse(
          await readFile(path.join(directory, "summary.json"), "utf8"),
        ),
      );
      await writeFile(
        output,
        JSON.stringify(normalizeChrono(rows, summary, input)),
      );
    }
    const result: Evidence = JSON.parse(await readFile(output, "utf8"));
    if (executedFingerprint !== (await fingerprint()))
      throw Error("Engine source changed during execution");
    const value = JSON.stringify({
      ...result,
      provenance: {
        jobId: job.id,
        inputHash: job.inputHash,
        codeFingerprint: executedFingerprint,
        nodeVersion: process.version,
        createdAt: job.createdAt.toISOString(),
      },
    });
    await writeFile(output, value);
    await rename(output, path.join(directory, "result.json"));
    await repo.transaction(async (tx) => {
      const completed = await tx.simulationRun.updateMany({
        where,
        data: {
          status: "completed",
          finishedAt: new Date(),
          verdict: result.verdict,
          engineVersion: result.engineVersion,
          metrics: json(result.metrics),
          codeFingerprint: executedFingerprint,
          leaseExpiresAt: null,
        },
      });
      if (completed.count)
        await tx.runArtifact.create({
          data: {
            runId: job.id,
            role: "result",
            mediaType: "application/json",
            storageKey: `${job.id}/result.json`,
            contentHash: createHash("sha256").update(value).digest("hex"),
            sizeBytes: Buffer.byteLength(value),
          },
        });
    });
  } catch {
    await db.simulationRun.updateMany({
      where,
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: json({
          message:
            "Worker failed; inspect local worker log / 执行失败，请检查本地日志",
        }),
      },
    });
  } finally {
    if (closing)
      await db.simulationRun.updateMany({
        where,
        data: { status: "interrupted", finishedAt: new Date() },
      });
    await db.simulationRun.updateMany({
      where: { id: job.id, leaseOwner: owner },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
  }
  return true;
}
try {
  do {
    const worked = await tick();
    if (process.argv.includes("--once")) break;
    if (!worked && !closing) await new Promise((r) => setTimeout(r, 750));
  } while (!closing);
} finally {
  await db.$disconnect();
}
