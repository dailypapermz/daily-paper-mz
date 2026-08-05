import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { containsCredentialedPostgresUrl } from "./cloudflare-artifact-contract.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const bundleDir = resolve(projectDir, "dist/cloudflare-dry-run");

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await validateCloudflareFinalBundle(bundleDir);
}

export async function validateCloudflareFinalBundle(root) {
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error("Missing Wrangler dry-run bundle; run npm run cf:dry-run first.");
  }

  const entries = await listFiles(root);
  const normalized = entries.map((file) => relative(root, file).replaceAll("\\", "/"));
  if (!normalized.includes("custom-worker.js")) {
    throw new Error("Wrangler dry-run bundle is missing custom-worker.js.");
  }

  const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".md", ".mjs", ".txt"]);
  for (const file of entries) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const content = await readFile(file, "utf8");
    const fileName = relative(root, file).replaceAll("\\", "/");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
      throw new Error(`Final Worker bundle contains a private key marker in ${fileName}.`);
    }
    if (containsCredentialedPostgresUrl(content)) {
      throw new Error(`Final Worker bundle contains an embedded credentialed PostgreSQL URL in ${fileName}.`);
    }
    if (/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=/i.test(content)) {
      throw new Error(`Final Worker bundle contains an embedded webhook URL in ${fileName}.`);
    }
    if (/(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/.test(content)) {
      throw new Error(`Final Worker bundle contains an embedded GitHub token in ${fileName}.`);
    }
    if (/Prisma failed to detect the libssl\/openssl version/.test(content)) {
      throw new Error(`Final Worker bundle contains the native Prisma runtime in ${fileName}.`);
    }
  }

  console.log(JSON.stringify({
    status: "ok",
    artifact: "dist/cloudflare-dry-run",
    files: entries.length
  }));
}

async function listFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}
