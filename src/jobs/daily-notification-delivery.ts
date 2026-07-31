import type { DailyNotificationDeliverySummary } from "./daily-cli";

export type DailyNotificationDeliveryStore = {
  claim(runId: string): Promise<"claimed" | "already_sent" | "legacy_suppressed" | "delivery_outcome_unknown">;
  markSent(input: { runId: string; channel: "wecom" | "email" }): Promise<void>;
  releaseClaim(runId: string): Promise<void>;
};

export async function deliverDailyNotificationOnce(input: {
  runId: string;
  businessDate?: string;
  store: DailyNotificationDeliveryStore;
  send(): Promise<DailyNotificationDeliverySummary>;
}): Promise<DailyNotificationDeliverySummary> {
  const claim = await input.store.claim(input.runId);
  if (claim !== "claimed") {
    return {
      deliveryStatus: "skipped",
      channel: "none",
      businessDate: input.businessDate,
      reason: claim,
      deduplicated: true
    };
  }

  const delivery = await input.send();
  if (delivery.deliveryStatus === "sent") {
    if (delivery.channel !== "wecom" && delivery.channel !== "email") {
      throw new Error("A sent daily notification must identify its delivery channel");
    }
    await input.store.markSent({ runId: input.runId, channel: delivery.channel });
  } else if (delivery.deliveryStatus === "skipped") {
    await input.store.releaseClaim(input.runId);
  }
  return delivery;
}
