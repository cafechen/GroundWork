import { readFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Mechanical schema generation only; never connects/migrates/seeds a database.
// 仅机械生成 schema；不连接、不迁移、不初始化数据库。
const root = fileURLToPath(new URL("../", import.meta.url));
// Match Next.js provider selection during npm run build; otherwise a PG local
// configuration could accidentally be overwritten by a MySQL client build.
try {
  process.loadEnvFile(path.join(root, '.env.local'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const provider =
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
  process.env.DATABASE_PROVIDER ||
  "mysql";
if (!["mysql", "postgresql"].includes(provider))
  throw Error("Expected mysql or postgresql");
let schema = await readFile(path.join(root, "prisma/schema.prisma"), "utf8");
schema = schema.replace(/provider = "mysql"/, `provider = "${provider}"`);
if (provider === "postgresql")
  schema = schema
    .replaceAll("@db.DateTime(3)", "@db.Timestamp(3)")
    .replaceAll("@db.Double", "@db.DoublePrecision");
const dir = path.join(root, "prisma", provider);
await mkdir(dir, { recursive: true });
await writeFile(
  path.join(dir, "schema.prisma"),
  "// Generated from ../schema.prisma. Do not edit. / 自动生成，请勿手改。\n" +
    schema,
);
if (process.argv.includes("--generate")) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/prisma/build/index.js"),
      "generate",
      "--schema",
      path.join(dir, "schema.prisma"),
    ],
    { stdio: "inherit", cwd: root },
  );
  process.exitCode = result.status ?? 1;
}
