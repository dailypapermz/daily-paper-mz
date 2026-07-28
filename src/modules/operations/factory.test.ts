import { describe, expect, it } from "vitest";

import { OPERATIONS_PIPELINE_STALE_AFTER_MS } from "./operations.service";
import { resolveOperationsPipelineStaleAfterMs } from "./factory";

describe("resolveOperationsPipelineStaleAfterMs", () => {
  it("uses the production default without validating unrelated application settings", () => {
    expect(resolveOperationsPipelineStaleAfterMs({})).toBe(OPERATIONS_PIPELINE_STALE_AFTER_MS);
  });

  it("accepts a positive whole-minute override", () => {
    expect(resolveOperationsPipelineStaleAfterMs({ DAILY_RUN_STALE_AFTER_MINUTES: "45" }))
      .toBe(45 * 60 * 1000);
  });

  it.each(["0", "-1", "1.5", "invalid", "999999999999999999999"])(
    "falls back for an unsafe override (%s)",
    (value) => {
      expect(resolveOperationsPipelineStaleAfterMs({ DAILY_RUN_STALE_AFTER_MINUTES: value }))
        .toBe(OPERATIONS_PIPELINE_STALE_AFTER_MS);
    }
  );
});
