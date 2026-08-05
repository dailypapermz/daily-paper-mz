import { describe, expect, it, vi } from "vitest";

vi.mock("@prisma/client/wasm.js", () => ({
  PrismaClient: class MockWorkerPrismaClient {
    async $disconnect() {}
  }
}));

import {
  getApplicationPrismaClient,
  releaseApplicationPrismaClient
} from "./edge-application-client";

const cloudEnvironment = {
  DEPLOYMENT_MODE: "cloud",
  DATABASE_URL: "postgresql://user:secret@db.example/daily_paper?sslmode=require"
};

describe("Worker Prisma client", () => {
  it("creates independent Neon-adapted clients for separate request compositions", async () => {
    const first = getApplicationPrismaClient(cloudEnvironment);
    const second = getApplicationPrismaClient(cloudEnvironment);
    expect(first).not.toBe(second);
    await Promise.all([
      releaseApplicationPrismaClient(first),
      releaseApplicationPrismaClient(second)
    ]);
  });

  it("rejects Local Mode before creating a Worker client", () => {
    expect(() =>
      getApplicationPrismaClient({ DEPLOYMENT_MODE: "local", DATABASE_URL: "file:./dev.db" })
    ).toThrow("requires Cloud Mode PostgreSQL");
  });
});
