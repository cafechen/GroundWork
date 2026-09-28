import { defineConfig } from "vitest/config";
// These six suites require private site maps not authorized for redistribution.
// They remain in source, but are explicitly outside the portable test command.
export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    exclude: [
      "packages/scenario-engine/src/index.test.ts",
      "packages/scenario-engine/src/boundary-lanes.test.ts",
      "packages/scenario-engine/src/multi-vehicle/simulation.test.ts",
      "packages/scenario-engine/src/multi-vehicle/junction.test.ts",
      "packages/scenario-engine/src/multi-vehicle/risk-generation.test.ts",
      "packages/scenario-engine/src/multi-vehicle/risk-scenario-suite.test.ts",
    ],
    maxWorkers: 2,
  },
});
