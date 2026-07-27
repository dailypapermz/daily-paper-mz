# Cloud Mode A dependency security audit

Audit date: 2026-07-27. The starting full audit reported 1 critical, 9 high, and 3 moderate package nodes. Reachability was classified before changing versions; `npm audit fix --force` was not used.

| Package path | Severity | Reachability | PR 4 decision |
|---|---:|---|---|
| `next` | high | Direct OpenNext Worker framework runtime | Upgraded from 15.5.12 to the official Maintenance-LTS security floor 15.5.21. The audit now marks the direct node only through its `postcss` and `sharp` dependency edges, not through a remaining Next advisory. |
| `postcss` through Next/Vite | high | Present in the OpenNext server artifact as build/framework support; the application does not accept or process user-supplied CSS | Deferred. The Next maintainer classifies the advisory as not exploitable by Next users, and a forced override is not justified for this release. |
| `sharp` through Next | high | Installed as an optional Next dependency but absent from the generated OpenNext server artifact; the app exposes no image-processing input or remote image configuration | Deferred; do not force Sharp outside Next's declared range when it is not shipped in the Worker artifact. |
| `nodemailer` | high node | GitHub Actions notifier only, not Worker. Current code exposes none of the advisory's raw/JSON/OAuth/List/envelope/transport-name inputs | Deferred to a focused major upgrade with notification tests. |
| Prisma CLI -> `effect` / `defu` | high nodes | Generation/migration tooling, not a web-request surface | Deferred to a coordinated Prisma Client/CLI/adapter patch update. |
| Vitest/Vite | critical/high/moderate | Development tests only; UI/API server is not used or deployed | Deferred to a test-toolchain PR. Do not expose the Vitest UI/API before upgrading. |

After the targeted Next/OpenNext/Worker changes, `npm audit --omit=dev` still reports eight high package nodes through these transitive/tooling/notifier paths. Artifact inspection confirms that Nodemailer, Sharp, Prisma CLI/config, Effect, and Defu are absent from the Worker server bundle; PostCSS and Next are present. The full audit, including the newly added build tooling and existing test stack, reports one critical, fifteen high, and three moderate nodes. This is not represented as a clean audit. OpenNext bundle inspection separately checks that no native Prisma query-engine binary is packaged.

Follow-up: upgrade Vitest/Vite together; test Nodemailer 9; update the Prisma set together; adopt fixed PostCSS/Sharp through supported Next ranges or narrowly tested overrides; and add a non-secret pull-request audit job rather than auditing inside the secret-bearing daily workflow.
