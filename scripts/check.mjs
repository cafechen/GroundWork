import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
async function scan(dir) {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    // Generated third-party clients are not maintained application source.
    if (dir === "src" && f.name === "generated") continue;
    const file = path.join(dir, f.name);
    if (f.isDirectory()) await scan(file);
    else if (/\.(m?js)$/.test(file)) {
      const r = spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
      });
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  }
}
for (const dir of ["src", "server", "scripts", "tests"]) await scan(dir);
console.log(
  "All maintained JavaScript files parse (not a linter or type checker)",
);
