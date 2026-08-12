# Daily Paper roadmap

This canonical roadmap contains only non-integrated work: `PLANNED`, `IN DEVELOPMENT`, and `EXPERIMENTAL`. Presence in a workspace or draft pull request does not make a capability integrated. `docs/PROJECT_STATE.md` owns integrated and production state.

## PLANNED

| Item | Phase | Owner | Dependency | Acceptance gate | Ref/archive evidence |
|---|---|---|---|---|---|
| Resolve repeated arXiv production degradation | Production Reliability | Primary to assign ingestion/source specialist | Reproducible failure evidence and frozen source-freshness contract | Root cause classified; focused adapter/retry tests; independent review; healthy production evidence after merge | Integrated adapter exists; no archive migration required |
| Verify Cloudflare Cron deployment and GitHub dispatch path | Production Reliability | Primary to assign production/scheduler specialist | Authorized read-only Cloudflare/GitHub evidence; live mutation requires separate approval | Deployment/trigger evidence and observed safe dispatch or an explicit `UNKNOWN` disposition | Scheduler code is integrated; deployment state is `UNKNOWN` |
| Reconcile SQLite/PostgreSQL schema parity ownership | Production Reliability / Data Safety | Primary to assign database/migrations specialist | Current dual-schema contract | Parity expectations documented and checked without rewriting applied migrations | No archive dependency |
| Establish ranking and feedback evaluation contract | Retrieval Evaluation / Feedback Learning | Primary to coordinate ranking and feedback specialists | Frozen metrics, dataset/evidence boundaries, model/version semantics | Reproducible baseline metrics and reviewer-approved acceptance thresholds before algorithm changes | Archive contains experiments, reference-only |
| Reconcile older draft PR stack with current master | Project Governance | Primary / Coordinator | Confirm continued product intent and current-master compatibility | Each PR is rebased/reimplemented or explicitly closed through a separate decision; no automatic integration claims | Draft PRs #21, #22, #24, #25 |

## IN DEVELOPMENT

| Item | Phase | Owner/evidence | Dependency | Acceptance gate | Ref |
|---|---|---|---|---|---|
| Agent Operating Model v1 | Agent Design | Primary / Coordinator | Approved governance specification and current master baseline | TOML/config validation, documentation reconciliation, independent integration review, PR to master | `codex/agent-operating-model-v1` |
| Dashboard product experience | Product Experience | PR author `linyuan701`; delivery owner otherwise `UNKNOWN` | Current feed/UI contract | Reconcile against current master, focused tests, independent review | Draft PR #21 |
| Independent saved/promoted states | Feedback Learning | PR author `linyuan701`; delivery owner otherwise `UNKNOWN` | PR #21 branch and frozen feedback semantics | Semantic review, persistence/API tests, master integration | Draft PR #22 |
| Recommendation limits | Product Experience | PR author `linyuan701`; delivery owner otherwise `UNKNOWN` | PR #21 branch and frozen recommendation contract | Contract, UI/API tests, master integration | Draft PR #24 |
| Source/ranking diagnostics | Retrieval Evaluation | PR author `linyuan701`; delivery owner otherwise `UNKNOWN` | PR #21 branch and current persisted ranking fields | Evidence correctness, read-only safety, master integration | Draft PR #25 |
| Scheduled production monitor | Production Reliability | PR author `linyuan701`; delivery owner otherwise `UNKNOWN` | Current workflow and notification semantics | Safe monitoring contract, no production mutation, reviewer readiness | Draft PR #28 |

## EXPERIMENTAL

`codex/cloud-mode-a` is a read-only experimental archive. Its branch/worktree must not be rebased, merged, repaired, revived, or treated as a development baseline. Any idea below requires a new task from current `origin/master`, individual product/architecture review, and fresh validation.

| Experiment | Integrated? | Archived implementation | Promotion requirement |
|---|---|---|---|
| BM25 retrieval | No | Yes | Evaluation contract and independent current-master implementation |
| Dense embeddings / embedding cache | No | Yes | Provider/privacy/cost/cache decision plus evaluation gate |
| Retrieval and production-feedback evaluation | No | Yes | Dataset provenance, metrics, and acceptance thresholds |
| Candidate quality filtering | No | Yes | Source/quality semantics and false-positive evaluation |
| Global paper identity / cross-run suppression | No | Yes | Identity, migration, retention, and user-experience contract |
| Additional feedback/profile-learning experiments | No | Yes | Positive/negative feedback semantics and reproducible evaluation |
| Obsidian feedback sync | No | Yes | Explicit product scope, filesystem safety, and data contract |
| Windows setup/scheduler/backup experiments | No | Yes | Portability, rollback, and isolated-install validation |
| Archived agent configuration | No | Yes | Superseded as authority by Agent Operating Model v1; useful only as historical reference |

No experimental row is a promise to ship. Statekeeper may move an item only when the required evidence supports the lifecycle transition.
