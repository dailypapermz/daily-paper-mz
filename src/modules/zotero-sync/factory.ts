import { EnvValidationError, getEnv } from "../../lib/config";
import { prisma } from "../../db/prisma/client";
import { PrismaZoteroSyncRepository } from "../../db/repositories";
import { HttpZoteroClient } from "./zotero-client";
import { DefaultZoteroSyncService } from "./zotero-sync.service";

export function createZoteroSyncService() {
  const env = getEnv();
  const userId = env.ZOTERO_ID;
  const apiKey = env.ZOTERO_KEY;

  if (!userId || !apiKey) {
    const missingKeys: string[] = [];
    if (!userId) missingKeys.push("ZOTERO_ID");
    if (!apiKey) missingKeys.push("ZOTERO_KEY");
    throw new EnvValidationError(missingKeys);
  }

  const client = new HttpZoteroClient({
    userId,
    apiKey
  });
  const repository = new PrismaZoteroSyncRepository(prisma);

  return new DefaultZoteroSyncService(client, repository);
}
