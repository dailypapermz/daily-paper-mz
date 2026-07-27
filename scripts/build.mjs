import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const isolatedRoot = resolve(".build-home");
const appData = resolve(isolatedRoot, "AppData", "Roaming");
const localAppData = resolve(isolatedRoot, "AppData", "Local");

for (const directory of [isolatedRoot, appData, localAppData]) {
  mkdirSync(directory, { recursive: true });
}

const nextBin = resolve("node_modules", "next", "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  env: {
    ...process.env,
    USERPROFILE: isolatedRoot,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    DATABASE_URL: process.env.DATABASE_URL?.trim() || "file:./dev.db",
    DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE?.trim() || "local"
  },
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
