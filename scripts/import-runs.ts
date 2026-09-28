import {
  readFile,
  readdir,
  mkdir,
  copyFile,
  stat,
  realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  PlatformRepository,
  json,
  contentHash,
} from "../src/server/repositories/platform";
const at = process.argv.indexOf("--source");
if (at < 0 || !process.argv[at + 1])
  throw Error("Explicit --source <run-directory> required");
const source = await realpath(process.argv[at + 1]),
  target = path.resolve(process.env.GROUNDWORK_ARTIFACTS || "data/next-runs");
if (source === target) throw Error("Source and destination must differ");
const apply = process.argv.includes("--apply");
const schema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  status: z.enum([
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  request: z
    .object({
      engine: z.enum(["park", "yard", "road", "chrono"]),
      snapshot: z
        .object({
          parkId: z.string(),
          parkVersion: z.number().int(),
          taskId: z.string(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  inputHash: z.string().optional(),
  error: z.unknown().optional(),
});
type ImportedResult = {
  engine: string;
  engineVersion: string;
  verdict: string;
  metrics: unknown;
  provenance?: { codeFingerprint?: string };
};
const bundles: {
  job: z.infer<typeof schema>;
  files: { name: string; file: string; hash: string; size: number }[];
  result: ImportedResult | null;
}[] = [];
for (const id of (await readdir(source)).sort()) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue;
  const directory = await realpath(path.join(source, id));
  if (!directory.startsWith(source + path.sep))
    throw Error("Source symlink escapes run directory");
  const job = schema.parse(
    JSON.parse(await readFile(path.join(directory, "job.json"), "utf8")),
  );
  if (job.id !== id) throw Error("Job directory identity mismatch");
  const files = [];
  for (const name of await readdir(directory)) {
    if (
      ![
        "job.json",
        "input.json",
        "result.json",
        "worker.log",
        "scene.json",
        "chrono.jsonl",
        "summary.json",
        "state.json",
      ].includes(name)
    )
      continue;
    const file = await realpath(path.join(directory, name));
    if (!file.startsWith(directory + path.sep))
      throw Error("Source artifact path escapes");
    const size = (await stat(file)).size;
    if (size > 150 * 1024 * 1024) throw Error("Artifact exceeds 150 MiB");
    const bytes = await readFile(file);
    files.push({
      name,
      file,
      hash: createHash("sha256").update(bytes).digest("hex"),
      size,
    });
  }
  const resultFile = files.find((f) => f.name === "result.json");
  if (job.status === "completed" && !resultFile)
    throw Error(`Completed run missing result: ${id}`);
  const result = resultFile
    ? z
        .object({
          engine: z.string(),
          engineVersion: z.string(),
          verdict: z.string(),
          metrics: z.unknown(),
          provenance: z
            .object({ codeFingerprint: z.string().optional() })
            .passthrough()
            .optional(),
        })
        .passthrough()
        .parse(JSON.parse(await readFile(resultFile.file, "utf8")))
    : null;
  if (result && result.engine !== job.request.engine)
    throw Error("Run/result engine mismatch");
  bundles.push({ job, files, result });
}
console.log(
  JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    runs: bundles.length,
    artifacts: bundles.reduce((s, b) => s + b.files.length, 0),
    bytes: bundles.reduce(
      (s, b) => s + b.files.reduce((n, f) => n + f.size, 0),
      0,
    ),
  }),
);
if (apply) {
  if (
    !process.env.DATABASE_URL ||
    !/^groundwork_/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))
  )
    throw Error("Dedicated groundwork_* destination required");
  const db = new PrismaClient(),
    repo = new PlatformRepository(db);
  try {
    if ((await db.simulationRun.count()) || (await db.runArtifact.count()))
      throw Error("Destination run tables must be empty");
    for (const { job, files } of bundles) {
      const dir = path.join(target, job.id);
      await mkdir(dir, { recursive: true });
      for (const f of files) {
        await copyFile(f.file, path.join(dir, f.name), constants.COPYFILE_EXCL);
        const actual = createHash("sha256")
          .update(await readFile(path.join(dir, f.name)))
          .digest("hex");
        if (actual !== f.hash) throw Error("Artifact copy checksum mismatch");
      }
    }
    await repo.transaction(async (tx) => {
      if ((await tx.simulationRun.count()) || (await tx.runArtifact.count()))
        throw Error("Destination changed during import");
      for (const { job, files, result } of bundles) {
        const park =
          job.request.engine === "park" ? job.request.snapshot : undefined;
        if (job.request.engine === "park" && !park)
          throw Error("Missing park snapshot");
        await tx.simulationRun.create({
          data: {
            id: job.id,
            parkId: park?.parkId,
            parkVersion: park?.parkVersion,
            taskId: park?.taskId,
            engine: job.request.engine,
            engineVersion: result?.engineVersion ?? "legacy-unexecuted",
            codeFingerprint:
              result?.provenance?.codeFingerprint ?? "legacy-unknown",
            status: ["queued", "running"].includes(job.status)
              ? "interrupted"
              : job.status,
            verdict: result?.verdict,
            inputSnapshot: json(job.request),
            inputHash: job.inputHash ?? contentHash(job.request),
            metrics: result ? json(result.metrics) : Prisma.DbNull,
            error: job.error === undefined ? Prisma.DbNull : json(job.error),
            createdAt: new Date(job.createdAt),
            startedAt: job.startedAt ? new Date(job.startedAt) : null,
            finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
          },
        });
        for (const f of files)
          await tx.runArtifact.create({
            data: {
              runId: job.id,
              role: f.name === "result.json" ? "result" : f.name,
              mediaType: f.name.endsWith(".json")
                ? "application/json"
                : "text/plain",
              storageKey: `${job.id}/${f.name}`,
              contentHash: f.hash,
              sizeBytes: f.size,
            },
          });
        await tx.auditEvent.create({
          data: {
            actor: "local-import",
            action: "migration.run",
            entityKind: "runs",
            entityId: job.id,
            details: json({
              originalStatus: job.status,
              originalInputHash: job.inputHash ?? null,
            }),
          },
        });
      }
    });
    console.log("Run history imported; source files were not changed.");
  } finally {
    await db.$disconnect();
  }
}
