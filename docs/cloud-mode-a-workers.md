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
3. Deploy the Worker named `daily-paper`. With `workers_dev=true`, its first-release URL is `https://daily-paper.<account-subdomain>.workers.dev`. `preview_urls=false` remains explicit so no per-version preview hostname becomes a bypass.
4. In Workers & Pages, select `daily-paper`, open **Settings > Domains & Routes**, and click **Enable Cloudflare Access** for the production `workers.dev` route.
5. In the generated Access policy, allow only the intended owner email. Configure the actual address in Cloudflare, never in source. Do not add `Everyone`, arbitrary valid email, or a public-domain allow rule to the protected application.
6. Copy the Access application audience tag and configure Worker variables `POLICY_AUD`, `TEAM_DOMAIN` (`https://<team-name>.cloudflareaccess.com`), and `ACCESS_ALLOWED_EMAIL`. The address is deployment data and must not be committed.
7. Keep the dashboard, APIs, and `/api/health/ready` protected. Configure a separate exact public destination/exception only for `/api/health/live` when public liveness is required.
8. Deploy with `npm run cf:deploy`, then verify both the outer Access policy and the Worker's application-level JWT validation.

Cloudflare's one-click Workers Access feature is supported directly on production `workers.dev` routes. The application does not rely on that outer route alone: middleware validates `Cf-Access-Jwt-Assertion` against the account JWKS, expected issuer, application audience, and configured owner email. Missing Access variables, a missing/invalid token, or an unexpected email fails closed with a sanitized 403.

Worker Static Assets use `run_worker_first=true`, so prerendered dashboard HTML and other static application assets cannot bypass the Next middleware. The middleware source lives at `src/middleware.ts`, matching this repository's `src/app` layout.

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

The Worker requires the `DATABASE_URL` secret plus non-secret Access values `POLICY_AUD` and `TEAM_DOMAIN`; `ACCESS_ALLOWED_EMAIL` should be treated as private deployment configuration. It does not receive Zotero, LLM, SMTP, WeCom, Obsidian, Windows, or daily-job secrets.

Before deploy, run the full repository checks plus `cf:build`, `cf:preview`, and `test:cloudflare`. A real preview with a disposable PostgreSQL database must exercise recommendations, feedback persistence, liveness, readiness success/failure, and sequential requests. Without credentials, record these as not executed rather than passed.

Rollback the Worker to the last verified Cloudflare version or disable its production `workers.dev` route while retaining Access deny rules. Worker rollback does not reverse PostgreSQL migrations.

## Later custom-domain migration

A custom domain is optional for the first personal instance. To add one later, configure a Worker Custom Domain, place the same Access owner-only policy in front of it, update `NOTIFICATION_DASHBOARD_URL`, and retest Origin/JWT boundaries. The Worker code, Neon schema, daily workflow, recommendations, and feedback data do not change. Keep the `workers.dev` route Access-protected during transition, then set `workers_dev=false` only after the custom hostname is verified so it cannot remain as a bypass.
