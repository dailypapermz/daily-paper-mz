import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/health/live", () => {
  it("returns only a constant liveness signal", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
