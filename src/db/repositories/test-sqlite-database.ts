import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

type TestDatabase = {
  close(): void;
  exec(sql: string): void;
};

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => TestDatabase;
};

export function createMigratedSqliteTestDatabase(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const databasePath = join(directory, "test.db");
  const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  const migrationsDirectory = join(process.cwd(), "prisma", "migrations");
  const database = new DatabaseSync(databasePath);

  try {
    for (const migration of readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      const migrationPath = join(migrationsDirectory, migration, "migration.sql");
      database.exec(readFileSync(migrationPath, "utf8"));
    }
  } finally {
    database.close();
  }

  return {
    databaseUrl,
    cleanup() {
      if (!directory.startsWith(tmpdir())) {
        throw new Error("Refusing to clean a test database outside the system temporary directory.");
      }
      rmSync(directory, { recursive: true, force: true });
    }
  };
}
