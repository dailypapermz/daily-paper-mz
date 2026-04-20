import { createDailyRecommendationService } from "../ranking/explain";
import { DefaultObsidianExportService, getDefaultObsidianConfigFromEnv } from "./obsidian-export.service";

export function createObsidianExportService() {
  return new DefaultObsidianExportService(
    createDailyRecommendationService(),
    getDefaultObsidianConfigFromEnv()
  );
}
