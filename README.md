# Daily Paper

Scaffold for the daily literature triage MVP.

## Stack
- Next.js + TypeScript
- Prisma
- SQLite by default for local MVP

## Local Setup
1. Install dependencies:
   - `npm install`
2. Create `.env` in project root with:
   - `DATABASE_URL="file:./prisma/dev.db"`
3. Generate Prisma client:
   - `npm run prisma:generate`
4. Start development server:
   - `npm run dev`
5. Verify health route:
   - `http://localhost:3000/api/health`

## Current Status
This issue only scaffolds project structure and baseline runtime.
Business logic is intentionally deferred to subsequent issues.

## Directory Highlights
- `src/app`: Next.js app router pages and route handlers
- `src/modules`: feature module placeholders aligned with MVP architecture
- `src/db`: Prisma/data access placeholders
- `src/lib`: shared config/types/logging placeholders
- `src/jobs`: scheduler/job placeholders
- `prisma/schema.prisma`: initial Prisma setup
