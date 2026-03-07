# Daily Paper

Scaffold for the daily literature triage MVP.

## Stack
- Next.js + TypeScript
- Prisma
- SQLite by default for local MVP

## Local Setup
1. Install dependencies:
   - `npm install`
2. Create `.env` from `.env.example` and set required values:
   - `DATABASE_URL`
   - `ZOTERO_KEY`
   - `ZOTERO_ID`
3. Validate environment:
   - `npm run check:env`
4. Generate Prisma client:
   - `npm run prisma:generate`
5. Start development server:
   - `npm run dev`
6. Verify health route:
   - `http://localhost:3000/api/health`

## Current Status
This repository currently contains scaffold and shared foundation modules.
Feature/business modules are implemented issue by issue.

## Directory Highlights
- `src/app`: Next.js app router pages and route handlers
- `src/modules`: feature module placeholders aligned with MVP architecture
- `src/db`: Prisma/data access placeholders
- `src/lib`: shared config/types/logging/utilities
- `src/jobs`: scheduler/job placeholders
- `prisma/schema.prisma`: initial Prisma setup

## Scheduled Job Examples (DAI-42)
The app includes simple runnable scheduler examples without extra infrastructure.

### API job triggers
- `POST /api/jobs/daily`
  - Runs source ingestion, enrichment, deduplication, summary generation, recall, and rerank for configured sources.
- `POST /api/jobs/monthly-reminder`
  - Runs monthly profile refresh reminder check.

### CLI examples
- Run daily job once:
  - `npm run job:daily`
- Run monthly reminder once:
  - `npm run job:monthly-reminder`
- Run loop scheduler (checks UTC clock periodically):
  - `npm run job:scheduler-loop`

### Scheduler env knobs
- `APP_BASE_URL` (default `http://localhost:3000`)
- `SCHEDULER_DAILY_UTC_HOUR` (default `6`)
- `SCHEDULER_MONTHLY_UTC_DAY` (default `1`)
- `SCHEDULER_MONTHLY_UTC_HOUR` (default `7`)
- `SCHEDULER_POLL_MS` (default `60000`)
