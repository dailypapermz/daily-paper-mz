import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionAudit,
  runProductionAudit
} from "./production-audit-check.mjs";

test("frozen production audit accepts only the current three high-risk packages", () => {
  const result = evaluateProductionAudit(fixture());
  assert.deepEqual(result.packages, ["next", "postcss", "sharp"]);
  assert.deepEqual(result.vulnerabilities, {
    info: 0,
    low: 0,
    moderate: 0,
    high: 3,
    critical: 0,
    total: 3
  });
});

test("npm audit exit code 1 is accepted only after its JSON passes the baseline", () => {
  const result = runProductionAudit({
    platform: "linux",
    runner(command, args, options) {
      assert.equal(command, "npm");
      assert.deepEqual(args, ["audit", "--omit=dev", "--json"]);
      assert.equal(options.shell, false);
      return { status: 1, signal: null, stdout: JSON.stringify(fixture()), stderr: "" };
    }
  });
  assert.equal(result.npmExitCode, 1);
  assert.equal(result.vulnerabilities.high, 3);
});

test("Windows audit invokes npm through Node without a command shell", () => {
  const result = runProductionAudit({
    platform: "win32",
    runner(command, args, options) {
      assert.equal(command, process.execPath);
      assert.match(args[0], /node_modules[\\/]npm[\\/]bin[\\/]npm-cli\.js$/);
      assert.deepEqual(args.slice(1), ["audit", "--omit=dev", "--json"]);
      assert.equal(options.shell, false);
      return { status: 1, signal: null, stdout: JSON.stringify(fixture()), stderr: "" };
    }
  });
  assert.equal(result.npmExitCode, 1);
});

test("production audit rejects new packages, critical findings, and increased counts", () => {
  const unexpected = fixture({ react: vulnerability("react", "high") });
  unexpected.metadata.vulnerabilities.high = 4;
  unexpected.metadata.vulnerabilities.total = 4;
  assert.throws(() => evaluateProductionAudit(unexpected), /Unexpected vulnerable production packages: react/);

  const critical = fixture();
  critical.vulnerabilities.next.severity = "critical";
  critical.metadata.vulnerabilities.high = 2;
  critical.metadata.vulnerabilities.critical = 1;
  assert.throws(() => evaluateProductionAudit(critical), /Critical production vulnerabilities increased/);

  const inconsistent = fixture();
  inconsistent.metadata.vulnerabilities.high = 4;
  inconsistent.metadata.vulnerabilities.total = 4;
  assert.throws(() => evaluateProductionAudit(inconsistent), /metadata high count does not match/);
});

test("production audit fails closed on malformed output and operational npm failures", () => {
  assert.throws(
    () => runProductionAudit({
      platform: "linux",
      runner: () => ({ status: 1, signal: null, stdout: "not-json", stderr: "" })
    }),
    /did not return valid JSON/
  );
  assert.throws(
    () => runProductionAudit({
      platform: "linux",
      runner: () => ({ status: 2, signal: null, stdout: "{}", stderr: "network unavailable" })
    }),
    /failed operationally with exit code 2/
  );
});

function fixture(extraVulnerabilities = {}) {
  const vulnerabilities = {
    next: vulnerability("next", "high"),
    postcss: vulnerability("postcss", "high"),
    sharp: vulnerability("sharp", "high"),
    ...extraVulnerabilities
  };
  return {
    auditReportVersion: 2,
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 3,
        critical: 0,
        total: 3
      }
    }
  };
}

function vulnerability(name, severity) {
  return { name, severity };
}
