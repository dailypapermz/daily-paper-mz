import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), query: vi.fn(), release: vi.fn() }));

vi.mock("../../../../db/prisma/application-client", () => ({
  getApplicationPrismaClient: mocks.getClient,
  releaseApplicationPrismaClient: mocks.release
}));

import { GET } from "./route";

describe("GET /api/health/ready", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset().mockResolvedValue(undefined);
    mocks.getClient.mockReset().mockReturnValue({ $queryRawUnsafe: mocks.query });
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("reports readiness after a database query", async () => {
    mocks.query.mockResolvedValue([{ value: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("sanitizes unavailable database errors", async () => {
    const databaseError = Object.assign(new Error("postgresql://secret@example"), {
      code: "P1001"
    });
    mocks.query.mockRejectedValue(databaseError);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(errorSpy).toHaveBeenCalledWith(JSON.stringify({
      event: "database_readiness_failed",
      phase: "query",
      errorName: "Error",
      errorCode: "P1001"
    }));
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("secret");
  });

  it("sanitizes database-client construction errors", async () => {
    mocks.getClient.mockImplementation(() => {
      throw new Error("DATABASE_URL postgresql://secret@example");
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      code: "DATABASE_UNAVAILABLE"
    });
    expect(mocks.release).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(JSON.stringify({
      event: "database_readiness_failed",
      phase: "client",
      errorName: "Error"
    }));
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("secret");
  });
});
