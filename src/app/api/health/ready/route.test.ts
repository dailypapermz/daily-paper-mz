import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), query: vi.fn(), release: vi.fn() }));

vi.mock("../../../../db/prisma/application-client", () => ({
  getApplicationPrismaClient: mocks.getClient,
  releaseApplicationPrismaClient: mocks.release
}));

import { GET } from "./route";

describe("GET /api/health/ready", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset().mockResolvedValue(undefined);
    mocks.getClient.mockReset().mockReturnValue({ $queryRawUnsafe: mocks.query });
  });

  it("reports readiness after a database query", async () => {
    mocks.query.mockResolvedValue([{ value: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("sanitizes unavailable database errors", async () => {
    mocks.query.mockRejectedValue(new Error("postgresql://secret@example"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
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
  });
});
