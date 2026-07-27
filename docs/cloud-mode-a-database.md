# Cloud Mode A database contract

## Scope

PR 2 adds PostgreSQL persistence for Cloud Mode without changing the Local Mode SQLite schema, migration history, database file, or runtime workflow. It does not deploy GitHub Actions or Cloudflare Workers and does not import historical SQLite data.

The PostgreSQL baseline is derived from the repository's current logical model. Pre-existing Local schema and migration changes remain user-owned and are not staged by PR 2; the SQLite history is neither rewritten nor flattened. The database contract verifies that the Cloud schema covers the Local model names and that its committed baseline has no drift.

The first personal instance uses Neon. Region selection is an operator choice: the initial instance may use AWS `eu-central-1` (Frankfurt), while other users should choose a Neon region near their primary location. No region is encoded in application code or shared configuration.

## Independent Prisma roots

| Mode | Schema | Migrations | Generated Client |
|---|---|---|---|
| Local | `prisma/schema.prisma` | `prisma/migrations/**` | `src/generated/prisma` |
| Cloud | `prisma/postgresql/schema.prisma` | `prisma/postgresql/migrations/**` | `src/generated/prisma-postgresql` |

The Cloud history starts with one PostgreSQL baseline generated from an empty database. It is intentionally independent from the incremental SQLite history. Neither provider is replaced dynamically in a shared schema.

## Commands

```text
npm run prisma:local:validate
npm run prisma:local:generate
npm run prisma:local:migrate:deploy

npm run prisma:cloud:validate
npm run prisma:cloud:generate
npm run prisma:cloud:migrate:deploy

npm run test:db-contract
```

Cloud commands read the Neon connection string from `DATABASE_URL`. Use a direct PostgreSQL connection URL for migration deployment when the provider distinguishes direct and pooled endpoints. Never commit the URL or echo it in logs.

`npm run setup` selects the schema from `DEPLOYMENT_MODE`. Local setup preserves and migrates SQLite. Cloud setup generates the PostgreSQL Client, deploys the PostgreSQL history, and then runs `doctor`.

## Contract and integration testing

The no-credential database contract verifies both providers, distinct Client outputs, schema parity, PostgreSQL migration drift, and PostgreSQL-specific SQL. It does not connect to a database.

The real migration and repository CRUD test is opt-in and reads only `TEST_POSTGRES_DATABASE_URL`. It creates a randomly named isolated PostgreSQL schema, deploys the Cloud migration history, exercises create/read/update through a repository, then removes only that validated test schema. If the variable is absent, the test is skipped and must be reported as not verified against Neon.

## Empty start and future import

The first Cloud database starts empty. Zotero items and interest profiles are rebuilt through the normal synchronization and profile pipelines. The existing SQLite file and its verified backup remain untouched.

An optional one-time SQLite-to-PostgreSQL import remains future work under the maintenance tooling described in `docs/cloud-mode-a-migration-plan.md`. It is not a prerequisite for PR 2 and must never overwrite or delete the SQLite source.
