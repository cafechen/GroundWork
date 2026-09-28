import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const hash = createHash("sha256");
async function include(relative) {
  const entries = await readdir(path.join(root, relative), {
    withFileTypes: true,
  });
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, e.name);
    if (e.isDirectory() && e.name !== "__pycache__") await include(name);
    else if (/\.(js|mjs|py)$/.test(name)) {
      hash.update(name);
      hash.update(await readFile(path.join(root, name)));
    }
  }
}
for (const dir of [
  "src/core",
  "packages/contracts/dist",
  "packages/scenario-engine/dist",
  "engines/chrono",
])
  await include(dir);
for (const file of [
  "server/domain.mjs",
  "server/planning.mjs",
  "server/worker.mjs",
  "server/park-simulation.mjs",
  "server/platform-contracts.mjs",
]) {
  hash.update(file);
  hash.update(await readFile(path.join(root, file)));
}
export const codeFingerprint = hash.digest("hex");
