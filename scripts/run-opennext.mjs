import { spawnSync } from "node:child_process";
import path from "node:path";

import { pruneOpenNextNativePrismaEngines } from "./prune-opennext-prisma-engines.mjs";

const [command, ...forwardedArgs] = process.argv.slice(2);
const supportedCommands = new Set(["build", "preview", "deploy"]);

if (!command || !supportedCommands.has(command)) {
  console.error("Usage: node scripts/run-opennext.mjs <build|preview|deploy> [args]");
  process.exit(1);
}

const prismaCli = path.resolve("node_modules/prisma/build/index.js");
const openNextCli = path.resolve("node_modules/@opennextjs/cloudflare/dist/cli/index.js");
const generation = spawnSync(process.execPath, [
  prismaCli,
  "generate",
  "--schema",
  "prisma/postgresql/schema.prisma",
  "--generator",
  "workerClient"
], {
  stdio: "inherit",
  env: process.env
});

if (generation.error || generation.status !== 0) {
  console.error(
    generation.error
      ? `Worker Prisma Client generation could not start: ${generation.error.message}`
      : "Worker Prisma Client generation failed."
  );
  process.exit(generation.status ?? 1);
}

const result = spawnSync(
  process.execPath,
  [openNextCli, command, ...forwardedArgs],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DEPLOYMENT_MODE: "cloud",
      DAILY_PAPER_RUNTIME_TARGET: "cloudflare",
      NEXT_PUBLIC_DEPLOYMENT_MODE: "cloud",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://worker-build.invalid/daily_paper?sslmode=require"
    }
  }
);

if (result.error) {
  console.error(`OpenNext ${command} could not start: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0 && command === "build") {
  await pruneOpenNextNativePrismaEngines(path.resolve(".open-next"));
}

process.exit(result.status ?? 1);
