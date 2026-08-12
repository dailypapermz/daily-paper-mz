# Daily Paper integrated architecture

This document describes only the implementation present at `origin/master@4b137ec96fdcd9e63574d497efbf64707c8a2a65`. Historical designs and experimental workspaces are not architecture evidence. If this document conflicts with a later verified `origin/master`, the code wins and Statekeeper must reconcile the document.

## System topology

Daily Paper is a single-user literature-triage application with two coupled data flows:

```text
Zotero sync → collection priority + tag semantics → profile snapshot
                                                        ↓
source retrieval → enrichment → normalize/dedup → labels → profile refresh
                                                        ↓
                                      recall → rerank → summaries
                                                        ↓
                              persisted feed → notification/dashboard
                                                        ↓
                                      feedback → later profile refresh
```

The profile and daily pipelines remain separate services. The daily pipeline now performs a scheduled profile refresh immediately before recall so prior feedback and current Zotero state are bound to the recall snapshot.

## Source retrieval and candidate freshness

`src/modules/scheduler/daily-pipeline.ts::runDailyRecommendationPipeline` invokes `src/modules/ingestion/factory.ts::createDailyIngestionService`. The default aggregate run includes bioRxiv, arXiv, PubMed, and configured journal feeds.

`DefaultDailyIngestionService::runAggregatedIngestion` fetches configured sources concurrently and isolates per-source failures. At least one successful source can produce a partial ingestion stage and allow the pipeline to continue.

Freshness is source-specific rather than one universal publication-date rule:

- PubMed uses the requested UTC day and prefers indexed/EDAT evidence.
- arXiv uses configured category scopes and watermark/date-range retrieval with bounded paging and retry handling.
- bioRxiv and journal feeds use persistent first-seen/cursor state with bounded overlap for initial or recovery intake.

`src/modules/ingestion/new-today.ts::resolveUtcDayWindow` resolves an explicit UTC business date; without one it selects the previous UTC day. Adapters normalize external identifiers and basic metadata before persistence.

## Enrichment, normalization, and representation

`DefaultJournalEnrichmentService::enrichRun` adds journal metadata through the configured enrichment provider and cache. Entry-level failures make the stage partial rather than discarding all candidates.

`DefaultCandidateNormalizationService::runForIngestionRun` groups records by DOI, normalized title/URL, normalized title, then source/external ID. It selects a richer canonical record and retains merged source provenance.

`DefaultCandidateOutputService::generateLabelsForRun` creates structured content-recall and research-type labels. After ranking, `generateSummariesForRun({ selectedOnly: true, limit: 20 })` generates four-field output only for selected recommendations. Provider failure and user-corrected content have explicit persistence states.

## Zotero profile construction

The profile flow comprises:

- `src/modules/zotero-sync/**`: Zotero item and collection synchronization.
- `src/modules/collections/**`: primary, secondary, and excluded collection boundaries with inherited priorities and child overrides.
- `src/modules/tagging/tag-parser.ts::parseZoteroTagSemantics`: Unicode star attention (`⭐` or `★`), structured `#` content tags, and other tags.
- `src/modules/profile-build/profile-build.service.ts::DefaultProfileBuildService.buildSnapshot`: immutable active profile snapshots.

Only items in effective primary or secondary collections are eligible. Primary collection weight is 1.0 and secondary is 0.7. Attention weight is `1 + attentionLevel × 0.6`; recency contributes a smaller tiered component. Items are divided into recent-core, stable-long-term, and background segments. Structured tags are preferred as item representation, with title/abstract fallback.

`ProfileRefreshService::runScheduledRefresh` runs at the recall stage of the daily pipeline. The resulting snapshot ID is passed to recall, preventing recall from silently using a different active snapshot.

## Recall and rerank

`src/modules/ranking/recall/recall-ranking.service.ts::DefaultRecallRankingService.runRecall` selects up to 100 candidates. The integrated implementation is lexical and explainable: it combines token/profile overlap, content-tag overlap, research-type preference, source scope, profile-conditioned topic alignment, context penalties, and bounded dismiss similarity penalties. The stored field named `semanticScore` is currently token overlap, not embedding inference.

`src/modules/ranking/rerank/rerank.service.ts::DefaultRerankService.runRerank` selects up to 20. It combines recall, recent/stable/high-attention profile overlap, labels, research type, collection/source/journal signals, recency, and user-corrected output. It persists final score, feature values/weights, and reason codes. The dismiss penalty is already reflected in recall; rerank records that reason without applying the penalty twice.

BM25, dense embeddings, hybrid fusion, retrieval evaluation, global paper identity, and archive-only candidate-quality logic are not part of this integrated architecture.

## Feedback and learning loop

`src/app/api/feedback/actions/route.ts` records save, dismiss, and promote actions. `src/app/api/candidates/content/route.ts` persists label or summary corrections and corresponding feedback logs. The dashboard folds the latest action for a run and hides dismissed cards.

At profile refresh:

- the latest triage action per paper identity produces bounded negative signals when it is dismiss;
- a later save/promote cancels that dismiss state;
- label edits can boost research-category preferences for the refresh interval; and
- feedback metadata and bounded negative representations are stored in the profile summary.

Save/promote do not currently provide a direct positive ranking weight. Summary edits, click/read behavior, and keyword hints are not an online learning model.

## Daily orchestration and stage recovery

The persisted stage order is:

```text
ingestion → enrichment → normalization → representation
→ profile refresh + recall → rerank → summary
```

`src/modules/pipeline-status/**` stores stage outcomes and finds the first incomplete stage for resume. Ingestion and enrichment may be partial warnings; downstream failures remain recoverable. Attempt fencing prevents a stale runner from writing after another attempt acquires the same business run.

The business request key is derived from sorted sources and UTC business date. A unique key, persisted attempt/lease state, stage rows, and stable rerank request key provide business idempotency. GitHub Actions concurrency is an additional queue, not the final idempotency boundary.

## Persistence boundaries

Local and Cloud modes have independent Prisma roots:

| Mode | Schema | Migration history | Runtime |
|---|---|---|---|
| Local | `prisma/schema.prisma` | `prisma/migrations/**` | SQLite and local generated client |
| Cloud | `prisma/postgresql/schema.prisma` | `prisma/postgresql/migrations/**` | PostgreSQL/Neon and cloud/Worker clients |

Changing only `DATABASE_URL` does not switch schema providers. Applied migrations are append-only operational history; production uses `prisma migrate deploy`, never `migrate dev`.

## Scheduling and production execution

`.github/workflows/daily.yml` is both the native scheduled path and guarded manual fallback. It validates the UTC business date, checks persisted state before migrations, conditionally deploys PostgreSQL migrations, then runs `scripts/run-daily-cloud.ts`. Its concurrency group includes the business date and does not cancel an active run.

`wrangler.jsonc` configures a Cloudflare Cron. `custom-worker.ts::scheduled` calls `src/cloudflare/daily-scheduler.ts::handleDailySchedule`, which dispatches the same GitHub workflow at `master` with an explicit business date, a bounded timeout, sanitized logging, and no Cloudflare automatic retry. The GitHub native schedule is the second clock into the same persisted execution path.

The repository proves both paths are integrated. Actual Cloudflare deployment and successful dispatch require external runtime evidence and are currently `UNKNOWN` in `docs/PROJECT_STATE.md`.

## Notification and dashboard

After a persisted run, `scripts/run-daily-cloud.ts` builds the recommendation notification. `scripts/daily-notifier.mjs` prefers WeCom and falls back to SMTP. Notification failure does not roll back the recommendation run.

Delivery is claimed atomically. `SENT` and legacy-suppressed runs are not resent; `SENDING` represents an ambiguous outcome and is conservatively blocked from automatic duplication. A configuration skip releases its claim, while a provider failure retains the ambiguous state for operator reconciliation.

The Next.js dashboard reads the latest persisted feed. In Cloud Mode, OpenNext runs it in a Cloudflare Worker protected by Cloudflare Access, while GitHub Actions performs long-running daily work directly against PostgreSQL.

## Architectural invariants

- The verified `origin/master` implementation is authoritative over historical architecture prose.
- Profile construction and daily retrieval remain separate domain services.
- Collection selection is a profile boundary, not merely a ranking hint.
- Source freshness is explicit and source-specific.
- Recall and rerank are separate, persisted, explainable stages.
- User-corrected content is not silently overwritten.
- SQLite and PostgreSQL schemas/migrations remain independent and must be checked for intended parity.
- The Worker does not run migrations or the long daily pipeline.
- Production and user-data mutations require explicit authorization.
