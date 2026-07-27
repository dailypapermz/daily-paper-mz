import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];
if (mode !== "local" && mode !== "cloud") {
  console.error("Usage: node scripts/validate-prisma.mjs <local|cloud>");
  process.exit(2);
}

const schema = mode === "local"
  ? "prisma/schema.prisma"
  : "prisma/postgresql/schema.prisma";
const validationUrl = mode === "local"
  ? "file:./dev.db"
  : "postgresql://validation:validation@127.0.0.1:5432/daily_paper";
const prismaBin = resolve("node_modules", "prisma", "build", "index.js");
const result = spawnSync(process.execPath, [prismaBin, "validate", "--schema", schema], {
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL?.trim() || validationUrl
  },
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
