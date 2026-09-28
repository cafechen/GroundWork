import { readFile, writeFile } from "node:fs/promises";
import { simulate } from "../src/core/simulation.js";
import { runBatch } from "../src/core/experiments.js";
import { simulateMultiVehicle } from "@groundwork/scenario-engine/multi-vehicle/simulation.js";
import { normalizeYard, normalizeRoad } from "./domain.mjs";
import { compilePlan } from "./planning.mjs";
import { simulatePark } from './park-simulation.mjs';
const [input, output] = process.argv.slice(2);
const request = JSON.parse(await readFile(input, "utf8"));
if (request.engine === 'park') {
  await writeFile(output, JSON.stringify(simulatePark(request)));
} else if (request.engine === "batch") {
  await writeFile(output, JSON.stringify(runBatch(request.config ?? {})));
} else if (request.engine === "yard") {
  await writeFile(
    output,
    JSON.stringify(normalizeYard(simulate(request.config ?? {}), request)),
  );
} else if (request.engine === "road") {
  const { map, plan, spec } = compilePlan(request);
  const trajectory = simulateMultiVehicle(map, spec);
  await writeFile(
    output,
    JSON.stringify(normalizeRoad(trajectory, map, { ...request, plan })),
  );
} else throw Error("Unknown worker engine");
