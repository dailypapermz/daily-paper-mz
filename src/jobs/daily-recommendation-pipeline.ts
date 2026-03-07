import { runDailyRecommendationPipeline } from "../modules/scheduler";

export async function runDailyRecommendationJob(input?: {
  runDate?: string;
  sources?: Array<"biorxiv" | "arxiv" | "pubmed" | "journal">;
}) {
  return runDailyRecommendationPipeline(input);
}
