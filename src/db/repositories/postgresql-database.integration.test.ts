import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient as PostgresqlPrismaClient } from "../../generated/prisma-postgresql";
import type { PrismaClient as RepositoryPrismaClient } from "../../generated/prisma";
import { PrismaJournalFeedRepository } from "./journal-feed-repository";

const baseUrl = process.env.TEST_POSTGRES_DATABASE_URL?.trim();
const describePostgresql = baseUrl ? describe : describe.skip;
const schemaName = `daily_paper_test_${randomBytes(8).toString("hex")}`;
let client: PostgresqlPrismaClient | undefined;

function isolatedUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_POSTGRES_DATABASE_URL must use postgresql: or postgres:.");
  }
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

describePostgresql("PostgreSQL database contract", () => {
  beforeAll(() => {
    const databaseUrl = isolatedUrl(baseUrl!);
    try {
      execFileSync(
        process.execPath,
        [
          "node_modules/prisma/build/index.js",
          "migrate",
          "deploy",
          "--schema",
          "prisma/postgresql/schema.prisma"
        ],
        {
          cwd: resolve(import.meta.dirname, "../../.."),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: ["ignore", "pipe", "pipe"]
        }
      );
    } catch {
      throw new Error("PostgreSQL test migration failed; verify the isolated test URL and direct database connectivity.");
    }
    client = new PostgresqlPrismaClient({ datasourceUrl: databaseUrl });
  }, 120_000);

  afterAll(async () => {
    if (!client) return;
    if (!/^daily_paper_test_[a-f0-9]{16}$/.test(schemaName)) {
      throw new Error("Refusing to clean up an unexpected PostgreSQL schema name.");
    }
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.$disconnect();
  }, 30_000);

  it("migrates an empty schema and supports repository create, read, and update", async () => {
    const repository = new PrismaJournalFeedRepository(
      client as unknown as RepositoryPrismaClient
    );
    const feedUrl = `https://example.invalid/${schemaName}.xml`;

    const created = (await repository.upsertFeeds([
      { journalName: "Cloud Contract Journal", feedUrl }
    ])).find((feed) => feed.feedUrl === feedUrl);
    expect(created).toBeDefined();

    const read = await repository.getFeedById(created!.id);
    expect(read).toMatchObject({ journalName: "Cloud Contract Journal", isActive: true });

    const updated = await repository.updateFeedActive({ id: created!.id, isActive: false });
    expect(updated.isActive).toBe(false);
    expect(await repository.getFeedById(created!.id)).toMatchObject({ isActive: false });
  });
});
