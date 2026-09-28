import { Worker } from "node:worker_threads";
import type { MapModel } from "../index.js";
import type { SceneSpecV2 } from "@groundwork/contracts";
import type { simulateMultiVehicle } from "./simulation.js";
export function simulateMultiVehicleAsync(
  map: MapModel,
  spec: SceneSpecV2,
  signal?: AbortSignal,
): Promise<ReturnType<typeof simulateMultiVehicle>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("仿真已取消"));
      return;
    }
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      workerData: { map, spec },
    });
    let settled = false;
    const finish = (
      error?: Error,
      result?: ReturnType<typeof simulateMultiVehicle>,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      void worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(new Error("仿真已取消"));
    const timer = setTimeout(
      () => finish(new Error("仿真超过 60 秒，请减少车辆或时长")),
      60000,
    );
    signal?.addEventListener("abort", cancel, { once: true });
    worker.once("message", ({ error, result }) =>
      finish(error ? new Error(error) : undefined, result),
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled) finish(new Error(`仿真进程提前退出：${code}`));
    });
  });
}
