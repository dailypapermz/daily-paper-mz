import { prisma } from "../src/db/prisma/client";
import { executeDailyJobCli } from "../src/jobs/daily-cli";
import { runDailyRecommendationJob } from "../src/jobs/daily-recommendation-pipeline";

const exitCode = await executeDailyJobCli(process.argv.slice(2), {
  runPipeline: runDailyRecommendationJob,
  disconnect: () => prisma.$disconnect(),
  writeResult: (result) => console.log(JSON.stringify(result))
});

process.exitCode = exitCode;
