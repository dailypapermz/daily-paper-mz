import type {
  DailyRecommendationFeed,
  RecommendationSourceValue
} from "../ranking/explain/types";

export type ObsidianExportConfig = {
  vaultPath: string;
  dailyDir: string;
  papersDir: string;
};

export type ObsidianExportRequest = Partial<ObsidianExportConfig> & {
  runId?: string;
  selectedOnly?: boolean;
  source?: RecommendationSourceValue;
};

export type ObsidianExportResult = {
  runId: string;
  dailyNotePath: string;
  paperNotePaths: string[];
  recommendationCount: number;
};

export interface ObsidianRecommendationFeedProvider {
  getDailyFeed(input?: {
    runId?: string;
    selectedOnly?: boolean;
    source?: RecommendationSourceValue;
  }): Promise<DailyRecommendationFeed | null>;
}

export interface ObsidianExportService {
  exportDailyRecommendations(input?: ObsidianExportRequest): Promise<ObsidianExportResult>;
}
