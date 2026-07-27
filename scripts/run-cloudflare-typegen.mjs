import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve(".wrangler/types");
const outputFile = path.join(outputDirectory, "cloudflare-env.d.ts");
const wranglerCli = path.resolve("node_modules/wrangler/bin/wrangler.js");

mkdirSync(outputDirectory, { recursive: true });

const result = spawnSync(
  process.execPath,
  [
    wranglerCli,
    "types",
    outputFile,
    "--env-interface",
    "CloudflareEnv",
    "--include-runtime",
    "false"
  ],
  { stdio: "inherit", env: process.env }
);

if (result.error) {
  console.error(`Cloudflare type generation could not start: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
