import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JobStore } from "../server/jobs.mjs";
import { compilePlan } from "../server/planning.mjs";
import { exportXosc, exportRmfGraph, exportSdf } from "../server/exports.mjs";
const waitFor = async (store, id) => {
  for (let i = 0; i < 200; i++) {
    const j = store.get(id);
    if (!["queued", "running"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Job timed out in test");
};
test("migrated plans compile and enforce map version identity", () => {
  const { plan } = compilePlan({ seed: 42 });
  assert.throws(() => compilePlan({ plan: { ...plan, mapVersion: "wrong" } }));
});
test("standalone workers persist yard and road results, exports and restart state", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "groundwork-jobs-"));
  const store = new JobStore(directory);
  await store.init();
  const a = await store.submit({ engine: "yard" }),
    b = await store.submit({ engine: "road" });
  assert.equal((await waitFor(store, a.id)).status, "completed");
  const road = await waitFor(store, b.id);
  assert.equal(road.status, "completed", road.error);
  const run = await store.result(a.id),
    r = await store.result(b.id);
  assert.equal(run.verdict, "PASS");
  assert.ok(r.frames.length > 100);
  assert.ok(r.report.events.length > 0);
  assert.ok(
    r.frames.at(-1).bodies[0].polygon[0].x > r.frames[0].bodies[0].polygon[0].x,
  );
  assert.match(exportXosc(r), /<Catalog name="GroundWorkTrajectories">/);
  assert.ok(exportRmfGraph(run).levels.L1.lanes.length);
  assert.match(exportSdf(run), /<sdf version="1.9">/);
  const next = new JobStore(directory);
  await next.init();
  assert.equal(next.list().length, 2);
  assert.equal(
    (await next.result(a.id)).provenance.inputHash,
    run.provenance.inputHash,
  );
  assert.equal(
    JSON.parse(await readFile(path.join(directory, a.id, "job.json"))).status,
    "completed",
  );
});
test("cancellation and startup interruption do not fabricate successful results", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "groundwork-cancel-"));
  const store = new JobStore(directory);
  await store.init();
  const j = await store.submit({ engine: "yard" });
  await store.cancel(j.id);
  await waitFor(store, j.id);
  assert.equal(store.get(j.id).status, "cancelled");
  await assert.rejects(() => store.result(j.id));
  await store.close();
  const f = path.join(directory, j.id, "job.json");
  await writeFile(f, JSON.stringify({ ...j, status: "running" }));
  const next = new JobStore(directory);
  await next.init();
  assert.equal(next.get(j.id).status, "interrupted");
});
