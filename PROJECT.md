# Project: Daily Literature Triage App Based on Zotero

## Goal

This project builds a **daily literature triage web app** centered on the user's Zotero library.

It is **not** a general academic search engine.
Its goal is to help the user discover papers that are **new today** and rank them by how likely the user is to care about them.

The system should support:
- Zotero-based interest profile building
- daily candidate collection from bioRxiv, arXiv, PubMed, and journal feeds
- personalized ranking
- AI summary generation
- editable topic labels
- feedback logging
- periodic profile refresh

---

## Core Design

The system has **two coupled pipelines** with different update frequencies.

### 1. Low-frequency profile pipeline

This pipeline builds and refreshes the user's **active interest profile** from Zotero.

It should:
- sync Zotero metadata using `ZOTERO_KEY` and `ZOTERO_ID`
- read item metadata, collections, subcollections, tags, star-like attention tags, added dates, title, and abstract
- let the user choose collection priorities before profile construction
- build profile only from selected collections
- batch-generate missing structured `#` tags for selected items during initial profile build
- support manual refresh and scheduled refresh
- remind the user once per month to refresh by default

### 2. High-frequency daily recommendation pipeline

This pipeline only works on **papers that are new today**.

It should:
- fetch daily candidates from bioRxiv, arXiv, PubMed, and selected journal feeds
- normalize metadata
- deduplicate overlapping items
- enrich journal metadata if available
- generate AI summary and structured labels for candidates
- rank only the daily candidate set against the active profile
- log user feedback
- avoid instantly rewriting the long-term profile

---

## Zotero Semantics

Different Zotero signals have different meanings and must remain separate.

### Collection priority

Collections define **interest boundaries**, not just weak ranking features.

The user can mark collections as:
- primary focus
- secondary focus
- excluded

Subcollections must be allowed to **override parent collection states**.

### Star tags

Tags such as:
- *
- **
- ***
- ****

represent **recent user attention level**.

These are **not topic tags**.
They should be parsed into a numeric field such as `attention_level`.

`attention_level` is the **strongest item-level priority signal** and should **almost override recency**.

### Recency

Use actual `added_date` or equivalent time metadata.

Recency is still useful, but weaker than strong star attention.

### Tags starting with "#"

These are **structured AI-generated content tags**, not priority tags.

They come from a fixed prompt schema and should be treated as **semi-structured metadata**.

Not all items have `#` tags.
If an item is in a selected collection but lacks `#` tags, it must still be included by using `title + abstract` representation.
At initial profile build time, missing `#` tags should be batch-generated for selected items.

---

## Meaning of "#" Tags

Preserve two structured tag types.

### Tag 1: content-recall label

This describes what the paper concretely does.

It usually compresses:
- method or framework name
- biological object or regulatory layer
- distinctive output form

### Tag 2: research-type label

This uses the schema:

`Category | primary innovation keyword, secondary innovation keyword`

Category must be one of:
- method
- biology
- resource
- benchmark

These tags should support:
- profile construction
- topic clustering
- recommendation explanation
- user correction
- future feedback integration

---

## Profile Construction Logic

The system must **not** treat the full Zotero library as a flat corpus.

Correct order:

1. Perform lightweight Zotero sync
2. Show collection tree to user
3. Let user choose primary / secondary / excluded collections
4. Build profile only from selected collections
5. Parse attention level from star tags
6. Use recency as secondary weighting
7. Use `#` tags as structured content representation
8. If `#` tags are missing, use `title + abstract`
9. Batch-generate missing `#` tags during initial profile build

The profile should contain at least:
- recent core interests
- stable long-term interests
- low-confidence or task-specific background interests
- preferred research types
- profile centroids or prototypes if useful
- user correction history
- refresh metadata

---

## Daily Candidate Logic

The daily pipeline must only consider papers that are **new today**.

Candidate sources:
- bioRxiv
- arXiv
- PubMed
- selected journal feeds

### Preprint discovery

Use user-selected broad category scopes.
Do not search the entire source without scope limits.

### Journal discovery

For MVP:
- use a user-imported journal pool
- leave an open interface for future auto-import or external curated journal collections
- support journal quality enrichment through EasyScholar or similar API

---

## Ranking Logic

Do **not** rank candidates by flat average similarity against the full Zotero library.

Use a **two-stage ranking pipeline**.

### Stage 1: recall

Use lighter, high-recall signals:
- semantic similarity to active profile
- `#` tag content overlap
- research-type match
- source/category filtering

### Stage 2: reranking

Use richer features:
- similarity to recent core profile
- similarity to stable long-term profile
- similarity to high-attention items
- content-recall tag match
- research-type preference match
- collection-derived profile weight
- user-corrected tag or keyword match
- source priority
- journal quality metrics
- optional same-day recency refinement

For MVP, reranking should remain **explainable**.
Prefer linear or semi-linear feature fusion.

Profile representation may use **multiple centroids or prototypes** instead of full-corpus comparison.

---

## AI Outputs for Recommended Papers

For top-ranked daily papers, generate two output layers.

### Layer 1: structured summary

Include:
- research question
- method
- main finding
- why it may matter to the user's interests

### Layer 2: structured editable labels

Use the same style as the Zotero `#` tag schema where possible.

User edits should be stored as **feedback logs first**.
They should influence the profile later during profile refresh, not instantly overwrite the long-term profile.

---

## UI Expectations

The app should support:
- Zotero connection
- collection selection UI
- parent/subcollection override
- profile refresh control
- daily recommendation dashboard
- source and category display
- summary display
- editable structured tags
- visible recommendation reasons
- feedback actions such as save, dismiss, promote, or tag correction

---

## Data Modeling Principles

Keep these concepts separate:
- raw Zotero items
- collection hierarchy
- user-selected collection priority state
- attention_level from star tags
- structured content-recall tags
- structured research-type tags
- profile snapshots
- daily candidate papers
- source metadata
- journal enrichment metadata
- recommendation results
- feedback logs
- profile refresh jobs

---

## Default Technical Stack

Preferred stack:
- Next.js + TypeScript
- Prisma
- PostgreSQL or SQLite for MVP
- modular service design
- scheduled jobs
- environment-based configuration

The MVP should be runnable, honest about external integrations, and designed for one user first with future multi-user extensibility.