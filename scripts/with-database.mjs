// Explicit development helper; no credentials printed or copied to the repository.
// 显式开发辅助命令；不打印凭证、不复制凭证到工程。
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Required ${name}`);
  return args[i + 1];
};
const database = option("--database");
if (!/^groundwork_[a-z0-9_]{1,48}$/.test(database))
  throw Error("Only explicit groundwork_* database names are accepted");
const source = parseEnv(
  await readFile(option("--env-file"), "utf8"),
).DATABASE_URL;
if (!source) throw Error("DATABASE_URL missing in the selected file");
const url = new URL(source);
if (!["mysql:", "postgresql:"].includes(url.protocol))
  throw Error("Unsupported database protocol");
const sourceDb = decodeURIComponent(url.pathname.slice(1));
if (sourceDb === database)
  throw Error("Sandbox must differ from the source database");
url.pathname = `/${database}`;
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  DATABASE_PROVIDER: url.protocol === "mysql:" ? "mysql" : "postgresql",
};
if (args.includes("--create")) {
  if (url.protocol !== "mysql:")
    throw Error("Automatic sandbox creation currently supports MySQL only");
  const { PrismaClient } = await import("@prisma/client");
  const admin = new URL(url);
  admin.pathname = "/information_schema";
  const db = new PrismaClient({
    datasources: { db: { url: admin.toString() } },
  });
  try {
    // Fixed validated identifier; never uses the original application schema.
    await db.$executeRawUnsafe(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`,
    );
    console.log(`Isolated database ready: ${database}`);
  } catch {
    console.error(
      "Sandbox creation failed; check database reachability and CREATE privilege. Credentials withheld.",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
} else {
  const divider = args.indexOf("--");
  if (divider < 0 || !args[divider + 1])
    throw Error("Provide -- <command> [args]");
  const child = spawn(args[divider + 1], args.slice(divider + 2), {
    stdio: "inherit",
    env,
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
  child.on("error", () => {
    console.error("Command could not start");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
