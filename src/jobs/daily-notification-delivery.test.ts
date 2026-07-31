import { describe, expect, it, vi } from "vitest";

import { deliverDailyNotificationOnce } from "./daily-notification-delivery";

describe("persisted daily notification delivery", () => {
  it("skips the sender when the same runId is already marked sent", async () => {
    const send = vi.fn();
    const markSent = vi.fn();
    const releaseClaim = vi.fn();

    await expect(deliverDailyNotificationOnce({
      runId: "run-1",
      businessDate: "2026-07-30",
      store: { claim: vi.fn().mockResolvedValue("already_sent"), markSent, releaseClaim },
      send
    })).resolves.toEqual({
      deliveryStatus: "skipped",
      channel: "none",
      businessDate: "2026-07-30",
      reason: "already_sent",
      deduplicated: true
    });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it("suppresses terminal runs migrated from the legacy notification model", async () => {
    const send = vi.fn();
    const markSent = vi.fn();
    const releaseClaim = vi.fn();

    await expect(deliverDailyNotificationOnce({
      runId: "legacy-run-1",
      businessDate: "2026-07-29",
      store: { claim: vi.fn().mockResolvedValue("legacy_suppressed"), markSent, releaseClaim },
      send
    })).resolves.toEqual({
      deliveryStatus: "skipped",
      channel: "none",
      businessDate: "2026-07-29",
      reason: "legacy_suppressed",
      deduplicated: true
    });

    expect(send).not.toHaveBeenCalled();
    expect(markSent).not.toHaveBeenCalled();
    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it("suppresses a retry when an earlier sender outcome is ambiguous", async () => {
    const send = vi.fn();
    await expect(deliverDailyNotificationOnce({
      runId: "run-in-flight",
      store: {
        claim: vi.fn().mockResolvedValue("delivery_outcome_unknown"),
        markSent: vi.fn(),
        releaseClaim: vi.fn()
      },
      send
    })).resolves.toMatchObject({
      deliveryStatus: "skipped",
      reason: "delivery_outcome_unknown",
      deduplicated: true
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("persists successful delivery before returning the sent result", async () => {
    const events: string[] = [];
    const delivery = {
      deliveryStatus: "sent" as const,
      channel: "email" as const,
      businessDate: "2026-07-30"
    };

    await expect(deliverDailyNotificationOnce({
      runId: "run-1",
      store: {
        claim: vi.fn().mockImplementation(async () => { events.push("claimed"); return "claimed"; }),
        markSent: vi.fn().mockImplementation(async () => { events.push("persisted"); }),
        releaseClaim: vi.fn()
      },
      send: vi.fn().mockImplementation(async () => {
        events.push("sent");
        return delivery;
      })
    })).resolves.toEqual(delivery);

    expect(events).toEqual(["claimed", "sent", "persisted"]);
  });

  it("retains the claim when the sender outcome is ambiguous", async () => {
    const releaseClaim = vi.fn();
    await expect(deliverDailyNotificationOnce({
      runId: "run-1",
      store: {
        claim: vi.fn().mockResolvedValue("claimed"),
        markSent: vi.fn(),
        releaseClaim
      },
      send: vi.fn().mockRejectedValue(new Error("connection ended after request upload"))
    })).rejects.toThrow("connection ended after request upload");

    expect(releaseClaim).not.toHaveBeenCalled();
  });

  it("releases only a no-attempt skip and keeps provider failures conservatively claimed", async () => {
    const markSent = vi.fn();
    const releaseClaim = vi.fn();
    for (const result of [
      { deliveryStatus: "failed" as const, channel: "none" as const, errorCategory: "delivery_failed" as const },
      { deliveryStatus: "skipped" as const, channel: "none" as const, reason: "configuration_incomplete" as const }
    ]) {
      await deliverDailyNotificationOnce({
        runId: "run-1",
        store: { claim: vi.fn().mockResolvedValue("claimed"), markSent, releaseClaim },
        send: vi.fn().mockResolvedValue(result)
      });
    }
    expect(markSent).not.toHaveBeenCalled();
    expect(releaseClaim).toHaveBeenCalledTimes(1);
  });
});
