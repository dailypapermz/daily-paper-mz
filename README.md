# Daily Paper

Daily literature triage MVP centered on Zotero, with two coupled pipelines:
- profile pipeline (low-frequency): Zotero sync, collection priorities, profile snapshot refresh
- daily pipeline (high-frequency): ingestion, enrichment, dedup, summary/labels, recall + rerank

## Stack
- Next.js + TypeScript
- Prisma
- SQLite by default for local MVP (`DATABASE_URL` can point to PostgreSQL)

## Local Setup
1. Install dependencies:
   - `npm install`
2. Create `.env` from `.env.example`:
   - required: `DATABASE_URL`, `ZOTERO_KEY`, `ZOTERO_ID`
   - optional: source scopes, LLM/journal integration keys, scheduler settings
   - `PUBMED_QUERY_SCOPE` defaults to a focused genomics/omics/regulatory-genomics query; generic AI terms are only included when paired with those domains, so override it only if you intentionally want broader PubMed intake
3. Run schema and generate client:
   - `npm run prisma:migrate`
   - `npm run prisma:generate`
4. Validate environment:
   - `npm run check:env`
5. Start app:
   - `npm run dev`
6. Health check:
   - `GET http://localhost:3000/api/health`

## End-to-End MVP Runbook

### Preferred single-trigger path
Use the integrated route:
- `POST /api/jobs/mvp-flow`
- optional body:
  - `syncMode`: `"full"` or `"incremental"` (default `"incremental"`)
  - `runDate`: `YYYY-MM-DD` (UTC day for ingestion)
  - `sources`: subset of `["biorxiv","arxiv","pubmed","journal"]`

This orchestrates:
1. Zotero sync
2. collection priority read/effective summary
3. manual profile refresh (new active snapshot)
4. daily pipeline (ingest -> enrich -> dedup -> summary/labels -> recall -> rerank)
5. dashboard feed snapshot readback

### Manual route-by-route path
1. Sync Zotero:
   - `POST /api/zotero/sync` with `{ "mode": "incremental" }`
2. Review/update collection priorities:
   - `GET /api/zotero/collections/priorities`
   - `PUT /api/zotero/collections/priorities`
3. Refresh profile:
   - `POST /api/profile/refresh`
4. Ingest daily candidates (per source):
   - `POST /api/ingestion/runs`
5. Run ranking:
   - `POST /api/ranking/recall`
   - `POST /api/ranking/rerank`
6. Open dashboard:
   - `/`
   - data API: `GET /api/recommendations/daily`
7. Store user feedback and label edits:
   - `POST /api/feedback/actions`
   - `PUT /api/candidates/content`

## Scheduler Jobs
- `POST /api/jobs/daily`: run daily recommendation pipeline
- `POST /api/jobs/monthly-reminder`: profile-refresh reminder check
- `POST /api/jobs/mvp-flow`: full local MVP orchestration

CLI wrappers:
- `npm run job:daily`
- `npm run job:daily:cloud` (Cloud Mode direct Node job)
- `npm run job:monthly-reminder`
- `npm run job:scheduler-loop`

Scheduler env knobs:
- `APP_BASE_URL`
- `SCHEDULER_DAILY_UTC_HOUR`
- `SCHEDULER_MONTHLY_UTC_DAY`
- `SCHEDULER_MONTHLY_UTC_HOUR`
- `SCHEDULER_POLL_MS`

## Cloud Mode daily execution

Cloud Mode keeps the Windows/SQLite path intact and runs the persisted daily pipeline directly in GitHub Actions against an empty managed PostgreSQL database. The committed workflow is `.github/workflows/daily.yml`; it does not call the Next.js or Cloudflare daily API.

Setup summary:

1. Create a Neon database in a region near the instance owner. The first personal instance uses AWS Frankfurt (`eu-central-1`), but no provider region is hardcoded.
2. Create a GitHub Actions environment named `production`.
3. Add required secrets: `DATABASE_URL`, `ZOTERO_ID`, `ZOTERO_KEY`, and `LLM_API_KEY`.
4. Optionally add `LLM_MODEL`, `LLM_API_BASE_URL`, `NOTIFICATION_DASHBOARD_URL`, WeCom, and SMTP settings.
5. Run **Cloud daily recommendations** manually once, optionally with a strict `runDate` (`YYYY-MM-DD`).
6. Keep or edit the template schedule, which defaults to 08:15 `Asia/Shanghai` (UTC 00:15).

The workflow validates/generates the PostgreSQL client, applies the independent cloud migration history, and then invokes the existing `job:daily:cloud` CLI. Notification settings are optional; failures do not roll back persisted results. See [Cloud Mode A GitHub Actions runbook](docs/cloud-mode-a-github-actions.md) for the full Secrets/Variables, schedule, retry, and exit-code contract.

## Validation Commands
- tests: `npm run test`
- typecheck: `npm run typecheck`
- production build: `npm run build`

If `next build` fails in Windows sandboxed environments with `EPERM ... Application Data`, run build with an isolated home/profile:

```powershell
$root=(Resolve-Path .).Path
$fakeHome=Join-Path $root '.codex-home'
$fakeAppData=Join-Path $fakeHome 'AppData\Roaming'
$fakeLocal=Join-Path $fakeHome 'AppData\Local'
New-Item -ItemType Directory -Force -Path $fakeAppData,$fakeLocal | Out-Null
$env:HOME=$fakeHome
$env:USERPROFILE=$fakeHome
$env:HOMEDRIVE=$fakeHome.Substring(0,2)
$env:HOMEPATH=$fakeHome.Substring(2)
$env:APPDATA=$fakeAppData
$env:LOCALAPPDATA=$fakeLocal
npm run build
```

## Known Limitations
- External integrations depend on real credentials/network (`ZOTERO_KEY`, source APIs, optional LLM/enrichment APIs).
- Providers are honest about unavailability; they degrade gracefully and record failure metadata.
- Daily ingestion is currently source-triggered; orchestration runs configured sources sequentially and aggregates outcomes.
- Single-user MVP data model and UI; no auth/tenant partitioning yet.
- Ranking remains explainable linear/semi-linear by design; no opaque model training in MVP.

## Extension Points
- Swap SQLite for PostgreSQL via `DATABASE_URL`.
- Replace unavailable provider adapters with real production integrations.
- Add richer source scopes and additional ingestion adapters.
- Introduce stronger multi-source joint-run orchestration if needed.
- Extend feedback consumption logic during profile refresh with stricter controls or weighting.

## Directory Highlights
- `src/app`: pages and thin API handlers
- `src/modules`: business modules (`zotero-sync`, `collections`, `profile-build`, `ingestion`, `ranking`, `feedback`, `scheduler`)
- `src/db/repositories`: Prisma-backed repository layer
- `src/lib`: config, logging, errors, shared utilities/types
- `prisma/schema.prisma`: current schema and relations
