import test from "node:test";
import assert from "node:assert/strict";
import {
  makeManifest,
  summarizeBatch,
  batchInputSchema,
  manifestSchema,
  batchCsv,
  batchReport,
} from "../src/simulation/batch-summary.ts";
import { runBatch } from "../src/simulation/experiments.ts";
import { DEFAULT_CONFIG } from "../src/simulation/yard-scenario.ts";

const manifest = () => {
  let n = 0;
  return makeManifest(
    DEFAULT_CONFIG,
    () => `job-${++n}`,
    "2026-09-28T00:00:00.000Z",
  );
};
test("batch rejects unknown inputs, duplicate members and invalid paired conditions", () => {
  assert.equal(
    batchInputSchema.safeParse({ config: { speed: 9 } }).success,
    false,
  );
  assert.equal(
    batchInputSchema.safeParse({ config: { executable: "arbitrary" } }).success,
    false,
  );
  const m = manifest();
  m.pairs[0].candidateId = m.pairs[0].baselineId;
  assert.equal(manifestSchema.safeParse(m).success, false);
  const wrong = manifest();
  wrong.pairs[0].seed = 12;
  assert.equal(manifestSchema.safeParse(wrong).success, false);
});
test("reports preserve six rows, exclude unavailable deltas and escape embedded HTML", () => {
  const result = summarizeBatch(manifest(), []);
  assert.equal(batchCsv(result).split("\r\n").length, 7);
  assert.ok(batchCsv(result).includes("Missing run"));
  result.manifest.id = "<script>alert(1)</script>";
  const html = batchReport(result);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("0/6"));
});
function rows(m, old) {
  return m.pairs.flatMap((p, i) =>
    ["baseline", "candidate"].map((role) => ({
      id: p[`${role}Id`],
      status: "completed",
      engine: "yard",
      engineVersion: "0.1.0",
      codeFingerprint: "sha256-same",
      inputHash: "hash",
      inputSnapshot: {
        engine: "yard",
        config: {
          ...m.config,
          seed: p.seed,
          doorDelay: p.doorDelay,
          policy: role === "baseline" ? "fifo" : "none",
        },
      },
      verdict: old.cases[i][role].status,
      metrics: old.cases[i][role].metrics,
    })),
  );
}
test("six durable matched pairs preserve exact legacy batch numerical summaries", () => {
  const m = manifest(),
    old = runBatch(DEFAULT_CONFIG),
    result = summarizeBatch(m, rows(m, old));
  assert.equal(result.summary.evaluatedPairs, 6);
  for (const key of ["runs", "regressions", "baselinePass", "candidatePass"])
    assert.equal(result.summary[key], old.summary[key]);
  assert.deepEqual(
    result.pairs.map((p) => p.comparison),
    old.cases.map((p) => p.comparison),
  );
});
test("cancelled, failed, missing, mismatched and nonfinite evidence never passes a pair", () => {
  const m = manifest(),
    old = runBatch(DEFAULT_CONFIG);
  for (const change of [
    (r) => (r.status = "cancelled"),
    (r) => (r.status = "failed"),
    (r) => (r.codeFingerprint = "different"),
    (r) => (r.inputSnapshot.config.speed = 2),
    (r) => (r.metrics = { ...r.metrics, totalWait: NaN }),
    (r) => (r.engine = "road"),
  ]) {
    const data = rows(m, old);
    change(data[0]);
    const result = summarizeBatch(m, data);
    assert.equal(result.summary.evaluatedPairs, 5);
    assert.equal(result.pairs[0].comparison, null);
    assert.ok(result.pairs[0].reason);
  }
  assert.equal(summarizeBatch(m, []).summary.evaluatedPairs, 0);
  assert.equal(summarizeBatch(m, []).summary.baselinePass, 0);
});
