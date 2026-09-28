import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  stat,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  validateRequest,
  makeChronoScene,
  normalizeChrono,
  digest,
} from "./domain.mjs";
import { compilePlan } from "./planning.mjs";
import { codeFingerprint } from "./provenance.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const atomic = async (file, value) => {
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, file);
};
export class JobStore {
  constructor(directory, python) {
    this.directory = directory;
    this.python = python;
    this.jobs = new Map();
    this.queue = [];
    this.active = null;
    this.closing = false;
  }
  async init() {
    await mkdir(this.directory, { recursive: true });
    for (const id of await readdir(this.directory)) {
      if (!/^[a-f0-9-]{36}$/.test(id)) continue;
      try {
        const j = JSON.parse(
          await readFile(path.join(this.directory, id, "job.json"), "utf8"),
        );
        if (["queued", "running"].includes(j.status)) {
          j.status = "interrupted";
          j.error = "Server restarted; resubmit to reproduce";
          await this.save(j);
        }
        this.jobs.set(id, j);
      } catch {
        /* Incomplete unrelated directories are not job records. */
      }
    }
  }
  async save(j) {
    this.writes ??= new Map();
    const snapshot = structuredClone(j);
    const write = (this.writes.get(j.id) ?? Promise.resolve()).then(() =>
      atomic(path.join(this.directory, j.id, "job.json"), snapshot),
    );
    this.writes.set(
      j.id,
      write.catch(() => {}),
    );
    await write;
  }
  list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ request, ...j }) => ({ ...j, engine: request.engine, ...(request.engine === 'park' ? {parkId:request.snapshot.parkId,taskName:request.snapshot.taskName,deviceId:request.snapshot.deviceId,parkVersion:request.snapshot.parkVersion}: {}) }));
  }
  get(id) {
    const job = this.jobs.get(id);
    if (!job) throw Error("Job not found");
    return job;
  }
  async submit(input) {
    if (this.closing) throw Error("Server stopping");
    if (
      [...this.jobs.values()].filter((j) => j.status === "queued").length >= 12
    )
      throw Error("Queue full");
    if (this.jobs.size >= 200)
      throw Error(
        "Preview storage limit: 200 jobs; archive data before continuing",
      );
    const request = validateRequest(input);
    if (request.engine === "chrono" && !this.python)
      throw Error("Chrono Python is not configured");
    if (request.engine === "road") compilePlan(request);
    const id = randomUUID(),
      directory = path.join(this.directory, id);
    const j = {
      id,
      createdAt: new Date().toISOString(),
      status: "queued",
      request,
      inputHash: digest(request),
      progress: 0,
    };
    this.jobs.set(id, j);
    await mkdir(directory);
    await atomic(path.join(directory, "input.json"), request);
    await this.save(j);
    this.queue.push(id);
    this.kick();
    return j;
  }
  async cancel(id) {
    const j = this.get(id);
    if (!["queued", "running"].includes(j.status)) return j;
    j.status = "cancelled";
    j.finishedAt = new Date().toISOString();
    this.queue = this.queue.filter((x) => x !== id);
    if (this.active?.id === id) {
      this.active.child?.kill("SIGTERM");
      setTimeout(() => {
        if (this.active?.id === id) this.active.child?.kill("SIGKILL");
      }, 2000).unref();
    }
    await this.save(j);
    return j;
  }
  async result(id) {
    const j = this.get(id);
    if (j.status !== "completed") throw Error("Result is not complete");
    return JSON.parse(
      await readFile(path.join(this.directory, id, "result.json"), "utf8"),
    );
  }
  async progress(id) {
    const j = this.get(id);
    if (j.status === "running" && j.request.engine === "chrono") {
      try {
        const p = JSON.parse(
          await readFile(path.join(this.directory, id, "state.json"), "utf8"),
        );
        return {
          ...j,
          progress: Math.min(1, p.time / j.request.duration),
          simulationTime: p.time,
          actors: p.robots.map(({ poses, ...r }) => r),
        };
      } catch {}
    }
    return j;
  }
  kick() {
    if (!this.active && this.queue.length && !this.closing)
      this.runningPromise = this.pump();
  }
  async pump() {
    if (this.active || !this.queue.length || this.closing) return;
    const id = this.queue.shift(),
      j = this.get(id);
    this.active = { id, child: null };
    const directory = path.join(this.directory, id);
    try {
      j.status = "running";
      j.startedAt = new Date().toISOString();
      await this.save(j);
      const chrono = j.request.engine === "chrono";
      if (chrono)
        await atomic(
          path.join(directory, "scene.json"),
          makeChronoScene(j.request),
        );
      if (j.status === "cancelled") return;
      const args = chrono
        ? [
            path.join(root, "engines/chrono/physics.py"),
            "--offline-seconds",
            String(j.request.duration),
            "--friction",
            String(j.request.friction),
            "--scene",
            path.join(directory, "scene.json"),
            "--output",
            directory,
          ]
        : [
            path.join(root, "server/worker.mjs"),
            path.join(directory, "input.json"),
            path.join(directory, "result.json"),
          ];
      const child = spawn(chrono ? this.python : process.execPath, args, {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      });
      this.active = { id, child };
      let log = "",
        timedOut = false;
      const capture = (c) => {
        log = (log + c.toString()).slice(-64000);
      };
      child.stdout.on("data", capture);
      child.stderr.on("data", capture);
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, 600000);
      timeout.unref();
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      }).finally(() => clearTimeout(timeout));
      await writeFile(path.join(directory, "worker.log"), log);
      if (j.status !== "cancelled") {
        if (code !== 0)
          throw Error(
            timedOut
              ? "Worker exceeded 10 minute limit"
              : `Worker exited ${code}: ${log.slice(-1800)}`,
          );
        if (chrono) {
          const file = path.join(directory, "chrono.jsonl");
          if ((await stat(file)).size > 150 * 1024 * 1024)
            throw Error("Journal exceeds 150 MiB processing limit");
          const rows = (await readFile(file, "utf8"))
            .trim()
            .split("\n")
            .map(JSON.parse);
          const summary = JSON.parse(
            await readFile(path.join(directory, "summary.json"), "utf8"),
          );
          await atomic(
            path.join(directory, "result.json"),
            normalizeChrono(rows, summary, j.request),
          );
        }
        const result = JSON.parse(
          await readFile(path.join(directory, "result.json"), "utf8"),
        );
        result.provenance = {
          inputHash: j.inputHash,
          createdAt: j.createdAt,
          jobId: id,
          build: "groundwork-0.2.0",
          codeFingerprint,
          nodeVersion: process.version,
          sourceRevisions: {
            scenario: "6538e7cf391ffe0fc551fe682da9e1785c32a26b",
            chrono: "80d2d5398071ffca4f4a7e2bfcd72ba9373b9428",
          },
        };
        await atomic(path.join(directory, "result.json"), result);
        if (j.status !== "cancelled") {
          j.status = "completed";
          j.verdict = result.verdict;
          j.progress = 1;
        }
      }
    } catch (error) {
      if (j.status !== "cancelled") {
        j.status = "failed";
        j.error = error.message;
      }
    } finally {
      j.finishedAt = new Date().toISOString();
      await this.save(j);
      this.active = null;
      this.kick();
    }
  }
  async close() {
    this.closing = true;
    if (this.active) await this.cancel(this.active.id);
    for (const id of [...this.queue]) await this.cancel(id);
    await this.runningPromise;
  }
}
