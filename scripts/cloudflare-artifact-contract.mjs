import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = resolve(import.meta.dirname, "..");
const artifactDir = resolve(projectDir, ".open-next");

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await validateOpenNextArtifact(artifactDir);
}

export async function validateOpenNextArtifact(root) {
  const rootStats = await stat(root).catch(() => null);
  if (!rootStats?.isDirectory()) {
    throw new Error("Missing .open-next artifact; run npm run cf:build before this contract.");
  }

  const entries = await listFiles(root);
  const normalized = entries.map((file) => relative(root, file).replaceAll("\\", "/"));

  for (const required of ["worker.js", "assets", "server-functions/default"]) {
    const present = normalized.some((entry) => entry === required || entry.startsWith(`${required}/`));
    if (!present) throw new Error(`OpenNext artifact is missing ${required}.`);
  }

  const forbiddenFiles = normalized.filter((entry) =>
    /(?:^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?)(?:\/|$)/i.test(entry) ||
    /(?:query_engine|libquery_engine).*(?:\.node|\.dll|\.so|\.dylib)$/i.test(entry) ||
    /\.(?:db|sqlite|sqlite3)$/i.test(entry)
  );
  if (forbiddenFiles.length > 0) {
    throw new Error(`Worker artifact contains forbidden files:\n${forbiddenFiles.join("\n")}`);
  }

  const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".mjs", ".txt"]);
  for (const file of entries) {
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    const content = await readFile(file, "utf8");
    const normalizedFile = relative(root, file).replaceAll("\\", "/");
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
      throw new Error(`Worker artifact contains a private key marker in ${relative(root, file)}.`);
    }
    if (containsCredentialedPostgresUrl(content)) {
      throw new Error(`Worker artifact contains an embedded credentialed PostgreSQL URL in ${relative(root, file)}.`);
    }
    const isPrismaGeneratorSource =
      /(?:^|\/)node_modules\/@prisma\/client\/generator-build\//.test(normalizedFile);
    if (/query_compiler_bg\.wasm/.test(content) && !isPrismaGeneratorSource) {
      throw new Error(
        `Worker artifact contains a filesystem-backed Prisma query compiler reference in ${relative(root, file)}.`
      );
    }
    if (/qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=/i.test(content)) {
      throw new Error(`Worker artifact contains an embedded webhook URL in ${relative(root, file)}.`);
    }
    if (/(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/.test(content)) {
      throw new Error(`Worker artifact contains an embedded GitHub token in ${relative(root, file)}.`);
    }
  }

  console.log(JSON.stringify({ status: "ok", artifact: ".open-next", files: entries.length }));
}

export function containsCredentialedPostgresUrl(content) {
  const candidates = content.match(/postgres(?:ql)?:\/\/[^\s"'`<>\\]+/gi) ?? [];
  return candidates.some((candidate) => {
    if (candidate.includes("${")) return false;
    try {
      const parsed = new URL(candidate);
      const isPrismaDocumentationPlaceholder =
        parsed.hostname === "host.tld" &&
        decodeURIComponent(parsed.username) === "user" &&
        decodeURIComponent(parsed.password) === "password";
      if (isPrismaDocumentationPlaceholder) return false;
      return parsed.username.length > 0 || parsed.password.length > 0;
    } catch {
      return false;
    }
  });
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
