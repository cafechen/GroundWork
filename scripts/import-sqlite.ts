import { PrismaClient } from "@prisma/client";
import {
  readLegacy,
  restoreLegacy,
} from "../src/server/services/legacy-import";
import { PlatformRepository } from "../src/server/repositories/platform";
const index = process.argv.indexOf("--source");
if (index < 0 || !process.argv[index + 1])
  throw Error("Explicit --source <sqlite-file> required");
const bundle = readLegacy(process.argv[index + 1]);
console.log(
  JSON.stringify({
    mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    sourceHash: bundle.sourceHash,
    records: bundle.records.length,
    versions: bundle.versions.length,
    audit: bundle.audit.length,
    kinds: bundle.records.reduce<Record<string, number>>(
      (m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + 1 }),
      {},
    ),
  }),
);
if (process.argv.includes("--apply")) {
  if (
    !process.env.DATABASE_URL ||
    !/^groundwork_/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))
  )
    throw Error("Explicit isolated groundwork_* destination required");
  const db = new PrismaClient();
  try {
    console.log(await restoreLegacy(new PlatformRepository(db), bundle));
  } finally {
    await db.$disconnect();
  }
}
