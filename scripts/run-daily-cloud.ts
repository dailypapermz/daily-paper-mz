import { prisma } from "../src/db/prisma/client";
import { executeDailyJobCli } from "../src/jobs/daily-cli";
import { runDailyRecommendationJob } from "../src/jobs/daily-recommendation-pipeline";
import { createDailyRecommendationService } from "../src/modules/ranking/explain/factory";
import { createDailyIngestionService } from "../src/modules/ingestion";
import { buildDailyNotification, sendDailyNotification } from "./daily-notifier.mjs";

async function main(): Promise<void> {
  const exitCode = await executeDailyJobCli(process.argv.slice(2), {
    runPipeline: runDailyRecommendationJob,
    disconnect: () => prisma.$disconnect(),
    writeResult: (result) => console.log(JSON.stringify(result)),
    writeNotificationResult: (result) => console.log(JSON.stringify(result)),
    warn: (message) => console.warn(JSON.stringify({ level: "warn", message })),
    notify: async (pipeline) => {
      if (!pipeline.runId) {
        return { deliveryStatus: "skipped", channel: "none", reason: "configuration_incomplete" };
      }
      const persistedRun = await createDailyIngestionService().getRun(pipeline.runId);
      const feed = await createDailyRecommendationService().getDailyFeed({ runId: pipeline.runId });
      const notification = buildDailyNotification({
        pipelinePayload: { status: pipeline.status, result: pipeline },
        feed,
        dashboardUrl: process.env.NOTIFICATION_DASHBOARD_URL,
        businessDate: persistedRun?.runDate ?? pipeline.runDate
      });
      const delivery = await sendDailyNotification({ notification, env: process.env });
      if (delivery.status === "sent") {
        return {
          deliveryStatus: "sent",
          channel: delivery.channel,
          businessDate: notification.businessDate,
          recommendationCount: notification.recommendationCount,
          warningSummary: notification.warningSummary
        };
      }
      if (delivery.status === "skipped") {
        return {
          deliveryStatus: "skipped",
          channel: "none",
          businessDate: notification.businessDate,
          recommendationCount: notification.recommendationCount,
          warningSummary: notification.warningSummary,
          reason: "configuration_incomplete"
        };
      }
      return {
        deliveryStatus: "failed",
        channel: "none",
        businessDate: notification.businessDate,
        recommendationCount: notification.recommendationCount,
        warningSummary: notification.warningSummary,
        errorCategory: "delivery_failed"
      };
    }
  });

  process.exitCode = exitCode;
}

void main();
