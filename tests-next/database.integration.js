import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PlatformRepository } from "../src/server/repositories/platform.ts";
import { RunService } from "../src/server/services/runs.ts";
import { readyYard } from "../examples/ready-yard.mjs";
import { fixture } from "./fixture.js";
const url = new URL(process.env.DATABASE_URL || "mysql://unused/none");
if (!/^groundwork_/.test(url.pathname.slice(1)))
  throw Error("Explicit isolated groundwork_* DATABASE_URL required");
const db = new PrismaClient(),
  repo = new PlatformRepository(db);
test("MySQL/PG repository transactions, version snapshots, references and worker lifecycle", async () => {
  try {
    const f = fixture(),
      map = await repo.save("maps", {
        name: "Integration map",
        data: f.maps[0].data,
      }),
      model = await repo.save("models", {
        name: "Integration model",
        data: f.models[0].data,
      }),
      gateway = await repo.save("gateways", {
        name: "Integration gateway",
        data: f.gateways[0].data,
      });
    const raw = readyYard({
      mapId: map.id,
      modelId: model.id,
      gatewayId: gateway.id,
    }).park;
    const park = await repo.save("parks", raw);
    assert.equal(park.data.devices.length, 1);
    assert.equal(park.data.objects.length, 6);
    const original = await repo.get("parks", park.id, 1);
    const edits = await Promise.allSettled([
      repo.save("parks", { ...raw, version: 1, name: "First writer" }, park.id),
      repo.save(
        "parks",
        { ...raw, version: 1, name: "Second writer" },
        park.id,
      ),
    ]);
    assert.equal(edits.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(edits.filter((x) => x.status === "rejected").length, 1);
    assert.deepEqual(await repo.get("parks", park.id, 1), original);
    await assert.rejects(
      () => repo.archive("maps", map.id, map.version),
      /referenced/,
    );
    const bad = structuredClone(raw);
    bad.data.devices[0].mapId = "foreign";
    await assert.rejects(() => repo.save("parks", bad), /资源|floor/);
    const second = await repo.save("parks", {
      ...raw,
      name: "Second park same local IDs",
    });
    assert.equal(second.data.devices[0].id, park.data.devices[0].id);
    const runs = new RunService(db, repo),
      job = await runs.submit(park.id, { version: 2, taskId: "demo-delivery" });
    const cancelled = await runs.submit(second.id, {
      version: 1,
      taskId: "demo-delivery",
    });
    await runs.cancel(cancelled.id);
    const code = await new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        ["--import", "tsx", "workers/runner.ts", "--once"],
        { stdio: "inherit", env: process.env },
      );
      p.once("error", reject);
      p.once("exit", resolve);
    });
    assert.equal(code, 0);
    const result = await runs.result(job.id);
    assert.equal(result.verdict, "COMPLETED");
    assert.equal(result.metrics.distanceM, 54.530020589459085);
    assert.equal(
      (
        await db.simulationRun.findUniqueOrThrow({
          where: { id: cancelled.id },
        })
      ).status,
      "cancelled",
    );
    assert.equal(
      await db.runArtifact.count({ where: { runId: cancelled.id } }),
      0,
    );
    await repo.save(
      "models",
      { name: "Changed model", version: 1, data: { ...model.data, length: 4 } },
      model.id,
    );
    assert.deepEqual(await runs.result(job.id), result);
    const runWorkerOnce = () =>
      new Promise((resolve, reject) => {
        const p = spawn(
          process.execPath,
          ["--import", "tsx", "workers/runner.ts", "--once"],
          { stdio: "inherit", env: process.env },
        );
        p.once("error", reject);
        p.once("exit", resolve);
      });
    const expired = await runs.submitLab({ engine: "yard" });
    await db.simulationRun.update({
      where: { id: expired.id },
      data: {
        status: "running",
        leaseOwner: "expired-test-worker",
        leaseExpiresAt: new Date(Date.now() - 60000),
      },
    });
    assert.equal(await runWorkerOnce(), 0);
    assert.equal(
      (await db.simulationRun.findUniqueOrThrow({ where: { id: expired.id } }))
        .status,
      "interrupted",
    );
    assert.equal(
      await db.runArtifact.count({ where: { runId: expired.id } }),
      0,
    );
    // Cancellation cannot free a slot while the previous worker's lease is live.
    const holder = await runs.submitLab({ engine: "yard" });
    await db.simulationRun.update({
      where: { id: holder.id },
      data: {
        status: "running",
        leaseOwner: "cancellation-test-worker",
        leaseExpiresAt: new Date(Date.now() + 60000),
      },
    });
    await runs.cancel(holder.id);
    const queued = await runs.submitLab({
      engine: "yard",
      config: { duration: 10 },
    });
    assert.equal(await runWorkerOnce(), 0);
    assert.equal(
      (await db.simulationRun.findUniqueOrThrow({ where: { id: queued.id } }))
        .status,
      "queued",
    );
    await db.simulationRun.update({
      where: { id: holder.id },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
    assert.deepEqual(
      await Promise.all([runWorkerOnce(), runWorkerOnce()]),
      [0, 0],
    );
    assert.equal(
      (await db.simulationRun.findUniqueOrThrow({ where: { id: queued.id } }))
        .status,
      "completed",
    );
    assert.equal(
      await db.runArtifact.count({
        where: { runId: queued.id, role: "result" },
      }),
      1,
    );
    assert.equal(
      await db.runArtifact.count({ where: { runId: holder.id } }),
      0,
    );
    console.log(
      JSON.stringify({
        integrationPark: park.id,
        run: job.id,
        verdict: result.verdict,
      }),
    );
  } finally {
    await db.$disconnect();
  }
});
