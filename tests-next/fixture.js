import { readyYard } from "../examples/ready-yard.mjs";
import { schemas } from "../src/contracts/platform.ts";
export function fixture() {
  const f = readyYard(),
    at = "2026-09-28T00:00:00.000Z";
  const row = (kind, id, raw) => ({
    id,
    kind,
    ...raw,
    data: schemas[kind].parse(raw.data),
    version: 1,
    archived: false,
    createdAt: at,
    updatedAt: at,
  });
  return {
    maps: [row("maps", "demo-map", f.map)],
    models: [row("models", "demo-model", f.model)],
    gateways: [
      row("gateways", "demo-gateway", {
        name: "Local",
        data: {
          location: "local",
          adapter: "simulation",
          channels: [
            { name: "state", kind: "telemetry", topic: "state" },
            { name: "events", kind: "events", topic: "events" },
          ],
        },
      }),
    ],
    parks: [row("parks", "demo-park", f.park)],
  };
}
