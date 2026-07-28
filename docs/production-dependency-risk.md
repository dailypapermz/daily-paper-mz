# Production dependency risk register

This register records the v0.2 production audit decisions. It is evidence for maintenance planning, not permission to run automated major upgrades or deploy to production.

## Resolved groups

| Group | Baseline | v0.2 | Result |
|---|---:|---:|---|
| Prisma CLI, Client, Neon adapter, Config/Effect/Defu chain | mixed 6.19.2 / broad 6.x ranges | exact 6.19.3 | Four high audit nodes removed. Local/Cloud generation, both schemas, migration contract, Node build, OpenNext build, and application tests pass. |
| Nodemailer | 7.0.13 | exact 9.0.3 | One high audit node removed. The production from/to/subject/text/html path is rendered with Nodemailer's stream transport without network access; real SMTP acceptance remains a controlled deployment check. |

The Worker-only Prisma generator uses `engineType = "client"`. The regular SQLite and Node PostgreSQL generators are unchanged. This prevents OpenNext from packaging a platform-native Prisma query engine while preserving the Neon driver-adapter runtime. The artifact contract rejects `.node`, `.dll`, `.so`, and `.dylib` query engines.

## Open high findings

After the two targeted groups, `npm audit --omit=dev` reports three high nodes in one Next.js dependency chain: `next`, `postcss`, and `sharp`.

| Node | Reachability in this application | Decision and containment |
|---|---|---|
| `postcss` 8.5.17 | Build-time CSS processing. Repository CSS is trusted source; users cannot upload CSS or source maps. | Do not override the exact version selected by Next independently. Keep clean-checkout builds and dependency audit monitoring; upgrade with a compatible Next/OpenNext release. |
| `sharp` 0.34.x | Next build/runtime dependency. The application has no `next/image` usage or attacker-controlled image optimization input today. | Do not force Sharp 0.35 outside Next's declared compatibility range. The protected route boundary limits current exposure; re-evaluate immediately before adding image optimization or uploads. |
| `next` 15.5.21 | Core production framework and therefore reachable, although the reported audit paths above are transitive PostCSS/Sharp findings. | `npm audit fix --force` proposes a downgrade to Next 14.2.35, which is incompatible with the accepted Next/OpenNext stack. Retain 15.5.21, monitor an upstream compatible release, and keep the Linux workerd, protected-route, liveness, artifact, and production-build gates mandatory. |

## Compatibility matrix

The accepted v0.2 matrix is Next 15.5.21, `@opennextjs/cloudflare` 1.20.2, Prisma/Client/Neon adapter 6.19.3, and `@neondatabase/serverless` 1.1.0. Prisma 7 is a major migration and was not attempted. Next 14 downgrade, independent PostCSS override, and independent Sharp major upgrade were rejected because they bypass the tested framework/adapter contract.

Revisit the open findings when a compatible Next/OpenNext release is available, when the application begins processing untrusted CSS/images, or when an advisory changes the assessed reachability. Each future group must remain an independent commit with the full regression and Linux workerd validation.
