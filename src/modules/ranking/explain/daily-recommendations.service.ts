import type {
  DailyRecommendationFeed,
  DailyRecommendationRepository,
  DailyRecommendationService
} from "./types";

export class DefaultDailyRecommendationService implements DailyRecommendationService {
  constructor(private readonly repository: DailyRecommendationRepository) {}

  async getDailyFeed(input?: {
    runId?: string;
    selectedOnly?: boolean;
    source?: "biorxiv" | "arxiv" | "pubmed" | "journal";
  }): Promise<DailyRecommendationFeed | null> {
    const feed = await this.repository.getLatestFeed(input?.runId);
    if (!feed) {
      return null;
    }

    const selectedOnly = input?.selectedOnly ?? true;
    const source = input?.source;

    const filtered = feed.recommendations.filter((recommendation) => {
      if (selectedOnly && !recommendation.selected) {
        return false;
      }
      if (source && !recommendation.sources.includes(source)) {
        return false;
      }
      return true;
    });

    return {
      ...feed,
      recommendations: filtered
    };
  }
}
