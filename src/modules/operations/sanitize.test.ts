import { describe, expect, it } from "vitest";

import { sanitizeOperationsDetails, sanitizeOperationsError } from "./sanitize";

describe("Operations diagnostic sanitization", () => {
  it("retains useful failure text and only the public provider origin", () => {
    expect(sanitizeOperationsError(
      "Notification delivery failed at https://hooks.slack.com/services/T000/B000/private-token?sig=private-signature#owner-fragment after 3 attempts."
    )).toBe("Notification delivery failed at https://hooks.slack.com after 3 attempts.");

    expect(sanitizeOperationsError(
      "GitHub returned 403 from https://api.github.com/repos/private-owner/private-repo/actions?signature=private#account"
    )).toBe("GitHub returned 403 from https://api.github.com");
  });

  it.each([
    "http://localhost:8787/hooks/private?sig=secret#fragment",
    "http://worker.internal/private/path?signature=secret",
    "https://daily-paper.local/private/path",
    "http://192.168.1.20:8080/private/path?sig=secret",
    "http://127.0.0.1/private",
    "http://[::1]:8787/private"
  ])("redacts local, private, and IP URL %s", (url) => {
    const sanitized = sanitizeOperationsError(`Provider unavailable at ${url}; retry later.`);
    expect(sanitized).toBe("Provider unavailable at [redacted] retry later.");
    expect(sanitized).not.toContain("private");
    expect(sanitized).not.toContain("secret");
  });

  it("redacts filesystem, personal, and database locations", () => {
    const details = sanitizeOperationsDetails({
      windows: "Could not read C:\\Users\\Alice\\private\\paper.md",
      fileUrl: "Could not read file:///C:/Users/Alice/private/paper.md",
      unc: "Could not read \\\\research-pc\\Alice\\private\\paper.md",
      unix: "Could not read /home/alice/private/paper.md",
      macLike: "Could not read /Users/Alice/private/paper.md",
      database: "Connection refused: postgresql://owner:password@db.example/private?ssl=true",
      sig: "private-signature",
      signature: "another-private-signature",
      useful: "Summary provider timed out after 30 seconds"
    });

    const serialized = JSON.stringify(details);
    expect(serialized).not.toMatch(/Alice|alice|research-pc|owner|password|paper\.md|ssl=true/);
    expect(details).toMatchObject({
      windows: "Could not read [local path]",
      fileUrl: "Could not read [local path]",
      unc: "Could not read [local path]",
      unix: "Could not read [local path]",
      macLike: "Could not read [local path]",
      database: "Connection refused: [database url]",
      sig: "[redacted]",
      signature: "[redacted]",
      useful: "Summary provider timed out after 30 seconds"
    });
  });
});
