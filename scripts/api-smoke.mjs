import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.BASE_URL || "http://127.0.0.1:4180";
async function request(route, data) {
  const response = await fetch(
    base + route,
    data === undefined
      ? {}
      : {
          method: "POST",
          headers: { Origin: base, "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  );
  const value = await response.json();
  if (!response.ok) throw Error(JSON.stringify(value));
  return value;
}
async function wait(id) {
  for (let i = 0; i < 240; i++) {
    const j = await request(`/api/runs/${id}`);
    if (!["queued", "running"].includes(j.status)) {
      assert.equal(j.status, "completed", JSON.stringify(j));
      return request(`/api/runs/${id}/result`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw Error("Run exceeded test timeout");
}
const cap = await request("/api/capabilities");
const baseline = await request("/api/runs", {
  engine: "yard",
  config: { policy: "fifo" },
});
const candidate = await request("/api/runs", {
  engine: "yard",
  config: { policy: "none" },
});
assert.equal((await wait(baseline.id)).verdict, "PASS");
assert.equal((await wait(candidate.id)).verdict, "FAIL");
const comparison = await request("/api/compare", {
  baseline: baseline.id,
  candidate: candidate.id,
});
assert.ok(comparison.deltas.collisionEpisodes > 0);
const roadmap = await request("/api/plan", {});
assert.ok(roadmap.catalog.movements.length > 0);
const invalid = await fetch(base + "/api/runs", {
  method: "POST",
  headers: { Origin: base, "Content-Type": "application/json" },
  body: JSON.stringify({ engine: "chrono", command: "unsafe" }),
});
assert.equal(invalid.status, 400);
let chrono;
if (cap.engines.chrono) {
  const cancelled = await request("/api/runs", {
    engine: "chrono",
    duration: 180,
    vehicles: 5,
  });
  await new Promise((r) => setTimeout(r, 500));
  await request(`/api/runs/${cancelled.id}/cancel`, {});
  assert.equal(
    (await request(`/api/runs/${cancelled.id}`)).status,
    "cancelled",
  );
  const job = await request("/api/runs", {
    engine: "chrono",
    duration: 120,
    vehicles: 1,
    trailers: 3,
  });
  const result = await wait(job.id);
  assert.equal(result.verdict, "MISSION_COMPLETE");
  assert.ok(result.events.some((e) => e.type === "charge_complete"));
  assert.ok(
    result.frames.some((f) => f.bodies.some((b) => b.id.endsWith("wagon-4"))),
  );
  assert.ok(result.provenance.codeFingerprint.length === 64);
  const refused = await fetch(`${base}/api/runs/${job.id}/xosc`);
  assert.equal(refused.status, 400);
  chrono = {
    id: job.id,
    metrics: result.metrics,
    engineVersion: result.engineVersion,
    codeFingerprint: result.provenance.codeFingerprint,
  };
}
const result = {
  base,
  baseline: baseline.id,
  candidate: candidate.id,
  comparison,
  chrono,
  status: "PASS",
};
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/api-smoke.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
