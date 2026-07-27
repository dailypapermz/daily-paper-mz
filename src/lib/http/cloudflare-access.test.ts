import { describe, expect, it, vi } from "vitest";

import { verifyCloudflareAccess } from "./cloudflare-access";

const validEnvironment = {
  TEAM_DOMAIN: "https://daily-paper.cloudflareaccess.com",
  POLICY_AUD: "audience-1",
  ACCESS_ALLOWED_EMAIL: "owner@example.test"
};

describe("verifyCloudflareAccess", () => {
  it("fails closed when Access deployment values are missing", async () => {
    const result = await verifyCloudflareAccess(new Request("https://app.example.test/"), {});
    expect(result).toEqual({ ok: false, code: "ACCESS_CONFIGURATION_INVALID" });
  });

  it("requires the Access assertion header", async () => {
    const result = await verifyCloudflareAccess(
      new Request("https://app.example.test/"),
      validEnvironment
    );
    expect(result).toEqual({ ok: false, code: "ACCESS_TOKEN_REQUIRED" });
  });

  it("verifies issuer, audience, signature path, and configured owner email", async () => {
    const verify = vi.fn().mockResolvedValue({ email: "Owner@Example.Test" });
    const result = await verifyCloudflareAccess(
      new Request("https://app.example.test/", {
        headers: { "Cf-Access-Jwt-Assertion": "signed-token" }
      }),
      validEnvironment,
      verify
    );

    expect(result).toEqual({ ok: true, email: "owner@example.test" });
    expect(verify).toHaveBeenCalledWith({
      token: "signed-token",
      teamDomain: "https://daily-paper.cloudflareaccess.com",
      audience: "audience-1"
    });
  });

  it("rejects a valid token for a different email without exposing it", async () => {
    const result = await verifyCloudflareAccess(
      new Request("https://app.example.test/", {
        headers: { "Cf-Access-Jwt-Assertion": "signed-token" }
      }),
      validEnvironment,
      vi.fn().mockResolvedValue({ email: "other@example.test" })
    );
    expect(result).toEqual({ ok: false, code: "ACCESS_TOKEN_INVALID" });
  });

  it("permits only an explicitly enabled localhost preview bypass", async () => {
    expect(
      await verifyCloudflareAccess(new Request("http://localhost:8787/"), {
        ACCESS_JWT_LOCAL_PREVIEW_BYPASS: "true"
      })
    ).toEqual({ ok: true, email: "local-preview" });
    expect(
      await verifyCloudflareAccess(new Request("https://daily-paper.example.workers.dev/"), {
        ACCESS_JWT_LOCAL_PREVIEW_BYPASS: "true"
      })
    ).toEqual({ ok: false, code: "ACCESS_CONFIGURATION_INVALID" });
  });
});
