import { parentPort, workerData } from "node:worker_threads";
import { createRiskScene } from "./risk-generation.js";
try {
  parentPort!.postMessage({
    result: createRiskScene(
      workerData.map,
      workerData.source,
      workerData.styles,
      workerData.seed,
      workerData.request,
    ),
  });
} catch (error) {
  parentPort!.postMessage({
    error: error instanceof Error ? error.message : String(error),
  });
}
