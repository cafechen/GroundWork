import { it, expect } from "vitest";
import { createRiskSceneAsync } from "./risk-async.js";
it.each([true, false])(
  "cancels risk worker before/after starting (preCancelled=%s)",
  async (before) => {
    const controller = new AbortController();
    if (before) controller.abort(new Error("cancelled-risk"));
    const pending = createRiskSceneAsync(
      {} as any,
      {} as any,
      [],
      42,
      undefined,
      controller.signal,
    );
    if (!before) controller.abort(new Error("cancelled-risk"));
    await expect(pending).rejects.toThrow("cancelled-risk");
  },
);
