import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
  parseArgs,
  engineVersion,
  verifyEngine,
} from "../scripts/deploy-robots.mjs";
import {
  assertConfiguration,
  assertMigrations,
  assertIdle,
  cutover,
  quote,
  validateRequest,
  SETTINGS,
} from "../scripts/deploy/remote.mjs";

test("deployment CLI requires explicit mutation and rejects ambiguous options", () => {
  assert.deepEqual(parseArgs(["deploy", "--apply"]), {
    action: "deploy",
    ref: "HEAD",
    apply: true,
  });
  assert.equal(parseArgs(["start", "--apply"]).action, "start");
  assert.equal(parseArgs(["plan", "--ref", "main"]).ref, "main");
  for (const args of [
    ["deploy"],
    ["start"],
    ["status", "--apply"],
    ["deploy", "--apply", "--ref", "--upload-pack=evil"],
    ["plan", "--ref", "main;touch x"],
    ["plan", "--ref", "../main"],
    ["deploy", "--apply", "--unknown"],
    ["status", "--ref", "HEAD"],
  ]) {
    assert.throws(() => parseArgs(args));
  }
});
test("SSH quoting contains shell metacharacters as literal arguments", () => {
  assert.equal(quote("a'b$(x);"), "'a'\\''b$(x);'");
});
test("deployment request rejects traversal and wrong engine file names", () => {
  const valid = {
    action: "deploy",
    releaseId: "20260929T010101000Z-abcdef0-12345678",
    commit: "a".repeat(40),
    engine: "b".repeat(40),
    archiveHash: "c".repeat(64),
    engines: [
      { name: "libquery_engine.so.node", sha256: "d".repeat(64) },
      { name: "schema-engine", sha256: "e".repeat(64) },
    ],
  };
  assert.doesNotThrow(() => validateRequest(valid));
  for (const change of [
    { releaseId: "../../current" },
    { archiveHash: "bad" },
    { engines: [{ name: "../.env.local", sha256: "d".repeat(64) }] },
    { action: "migrate" },
  ])
    assert.throws(() => validateRequest({ ...valid, ...change }));
});
test("Prisma engines derive from locked version and require uncompressed SHA256", () => {
  assert.equal(
    engineVersion({
      packages: {
        "node_modules/@prisma/engines-version": {
          version: `7.1.1-3.${"a".repeat(40)}`,
        },
      },
    }),
    "a".repeat(40),
  );
  assert.throws(() => engineVersion({ packages: {} }));
  const bytes = Buffer.from("synthetic engine fixture");
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.deepEqual(
    verifyEngine(gzipSync(bytes), `${digest}  schema-engine`),
    bytes,
  );
  assert.throws(
    () => verifyEngine(gzipSync(bytes), "0".repeat(64)),
    /mismatch/,
  );
  assert.throws(() => verifyEngine(gzipSync(bytes), "not a checksum"));
});
test("configuration never accepts foreign databases, public binding or release-local artifacts", () => {
  const env = {
    DATABASE_PROVIDER: "mysql",
    DATABASE_URL: "mysql://fixture:unused@localhost/groundwork_fixture",
    GROUNDWORK_ARTIFACTS: `${SETTINGS.base}/data/next-runs`,
    GROUNDWORK_ALLOWED_HOSTS: "10.9.0.20,robots",
  };
  assert.doesNotThrow(() => assertConfiguration(env, 0o100600));
  assert.throws(() => assertConfiguration(env, 0o644));
  for (const change of [
    { DATABASE_URL: "mysql://fixture@localhost/strategist" },
    { DATABASE_PROVIDER: "postgresql" },
    { GROUNDWORK_ARTIFACTS: `${SETTINGS.base}/data/../releases/a` },
    { GROUNDWORK_ARTIFACTS: "/tmp/runs" },
    { GROUNDWORK_ALLOWED_HOSTS: "*" },
    { GROUNDWORK_ORIGIN: "https://public.example" },
  ])
    assert.throws(() => assertConfiguration({ ...env, ...change }, 0o600));
});
test("migration checks require exact set, checksum and successful application", () => {
  const expected = [{ name: "initial", checksum: "a".repeat(64) }];
  const row = {
    migration_name: "initial",
    checksum: "a".repeat(64),
    finished_at: new Date(),
    rolled_back_at: null,
  };
  assert.doesNotThrow(() => assertMigrations(expected, [row]));
  for (const rows of [
    [],
    [row, row],
    [{ ...row, checksum: "b".repeat(64) }],
    [{ ...row, finished_at: null }],
    [{ ...row, rolled_back_at: new Date() }],
    [{ ...row, migration_name: "other" }],
  ])
    assert.throws(() => assertMigrations(expected, rows));
  assert.throws(() => assertMigrations([], []));
});
test("queue guard uses the actual SimulationRun Prisma delegate and sanitizes DB failures", async () => {
  for (const count of [0, 1]) {
    const db = {
      simulationRun: {
        count: async (input) => {
          assert.deepEqual(input, {
            where: { status: { in: ["queued", "running"] } },
          });
          return count;
        },
      },
    };
    if (count === 0) await assertIdle(db);
    else await assert.rejects(assertIdle(db), /Queued/);
  }
  await assert.rejects(
    assertIdle({
      simulationRun: {
        count: async () => {
          throw new Error("secret");
        },
      },
    }),
    (error) => !error.message.includes("secret"),
  );
});
function operations(fail) {
  const events = [];
  let checks = 0;
  const ops = Object.fromEntries(
    [
      "idle",
      "stopWeb",
      "stopWorker",
      "startNew",
      "verifyNew",
      "selectNew",
      "restoreOld",
    ].map((name) => [
      name,
      async () => {
        const label = name === "idle" ? `idle${++checks}` : name;
        events.push(label);
        if (label === fail || (Array.isArray(fail) && fail.includes(label)))
          throw new Error(label);
      },
    ]),
  );
  return { events, ops };
}
test("successful cutover gates both before and after closing submissions, verifies before symlink", async () => {
  const { events, ops } = operations();
  await cutover(ops);
  assert.deepEqual(events, [
    "idle1",
    "stopWeb",
    "idle2",
    "stopWorker",
    "startNew",
    "verifyNew",
    "selectNew",
  ]);
});
test("busy queue before cutover does not stop any service", async () => {
  const { events, ops } = operations("idle1");
  await assert.rejects(cutover(ops));
  assert.deepEqual(events, ["idle1"]);
});
test("submission race aborts before stopping worker and restores old web", async () => {
  const { events, ops } = operations("idle2");
  await assert.rejects(cutover(ops));
  assert.deepEqual(events, ["idle1", "stopWeb", "idle2", "restoreOld"]);
});
test("startup, verification and symlink errors attempt recovery; recovery failure is explicit", async () => {
  for (const stage of [
    "stopWeb",
    "stopWorker",
    "startNew",
    "verifyNew",
    "selectNew",
  ]) {
    const { events, ops } = operations(stage);
    await assert.rejects(cutover(ops));
    assert.equal(events.at(-1), "restoreOld");
    if (stage !== "selectNew") assert.ok(!events.includes("selectNew"));
  }
  const { ops } = operations(["verifyNew", "restoreOld"]);
  await assert.rejects(cutover(ops), /recovery failed/);
});
