import { Worker } from "node:worker_threads";
import type { MapModel } from "../index.js";
import type { SceneSpecV2, RiskRequest } from "@groundwork/contracts";
import type { DrivingStyle } from "./risk-generation.js";
export function createRiskSceneAsync(
  map: MapModel,
  source: SceneSpecV2,
  styles: DrivingStyle[],
  seed: number,
  request?: RiskRequest,
  signal?: AbortSignal,
): Promise<SceneSpecV2> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("危险场景搜索已取消"));
      return;
    }
    const worker = new Worker(new URL("./risk-worker.js", import.meta.url), {
      workerData: { map, source, styles, seed, request },
      execArgv: process.execArgv.filter(
        (arg) => !arg.startsWith("--input-type"),
      ),
    });
    let done = false;
    const finish = (error?: Error, result?: SceneSpecV2) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const abort = () =>
      finish(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("危险场景搜索已取消"),
      );
    const timer = setTimeout(
      () => finish(new Error("危险场景搜索超过 30 秒，未返回不合格结果")),
      30000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    worker.once("message", ({ result, error }) =>
      finish(error ? new Error(error) : undefined, result),
    );
    worker.once("error", (e) => finish(e));
    worker.once("exit", (code) => {
      if (!done) finish(new Error(`危险场景搜索进程提前退出：${code}`));
    });
  });
}
/** Backwards-compatible entry point for the first left-turn pilot. */
export const createDangerousLeftTurnAsync = createRiskSceneAsync;
