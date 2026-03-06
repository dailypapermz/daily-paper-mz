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
