# Cloud Mode A: Cloudflare Workers deployment

Cloud Mode A deploys the Next.js dashboard and short interactive APIs to Cloudflare Workers through OpenNext. GitHub Actions remains the only cloud daily-job runner and connects directly to Neon. The Worker never runs migrations or the seven-stage daily pipeline.

## Runtime topology

```text
GitHub Actions daily CLI ----write----> Neon PostgreSQL
                                          ^
                                          |
Owner browser -> Cloudflare Access -> OpenNext Worker
                                          |
                                  read + interactive writes
```

The Worker uses `@prisma/adapter-neon` with a Rust-free Prisma Client generated from `prisma/postgresql/schema.prisma`. The standard PostgreSQL Client and migration history used by GitHub Actions are unchanged. The SQLite Client remains the Local Mode implementation.

## Build and local preview

Use Node 22 and install from the lockfile:

```text
npm ci
npm run cf:typegen
npm run test:cloudflare
npm run cf:build
npm run cf:preview
```

For a database-backed preview, create an ignored `.dev.vars` file containing a disposable Neon URL:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Do not use a production database for destructive tests. `cf:preview` remains active until stopped. Validate liveness, private routes, recommendation reads, and guarded writes. OpenNext warns that native Windows support is incomplete; if `workerd` crashes on Windows, repeat preview acceptance on Linux or a GitHub-hosted Ubuntu runner and record the real result.

### Current acceptance status

The repository build and static Worker contract checks pass on the current Windows development machine. Native `cf:preview` is not accepted on Windows: `workerd` exited with access-violation status `0xc0000005` under the installed Node runtime, while a Node 22 retry did not start a listener and had to be stopped after the wrapper stalled. Linux runtime acceptance passed in GitHub Actions run `30249599589`: OpenNext built on `ubuntu-latest`, workerd started, the dashboard rendered, liveness returned 200, readiness failed safely without a database binding, Cloud-disabled job routes returned the capability contract, and mutation guards rejected non-JSON, wrong-origin, and oversized requests.

No `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, or disposable Neon test URL was available, so no remote Worker deploy, Access policy, readiness query, or persisted feedback write was executed. Perform the remaining acceptance from Linux or a GitHub-hosted Ubuntu runner with a disposable PostgreSQL database:

```text
npm ci
npm run cf:typegen
npm run test:cloudflare
npm run cf:build
npm run cf:preview
```

Then verify `/api/health/live`, Access-protected `/api/health/ready`, recommendation reads, a feedback write, a second sequential request, and rollback before approving production deployment.

The repository also includes `.github/workflows/cloudflare-preview.yml`. It builds the OpenNext artifact on `ubuntu-latest`, launches local workerd, and verifies liveness, sanitized readiness failure, Cloud-disabled job routes, wrong-origin rejection, JSON-only writes, and the request-size limit without loading production Secrets. This resolves the native Windows `workerd` gap; database-backed production acceptance remains separate.

## Cloudflare configuration

1. Create a Worker deployment using this repository and `wrangler.jsonc`.
2. Add the pooled Neon runtime URL with `npx wrangler secret put DATABASE_URL`.
3. Configure a custom hostname. `workers_dev=false` and `preview_urls=false` prevent an unprotected default hostname from bypassing Access.
4. Create a Cloudflare Access self-hosted application covering the custom hostname and every path.
5. Allow only the intended Cloudflare account member/owner identity. Configure the actual identity in Cloudflare, never in source. Do not use `Everyone`, arbitrary valid email, or a public-domain allow rule.
6. Protect the dashboard, APIs, and `/api/health/ready`.
7. If public liveness is required, configure a separate exact-path policy only for `/api/health/live`.
8. Deploy only after Access and the custom hostname are ready with `npm run cf:deploy`.

The daily workflow does not call the Worker, so PR 4 adds no Cloudflare service token. A later headless client or monitor must use a dedicated Access service token rather than a browser cookie.

## API capability matrix

| Surface | Cloud Mode A policy |
|---|---|
| `/`, `/collections`, `/journals` | Worker-compatible; Access-protected. Local Obsidian and live feed-health controls are hidden. |
| `GET /api/recommendations/daily`, `GET /api/feedback/logs` | Worker-compatible authenticated reads. |
| `GET /api/candidates/content`, `PUT /api/candidates/content` | Worker-compatible; PUT requires same-origin JSON and strict summary/label input. |
| `POST /api/feedback/actions` | Worker-compatible; same-origin JSON, bounded metadata, and candidate/run association. |
| `GET/POST/PUT /api/journals/pool` | Worker-compatible; guarded writes. Cloud URLs require HTTPS and reject literal local/private targets. Live probing is disabled. |
| `GET/PUT /api/zotero/collections/priorities` | Worker-compatible; guarded and validated PUT. |
| `GET /api/profile/refresh`, `GET /api/profile/snapshot` | Worker-compatible persisted status reads. |
| `GET /api/ranking/recall`, `GET /api/ranking/rerank`, `GET /api/ingestion/runs`, `GET /api/ingestion/dedup` | Worker-compatible persisted-result reads. |
| `GET /api/zotero/sync`, `GET /api/zotero/tags/parse` | Worker-compatible status reads without Zotero credentials in the Worker. |
| `GET /api/health/live` | Public only under an exact Access bypass; constant liveness only. |
| `GET /api/health/ready` and legacy `GET /api/health` | Database readiness; protected and sanitized. |
| daily/MVP/monthly job endpoints | Cloud-disabled; use GitHub Actions. |
| ingestion, enrichment, normalization, recall, rerank, summary generation, profile build, Zotero sync/tag mutation methods | Cloud-disabled Node job responsibilities. |
| Obsidian export, journal bootstrap/health probing, profile reminder mutation | Local/Node-only and Cloud-disabled. |

No route emits permissive CORS headers. Cloud writes require JSON, a matching `Origin`, same-origin Fetch Metadata when present, bounded bodies, and route validation. Server errors do not return stack traces, connection URLs, provider bodies, or secrets.

## Secrets, acceptance, and rollback

The Worker requires only `DATABASE_URL`. It does not receive Zotero, LLM, SMTP, WeCom, Obsidian, Windows, or daily-job secrets.

Before deploy, run the full repository checks plus `cf:build`, `cf:preview`, and `test:cloudflare`. A real preview with a disposable PostgreSQL database must exercise recommendations, feedback persistence, liveness, readiness success/failure, and sequential requests. Without credentials, record these as not executed rather than passed.

Rollback the Worker to the last verified Cloudflare version or detach the custom route while retaining Access deny rules. Worker rollback does not reverse PostgreSQL migrations.
