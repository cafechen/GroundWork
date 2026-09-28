import { readFile, writeFile } from "node:fs/promises";
import { simulatePark } from "../src/simulation/park";
import { simulate } from "../src/simulation/yard";
import {
  normalizeYard,
  normalizeRoad,
  validateRequest,
} from "../src/simulation/lab-domain";
import { compilePlan } from "../src/simulation/planning";
import { simulateMultiVehicle } from "@groundwork/scenario-engine";
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error("Expected input and output files");
const request = validateRequest(JSON.parse(await readFile(input, "utf8")));
let result;
if (request.engine === "park") result = simulatePark(request);
else if (request.engine === "yard")
  result = normalizeYard(simulate(request.config), request);
else if (request.engine === "road") {
  const { map, plan, spec } = compilePlan(request);
  result = normalizeRoad(simulateMultiVehicle(map, spec), map, {
    ...request,
    plan,
  });
} else throw Error("Chrono uses the explicit Python adapter");
await writeFile(output, JSON.stringify(result));
