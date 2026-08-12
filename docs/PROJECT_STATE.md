# Daily Paper project state

This is the canonical current-state ledger. It records verified integrated code separately from production status. Current integrated implementation is determined from the latest remote `origin/master`; workspaces, local branches, draft pull requests, archived experiments, and prior conversations are not integration evidence.

## Baseline

| Field | Value |
|---|---|
| Authoritative branch | `origin/master` |
| Authoritative SHA | `4b137ec96fdcd9e63574d497efbf64707c8a2a65` |
| Last verified | `2026-08-12T21:15:09+08:00` |
| GitHub repository | `linyuan701/daily-paper` |
| Verification evidence | Remote ref, current master code, merged pull requests, and GitHub Actions records |

Lifecycle values are `PLANNED`, `EXPERIMENTAL`, `IN DEVELOPMENT`, and `INTEGRATED`. Production values are `NOT_APPLICABLE`, `NOT_DEPLOYED`, `DEPLOYED`, `DEGRADED`, `ROLLED_BACK`, and `UNKNOWN`.

## Integrated capability inventory

| Capability | Lifecycle | Production | Evidence |
|---|---|---|---|
| Agent Operating Model v1, persistent Coordinator/Reviewer/Statekeeper roles, and canonical project documentation | `INTEGRATED` | `NOT_APPLICABLE` | [PR #40](https://github.com/linyuan701/daily-paper/pull/40), merge `4b137ec96fdcd9e63574d497efbf64707c8a2a65`, `AGENTS.md`, `.codex/config.toml`, `.codex/agents/**`, and the four canonical documents |
| Zotero sync, collection priorities, and tag semantics | `INTEGRATED` | `UNKNOWN` | `src/modules/zotero-sync/**`, `src/modules/collections/**`, `src/modules/tagging/**`; no current sync-run evidence inspected |
| Profile snapshots and daily pre-recall refresh | `INTEGRATED` | `DEPLOYED` as part of the cloud daily path | `src/modules/profile-build/**`, `src/modules/scheduler/daily-pipeline.ts`; PR #39 and successful daily runs |
| Four-source daily ingestion with source-specific freshness and partial-source isolation | `INTEGRATED` | `DEGRADED` | `src/modules/ingestion/**`; latest run completed but reported arXiv failure |
| Journal enrichment, normalization, and canonical deduplication | `INTEGRATED` | `DEPLOYED` as part of the daily path | `src/modules/candidate-enrich/**`, `src/modules/normalize-dedupe/**` |
| Structured candidate labels and selected top-20 summaries | `INTEGRATED` | `DEPLOYED` as part of the daily path | `src/modules/summary/**`, `src/modules/scheduler/daily-pipeline.ts` |
| Profile-conditioned lexical recall, explainable rerank, and bounded dismiss penalties | `INTEGRATED` | `DEPLOYED` as part of the daily path | `src/modules/ranking/**`, `src/modules/feedback/negative-feedback.ts`; PRs #36, #37, #39 |
| SQLite Local Mode and independent PostgreSQL Cloud Mode persistence | `INTEGRATED` | PostgreSQL path `DEPLOYED`; Local Mode runtime status `UNKNOWN` | `prisma/schema.prisma`, `prisma/postgresql/schema.prisma`, `src/db/**` |
| Persisted stage recovery, request-key idempotency, lease fencing, and guarded manual fallback | `INTEGRATED` | `DEPLOYED` | `src/modules/pipeline-status/**`, ingestion repositories, `.github/workflows/daily.yml`; PRs #29 and #30 |
| GitHub scheduled/manual daily execution | `INTEGRATED` | `DEPLOYED` | `.github/workflows/daily.yml`; Actions run #31557628680 |
| Notification claim/deduplication with WeCom-first and SMTP fallback | `INTEGRATED` | Email path `DEPLOYED` | `scripts/daily-notifier.mjs`, `scripts/run-daily-cloud.ts`; latest run recorded `deliveryStatus=sent` |
| Cloudflare Worker dashboard and scheduled-dispatch code | `INTEGRATED` | `UNKNOWN` | `custom-worker.ts`, `src/cloudflare/daily-scheduler.ts`, `wrangler.jsonc`; deployment/dispatch not independently verified |
| Dashboard feedback, dismiss/save/promote actions, and content corrections | `INTEGRATED` | `UNKNOWN` | `src/app/api/feedback/**`, `src/app/api/candidates/content/**`, dashboard code; no current usage evidence inspected |

## Current production health

The latest verified daily run is [GitHub Actions run #31557628680](https://github.com/linyuan701/daily-paper/actions/runs/31557628680), created on 2026-08-12 against the previous product baseline `7e4e4602ed06893b41d60e774722157f52697e0f`. Governance-only PR #40 later advanced the authoritative master without changing product/runtime behavior or this run's production implications. The run:

- accepted business date `2026-08-11` as a new persisted run;
- completed with `complete_with_warnings`;
- persisted 20 recommendations; and
- sent the notification through email.

Known degradation:

- arXiv was the failed source in that run. The eight successful workflow runs from 2026-08-05 through 2026-08-12 all completed their business pipeline with the same arXiv warning. Root cause remains `UNKNOWN`.

Scheduling evidence:

- Recent daily executions are GitHub `schedule` events.
- The repository contains a Cloudflare Cron dispatcher intended to call `workflow_dispatch`, but recent run history does not prove that path is deployed or dispatching. Cloudflare deployment and dispatch status remain `UNKNOWN`.

## Active phases and development refs

| Phase/work | Lifecycle | Ref | Owner/evidence |
|---|---|---|---|
| Dashboard product experience | `IN DEVELOPMENT` | Draft PR [#21](https://github.com/linyuan701/daily-paper/pull/21) | PR author `linyuan701`; base `master` |
| Independent saved/promoted feedback states | `IN DEVELOPMENT` | Draft PR [#22](https://github.com/linyuan701/daily-paper/pull/22) | PR author `linyuan701`; base is PR #21's branch, not `master` |
| Recommendation limits | `IN DEVELOPMENT` | Draft PR [#24](https://github.com/linyuan701/daily-paper/pull/24) | PR author `linyuan701`; base is PR #21's branch |
| Source/ranking diagnostics | `IN DEVELOPMENT` | Draft PR [#25](https://github.com/linyuan701/daily-paper/pull/25) | PR author `linyuan701`; base is PR #21's branch |
| Scheduled production monitor | `IN DEVELOPMENT` | Draft PR [#28](https://github.com/linyuan701/daily-paper/pull/28) | PR author `linyuan701`; base `master` |

Draft PRs are not integrated capabilities. Delivery ownership and continued intent beyond the recorded PR author are `UNKNOWN` until the Coordinator confirms them.

## UNKNOWN and evidence gaps

- Cloudflare Worker deployment, Cron trigger, dispatch token, and successful `workflow_dispatch` behavior.
- Root cause of the repeated arXiv source failure.
- Current Local Mode operational health on a real Windows installation.
- Real production usage of dashboard feedback and content-correction endpoints.
- Whether the older draft PR stack remains intended for integration against current `master`.

See `docs/ARCHITECTURE.md` for implementation, `docs/ROADMAP.md` for non-integrated work, and `docs/DECISIONS.md` for accepted governance decisions.
