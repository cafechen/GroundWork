#!/usr/bin/env node
// Trusted-VPN preview only. / 仅用于可信 VPN 预览部署。
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { quote, SETTINGS } from "./deploy/remote.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function parseArgs(args) {
  const action = args.shift() ?? "help";
  if (["--help", "-h", "help"].includes(action)) return { action: "help" };
  if (!["plan", "deploy", "status", "start", "logs"].includes(action))
    throw new Error("Unknown command / 未知命令");
  let ref = "HEAD",
    apply = false;
  while (args.length) {
    const key = args.shift();
    if (key === "--apply" && !apply) apply = true;
    else if (key === "--ref" && ["plan", "deploy"].includes(action)) {
      ref = args.shift();
      if (
        !ref ||
        !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) ||
        ref.includes("..")
      )
        throw new Error("Invalid Git ref / Git 版本无效");
    } else throw new Error(`Unknown option / 未知参数: ${key}`);
  }
  if (["deploy", "start"].includes(action) !== apply)
    throw new Error(
      "Only deploy/start require --apply / 部署和启动必须显式 --apply，其他命令不能使用",
    );
  return { action, ref, apply };
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} failed / 命令失败 (${result.status ?? result.error?.code})`,
    );
  return result.stdout?.trim();
}
async function remote(request) {
  const source = await readFile(
    path.join(root, "scripts/deploy/remote.mjs"),
    "utf8",
  );
  run(
    "ssh",
    [
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "robots",
      `${quote(SETTINGS.node)} --input-type=module -`,
    ],
    {
      input: `${source}\nawait main(${JSON.stringify(request)}).catch(e => { console.error(e.message); process.exitCode = 1; });\n`,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
}
export function engineVersion(lock) {
  const version =
    lock.packages?.["node_modules/@prisma/engines-version"]?.version;
  const hash = version?.match(/\.([a-f0-9]{40})$/)?.[1];
  if (!hash)
    throw new Error("Unsupported Prisma lockfile / 无法确定 Prisma 引擎版本");
  return hash;
}
const digest = (data) => createHash("sha256").update(data).digest("hex");
export function verifyEngine(compressed, checksum) {
  const expected = checksum.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(expected))
    throw new Error("Invalid engine checksum / 引擎校验格式无效");
  const data = gunzipSync(compressed);
  if (digest(data) !== expected)
    throw new Error("Engine checksum mismatch / 引擎校验失败");
  return data;
}
async function mainLocal() {
  const options = parseArgs(process.argv.slice(2));
  if (options.action === "help") {
    console.log(`GroundWork → robots (10.9.0.20:5180)
Usage / 用法：node scripts/deploy-robots.mjs <command>
  plan [--ref HEAD]            Local release plan; read-only / 本地只读计划
  status                      Remote read-only status / 远端只读状态
  deploy --apply [--ref HEAD]  Build and switch a committed release / 构建并切换已提交版本
  start --apply               Start current after reboot / 重启后启动当前版本
  logs                        Last 80 journal lines / 最近 80 行日志
Clean Git tree required for deploy. No seed/import/schema changes or boot setup.
部署要求干净工作区；不初始化、不导入、不改表、不配置开机自启。
See / 详见 docs/deploy-robots.md`);
    return;
  }
  if (!["deploy", "plan"].includes(options.action))
    return remote({ action: options.action });
  const commit = run("git", [
    "rev-parse",
    "--verify",
    `${options.ref}^{commit}`,
  ]);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid commit");
  const dirty = Boolean(run("git", ["status", "--porcelain"]));
  console.log(
    JSON.stringify(
      {
        target: "robots",
        url: SETTINGS.url,
        commit,
        dirty,
        scope:
          "Committed files only; same-schema upgrade / 仅已提交文件，同结构更新",
        database:
          "Reuse remote .env.local; never migrate/seed/import / 复用远端配置，不迁移或初始化",
      },
      null,
      2,
    ),
  );
  if (options.action === "plan") return;
  if (dirty)
    throw new Error(
      "Commit/review changes first; dirty tree refused / 请先审查提交，拒绝部署脏工作区",
    );
  const names = run("git", ["ls-tree", "-r", "--name-only", commit]).split(
    "\n",
  );
  if (
    names.some(
      (name) =>
        /(^|\/)\.env($|\.)/.test(name) &&
        !name.endsWith("/.env.example") &&
        name !== ".env.example",
    )
  ) {
    throw new Error(
      "Tracked environment file refused / 拒绝打包含环境秘密的版本",
    );
  }
  const lock = JSON.parse(run("git", ["show", `${commit}:package-lock.json`]));
  const engine = engineVersion(lock);
  const releaseId = `${new Date().toISOString().replace(/[-:.]/g, "")}-${commit.slice(0, 7)}-${randomUUID().slice(0, 8)}`;
  const temporary = await mkdtemp(path.join(tmpdir(), "groundwork-deploy-"));
  try {
    const archive = path.join(temporary, "source.tar.gz");
    run("git", ["archive", "--format=tar.gz", `--output=${archive}`, commit]);
    const archiveHash = digest(await readFile(archive));
    const engines = [];
    for (const name of ["libquery_engine.so.node", "schema-engine"]) {
      const url = `https://binaries.prisma.sh/all_commits/${engine}/debian-openssl-3.0.x/${name}`;
      console.log(
        `Download verified Linux engine / 下载并校验 Linux 引擎: ${name}`,
      );
      const zipped = path.join(temporary, `${name}.gz`);
      const checksum = path.join(temporary, `${name}.sha256`);
      for (const [suffix, dest] of [
        [".gz", zipped],
        [".sha256", checksum],
      ]) {
        run("curl", [
          "--fail",
          "--silent",
          "--show-error",
          "--location",
          "--proto",
          "=https",
          "--proto-redir",
          "=https",
          "--max-time",
          "180",
          "--retry",
          "2",
          "--output",
          dest,
          url + suffix,
        ]);
      }
      const data = verifyEngine(
        await readFile(zipped),
        await readFile(checksum, "utf8"),
      );
      await writeFile(path.join(temporary, name), data, {
        mode: 0o600,
        flag: "wx",
      });
      engines.push({ name, sha256: digest(data) });
    }
    const incoming = `${SETTINGS.base}/incoming-${releaseId}`;
    run(
      "ssh",
      [
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "robots",
        `mkdir -m 700 -- ${quote(incoming)}`,
      ],
      { stdio: "inherit" },
    );
    run(
      "scp",
      [
        "-q",
        "-o",
        "BatchMode=yes",
        archive,
        ...engines.map((e) => path.join(temporary, e.name)),
        `robots:${incoming}/`,
      ],
      { stdio: "inherit" },
    );
    await remote({
      action: "deploy",
      releaseId,
      commit,
      archiveHash,
      engine,
      engines,
    });
  } finally {
    // Only this invocation's mkdtemp directory, never repository/user data.
    await rm(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await mainLocal().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
