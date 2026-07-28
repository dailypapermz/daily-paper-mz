import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowedPackages = new Set(["next", "postcss", "sharp"]);
const allowedSeverityCounts = Object.freeze({
  high: 3,
  critical: 0,
  total: 3
});
const severityNames = ["info", "low", "moderate", "high", "critical"];

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const summary = runProductionAudit();
    console.log(JSON.stringify({ status: "ok", ...summary }));
  } catch (error) {
    console.error(`[production-audit] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export function runProductionAudit({
  runner = spawnSync,
  platform = process.platform,
  environment = process.env
} = {}) {
  const npmCommand = platform === "win32" ? process.execPath : "npm";
  const npmArgs = platform === "win32"
    ? [resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), "audit", "--omit=dev", "--json"]
    : ["audit", "--omit=dev", "--json"];
  const result = runner(npmCommand, npmArgs, {
    cwd: resolve(import.meta.dirname, ".."),
    env: environment,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    shell: false
  });

  if (result.error) {
    throw new Error(`npm audit could not start: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`npm audit terminated by signal ${result.signal}.`);
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`npm audit failed operationally with exit code ${result.status ?? "unknown"}.`);
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error("npm audit did not return valid JSON.");
  }

  return {
    ...evaluateProductionAudit(report),
    npmExitCode: result.status
  };
}

export function evaluateProductionAudit(report) {
  if (!isRecord(report) || report.auditReportVersion !== 2) {
    throw new Error("Unsupported npm audit report format; expected auditReportVersion 2.");
  }
  if (!isRecord(report.vulnerabilities)) {
    throw new Error("npm audit report is missing the vulnerabilities object.");
  }

  const packages = Object.keys(report.vulnerabilities).sort();
  const unexpectedPackages = packages.filter((name) => !allowedPackages.has(name));
  if (unexpectedPackages.length > 0) {
    throw new Error(`Unexpected vulnerable production packages: ${unexpectedPackages.join(", ")}.`);
  }

  const computed = Object.fromEntries(severityNames.map((name) => [name, 0]));
  for (const packageName of packages) {
    const vulnerability = report.vulnerabilities[packageName];
    if (!isRecord(vulnerability) || vulnerability.name !== packageName) {
      throw new Error(`Malformed vulnerability entry for ${packageName}.`);
    }
    if (!severityNames.includes(vulnerability.severity)) {
      throw new Error(`Unsupported severity for ${packageName}.`);
    }
    computed[vulnerability.severity] += 1;
  }
  computed.total = packages.length;

  if (computed.critical > allowedSeverityCounts.critical) {
    throw new Error(`Critical production vulnerabilities increased to ${computed.critical}.`);
  }
  if (computed.high > allowedSeverityCounts.high) {
    throw new Error(`High production vulnerabilities increased to ${computed.high}.`);
  }
  if (computed.total > allowedSeverityCounts.total) {
    throw new Error(`Production vulnerability count increased to ${computed.total}.`);
  }

  const metadataCounts = report.metadata?.vulnerabilities;
  if (!isRecord(metadataCounts)) {
    throw new Error("npm audit report is missing vulnerability metadata.");
  }
  for (const severity of [...severityNames, "total"]) {
    if (!Number.isInteger(metadataCounts[severity]) || metadataCounts[severity] < 0) {
      throw new Error(`npm audit metadata has an invalid ${severity} count.`);
    }
    if (metadataCounts[severity] !== computed[severity]) {
      throw new Error(`npm audit metadata ${severity} count does not match its vulnerability entries.`);
    }
  }

  return {
    packages,
    vulnerabilities: computed
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
