import { constants } from "node:fs";
import { copyFile, mkdir, open, readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parse as parseDotenv } from "dotenv";

import { inspectRuntimeEnvironment, resolveDeploymentMode } from "./check-env.mjs";

export function runCommand(command, args, { cwd }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

async function createEnvIfMissing(projectDir) {
  try {
    await copyFile(
      resolve(projectDir, ".env.example"),
      resolve(projectDir, ".env"),
      constants.COPYFILE_EXCL
    );
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

async function readEnvIfPresent(projectDir) {
  try {
    return parseDotenv(await readFile(resolve(projectDir, ".env"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

export async function ensureSqliteDatabaseFile(projectDir) {
  const env = parseDotenv(await readFile(resolve(projectDir, ".env"), "utf8"));
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl?.startsWith("file:")) return { created: false };

  const configuredPath = decodeURIComponent(databaseUrl.slice("file:".length).split("?", 1)[0]);
  if (!configuredPath) return { created: false };
  const databasePath = isAbsolute(configuredPath)
    ? configuredPath
    : resolve(projectDir, "prisma", configuredPath);

  await mkdir(dirname(databasePath), { recursive: true });
  const handle = await open(databasePath, "a");
  await handle.close();
  return { created: true };
}

export async function runSetup({
  projectDir = process.cwd(),
  commandRunner = runCommand,
  logger = console.log,
  nodeExecutable = process.execPath,
  environment = process.env
} = {}) {
  let fileEnv = await readEnvIfPresent(projectDir);
  let deployment = resolveDeploymentMode({ ...fileEnv, ...environment });
  let createdEnv = false;

  if (deployment.mode === "local") {
    createdEnv = await createEnvIfMissing(projectDir);
    if (createdEnv) fileEnv = await readEnvIfPresent(projectDir);
    deployment = resolveDeploymentMode({ ...fileEnv, ...environment });
    logger(createdEnv
      ? "Created .env from .env.example. Review it before enabling optional integrations."
      : "Existing .env preserved.");
  } else if (Object.keys(fileEnv).length > 0) {
    logger("Existing .env preserved.");
  } else {
    logger("Cloud preflight is using injected environment values; no .env was created.");
  }

  const mergedEnvironment = { ...fileEnv, ...environment };
  const preflight = inspectRuntimeEnvironment(mergedEnvironment, {
    blockUnimplementedCloud: false
  });
  const preflightErrors = preflight.checks.filter((item) => item.level === "error");
  if (preflightErrors.length > 0) {
    throw new Error(`Environment validation failed: ${preflightErrors.map((item) => item.message).join("; ")}`);
  }

  if (deployment.mode !== "local") {
    logger("Running doctor...");
    const exitCode = await commandRunner(nodeExecutable, ["scripts/doctor.mjs"], { cwd: projectDir });
    if (exitCode !== 0) {
      throw new Error(`doctor failed with exit code ${exitCode}.`);
    }
    if (!deployment.mode) {
      throw new Error(deployment.error);
    }
    throw new Error("Cloud setup is blocked until the PostgreSQL schema and migrations are implemented.");
  }

  await ensureSqliteDatabaseFile(projectDir);

  const steps = [
    { label: "prisma generate", args: ["node_modules/prisma/build/index.js", "generate"] },
    { label: "prisma migrate deploy", args: ["node_modules/prisma/build/index.js", "migrate", "deploy"] },
    { label: "doctor", args: ["scripts/doctor.mjs"] }
  ];

  for (const step of steps) {
    logger(`Running ${step.label}...`);
    const exitCode = await commandRunner(nodeExecutable, step.args, { cwd: projectDir });
    if (exitCode !== 0) {
      throw new Error(`${step.label} failed with exit code ${exitCode}.`);
    }
  }

  logger("Setup completed.");
  return { createdEnv };
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

if (isMainModule()) {
  try {
    await runSetup();
  } catch (error) {
    console.error(`Setup failed: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
