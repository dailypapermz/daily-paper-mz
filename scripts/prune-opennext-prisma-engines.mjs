import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nativeEnginePattern =
  /(?:^|\/)node_modules\/\.prisma\/client\/(?:lib)?query_engine[^/]*(?:\.(?:node|dll|so|dylib))+$/i;

export async function pruneOpenNextNativePrismaEngines(root) {
  const removed = [];
  for (const file of await listFiles(root)) {
    const normalized = path.relative(root, file).replaceAll("\\", "/");
    if (!nativeEnginePattern.test(normalized)) continue;
    await unlink(file);
    removed.push(normalized);
  }
  console.log(JSON.stringify({ status: "ok", prunedNativePrismaEngines: removed.length }));
  return removed;
}

async function listFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = path.resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await pruneOpenNextNativePrismaEngines(path.resolve(process.argv[2] ?? ".open-next"));
}
