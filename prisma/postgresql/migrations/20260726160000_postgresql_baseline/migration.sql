-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ZoteroSyncMode" AS ENUM ('FULL', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "ZoteroSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "CollectionPriority" AS ENUM ('PRIMARY', 'SECONDARY', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ResearchTypeCategory" AS ENUM ('METHOD', 'BIOLOGY', 'RESOURCE', 'BENCHMARK');

-- CreateEnum
CREATE TYPE "StructuredTagParseStatus" AS ENUM ('PARSED', 'PARTIAL', 'INVALID_CATEGORY', 'UNPARSED');

-- CreateEnum
CREATE TYPE "TagProvenance" AS ENUM ('ORIGINAL', 'GENERATED');

-- CreateEnum
CREATE TYPE "TagGenerationJobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "TagGenerationItemStatus" AS ENUM ('GENERATED', 'SKIPPED_UNAVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "ProfileSnapshotStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ProfileInterestSegment" AS ENUM ('RECENT_CORE', 'STABLE_LONG_TERM', 'BACKGROUND');

-- CreateEnum
CREATE TYPE "ProfileRepresentationSource" AS ENUM ('STRUCTURED_TAGS', 'TITLE_ABSTRACT');

-- CreateEnum
CREATE TYPE "ProfileRefreshTrigger" AS ENUM ('INITIAL', 'MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "ProfileRefreshJobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('BIORXIV', 'ARXIV', 'PUBMED', 'JOURNAL');

-- CreateEnum
CREATE TYPE "DailyIngestionRunSource" AS ENUM ('BIORXIV', 'ARXIV', 'PUBMED', 'JOURNAL', 'AGGREGATED');

-- CreateEnum
CREATE TYPE "DailyIngestionRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "DailyPipelineStage" AS ENUM ('INGESTION', 'ENRICHMENT', 'NORMALIZATION', 'REPRESENTATION', 'RECALL', 'RERANK', 'SUMMARY');

-- CreateEnum
CREATE TYPE "DailyPipelineStageStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "JournalEnrichmentStatus" AS ENUM ('ENRICHED', 'NOT_FOUND', 'FAILED');

-- CreateEnum
CREATE TYPE "CandidateMergeReason" AS ENUM ('DOI', 'TITLE_URL', 'TITLE', 'SOURCE_EXTERNAL_ID');

-- CreateEnum
CREATE TYPE "CandidateContentProvenance" AS ENUM ('GENERATED', 'USER_CORRECTED');

-- CreateEnum
CREATE TYPE "CandidateLabelType" AS ENUM ('CONTENT_RECALL', 'RESEARCH_TYPE');

-- CreateEnum
CREATE TYPE "RecallRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "RerankRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "FeedbackActionType" AS ENUM ('SAVE', 'DISMISS', 'PROMOTE', 'LABEL_EDIT', 'SUMMARY_EDIT');

-- CreateEnum
CREATE TYPE "FeedbackOrigin" AS ENUM ('WEB', 'OBSIDIAN');

-- CreateEnum
CREATE TYPE "FeedbackSignalPolarity" AS ENUM ('POSITIVE', 'NEGATIVE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "PaperIdentifierScheme" AS ENUM ('DOI', 'PMID', 'ARXIV', 'BIORXIV', 'TITLE');

-- CreateTable
CREATE TABLE "ZoteroSyncRun" (
    "id" TEXT NOT NULL,
    "mode" "ZoteroSyncMode" NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'web',
    "transportReason" TEXT,
    "status" "ZoteroSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "sinceVersion" INTEGER,
    "libraryVersion" INTEGER,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "collectionsCount" INTEGER NOT NULL DEFAULT 0,
    "mappingsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroItemRaw" (
    "id" TEXT NOT NULL,
    "zoteroItemKey" TEXT NOT NULL,
    "zoteroVersion" INTEGER,
    "title" TEXT,
    "abstractNote" TEXT,
    "dateAdded" TIMESTAMP(3),
    "rawTagsJson" JSONB,
    "rawCollectionsJson" JSONB,
    "sourcePayloadJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "libraryVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroItemRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroCollection" (
    "id" TEXT NOT NULL,
    "zoteroCollectionKey" TEXT NOT NULL,
    "zoteroVersion" INTEGER,
    "name" TEXT NOT NULL,
    "parentCollectionKey" TEXT,
    "path" TEXT,
    "sourcePayloadJson" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "libraryVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroItemCollection" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZoteroItemCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroItemTagSignal" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "attentionLevel" INTEGER NOT NULL DEFAULT 0,
    "rawStarTagsJson" JSONB,
    "otherTagsJson" JSONB,
    "parsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroItemTagSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroItemContentRecallTag" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "label" TEXT,
    "provenance" "TagProvenance" NOT NULL DEFAULT 'ORIGINAL',
    "generationJobId" TEXT,
    "parseStatus" "StructuredTagParseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroItemContentRecallTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroItemResearchTypeTag" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "rawTag" TEXT NOT NULL,
    "rawCategoryToken" TEXT,
    "category" "ResearchTypeCategory",
    "primaryKeyword" TEXT,
    "secondaryKeyword" TEXT,
    "provenance" "TagProvenance" NOT NULL DEFAULT 'ORIGINAL',
    "generationJobId" TEXT,
    "parseStatus" "StructuredTagParseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroItemResearchTypeTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroCollectionPrioritySelection" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "priority" "CollectionPriority" NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroCollectionPrioritySelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroCollectionEffectivePriority" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "priority" "CollectionPriority" NOT NULL,
    "isExplicitOverride" BOOLEAN NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroCollectionEffectivePriority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroTagGenerationJob" (
    "id" TEXT NOT NULL,
    "status" "TagGenerationJobStatus" NOT NULL DEFAULT 'RUNNING',
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "selectedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "missingItemsCount" INTEGER NOT NULL DEFAULT 0,
    "generatedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackItemsCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroTagGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoteroTagGenerationJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" "TagGenerationItemStatus" NOT NULL,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoteroTagGenerationJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSnapshot" (
    "id" TEXT NOT NULL,
    "status" "ProfileSnapshotStatus" NOT NULL DEFAULT 'ACTIVE',
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceLibraryVersion" INTEGER,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileFeedbackConsumption" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "feedbackLogId" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileFeedbackConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSnapshotFeedbackSignal" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceFeedbackLogId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "polarity" "FeedbackSignalPolarity" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "representationText" TEXT NOT NULL,
    "researchCategory" "ResearchTypeCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileSnapshotFeedbackSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSnapshotItemSignal" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "segment" "ProfileInterestSegment" NOT NULL,
    "finalWeight" DOUBLE PRECISION NOT NULL,
    "collectionWeight" DOUBLE PRECISION NOT NULL,
    "attentionWeight" DOUBLE PRECISION NOT NULL,
    "recencyWeight" DOUBLE PRECISION NOT NULL,
    "representationSource" "ProfileRepresentationSource" NOT NULL,
    "contentRecallLabel" TEXT,
    "researchCategory" "ResearchTypeCategory",
    "representationText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileSnapshotItemSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileSnapshotResearchTypePreference" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "category" "ResearchTypeCategory" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileSnapshotResearchTypePreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileRefreshJob" (
    "id" TEXT NOT NULL,
    "trigger" "ProfileRefreshTrigger" NOT NULL,
    "status" "ProfileRefreshJobStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "snapshotId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileRefreshJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileReminderCheck" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshAt" TIMESTAMP(3),
    "isDue" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileReminderCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyIngestionRun" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "source" "DailyIngestionRunSource" NOT NULL,
    "status" "DailyIngestionRunStatus" NOT NULL DEFAULT 'RUNNING',
    "runDate" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "candidatesCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyIngestionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceIngestionCursor" (
    "source" "CandidateSource" NOT NULL,
    "lastSuccessfulAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceIngestionCursor_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "SourceSeenItem" (
    "id" TEXT NOT NULL,
    "source" "CandidateSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceSeenItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPipelineStageRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "DailyPipelineStage" NOT NULL,
    "status" "DailyPipelineStageStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPipelineStageRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCandidate" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "source" "CandidateSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "abstractNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3),
    "url" TEXT,
    "doi" TEXT,
    "pmid" TEXT,
    "arxivId" TEXT,
    "bioRxivId" TEXT,
    "journalName" TEXT,
    "authorsJson" JSONB,
    "sourcePayloadJson" JSONB NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCanonicalCandidate" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT,
    "abstractNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "indexedAt" TIMESTAMP(3),
    "url" TEXT,
    "doi" TEXT,
    "pmid" TEXT,
    "arxivId" TEXT,
    "bioRxivId" TEXT,
    "journalName" TEXT,
    "authorsJson" JSONB,
    "mergedSourceCount" INTEGER NOT NULL DEFAULT 1,
    "sourceProvenanceJson" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "globalPaperId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCanonicalCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPaper" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "title" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalPaperIdentifier" (
    "id" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "scheme" "PaperIdentifierScheme" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalPaperIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextEmbeddingCache" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "vectorJson" JSONB NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextEmbeddingCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCanonicalCandidateProvenance" (
    "id" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "sourceCandidateId" TEXT NOT NULL,
    "source" "CandidateSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "mergeReason" "CandidateMergeReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCanonicalCandidateProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCandidateSummary" (
    "id" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "researchQuestion" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "mainFinding" TEXT NOT NULL,
    "relevanceToUser" TEXT NOT NULL,
    "provenance" "CandidateContentProvenance" NOT NULL DEFAULT 'GENERATED',
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCandidateSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCandidateStructuredLabel" (
    "id" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "labelType" "CandidateLabelType" NOT NULL,
    "contentRecallLabel" TEXT,
    "researchCategory" "ResearchTypeCategory",
    "primaryKeyword" TEXT,
    "secondaryKeyword" TEXT,
    "rawLabelText" TEXT,
    "provenance" "CandidateContentProvenance" NOT NULL DEFAULT 'GENERATED',
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCandidateStructuredLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecallRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "profileSnapshotId" TEXT NOT NULL,
    "status" "RecallRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "requestedTopN" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "recalledCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRecallRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecallResult" (
    "id" TEXT NOT NULL,
    "recallRunId" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "recallScore" DOUBLE PRECISION NOT NULL,
    "semanticScore" DOUBLE PRECISION NOT NULL,
    "denseSimilarityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feedbackAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tagOverlapScore" DOUBLE PRECISION NOT NULL,
    "researchTypeScore" DOUBLE PRECISION NOT NULL,
    "sourceScopeScore" DOUBLE PRECISION NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRecallResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRerankRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "recallRunId" TEXT NOT NULL,
    "profileSnapshotId" TEXT NOT NULL,
    "status" "RerankRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "requestedTopN" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "recommendedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRerankRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecommendationResult" (
    "id" TEXT NOT NULL,
    "rerankRunId" TEXT NOT NULL,
    "canonicalCandidateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "rawScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentile" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "featureCoverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recallScore" DOUBLE PRECISION NOT NULL,
    "recentCoreScore" DOUBLE PRECISION NOT NULL,
    "stableLongTermScore" DOUBLE PRECISION NOT NULL,
    "highAttentionScore" DOUBLE PRECISION NOT NULL,
    "contentTagScore" DOUBLE PRECISION NOT NULL,
    "researchTypeScore" DOUBLE PRECISION NOT NULL,
    "collectionWeightScore" DOUBLE PRECISION NOT NULL,
    "sourcePriorityScore" DOUBLE PRECISION NOT NULL,
    "journalQualityScore" DOUBLE PRECISION NOT NULL,
    "userCorrectedScore" DOUBLE PRECISION NOT NULL,
    "recencyScore" DOUBLE PRECISION NOT NULL,
    "reasonsJson" JSONB NOT NULL,
    "featureWeightsJson" JSONB NOT NULL,
    "featureAvailabilityJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyRecommendationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateFeedbackLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "actionType" "FeedbackActionType" NOT NULL,
    "origin" "FeedbackOrigin" NOT NULL DEFAULT 'WEB',
    "externalEventKey" TEXT,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateFeedbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObsidianPaperSyncState" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "notePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "desiredStatus" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "fileMtime" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObsidianPaperSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalFeedSource" (
    "id" TEXT NOT NULL,
    "journalName" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalFeedSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEnrichmentCache" (
    "id" TEXT NOT NULL,
    "journalName" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "quartile" TEXT,
    "impactScore" DOUBLE PRECISION,
    "rawPayloadJson" JSONB,
    "normalizedJson" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEnrichmentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCandidateJournalEnrichment" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "JournalEnrichmentStatus" NOT NULL,
    "quartile" TEXT,
    "impactScore" DOUBLE PRECISION,
    "rawPayloadJson" JSONB,
    "normalizedJson" JSONB,
    "errorMessage" TEXT,
    "enrichedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCandidateJournalEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ZoteroSyncRun_status_startedAt_idx" ON "ZoteroSyncRun"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemRaw_zoteroItemKey_key" ON "ZoteroItemRaw"("zoteroItemKey");

-- CreateIndex
CREATE INDEX "ZoteroItemRaw_syncedAt_idx" ON "ZoteroItemRaw"("syncedAt");

-- CreateIndex
CREATE INDEX "ZoteroItemRaw_libraryVersion_idx" ON "ZoteroItemRaw"("libraryVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroCollection_zoteroCollectionKey_key" ON "ZoteroCollection"("zoteroCollectionKey");

-- CreateIndex
CREATE INDEX "ZoteroCollection_parentCollectionKey_idx" ON "ZoteroCollection"("parentCollectionKey");

-- CreateIndex
CREATE INDEX "ZoteroCollection_syncedAt_idx" ON "ZoteroCollection"("syncedAt");

-- CreateIndex
CREATE INDEX "ZoteroItemCollection_itemId_idx" ON "ZoteroItemCollection"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemCollection_collectionId_idx" ON "ZoteroItemCollection"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemCollection_itemId_collectionId_key" ON "ZoteroItemCollection"("itemId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemTagSignal_itemId_key" ON "ZoteroItemTagSignal"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemTagSignal_attentionLevel_idx" ON "ZoteroItemTagSignal"("attentionLevel");

-- CreateIndex
CREATE INDEX "ZoteroItemContentRecallTag_itemId_idx" ON "ZoteroItemContentRecallTag"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemContentRecallTag_provenance_idx" ON "ZoteroItemContentRecallTag"("provenance");

-- CreateIndex
CREATE INDEX "ZoteroItemContentRecallTag_generationJobId_idx" ON "ZoteroItemContentRecallTag"("generationJobId");

-- CreateIndex
CREATE INDEX "ZoteroItemContentRecallTag_parseStatus_idx" ON "ZoteroItemContentRecallTag"("parseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemContentRecallTag_itemId_rawTag_key" ON "ZoteroItemContentRecallTag"("itemId", "rawTag");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_itemId_idx" ON "ZoteroItemResearchTypeTag"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_category_idx" ON "ZoteroItemResearchTypeTag"("category");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_provenance_idx" ON "ZoteroItemResearchTypeTag"("provenance");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_generationJobId_idx" ON "ZoteroItemResearchTypeTag"("generationJobId");

-- CreateIndex
CREATE INDEX "ZoteroItemResearchTypeTag_parseStatus_idx" ON "ZoteroItemResearchTypeTag"("parseStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroItemResearchTypeTag_itemId_rawTag_key" ON "ZoteroItemResearchTypeTag"("itemId", "rawTag");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroCollectionPrioritySelection_collectionId_key" ON "ZoteroCollectionPrioritySelection"("collectionId");

-- CreateIndex
CREATE INDEX "ZoteroCollectionPrioritySelection_priority_idx" ON "ZoteroCollectionPrioritySelection"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroCollectionEffectivePriority_collectionId_key" ON "ZoteroCollectionEffectivePriority"("collectionId");

-- CreateIndex
CREATE INDEX "ZoteroCollectionEffectivePriority_priority_idx" ON "ZoteroCollectionEffectivePriority"("priority");

-- CreateIndex
CREATE INDEX "ZoteroCollectionEffectivePriority_isExplicitOverride_idx" ON "ZoteroCollectionEffectivePriority"("isExplicitOverride");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJob_status_startedAt_idx" ON "ZoteroTagGenerationJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJobItem_jobId_idx" ON "ZoteroTagGenerationJobItem"("jobId");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJobItem_itemId_idx" ON "ZoteroTagGenerationJobItem"("itemId");

-- CreateIndex
CREATE INDEX "ZoteroTagGenerationJobItem_status_idx" ON "ZoteroTagGenerationJobItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ZoteroTagGenerationJobItem_jobId_itemId_key" ON "ZoteroTagGenerationJobItem"("jobId", "itemId");

-- CreateIndex
CREATE INDEX "ProfileSnapshot_status_builtAt_idx" ON "ProfileSnapshot"("status", "builtAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileFeedbackConsumption_feedbackLogId_key" ON "ProfileFeedbackConsumption"("feedbackLogId");

-- CreateIndex
CREATE INDEX "ProfileFeedbackConsumption_snapshotId_idx" ON "ProfileFeedbackConsumption"("snapshotId");

-- CreateIndex
CREATE INDEX "ProfileSnapshotFeedbackSignal_snapshotId_polarity_idx" ON "ProfileSnapshotFeedbackSignal"("snapshotId", "polarity");

-- CreateIndex
CREATE INDEX "ProfileSnapshotFeedbackSignal_candidateId_idx" ON "ProfileSnapshotFeedbackSignal"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSnapshotFeedbackSignal_snapshotId_sourceFeedbackLogI_key" ON "ProfileSnapshotFeedbackSignal"("snapshotId", "sourceFeedbackLogId");

-- CreateIndex
CREATE INDEX "ProfileSnapshotItemSignal_snapshotId_idx" ON "ProfileSnapshotItemSignal"("snapshotId");

-- CreateIndex
CREATE INDEX "ProfileSnapshotItemSignal_itemId_idx" ON "ProfileSnapshotItemSignal"("itemId");

-- CreateIndex
CREATE INDEX "ProfileSnapshotItemSignal_segment_idx" ON "ProfileSnapshotItemSignal"("segment");

-- CreateIndex
CREATE INDEX "ProfileSnapshotResearchTypePreference_snapshotId_idx" ON "ProfileSnapshotResearchTypePreference"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSnapshotResearchTypePreference_snapshotId_category_key" ON "ProfileSnapshotResearchTypePreference"("snapshotId", "category");

-- CreateIndex
CREATE INDEX "ProfileRefreshJob_status_startedAt_idx" ON "ProfileRefreshJob"("status", "startedAt");

-- CreateIndex
CREATE INDEX "ProfileRefreshJob_trigger_startedAt_idx" ON "ProfileRefreshJob"("trigger", "startedAt");

-- CreateIndex
CREATE INDEX "ProfileReminderCheck_checkedAt_idx" ON "ProfileReminderCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "ProfileReminderCheck_isDue_checkedAt_idx" ON "ProfileReminderCheck"("isDue", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyIngestionRun_requestKey_key" ON "DailyIngestionRun"("requestKey");

-- CreateIndex
CREATE INDEX "DailyIngestionRun_source_runDate_idx" ON "DailyIngestionRun"("source", "runDate");

-- CreateIndex
CREATE INDEX "DailyIngestionRun_status_startedAt_idx" ON "DailyIngestionRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "SourceSeenItem_source_firstSeenAt_idx" ON "SourceSeenItem"("source", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSeenItem_source_externalId_key" ON "SourceSeenItem"("source", "externalId");

-- CreateIndex
CREATE INDEX "DailyPipelineStageRun_runId_status_idx" ON "DailyPipelineStageRun"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyPipelineStageRun_runId_stage_key" ON "DailyPipelineStageRun"("runId", "stage");

-- CreateIndex
CREATE INDEX "DailyCandidate_runId_idx" ON "DailyCandidate"("runId");

-- CreateIndex
CREATE INDEX "DailyCandidate_source_publishedAt_idx" ON "DailyCandidate"("source", "publishedAt");

-- CreateIndex
CREATE INDEX "DailyCandidate_source_indexedAt_idx" ON "DailyCandidate"("source", "indexedAt");

-- CreateIndex
CREATE INDEX "DailyCandidate_doi_idx" ON "DailyCandidate"("doi");

-- CreateIndex
CREATE INDEX "DailyCandidate_pmid_idx" ON "DailyCandidate"("pmid");

-- CreateIndex
CREATE INDEX "DailyCandidate_arxivId_idx" ON "DailyCandidate"("arxivId");

-- CreateIndex
CREATE INDEX "DailyCandidate_bioRxivId_idx" ON "DailyCandidate"("bioRxivId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidate_runId_source_externalId_key" ON "DailyCandidate"("runId", "source", "externalId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidate_runId_idx" ON "DailyCanonicalCandidate"("runId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidate_doi_idx" ON "DailyCanonicalCandidate"("doi");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidate_contentHash_idx" ON "DailyCanonicalCandidate"("contentHash");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidate_globalPaperId_idx" ON "DailyCanonicalCandidate"("globalPaperId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCanonicalCandidate_runId_canonicalKey_key" ON "DailyCanonicalCandidate"("runId", "canonicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPaper_identityKey_key" ON "GlobalPaper"("identityKey");

-- CreateIndex
CREATE INDEX "GlobalPaperIdentifier_paperId_idx" ON "GlobalPaperIdentifier"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalPaperIdentifier_scheme_value_key" ON "GlobalPaperIdentifier"("scheme", "value");

-- CreateIndex
CREATE UNIQUE INDEX "TextEmbeddingCache_model_textHash_key" ON "TextEmbeddingCache"("model", "textHash");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCanonicalCandidateProvenance_sourceCandidateId_key" ON "DailyCanonicalCandidateProvenance"("sourceCandidateId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidateProvenance_canonicalCandidateId_idx" ON "DailyCanonicalCandidateProvenance"("canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyCanonicalCandidateProvenance_source_mergeReason_idx" ON "DailyCanonicalCandidateProvenance"("source", "mergeReason");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidateSummary_canonicalCandidateId_key" ON "DailyCandidateSummary"("canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyCandidateSummary_provenance_idx" ON "DailyCandidateSummary"("provenance");

-- CreateIndex
CREATE INDEX "DailyCandidateStructuredLabel_canonicalCandidateId_idx" ON "DailyCandidateStructuredLabel"("canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyCandidateStructuredLabel_provenance_labelType_idx" ON "DailyCandidateStructuredLabel"("provenance", "labelType");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidateStructuredLabel_canonicalCandidateId_labelTyp_key" ON "DailyCandidateStructuredLabel"("canonicalCandidateId", "labelType");

-- CreateIndex
CREATE INDEX "DailyRecallRun_runId_startedAt_idx" ON "DailyRecallRun"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRecallRun_status_startedAt_idx" ON "DailyRecallRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRecallResult_recallRunId_rank_idx" ON "DailyRecallResult"("recallRunId", "rank");

-- CreateIndex
CREATE INDEX "DailyRecallResult_selected_recallScore_idx" ON "DailyRecallResult"("selected", "recallScore");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecallResult_recallRunId_canonicalCandidateId_key" ON "DailyRecallResult"("recallRunId", "canonicalCandidateId");

-- CreateIndex
CREATE INDEX "DailyRerankRun_runId_startedAt_idx" ON "DailyRerankRun"("runId", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRerankRun_status_startedAt_idx" ON "DailyRerankRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "DailyRecommendationResult_rerankRunId_rank_idx" ON "DailyRecommendationResult"("rerankRunId", "rank");

-- CreateIndex
CREATE INDEX "DailyRecommendationResult_selected_finalScore_idx" ON "DailyRecommendationResult"("selected", "finalScore");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecommendationResult_rerankRunId_canonicalCandidateId_key" ON "DailyRecommendationResult"("rerankRunId", "canonicalCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateFeedbackLog_externalEventKey_key" ON "CandidateFeedbackLog"("externalEventKey");

-- CreateIndex
CREATE INDEX "CandidateFeedbackLog_runId_createdAt_idx" ON "CandidateFeedbackLog"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateFeedbackLog_candidateId_actionType_createdAt_idx" ON "CandidateFeedbackLog"("candidateId", "actionType", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateFeedbackLog_origin_createdAt_idx" ON "CandidateFeedbackLog"("origin", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ObsidianPaperSyncState_candidateId_key" ON "ObsidianPaperSyncState"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "ObsidianPaperSyncState_notePath_key" ON "ObsidianPaperSyncState"("notePath");

-- CreateIndex
CREATE INDEX "ObsidianPaperSyncState_runId_status_idx" ON "ObsidianPaperSyncState"("runId", "status");

-- CreateIndex
CREATE INDEX "ObsidianPaperSyncState_lastSyncedAt_idx" ON "ObsidianPaperSyncState"("lastSyncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalFeedSource_feedUrl_key" ON "JournalFeedSource"("feedUrl");

-- CreateIndex
CREATE INDEX "JournalFeedSource_journalName_idx" ON "JournalFeedSource"("journalName");

-- CreateIndex
CREATE INDEX "JournalFeedSource_isActive_idx" ON "JournalFeedSource"("isActive");

-- CreateIndex
CREATE INDEX "JournalEnrichmentCache_provider_expiresAt_idx" ON "JournalEnrichmentCache"("provider", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEnrichmentCache_journalName_provider_key" ON "JournalEnrichmentCache"("journalName", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCandidateJournalEnrichment_candidateId_key" ON "DailyCandidateJournalEnrichment"("candidateId");

-- CreateIndex
CREATE INDEX "DailyCandidateJournalEnrichment_provider_status_idx" ON "DailyCandidateJournalEnrichment"("provider", "status");

-- CreateIndex
CREATE INDEX "DailyCandidateJournalEnrichment_enrichedAt_idx" ON "DailyCandidateJournalEnrichment"("enrichedAt");

-- AddForeignKey
ALTER TABLE "ZoteroItemCollection" ADD CONSTRAINT "ZoteroItemCollection_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroItemCollection" ADD CONSTRAINT "ZoteroItemCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ZoteroCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroItemTagSignal" ADD CONSTRAINT "ZoteroItemTagSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroItemContentRecallTag" ADD CONSTRAINT "ZoteroItemContentRecallTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroItemContentRecallTag" ADD CONSTRAINT "ZoteroItemContentRecallTag_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "ZoteroTagGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroItemResearchTypeTag" ADD CONSTRAINT "ZoteroItemResearchTypeTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroItemResearchTypeTag" ADD CONSTRAINT "ZoteroItemResearchTypeTag_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "ZoteroTagGenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroCollectionPrioritySelection" ADD CONSTRAINT "ZoteroCollectionPrioritySelection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ZoteroCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroCollectionEffectivePriority" ADD CONSTRAINT "ZoteroCollectionEffectivePriority_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ZoteroCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroTagGenerationJobItem" ADD CONSTRAINT "ZoteroTagGenerationJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ZoteroTagGenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoteroTagGenerationJobItem" ADD CONSTRAINT "ZoteroTagGenerationJobItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFeedbackConsumption" ADD CONSTRAINT "ProfileFeedbackConsumption_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFeedbackConsumption" ADD CONSTRAINT "ProfileFeedbackConsumption_feedbackLogId_fkey" FOREIGN KEY ("feedbackLogId") REFERENCES "CandidateFeedbackLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSnapshotFeedbackSignal" ADD CONSTRAINT "ProfileSnapshotFeedbackSignal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSnapshotItemSignal" ADD CONSTRAINT "ProfileSnapshotItemSignal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSnapshotItemSignal" ADD CONSTRAINT "ProfileSnapshotItemSignal_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ZoteroItemRaw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileSnapshotResearchTypePreference" ADD CONSTRAINT "ProfileSnapshotResearchTypePreference_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileRefreshJob" ADD CONSTRAINT "ProfileRefreshJob_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPipelineStageRun" ADD CONSTRAINT "DailyPipelineStageRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCandidate" ADD CONSTRAINT "DailyCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCanonicalCandidate" ADD CONSTRAINT "DailyCanonicalCandidate_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCanonicalCandidate" ADD CONSTRAINT "DailyCanonicalCandidate_globalPaperId_fkey" FOREIGN KEY ("globalPaperId") REFERENCES "GlobalPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlobalPaperIdentifier" ADD CONSTRAINT "GlobalPaperIdentifier_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "GlobalPaper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCanonicalCandidateProvenance" ADD CONSTRAINT "DailyCanonicalCandidateProvenance_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCanonicalCandidateProvenance" ADD CONSTRAINT "DailyCanonicalCandidateProvenance_sourceCandidateId_fkey" FOREIGN KEY ("sourceCandidateId") REFERENCES "DailyCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCandidateSummary" ADD CONSTRAINT "DailyCandidateSummary_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCandidateStructuredLabel" ADD CONSTRAINT "DailyCandidateStructuredLabel_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecallRun" ADD CONSTRAINT "DailyRecallRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecallRun" ADD CONSTRAINT "DailyRecallRun_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecallResult" ADD CONSTRAINT "DailyRecallResult_recallRunId_fkey" FOREIGN KEY ("recallRunId") REFERENCES "DailyRecallRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecallResult" ADD CONSTRAINT "DailyRecallResult_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRerankRun" ADD CONSTRAINT "DailyRerankRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRerankRun" ADD CONSTRAINT "DailyRerankRun_recallRunId_fkey" FOREIGN KEY ("recallRunId") REFERENCES "DailyRecallRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRerankRun" ADD CONSTRAINT "DailyRerankRun_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "ProfileSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecommendationResult" ADD CONSTRAINT "DailyRecommendationResult_rerankRunId_fkey" FOREIGN KEY ("rerankRunId") REFERENCES "DailyRerankRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecommendationResult" ADD CONSTRAINT "DailyRecommendationResult_canonicalCandidateId_fkey" FOREIGN KEY ("canonicalCandidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFeedbackLog" ADD CONSTRAINT "CandidateFeedbackLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateFeedbackLog" ADD CONSTRAINT "CandidateFeedbackLog_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObsidianPaperSyncState" ADD CONSTRAINT "ObsidianPaperSyncState_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DailyCanonicalCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObsidianPaperSyncState" ADD CONSTRAINT "ObsidianPaperSyncState_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DailyIngestionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCandidateJournalEnrichment" ADD CONSTRAINT "DailyCandidateJournalEnrichment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DailyCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
