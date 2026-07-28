import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateOpenNextArtifact } from "./cloudflare-artifact-contract.mjs";

test("artifact contract requires a completed OpenNext bundle", async () => {
  const root = join(import.meta.dirname, ".tmp-missing-open-next");
  await rm(root, { recursive: true, force: true });
  await assert.rejects(validateOpenNextArtifact(root), /Missing \.open-next artifact/);
});

test("artifact contract accepts the minimum secret-free Worker shape", async (context) => {
  const root = join(import.meta.dirname, `.tmp-open-next-${process.pid}`);
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "server-functions", "default"), { recursive: true });
  await writeFile(join(root, "worker.js"), "export default {};\n", "utf8");
  await writeFile(join(root, "assets", "index.txt"), "public\n", "utf8");
  await writeFile(join(root, "server-functions", "default", "handler.mjs"), "export {};\n", "utf8");

  await assert.doesNotReject(validateOpenNextArtifact(root));
});

test("artifact contract rejects native engines and embedded credentials", async (context) => {
  const root = join(import.meta.dirname, `.tmp-unsafe-open-next-${process.pid}`);
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "server-functions", "default"), { recursive: true });
  await writeFile(join(root, "worker.js"), "export default {};\n", "utf8");
  await writeFile(join(root, "assets", "index.txt"), "public\n", "utf8");
  await writeFile(join(root, "server-functions", "default", "libquery_engine.so.node"), "native", "utf8");

  await assert.rejects(validateOpenNextArtifact(root), /forbidden files/);

  await rm(join(root, "server-functions", "default", "libquery_engine.so.node"));
  await writeFile(
    join(root, "server-functions", "default", "handler.mjs"),
    "const url = 'postgresql://real-user:real-password@database.example/app';\n",
    "utf8"
  );
  await assert.rejects(validateOpenNextArtifact(root), /embedded credentialed PostgreSQL URL/);
});

test("artifact contract does not join a credential-free URL to later minified punctuation", async (context) => {
  const root = join(import.meta.dirname, `.tmp-safe-url-open-next-${process.pid}`);
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "server-functions", "default"), { recursive: true });
  await writeFile(join(root, "worker.js"), "export default {};\n", "utf8");
  await writeFile(join(root, "assets", "index.txt"), "public\n", "utf8");
  await writeFile(
    join(root, "server-functions", "default", "handler.mjs"),
    [
      "const buildUrl='postgresql://worker-build.invalid/daily_paper?sslmode=require';",
      "const owner='ci-user@example.invalid';",
      "const prismaDocs='postgresql://user:password@host.tld/database';",
      "const runtimeTemplate='postgresql://${encode(user)}:${encode(password)}@${encode(host)}';\n"
    ].join(""),
    "utf8"
  );

  await assert.doesNotReject(validateOpenNextArtifact(root));
});
