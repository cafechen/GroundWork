import { scenarioPlanSchema } from "@groundwork/contracts";
import {
  describeMapAffordances,
  compileScenarioPlan,
} from "@groundwork/scenario-engine";
import { syntheticMap, importMap } from "./domain.mjs";

export function planContext(geojson) {
  const map = geojson ? importMap(geojson) : syntheticMap();
  return { map, catalog: describeMapAffordances(map) };
}
export function defaultPlan(map, catalog, seed = 42) {
  const movement = catalog.movements[0];
  return scenarioPlanSchema.parse({
    schemaVersion: 1,
    title: "园区道路前车制动 / Lead vehicle braking",
    summary: "Synthetic road behavior test. Not a forklift dynamics model.",
    mapId: map.mapId,
    mapVersion: catalog.mapVersion,
    seed,
    durationS: 20,
    actors: [
      {
        id: "Ego",
        name: "Following vehicle",
        role: "ego",
        movementId: movement.id,
        positionM: 10,
        speedMps: 3,
        profile: { desiredSpeedMps: 3 },
      },
      {
        id: "Lead",
        name: "Lead vehicle",
        role: "event",
        movementId: movement.id,
        positionM: 30,
        speedMps: 2.5,
        profile: { desiredSpeedMps: 2.5 },
      },
    ],
    events: [
      {
        id: "brake-1",
        actorId: "Lead",
        action: "brake",
        trigger: { earliestS: 4, latestS: 6 },
        durationS: 4,
        targetSpeedMps: 0.5,
      },
    ],
    objectives: { outcome: "behavior", requiredEventIds: ["brake-1"] },
    constraints: { maxSpeedMps: 5 },
  });
}
export function compilePlan(request) {
  const { map, catalog } = planContext(request.map);
  const plan = scenarioPlanSchema.parse(
    request.plan ?? defaultPlan(map, catalog, request.seed),
  );
  if (plan.actors.length > 12 || plan.durationS > 60)
    throw Error("Preview limit: 12 road actors / 60 seconds");
  return { map, catalog, plan, spec: compileScenarioPlan(map, catalog, plan) };
}

// Optional administrator-controlled model gateway. No URL, key or executable
// is accepted from browser requests. No model calls happen without explicit use.
export async function modelPlan(prompt, geojson) {
  const endpoint = process.env.GROUNDWORK_MODEL_URL;
  if (!endpoint)
    throw Error(
      "No model gateway configured. Structured plans and templates remain available.",
    );
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000)
    throw Error("Prompt must be 1–4000 characters");
  const { map, catalog } = planContext(geojson);
  const response = await fetch(endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      "Content-Type": "application/json",
      ...(process.env.GROUNDWORK_MODEL_KEY
        ? { Authorization: `Bearer ${process.env.GROUNDWORK_MODEL_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      prompt,
      catalog,
      example: defaultPlan(map, catalog),
      instructions:
        "Return a JSON ScenarioPlan object matching the example, using only catalog movement ids. No executable code. Road car/heavy_truck models only.",
    }),
  });
  if (!response.ok)
    throw Error(`Model gateway returned HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 100000) throw Error("Model output too large");
  const plan = scenarioPlanSchema.parse(JSON.parse(text));
  compileScenarioPlan(map, catalog, plan);
  return { source: "configured-model-gateway", plan };
}
