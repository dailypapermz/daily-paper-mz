import assert from "node:assert/strict";
import test from "node:test";

import { validateTestDatabaseUrl } from "./ci-migration-check.mjs";

test("migration check requires a dedicated PostgreSQL test URL", () => {
  assert.throws(() => validateTestDatabaseUrl(undefined), /TEST_POSTGRES_DATABASE_URL is required/);
  assert.throws(() => validateTestDatabaseUrl("file:./dev.db"), /must use postgresql/);
  assert.throws(() => validateTestDatabaseUrl("postgresql://localhost"), /isolated test database/);
  assert.equal(
    validateTestDatabaseUrl("postgresql://ci:ci@127.0.0.1:5432/daily_paper_ci"),
    "postgresql://ci:ci@127.0.0.1:5432/daily_paper_ci"
  );
});
