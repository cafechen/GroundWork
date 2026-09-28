import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { decodeJson } from "../src/server/repositories/json-codec.ts";
import { simulate } from "../src/simulation/yard.ts";
import {
  normalizeYard,
  validateRequest,
} from "../src/simulation/lab-domain.ts";
if (
  !/^groundwork_import_/.test(
    new URL(process.env.DATABASE_URL).pathname.slice(1),
  )
)
  throw Error("Dedicated groundwork_import_* test database required");
test("run importer defaults read-only; preserves artifact bytes and interrupts legacy active jobs", async () => {
  const directory = await mkdtemp(
      path.join(os.tmpdir(), "groundwork-run-import-"),
    ),
    source = path.join(directory, "source"),
    target = path.join(directory, "target"),
    db = new PrismaClient();
  const request = validateRequest({ engine: "yard", config: { duration: 10 } }),
    result = normalizeYard(simulate(request.config), request),
    bytes = JSON.stringify(result),
    ids = [randomUUID(), randomUUID()];
  try {
    for (const [i, id] of ids.entries()) {
      await mkdir(path.join(source, id), { recursive: true });
      await writeFile(
        path.join(source, id, "job.json"),
        JSON.stringify({
          id,
          status: i ? "running" : "completed",
          createdAt: new Date().toISOString(),
          request,
        }),
      );
      if (!i) await writeFile(path.join(source, id, "result.json"), bytes);
    }
    const run = async (apply) =>
      new Promise((resolve, reject) => {
        const p = spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/import-runs.ts",
            "--source",
            source,
            ...(apply ? ["--apply"] : []),
          ],
          {
            env: { ...process.env, GROUNDWORK_ARTIFACTS: target },
            stdio: "inherit",
          },
        );
        p.once("error", reject);
        p.once("exit", resolve);
      });
    assert.equal(await db.simulationRun.count(), 0);
    assert.equal(await run(false), 0);
    assert.equal(await db.simulationRun.count(), 0);
    assert.equal(await run(true), 0);
    assert.equal(await db.simulationRun.count(), 2);
    assert.equal(
      (await db.simulationRun.findUniqueOrThrow({ where: { id: ids[1] } }))
        .status,
      "interrupted",
    );
    const completed = await db.simulationRun.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    assert.deepEqual(decodeJson(completed.inputSnapshot), request);
    const artifact = await db.runArtifact.findFirstOrThrow({
      where: { runId: ids[0], role: "result" },
    });
    assert.equal(
      artifact.contentHash,
      createHash("sha256").update(bytes).digest("hex"),
    );
    assert.equal(
      await readFile(path.join(target, artifact.storageKey), "utf8"),
      bytes,
    );
    assert.equal(
      await readFile(path.join(source, ids[0], "result.json"), "utf8"),
      bytes,
    );
    console.log(JSON.stringify({ fixtureDirectory: directory, ids }));
  } finally {
    await db.$disconnect();
  }
});
