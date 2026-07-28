import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");

const trackedStatus = runGit([
  "status",
  "--porcelain=v1",
  "--untracked-files=no"
]).trim();

if (trackedStatus) {
  throw new Error(`Tracked checkout is not clean:\n${trackedStatus}`);
}

const trackedFiles = runGit(["ls-files", "-z"])
  .split("\0")
  .filter(Boolean)
  .map((file) => file.replaceAll("\\", "/"));

if (!trackedFiles.includes("package-lock.json")) {
  throw new Error("package-lock.json must be tracked for reproducible npm ci installs.");
}

const forbidden = trackedFiles.filter((file) =>
  /(?:^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|\.open-next|\.next|\.build-home)(?:\/|$)/i.test(file) ||
  /\.(?:db|sqlite|sqlite3|log)$/i.test(file)
).filter((file) => file !== ".env.example");

if (forbidden.length > 0) {
  throw new Error(`Generated, secret-bearing, or data-bearing files are tracked:\n${forbidden.join("\n")}`);
}

console.log(JSON.stringify({ status: "ok", trackedFiles: trackedFiles.length }));

function runGit(args) {
  return execFileSync("git", args, {
    cwd: projectDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}
