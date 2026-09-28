import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PrismaClient } from "@prisma/client";
import { PlatformRepository } from "../src/server/repositories/platform.ts";
import { BatchService } from "../src/server/services/batches.ts";
import { RunService } from "../src/server/services/runs.ts";
import { runBatch } from "../src/simulation/experiments.ts";
import { DEFAULT_CONFIG } from "../src/simulation/yard-scenario.ts";
if (
  !/^groundwork_/.test(
    new URL(process.env.DATABASE_URL || "mysql://unused/none").pathname.slice(
      1,
    ),
  )
)
  throw Error("Explicit isolated groundwork_* DATABASE_URL required");
test(
  "atomic batch capacity, cancellation, durable membership and twelve real worker results",
  { timeout: 180000 },
  async () => {
    const db = new PrismaClient(),
      repo = new PlatformRepository(db),
      service = new BatchService(db, repo);
    let worker;
    const created = [];
    try {
      assert.equal(
        await db.simulationRun.count({
          where: { status: { in: ["queued", "running"] } },
        }),
        0,
        "Use an idle dedicated test database",
      );
      const count = await db.simulationRun.count(),
        audit = await db.auditEvent.count({
          where: { action: "batch.create" },
        });
      const submissions = await Promise.allSettled([
        service.submit({ config: {} }),
        service.submit({ config: {} }),
      ]);
      for (const s of submissions)
        if (s.status === "fulfilled") created.push(s.value.manifest.id);
      assert.equal(
        created.length,
        1,
        "Concurrent batches cannot oversubscribe queue",
      );
      assert.equal(await db.simulationRun.count(), count + 12);
      assert.equal(
        await db.auditEvent.count({ where: { action: "batch.create" } }),
        audit + 1,
      );
      const cancelled = await service.cancel(created[0]);
      assert.equal(cancelled.summary.cancelled, 12);
      assert.equal(cancelled.summary.evaluatedPairs, 0);
      assert.deepEqual(
        (await new BatchService(db, repo).get(created[0])).manifest,
        cancelled.manifest,
      );
      const cancelledIds = cancelled.manifest.pairs.flatMap((p) => [
        p.baselineId,
        p.candidateId,
      ]);
      assert.equal(
        await db.runArtifact.count({ where: { runId: { in: cancelledIds } } }),
        0,
      );
      const batch = await service.submit({ config: DEFAULT_CONFIG });
      created.push(batch.manifest.id);
      worker = spawn(
        process.execPath,
        ["--import", "tsx", "workers/runner.ts"],
        { stdio: "inherit", env: process.env },
      );
      const deadline = Date.now() + 120000;
      let result;
      do {
        result = await service.get(batch.manifest.id);
        if (!result.summary.queued && !result.summary.running) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      } while (Date.now() < deadline);
      assert.equal(result.summary.completed, 12);
      assert.equal(result.summary.evaluatedPairs, 6);
      const old = runBatch(DEFAULT_CONFIG);
      assert.deepEqual(
        result.pairs.map((p) => p.comparison),
        old.cases.map((c) => c.comparison),
      );
      for (const key of ["regressions", "baselinePass", "candidatePass"])
        assert.equal(result.summary[key], old.summary[key]);
      const runs = new RunService(db, repo);
      for (const p of result.pairs)
        for (const role of ["baseline", "candidate"]) {
          const evidence = await runs.result(p[`${role}Id`]);
          assert.deepEqual(evidence.metrics, p[role].metrics);
        }
      console.log(
        JSON.stringify({ batch: batch.manifest.id, summary: result.summary }),
      );
    } finally {
      if (worker) {
        const stopped = once(worker, "exit");
        worker.kill("SIGTERM");
        await stopped;
      }
      // Only cancel this test's unfinished members; never clear tables or unrelated jobs.
      for (const id of created) await service.cancel(id);
      await db.$disconnect();
    }
  },
);
