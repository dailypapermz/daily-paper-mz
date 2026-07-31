import type { DailyNotificationDeliveryStore } from "./daily-notification-delivery";

type PersistedDeliveryStatus = "SENDING" | "SENT" | "LEGACY_SUPPRESSED";
type PersistedDeliveryChannel = "WECOM" | "EMAIL";

export type DailyNotificationStoreDatabase = {
  dailyIngestionRun: {
    updateMany(input: {
      where: {
        id: string;
        notificationDeliveryStatus: PersistedDeliveryStatus | null;
      };
      data: {
        notificationDeliveryStatus: PersistedDeliveryStatus | null;
        notificationChannel?: PersistedDeliveryChannel | null;
        notificationSentAt?: Date | null;
      };
    }): Promise<{ count: number }>;
    findUnique(input: {
      where: { id: string };
      select: { notificationDeliveryStatus: true };
    }): Promise<{ notificationDeliveryStatus: PersistedDeliveryStatus | null } | null>;
  };
};

export function createPrismaDailyNotificationStore(
  db: DailyNotificationStoreDatabase,
  runId: string
): DailyNotificationDeliveryStore {
  return {
    claim: async () => {
      const claimed = await db.dailyIngestionRun.updateMany({
        where: { id: runId, notificationDeliveryStatus: null },
        data: { notificationDeliveryStatus: "SENDING" }
      });
      if (claimed.count === 1) return "claimed";

      const current = await db.dailyIngestionRun.findUnique({
        where: { id: runId },
        select: { notificationDeliveryStatus: true }
      });
      if (current?.notificationDeliveryStatus === "SENT") return "already_sent";
      if (current?.notificationDeliveryStatus === "LEGACY_SUPPRESSED") return "legacy_suppressed";
      if (current?.notificationDeliveryStatus === "SENDING") return "delivery_outcome_unknown";
      throw new Error("Daily notification run is missing or could not be claimed");
    },
    markSent: async ({ channel }) => {
      const updated = await db.dailyIngestionRun.updateMany({
        where: { id: runId, notificationDeliveryStatus: "SENDING" },
        data: {
          notificationDeliveryStatus: "SENT",
          notificationChannel: channel === "email" ? "EMAIL" : "WECOM",
          notificationSentAt: new Date()
        }
      });
      if (updated.count !== 1) {
        throw new Error("Daily notification delivery claim was lost before SENT persistence");
      }
    },
    releaseClaim: async () => {
      await db.dailyIngestionRun.updateMany({
        where: { id: runId, notificationDeliveryStatus: "SENDING" },
        data: {
          notificationDeliveryStatus: null,
          notificationChannel: null,
          notificationSentAt: null
        }
      });
    }
  };
}
