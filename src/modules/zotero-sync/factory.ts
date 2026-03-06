import { getEnv } from "../../lib/config";
import { prisma } from "../../db/prisma/client";
import { PrismaZoteroSyncRepository } from "../../db/repositories";
import { HttpZoteroClient } from "./zotero-client";
import { DefaultZoteroSyncService } from "./zotero-sync.service";

export function createZoteroSyncService() {
  const env = getEnv();
  const client = new HttpZoteroClient({
    userId: env.ZOTERO_ID,
    apiKey: env.ZOTERO_KEY
  });
  const repository = new PrismaZoteroSyncRepository(prisma);

  return new DefaultZoteroSyncService(client, repository);
}
