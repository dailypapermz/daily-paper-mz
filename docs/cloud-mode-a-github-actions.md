# Cloud Mode A: GitHub Actions daily job

Cloud Mode runs the existing persisted daily CLI on a standard GitHub-hosted Node runner. It connects directly to the user's Neon PostgreSQL database; it does not call a Cloudflare or Next.js daily API.

## 1. Create the PostgreSQL database

Create an empty Neon PostgreSQL database. The first personal instance uses AWS Frankfurt (`eu-central-1`) because its primary use is in Europe. This region is not an application default: choose a Neon region near the instance owner (for example, Frankfurt for Europe or Singapore for East Asia).

Keep the complete TLS-enabled connection string private. The workflow runs `prisma:cloud:migrate:deploy` before the daily CLI, so the first run creates the schema from `prisma/postgresql/migrations/**`. It never reads, changes, or imports the Local Mode SQLite database.

## 2. Configure the GitHub production environment

In the repository, create an Actions environment named `production`. Add these required environment secrets:

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `ZOTERO_ID` | Zotero user or group identifier |
| `ZOTERO_KEY` | Zotero Web API key |
| `LLM_API_KEY` | Runtime LLM API key |

Add these environment variables as needed:

| Variable | Purpose |
|---|---|
| `LLM_MODEL` | Runtime model name; repository defaults apply when omitted |
| `LLM_API_BASE_URL` | Provider API base URL; use a Secret instead if the URL itself contains sensitive data |
| `NOTIFICATION_DASHBOARD_URL` | Optional dashboard URL included in notifications |

The committed workflow currently reads `LLM_API_BASE_URL` as a GitHub Variable. If a provider embeds credentials in that URL, edit the workflow to read a same-named Secret before enabling the job. Never commit either value.

## 3. Optional notifications

No notification setting is required. If all optional settings are absent, the persisted recommendation job still succeeds and notification delivery reports `skipped`.

- WeCom: `WECOM_BOT_WEBHOOK_URL`.
- SMTP: `NOTIFICATION_SMTP_HOST`, `NOTIFICATION_SMTP_PORT`, `NOTIFICATION_SMTP_SECURE`, `NOTIFICATION_SMTP_USER`, `NOTIFICATION_SMTP_PASS`, `NOTIFICATION_SMTP_FROM`, and `NOTIFICATION_SMTP_TO`.

The workflow maps `NOTIFICATION_SMTP_FROM/TO` to the application's existing `NOTIFICATION_EMAIL_FROM/TO` environment names. WeCom is attempted first; SMTP is the fallback. Delivery failure is logged without provider error bodies and does not roll back recommendations or change the persisted pipeline result.

## 4. Schedule and manual runs

`.github/workflows/daily.yml` defaults to 08:15 in `Asia/Shanghai`:

```yaml
schedule:
  - cron: "15 8 * * *"
    timezone: "Asia/Shanghai"
```

This is UTC 00:15 and deliberately avoids the top of the hour. To change it, edit both the POSIX cron and the IANA timezone in your own repository. The schedule only runs from the default branch and GitHub may delay scheduled jobs during high load.

GitHub's current schedule syntax and IANA timezone behavior are documented in [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule).

For a manual run, open Actions, select **Cloud daily recommendations**, choose **Run workflow**, and optionally provide `runDate` as `YYYY-MM-DD`. Omit it to preserve the existing previous-UTC-day behavior. Invalid dates fail before source calls.

## 5. Execution and retry semantics

The workflow order is:

```text
checkout -> Node 22 -> npm ci -> cloud config check
-> PostgreSQL validate/generate -> migrate deploy -> job:daily:cloud
```

The CLI may also be invoked locally against an explicitly configured Cloud environment:

```text
npm run job:daily:cloud
npm run job:daily:cloud -- --run-date 2026-07-27
```

The database request key and stage rows, not Actions concurrency, provide business idempotency. A successful run is reused, an active lease is not stolen, a stale lease is reclaimed on the same `runId`, and a downstream failure resumes after successful ingestion. Retry a failed workflow with **Re-run jobs** or use `workflow_dispatch` with the same date.

## 6. Result and secret boundaries

`complete`, `already_succeeded`, and non-retryable `partial` return exit code 0. Retryable `partial`, `failed`, `already_running`, invalid arguments, and configuration/factory failures return exit code 1. The CLI prints only `status`, `runId`, `failedStage`, and `retryable`.

Do not add pull-request triggers to the production workflow. Do not echo environment objects, database URLs, provider responses, webhook URLs, or SMTP errors. The workflow has only `contents: read` repository permission and serializes production runs with a non-cancelling concurrency group.
