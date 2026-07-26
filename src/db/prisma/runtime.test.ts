import { describe, expect, it } from "vitest";

import { resolveDatabaseRuntime } from "./runtime";

describe("resolveDatabaseRuntime", () => {
  it("selects SQLite for Local Mode", () => {
    expect(resolveDatabaseRuntime({ DATABASE_URL: "file:./dev.db" })).toEqual({
      mode: "local",
      provider: "sqlite",
      databaseUrl: "file:./dev.db"
    });
  });

  it("selects PostgreSQL for Cloud Mode", () => {
    expect(resolveDatabaseRuntime({
      DEPLOYMENT_MODE: "cloud",
      DATABASE_URL: "postgresql://user:secret@example.invalid/daily_paper"
    })).toEqual({
      mode: "cloud",
      provider: "postgresql",
      databaseUrl: "postgresql://user:secret@example.invalid/daily_paper"
    });
  });

  it.each([
    [{ DEPLOYMENT_MODE: "local", DATABASE_URL: "postgresql://example.invalid/db" }, /Local database mode/],
    [{ DEPLOYMENT_MODE: "cloud", DATABASE_URL: "file:.\/dev.db" }, /Cloud database mode/]
  ])("rejects a provider and deployment mode mismatch", (environment, expected) => {
    expect(() => resolveDatabaseRuntime(environment)).toThrow(expected);
  });

  it("fails safely when Cloud Mode has no database URL", () => {
    expect(() => resolveDatabaseRuntime({ DEPLOYMENT_MODE: "cloud" })).toThrow(
      "DATABASE_URL is required for cloud database mode."
    );
  });
});
