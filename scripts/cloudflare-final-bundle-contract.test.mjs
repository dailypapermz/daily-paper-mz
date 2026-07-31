import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateCloudflareFinalBundle } from "./cloudflare-final-bundle-contract.mjs";

test("final bundle contract requires a Wrangler dry-run artifact", async () => {
  const root = join(import.meta.dirname, ".tmp-missing-final-worker");
  await rm(root, { recursive: true, force: true });
  await assert.rejects(validateCloudflareFinalBundle(root), /Missing Wrangler dry-run bundle/);
});

test("final bundle contract accepts a secret-free custom Worker", async (context) => {
  const root = join(import.meta.dirname, `.tmp-final-worker-${process.pid}`);
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "custom-worker.js"),
    "const header = `Bearer ${env.DAILY_SCHEDULER_GITHUB_TOKEN}`;\n",
    "utf8"
  );

  await assert.doesNotReject(validateCloudflareFinalBundle(root));
});

test("final bundle contract rejects embedded GitHub tokens", async (context) => {
  const root = join(import.meta.dirname, `.tmp-unsafe-final-worker-${process.pid}`);
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(root, { recursive: true });
  const tokenMarker = ["github", "pat", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  await writeFile(join(root, "custom-worker.js"), `const token = '${tokenMarker}';\n`, "utf8");

  await assert.rejects(validateCloudflareFinalBundle(root), /embedded GitHub token/);
});
