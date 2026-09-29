// Sent to robots over SSH stdin; exports allow isolated tests. No credentials in arguments.
// 通过 SSH 标准输入执行；导出纯校验和切换流程以供隔离测试，不在参数传递凭证。
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmdirSync,
  realpathSync,
  statSync,
  readdirSync,
  copyFileSync,
  chmodSync,
  symlinkSync,
  renameSync,
  constants,
  existsSync,
} from "node:fs";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import path from "node:path";

export const SETTINGS = Object.freeze({
  base: "/home/steven/src/groundwork",
  node: "/home/steven/src/groundwork/.tools/node/bin/node",
  bind: "10.9.0.20",
  port: 5180,
  url: "http://10.9.0.20:5180",
});
const units = ["groundwork-next-web.service", "groundwork-next-worker.service"];
export const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const sha = (value) => createHash("sha256").update(value).digest("hex");
function need(condition, message) {
  if (!condition) throw new Error(message);
}
function command(file, args, options = {}) {
  const result = spawnSync(file, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
    ...options,
  });
  if (options.log)
    writeFileSync(
      options.log,
      `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      { mode: 0o600, flag: "wx" },
    );
  need(
    result.status === 0,
    `${path.basename(file)} failed / 执行失败${options.log ? `; private log / 私有日志: ${options.log}` : ""}`,
  );
  return result.stdout?.trim();
}
export function validateRequest(request) {
  need(
    ["status", "logs", "start", "deploy"].includes(request.action),
    "Invalid action / 无效操作",
  );
  if (request.action !== "deploy") return;
  need(
    /^[0-9TZ]+-[a-f0-9]{7}-[a-f0-9]{8}$/.test(request.releaseId),
    "Invalid release ID",
  );
  for (const key of ["commit", "engine"])
    need(/^[a-f0-9]{40}$/.test(request[key]), `Invalid ${key}`);
  need(/^[a-f0-9]{64}$/.test(request.archiveHash), "Invalid archive hash");
  need(
    request.engines?.length === 2 &&
      request.engines[0].name === "libquery_engine.so.node" &&
      request.engines[1].name === "schema-engine",
    "Invalid engine files",
  );
  need(
    request.engines.every((e) => /^[a-f0-9]{64}$/.test(e.sha256)),
    "Invalid engine checksum",
  );
}
export function assertMigrations(expected, actual) {
  need(
    actual.length === expected.length && expected.length > 0,
    "Migration set differs; manual upgrade required / 迁移集合不同，需另行升级",
  );
  for (const item of expected) {
    const row = actual.find((r) => r.migration_name === item.name);
    need(
      row &&
        row.checksum === item.checksum &&
        row.finished_at &&
        !row.rolled_back_at,
      "Unapplied/changed/failed migration; refusing cutover / 存在未应用、已修改或失败的迁移，拒绝切换",
    );
  }
}
export function assertConfiguration(env, mode) {
  need(
    (mode & 0o777) === 0o600,
    ".env.local must have mode 0600 / 环境文件权限须为 0600",
  );
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error(
      "Invalid protected database configuration / 数据库配置无效",
    );
  }
  need(
    env.DATABASE_PROVIDER === "mysql" &&
      url.protocol === "mysql:" &&
      /^\/groundwork_[a-zA-Z0-9_]+$/.test(url.pathname),
    "Dedicated MySQL database required / 仅支持专用 MySQL 库",
  );
  need(
    env.GROUNDWORK_ARTIFACTS?.startsWith(`${SETTINGS.base}/data/`) &&
      !env.GROUNDWORK_ARTIFACTS.split("/").includes(".."),
    "Artifacts must stay outside releases / 轨迹必须放在独立 data 目录",
  );
  need(
    env.GROUNDWORK_ALLOWED_HOSTS?.split(",")
      .map((v) => v.trim())
      .includes(SETTINGS.bind),
    "VPN host must be allowed / 须允许 VPN 主机",
  );
  need(
    !env.GROUNDWORK_ORIGIN || env.GROUNDWORK_ORIGIN === SETTINGS.url,
    "Origin does not match VPN URL / 来源配置与 VPN 地址不符",
  );
}
function currentRelease() {
  const release = realpathSync(`${SETTINGS.base}/current`);
  need(
    path.dirname(release) === `${SETTINGS.base}/releases`,
    "Current must resolve to a direct release / current 必须指向 releases 中的版本",
  );
  need(
    existsSync(`${release}/node_modules/next/dist/bin/next`),
    "Current is not built Next.js / 当前并非已构建 Next.js 版本",
  );
  return release;
}
function configuration(release) {
  const file = `${release}/.env.local`;
  const info = statSync(file);
  need(
    info.uid === process.getuid() && info.isFile(),
    "Configuration ownership mismatch / 配置所有者不符",
  );
  const env = parseEnv(readFileSync(file, "utf8"));
  assertConfiguration(env, info.mode);
  need(
    realpathSync(env.GROUNDWORK_ARTIFACTS).startsWith(`${SETTINGS.base}/data/`),
    "Unsafe artifact symlink / 轨迹目录链接不安全",
  );
  return env;
}
function unitStates(release) {
  return units.map((unit, index) => {
    const raw = command("systemctl", [
      "--user",
      "show",
      unit,
      "--property=LoadState,ActiveState,WorkingDirectory,ExecStart",
    ]);
    const properties = Object.fromEntries(
      raw.split("\n").map((line) => {
        const n = line.indexOf("=");
        return [line.slice(0, n), line.slice(n + 1)];
      }),
    );
    if (properties.LoadState !== "not-found") {
      need(
        properties.WorkingDirectory === release &&
          properties.ExecStart?.includes(SETTINGS.node) &&
          properties.ExecStart.includes(
            index === 0
              ? "node_modules/next/dist/bin/next"
              : "workers/runner.ts",
          ),
        "Foreign unit; refusing changes / 服务身份不符，拒绝修改",
      );
    }
    need(
      ["active", "inactive", "failed"].includes(properties.ActiveState),
      "Unit transitioning; try later / 服务切换中，请稍后重试",
    );
    return properties.ActiveState;
  });
}
function portFree() {
  need(
    !command("ss", ["-H", "-ltn", "sport = :5180"]),
    "Port 5180 occupied; no processes killed / 5180 已占用，不会杀进程",
  );
}
function startUnit(release, index) {
  command("systemd-run", [
    "--user",
    `--unit=${units[index].replace(".service", "")}`,
    "--description=GroundWork trusted-VPN preview",
    `--working-directory=${release}`,
    "--property=Restart=on-failure",
    "--property=RestartSec=5",
    "--property=TimeoutStopSec=30",
    "--property=UMask=0077",
    "--setenv=NODE_ENV=production",
    `--setenv=PATH=${path.dirname(SETTINGS.node)}:/usr/local/bin:/usr/bin:/bin`,
    SETTINGS.node,
    "--env-file=.env.local",
    ...(index === 0
      ? [
          "node_modules/next/dist/bin/next",
          "start",
          "--hostname",
          SETTINGS.bind,
          "--port",
          String(SETTINGS.port),
        ]
      : ["--import", "tsx", "workers/runner.ts"]),
  ]);
}
function stopUnits(indices) {
  for (const index of indices)
    command("systemctl", ["--user", "stop", units[index]]);
}
async function waitUnloaded(indices = [0, 1]) {
  const selected = indices.map((index) => units[index]);
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const unit of selected)
      spawnSync("systemctl", ["--user", "reset-failed", unit], {
        stdio: "ignore",
      });
    const loads = selected.map((unit) =>
      command("systemctl", [
        "--user",
        "show",
        unit,
        "--property=LoadState",
        "--value",
      ]),
    );
    if (loads.every((value) => value === "not-found")) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    "Transient units not unloaded; inspect manually / 临时单元未释放，请检查",
  );
}
async function health(release) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const responses = await Promise.all(
        ["/", "/api/platform", "/api/runs"].map((route) =>
          fetch(SETTINGS.url + route, {
            signal: AbortSignal.timeout(2000),
            redirect: "error",
          }),
        ),
      );
      need(
        responses.every((response) => response.status === 200),
        "HTTP health check failed",
      );
      await responses[0].text();
      await responses[1].json();
      await responses[2].json();
      need(
        unitStates(release).every((state) => state === "active"),
        "Service not active",
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Read-only health check failed / 只读验收失败");
}
function pointCurrent(release, suffix) {
  const temp = `${SETTINGS.base}/.current-${suffix}`;
  symlinkSync(release, temp);
  renameSync(temp, `${SETTINGS.base}/current`);
}

// No DB rollback: both releases must share exact schema/migration history.
// 不回滚数据库；仅允许结构和迁移历史一致的代码切换。
export async function cutover(ops) {
  await ops.idle();
  let touched = false;
  try {
    touched = true;
    await ops.stopWeb();
    await ops.idle(); // Close submission race while old worker still drains.
    await ops.stopWorker();
    await ops.startNew();
    await ops.verifyNew();
    await ops.selectNew();
  } catch (error) {
    if (touched) {
      try {
        await ops.restoreOld();
      } catch {
        throw new Error(
          "Cutover and recovery failed; inspect both units and current / 切换和恢复均失败，请检查服务及 current",
        );
      }
    }
    throw error;
  }
}

export async function assertIdle(db) {
  let count;
  try {
    count = await db.simulationRun.count({
      where: { status: { in: ["queued", "running"] } },
    });
  } catch {
    throw new Error("Cannot check job queue / 无法检查作业队列");
  }
  need(
    count === 0,
    "Queued/running jobs found; finish/cancel first / 存在排队或运行作业，请先完成或取消",
  );
}

export async function main(request) {
  validateRequest(request);
  process.umask(0o077);
  let old = currentRelease();
  if (request.action === "logs") {
    console.log(
      command("journalctl", [
        "--user",
        "-u",
        units[0],
        "-u",
        units[1],
        "-n",
        "80",
        "--no-pager",
      ]),
    );
    return;
  }
  if (request.action === "status") {
    const states = unitStates(old);
    console.log(
      JSON.stringify(
        { release: old, states, url: SETTINGS.url, bootEnabled: false },
        null,
        2,
      ),
    );
    if (states.every((state) => state === "active")) await health(old);
    return;
  }
  const lock = `${SETTINGS.base}/.deploy-lock`;
  mkdirSync(lock, { mode: 0o700 }); // Atomic lock; never remove another invocation's lock.
  try {
    old = currentRelease(); // Resolve again after acquiring the exclusive lock.
    writeFileSync(
      `${lock}/owner.json`,
      JSON.stringify({
        pid: process.pid,
        started: new Date().toISOString(),
        action: request.action,
      }),
      { mode: 0o600 },
    );
    const env = configuration(old);
    const states = unitStates(old);
    need(
      states.every((s) => s === "active") ||
        states.every((s) => ["inactive", "failed"].includes(s)),
      "Partial service state; inspect manually / 服务部分运行，请先检查",
    );
    if (request.action === "start") {
      if (states.every((s) => s === "active")) {
        await health(old);
        console.log("Already healthy / 已运行正常");
        return;
      }
      portFree();
      await waitUnloaded();
      try {
        startUnit(old, 0);
        startUnit(old, 1);
        await health(old);
      } catch (error) {
        for (const unit of units)
          spawnSync("systemctl", ["--user", "stop", unit]);
        throw error;
      }
      console.log(`Started / 已启动: ${SETTINGS.url}`);
      return;
    }
    need(
      states.every((s) => s === "active"),
      "Start current first / 请先启动当前版本再部署",
    );
    need(
      process.platform === "linux" &&
        process.arch === "x64" &&
        /^3\./.test(process.versions.openssl),
      "Requires Linux x64 / OpenSSL 3",
    );
    need(
      /^(ID|ID_LIKE)=.*(debian|ubuntu)/m.test(
        readFileSync("/etc/os-release", "utf8"),
      ),
      "Requires Debian/Ubuntu target",
    );
    const incoming = `${SETTINGS.base}/incoming-${request.releaseId}`;
    const release = `${SETTINGS.base}/releases/${request.releaseId}`;
    need(
      sha(readFileSync(`${incoming}/source.tar.gz`)) === request.archiveHash,
      "Archive checksum mismatch",
    );
    mkdirSync(release, { mode: 0o700 });
    command("tar", ["-xzf", `${incoming}/source.tar.gz`, "-C", release]);
    need(
      sha(readFileSync(`${release}/prisma/schema.prisma`)) ===
        sha(readFileSync(`${old}/prisma/schema.prisma`)),
      "Schema changed; manual migration review required / 结构已改变，须单独审查迁移",
    );
    copyFileSync(
      `${old}/.env.local`,
      `${release}/.env.local`,
      constants.COPYFILE_EXCL,
    );
    chmodSync(`${release}/.env.local`, 0o600);
    const engineEnv = {};
    for (const entry of request.engines) {
      const file = `${incoming}/${entry.name}`;
      need(
        sha(readFileSync(file)) === entry.sha256,
        "Uploaded engine checksum mismatch",
      );
      chmodSync(file, entry.name === "schema-engine" ? 0o700 : 0o600);
      engineEnv[
        entry.name === "schema-engine"
          ? "PRISMA_SCHEMA_ENGINE_BINARY"
          : "PRISMA_QUERY_ENGINE_LIBRARY"
      ] = file;
    }
    const buildEnv = {
      ...process.env,
      ...env,
      ...engineEnv,
      PATH: `${path.dirname(SETTINGS.node)}:/usr/local/bin:/usr/bin:/bin`,
      NEXT_TELEMETRY_DISABLED: "1",
      PRISMA_SKIP_POSTINSTALL_GENERATE: "1",
    };
    console.log(
      "Installing and building new release; old service stays live / 安装构建新版本，旧服务保持运行",
    );
    command(
      `${path.dirname(SETTINGS.node)}/npm`,
      ["ci", "--no-audit", "--no-fund"],
      { cwd: release, env: buildEnv, log: `${release}/deploy-install.log` },
    );
    const require = createRequire(`${release}/package.json`);
    need(
      require("@prisma/engines-version").enginesVersion === request.engine,
      "Installed Prisma engine version differs",
    );
    // Preserve Prisma's platform-specific filenames in the generated client.
    for (const entry of request.engines) {
      const destination = `${release}/node_modules/@prisma/engines/${entry.name === "schema-engine" ? "schema-engine-debian-openssl-3.0.x" : "libquery_engine-debian-openssl-3.0.x.so.node"}`;
      copyFileSync(`${incoming}/${entry.name}`, destination);
      chmodSync(destination, entry.name === "schema-engine" ? 0o700 : 0o600);
      engineEnv[
        entry.name === "schema-engine"
          ? "PRISMA_SCHEMA_ENGINE_BINARY"
          : "PRISMA_QUERY_ENGINE_LIBRARY"
      ] = destination;
    }
    Object.assign(buildEnv, engineEnv);
    command(`${path.dirname(SETTINGS.node)}/npm`, ["run", "build"], {
      cwd: release,
      env: buildEnv,
      log: `${release}/deploy-build.log`,
    });
    Object.assign(process.env, env, engineEnv);
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient({ log: [] });
    try {
      const expected = readdirSync(`${release}/prisma/mysql/migrations`, {
        withFileTypes: true,
      })
        .filter((e) => e.isDirectory())
        .map((e) => ({
          name: e.name,
          checksum: sha(
            readFileSync(
              `${release}/prisma/mysql/migrations/${e.name}/migration.sql`,
            ),
          ),
        }));
      let actual;
      try {
        actual = await db.$queryRawUnsafe(
          "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations",
        );
      } catch {
        throw new Error("Cannot read migration history / 无法读取迁移历史");
      }
      assertMigrations(expected, actual);
      const idle = () => assertIdle(db);
      unitStates(old); // Recheck ownership immediately before stopping anything.
      symlinkSync(old, `${SETTINGS.base}/previous-${request.releaseId}`);
      console.log("Cutover and read-only verification / 切换并只读验收");
      await cutover({
        idle,
        stopWeb: () => stopUnits([0]),
        stopWorker: () => stopUnits([1]),
        startNew: async () => {
          await waitUnloaded();
          portFree();
          startUnit(release, 0);
          startUnit(release, 1);
        },
        verifyNew: () => health(release),
        selectNew: () => {
          writeFileSync(
            `${release}/deployment.json`,
            JSON.stringify(
              {
                ...request,
                previous: old,
                verified: new Date().toISOString(),
                bootEnabled: false,
              },
              null,
              2,
            ),
            { mode: 0o600, flag: "wx" },
          );
          pointCurrent(release, request.releaseId);
        },
        restoreOld: async () => {
          // A failed second idle check leaves the old worker running: preserve it.
          const workerDir = command("systemctl", [
            "--user",
            "show",
            units[1],
            "--property=WorkingDirectory",
            "--value",
          ]);
          const workerActive = command("systemctl", [
            "--user",
            "show",
            units[1],
            "--property=ActiveState",
            "--value",
          ]);
          if (workerDir === old && workerActive === "active") {
            const webActive = command("systemctl", [
              "--user",
              "show",
              units[0],
              "--property=ActiveState",
              "--value",
            ]);
            if (webActive === "active") {
              await health(old);
              return;
            }
            await waitUnloaded([0]);
            startUnit(old, 0);
            await health(old);
            return;
          }
          for (const unit of units)
            spawnSync("systemctl", ["--user", "stop", unit]);
          await waitUnloaded();
          portFree();
          startUnit(old, 0);
          startUnit(old, 1);
          pointCurrent(old, `recovery-${request.releaseId}`);
          await health(old);
        },
      });
    } finally {
      await db.$disconnect();
    }
    console.log(
      `Deployed / 部署完成: ${SETTINGS.url}\nRelease / 版本: ${release}`,
    );
  } finally {
    // Remove only the exact lock file and empty directory created above.
    const { unlinkSync } = await import("node:fs");
    if (existsSync(`${lock}/owner.json`)) unlinkSync(`${lock}/owner.json`);
    rmdirSync(lock);
  }
}
