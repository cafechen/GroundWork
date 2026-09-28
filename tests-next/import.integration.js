import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PlatformStore } from "../server/platform-store.mjs";
import { PlatformRepository } from "../src/server/repositories/platform.ts";
import {
  readLegacy,
  restoreLegacy,
} from "../src/server/services/legacy-import.ts";
import { readyYard } from "../examples/ready-yard.mjs";
if (
  !/^groundwork_import_/.test(
    new URL(process.env.DATABASE_URL).pathname.slice(1),
  )
)
  throw Error("Dedicated empty groundwork_import_* database required");
test("SQLite import preserves IDs, pinned versions, audit and source bytes; rejects a populated target", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "groundwork-import-"));
  const source = path.join(directory, "source.sqlite"),
    store = new PlatformStore(source);
  const db = new PrismaClient(),
    repo = new PlatformRepository(db);
  let sourceClosed = false;
  try {
    await store.init();
    const data = readyYard();
    const map = store.save("maps", data.map),
      model = store.list("models").find((m) => m.data.category === "tugger"),
      gateway = store.list("gateways")[0];
    const raw = readyYard({
      mapId: map.id,
      modelId: model.id,
      gatewayId: gateway.id,
    }).park;
    const park = store.save("parks", raw);
    store.save(
      "parks",
      { ...raw, version: 1, name: "Imported revision 2" },
      park.id,
    );
    store.close();
    sourceClosed = true;
    const before = await readFile(source),
      bundle = readLegacy(source);
    assert.deepEqual(await readFile(source), before);
    const result = await restoreLegacy(repo, bundle);
    assert.equal(result.records, bundle.records.length);
    assert.equal((await repo.get("parks", park.id)).version, 2);
    assert.deepEqual((await repo.get("parks", park.id, 1)).data, park.data);
    assert.equal(await db.parkRevision.count(), 2);
    assert.equal(
      await db.auditEvent.count(),
      bundle.audit.length +
        bundle.versions.filter((v) => v.kind === "gateways").length +
        1,
    );
    await assert.rejects(() => restoreLegacy(repo, bundle), /must be empty/);
    assert.deepEqual(await readFile(source), before);
    console.log(
      JSON.stringify({
        fixtureDirectory: directory,
        sourceHash: bundle.sourceHash,
      }),
    );
  } finally {
    if (!sourceClosed) store.close();
    await db.$disconnect();
  }
});
