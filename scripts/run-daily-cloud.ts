import { prisma } from "../src/db/prisma/client";
import { executeDailyJobCli } from "../src/jobs/daily-cli";
import { runDailyRecommendationJob } from "../src/jobs/daily-recommendation-pipeline";
import { createDailyRecommendationService } from "../src/modules/ranking/explain/factory";
import { buildDailyNotification, sendDailyNotification } from "./daily-notifier.mjs";

const exitCode = await executeDailyJobCli(process.argv.slice(2), {
  runPipeline: runDailyRecommendationJob,
  disconnect: () => prisma.$disconnect(),
  writeResult: (result) => console.log(JSON.stringify(result)),
  warn: (message) => console.warn(JSON.stringify({ level: "warn", message })),
  notify: async (pipeline) => {
    if (!pipeline.runId) return;
    const feed = await createDailyRecommendationService().getDailyFeed({ runId: pipeline.runId });
    const notification = buildDailyNotification({
      pipelinePayload: { status: pipeline.status, result: pipeline },
      feed,
      dashboardUrl: process.env.NOTIFICATION_DASHBOARD_URL
    });
    const delivery = await sendDailyNotification({ notification, env: process.env });
    if (delivery.status === "failed") {
      console.warn(JSON.stringify({
        level: "warn",
        message: "Optional daily notification channels failed",
        channels: delivery.attempts.map((attempt) => attempt.channel)
      }));
    }
  }
});

process.exitCode = exitCode;
