# Agent Rules

> **Classification: historical product-rules reference.** This file is not the current Codex governance or project-state authority. Use `AGENTS.md`, `docs/PROJECT_STATE.md`, and `docs/ARCHITECTURE.md`; current integrated code at the verified `origin/master` wins on conflict.

You are working on a daily literature triage app centered on a Zotero library.

Follow these rules strictly.

## Architecture Rules

The system has **two coupled pipelines**:
1. low-frequency profile pipeline
2. high-frequency daily recommendation pipeline

Do not collapse them into one flat pipeline.

Do not treat the full Zotero library as a flat interest corpus.

---

## Collection Rules

Collection priority is a **boundary condition**, not just a soft ranking feature.

Collections must support:
- primary
- secondary
- excluded

Subcollections must be allowed to override parent collection states.

Only selected primary and secondary collections should contribute to the active interest profile.

---

## Zotero Signal Rules

Keep the following signals separate:

### 1. Collection priority
Defines profile boundaries and base weighting.

### 2. Star tags
Tags such as `*`, `**`, `***`, and `****` must be parsed into `attention_level`.

They are not content tags.

`attention_level` is the strongest item-level weighting signal and should almost override recency.

### 3. Recency
Use actual time fields such as `added_date`.

Recency matters, but less than strong star attention.

### 4. "#" tags
These are structured AI-generated content tags, not priority tags.

Do not mix them with star tags.

---

## "#" Tag Rules

Preserve two structured tag types:

### Tag 1
Content-recall label describing what the paper concretely does.

### Tag 2
Research-type label:
`Category | primary innovation keyword, secondary innovation keyword`

Category must be one of:
- method
- biology
- resource
- benchmark

Do not flatten these into ordinary keywords if structured storage is possible.

---

## Missing Tag Rules

Not all selected items have `#` tags.

If an item is in a selected collection but lacks `#` tags:
- it must still be included
- use title + abstract representation
- batch-generate missing `#` tags during initial profile build

Do not exclude important papers only because tags are missing.

---

## Ranking Rules

Do not implement ranking as flat average similarity against the whole Zotero library.

Use a two-stage ranking pipeline:

### Recall
High-recall, lighter features

### Rerank
Richer features, still explainable

Prefer:
- multi-centroid or prototype-based profile representation
- linear or semi-linear reranking for MVP

Preserve explainability.

---

## Daily Pipeline Rules

The daily recommendation pipeline should only process papers that are **new today**.

Candidate sources:
- bioRxiv
- arXiv
- PubMed
- selected journal feeds

Do not rank historical literature together with daily candidates.

---

## Journal Rules

For MVP:
- use user-imported journal pools
- leave an extension interface for future external curated journal sources
- support EasyScholar-like journal enrichment as an external integration point

Do not fake journal API behavior.

---

## Feedback Rules

User edits and feedback must first be stored as logs.

They should not instantly rewrite the long-term profile.

They should be integrated during later profile refresh.

---

## Coding Rules

Prefer:
- Next.js + TypeScript
- Prisma
- modular service design
- clear separation of responsibilities
- readable and maintainable code

When an external integration is not available:
- implement interfaces
- mark integration points clearly
- do not fake working behavior

Do not redesign the product logic unless explicitly asked.
