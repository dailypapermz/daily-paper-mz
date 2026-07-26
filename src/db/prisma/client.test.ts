import { describe, expect, it, vi } from "vitest";

import type { DatabasePrismaClient } from "./client";
import { createPrismaClient } from "./client";

function constructorReturning(value: DatabasePrismaClient) {
  return vi.fn(function MockClient() {
    return value;
  }) as unknown as new (options: {
    datasourceUrl: string;
    log: Array<"warn" | "error">;
  }) => DatabasePrismaClient;
}

describe("createPrismaClient", () => {
  it("constructs only the SQLite client in Local Mode", () => {
    const localClient = {} as DatabasePrismaClient;
    const sqlite = constructorReturning(localClient);
    const postgresql = constructorReturning({} as DatabasePrismaClient);

    expect(createPrismaClient({ DATABASE_URL: "file:./dev.db" }, { sqlite, postgresql })).toBe(localClient);
    expect(sqlite).toHaveBeenCalledWith({ datasourceUrl: "file:./dev.db", log: ["warn", "error"] });
    expect(postgresql).not.toHaveBeenCalled();
  });

  it("constructs only the PostgreSQL client in Cloud Mode", () => {
    const cloudClient = {} as DatabasePrismaClient;
    const sqlite = constructorReturning({} as DatabasePrismaClient);
    const postgresql = constructorReturning(cloudClient);
    const url = "postgresql://user:secret@example.invalid/daily_paper";

    expect(createPrismaClient({ DEPLOYMENT_MODE: "cloud", DATABASE_URL: url }, { sqlite, postgresql })).toBe(cloudClient);
    expect(postgresql).toHaveBeenCalledWith({ datasourceUrl: url, log: ["warn", "error"] });
    expect(sqlite).not.toHaveBeenCalled();
  });

  it("rejects mismatches before constructing either client", () => {
    const sqlite = constructorReturning({} as DatabasePrismaClient);
    const postgresql = constructorReturning({} as DatabasePrismaClient);

    expect(() => createPrismaClient({
      DEPLOYMENT_MODE: "cloud",
      DATABASE_URL: "file:./dev.db"
    }, { sqlite, postgresql })).toThrow(/Cloud database mode/);
    expect(sqlite).not.toHaveBeenCalled();
    expect(postgresql).not.toHaveBeenCalled();
  });
});
