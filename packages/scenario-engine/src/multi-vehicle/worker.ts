import { parentPort, workerData } from "node:worker_threads";
import { simulateMultiVehicle } from "./simulation.js";
try {
  parentPort!.postMessage({
    result: simulateMultiVehicle(workerData.map, workerData.spec),
  });
} catch (error) {
  parentPort!.postMessage({
    error: error instanceof Error ? error.message : String(error),
  });
}
