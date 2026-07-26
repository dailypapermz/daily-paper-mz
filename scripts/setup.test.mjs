import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runSetup } from "./setup.mjs";

async function withTempProject(run) {
  const projectDir = await mkdtemp(join(tmpdir(), "daily-paper-setup-"));
  try {
    await writeFile(join(projectDir, ".env.example"), "DATABASE_URL=\"file:./dev.db\"\n", "utf8");
    await run(projectDir);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

test("setup creates .env without exposing values and runs commands in order", async () => {
  await withTempProject(async (projectDir) => {
    const commands = [];
    const lines = [];

    const result = await runSetup({
      projectDir,
      commandRunner: async (command, args) => {
        commands.push([command, ...args]);
        return 0;
      },
      logger: (line) => lines.push(line),
      nodeExecutable: "node-test",
      environment: {}
    });

    assert.equal(result.createdEnv, true);
    assert.equal(await readFile(join(projectDir, ".env"), "utf8"), "DATABASE_URL=\"file:./dev.db\"\n");
    assert.equal((await readFile(join(projectDir, "prisma", "dev.db"))).length, 0);
    assert.deepEqual(commands, [
      ["node-test", "node_modules/prisma/build/index.js", "generate"],
      ["node-test", "node_modules/prisma/build/index.js", "migrate", "deploy"],
      ["node-test", "scripts/doctor.mjs"]
    ]);
    assert.equal(lines.some((line) => line.includes("file:./dev.db")), false);
  });
});

test("setup preserves an existing .env", async () => {
  await withTempProject(async (projectDir) => {
    const existingEnv = 'DATABASE_URL="file:./dev.db"\nSECRET_VALUE=keep-me\n';
    await writeFile(join(projectDir, ".env"), existingEnv, "utf8");

    const result = await runSetup({
      projectDir,
      commandRunner: async () => 0,
      logger: () => {},
      nodeExecutable: "node-test",
      environment: {}
    });

    assert.equal(result.createdEnv, false);
    assert.equal(await readFile(join(projectDir, ".env"), "utf8"), existingEnv);
  });
});

test("setup stops after the first failed command", async () => {
  await withTempProject(async (projectDir) => {
    const commands = [];

    await assert.rejects(
      runSetup({
        projectDir,
        commandRunner: async (command, args) => {
          commands.push([command, ...args]);
          return commands.length === 2 ? 1 : 0;
        },
        logger: () => {},
        nodeExecutable: "node-test",
        environment: {}
      }),
      /prisma migrate deploy failed/
    );

    assert.equal(commands.length, 2);
  });
});

test("setup never truncates an existing SQLite database", async () => {
  await withTempProject(async (projectDir) => {
    await writeFile(join(projectDir, ".env"), "DATABASE_URL=\"file:./dev.db\"\n", "utf8");
    await mkdir(join(projectDir, "prisma"), { recursive: true });
    await writeFile(join(projectDir, "prisma", "dev.db"), "existing database bytes", "utf8");

    await runSetup({
      projectDir,
      commandRunner: async () => 0,
      logger: () => {},
      nodeExecutable: "node-test",
      environment: {}
    });

    assert.equal(
      await readFile(join(projectDir, "prisma", "dev.db"), "utf8"),
      "existing database bytes"
    );
  });
});

test("local setup rejects a non-SQLite URL before running Prisma", async () => {
  await withTempProject(async (projectDir) => {
    await writeFile(
      join(projectDir, ".env"),
      'DEPLOYMENT_MODE="local"\nDATABASE_URL="postgresql://placeholder:placeholder@example.invalid/daily_paper"\n',
      "utf8"
    );
    const commands = [];

    await assert.rejects(
      runSetup({
        projectDir,
        commandRunner: async (command, args) => {
          commands.push([command, ...args]);
          return 0;
        },
        logger: () => {},
        nodeExecutable: "node-test",
        environment: {}
      }),
      /Local mode requires a file: SQLite DATABASE_URL/
    );

    assert.deepEqual(commands, []);
    await assert.rejects(readFile(join(projectDir, "prisma", "dev.db")), /ENOENT/);
  });
});

test("cloud setup runs doctor only and remains blocked without touching a database", async () => {
  await withTempProject(async (projectDir) => {
    const cloudEnv = `
DEPLOYMENT_MODE="cloud"
DATABASE_URL="postgresql://placeholder:placeholder@example.invalid/daily_paper"
ZOTERO_TRANSPORT="web"
ZOTERO_KEY="placeholder-key"
ZOTERO_ID="placeholder-id"
`;
    await writeFile(join(projectDir, ".env"), cloudEnv, "utf8");
    const commands = [];

    await assert.rejects(
      runSetup({
        projectDir,
        commandRunner: async (command, args) => {
          commands.push([command, ...args]);
          return 0;
        },
        logger: () => {},
        nodeExecutable: "node-test",
        environment: {}
      }),
      /PostgreSQL schema and migrations are implemented/
    );

    assert.deepEqual(commands, [["node-test", "scripts/doctor.mjs"]]);
    await assert.rejects(readFile(join(projectDir, "prisma", "dev.db")), /ENOENT/);
    assert.equal(await readFile(join(projectDir, ".env"), "utf8"), cloudEnv);
  });
});

test("injected cloud setup does not create .env or run Prisma commands", async () => {
  await withTempProject(async (projectDir) => {
    const commands = [];

    await assert.rejects(
      runSetup({
        projectDir,
        commandRunner: async (command, args) => {
          commands.push([command, ...args]);
          return 1;
        },
        logger: () => {},
        nodeExecutable: "node-test",
        environment: {
          DEPLOYMENT_MODE: "cloud",
          DATABASE_URL: "postgres://placeholder:placeholder@example.invalid/daily_paper",
          ZOTERO_TRANSPORT: "web",
          ZOTERO_KEY: "placeholder-key",
          ZOTERO_ID: "placeholder-id"
        }
      }),
      /doctor failed/
    );

    assert.deepEqual(commands, [["node-test", "scripts/doctor.mjs"]]);
    await assert.rejects(readFile(join(projectDir, ".env")), /ENOENT/);
  });
});
