import type { PrismaClient } from "../../generated/prisma";
import type { JournalFeedSourceRecord } from "../../modules/ingestion/types";

export class PrismaJournalFeedRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsertFeeds(
    feeds: Array<{
      journalName: string;
      feedUrl: string;
      isActive?: boolean;
    }>
  ): Promise<JournalFeedSourceRecord[]> {
    for (const feed of feeds) {
      await this.db.journalFeedSource.upsert({
        where: {
          feedUrl: feed.feedUrl
        },
        create: {
          journalName: feed.journalName,
          feedUrl: feed.feedUrl,
          isActive: feed.isActive ?? true
        },
        update: {
          journalName: feed.journalName,
          isActive: feed.isActive ?? true
        }
      });
    }

    return this.listFeeds();
  }

  async listFeeds(): Promise<JournalFeedSourceRecord[]> {
    const rows = await this.db.journalFeedSource.findMany({
      orderBy: [{ journalName: "asc" }, { createdAt: "desc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      journalName: row.journalName,
      feedUrl: row.feedUrl,
      isActive: row.isActive
    }));
  }

  async listActiveFeeds(): Promise<JournalFeedSourceRecord[]> {
    const rows = await this.db.journalFeedSource.findMany({
      where: {
        isActive: true
      },
      orderBy: [{ journalName: "asc" }, { createdAt: "desc" }]
    });

    return rows.map((row) => ({
      id: row.id,
      journalName: row.journalName,
      feedUrl: row.feedUrl,
      isActive: row.isActive
    }));
  }
}
