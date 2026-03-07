"use client";

import { useEffect, useMemo, useState } from "react";

type RecommendationSource = "biorxiv" | "arxiv" | "pubmed" | "journal";

type Recommendation = {
  candidateId: string;
  rank: number;
  selected: boolean;
  finalScore: number;
  title?: string;
  publishedAt?: string;
  sources: RecommendationSource[];
  identifiers: {
    doi?: string;
    pmid?: string;
    arxivId?: string;
    bioRxivId?: string;
  };
  summary?: {
    researchQuestion: string;
    method: string;
    mainFinding: string;
    relevanceToUser: string;
  };
  labels: {
    contentRecall?: {
      label: string;
    };
    researchType?: {
      category?: string;
      primaryKeyword?: string;
      secondaryKeyword?: string;
    };
  };
  reasons: string[];
  journal?: {
    quartile?: string;
    impactScore?: number;
  };
};

type RecommendationFeed = {
  rerankRunId: string;
  runId: string;
  generatedAt: string;
  recommendations: Recommendation[];
};

type TriageAction = "save" | "dismiss" | "promote";

export default function HomePage() {
  const [feed, setFeed] = useState<RecommendationFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<RecommendationSource | "all">("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(true);
  const [triageState, setTriageState] = useState<Record<string, TriageAction | undefined>>({});

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const query = new URLSearchParams();
        query.set("selectedOnly", showSelectedOnly ? "true" : "false");
        if (sourceFilter !== "all") {
          query.set("source", sourceFilter);
        }

        const response = await fetch(`/api/recommendations/daily?${query.toString()}`, {
          method: "GET",
          signal: controller.signal
        });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as { feed: RecommendationFeed | null };
        setFeed(payload.feed);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unknown dashboard load error");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      controller.abort();
    };
  }, [sourceFilter, showSelectedOnly]);

  const recommendations = useMemo(() => feed?.recommendations ?? [], [feed]);

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Daily Recommendation Dashboard</h1>
          <p className="subtitle">Browse and triage today&apos;s personalized paper recommendations.</p>
        </div>
        <div className="header-links">
          <a href="/collections">Collection Priorities</a>
          <a href="/api/recommendations/daily">Feed API</a>
        </div>
      </header>

      <section className="controls">
        <label>
          Source
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as RecommendationSource | "all")}
          >
            <option value="all">All</option>
            <option value="journal">Journal</option>
            <option value="pubmed">PubMed</option>
            <option value="arxiv">arXiv</option>
            <option value="biorxiv">bioRxiv</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={showSelectedOnly}
            onChange={(event) => setShowSelectedOnly(event.target.checked)}
          />
          Show selected recommendations only
        </label>
      </section>

      {loading && <p>Loading recommendations...</p>}
      {!loading && error && <p className="error">Failed to load recommendations: {error}</p>}
      {!loading && !error && !feed && (
        <p>
          No recommendation run found yet. Run <code>/api/ranking/recall</code> then <code>/api/ranking/rerank</code>
          .
        </p>
      )}

      {!loading && !error && feed && (
        <>
          <section className="run-meta">
            <span>Rerank run: {feed.rerankRunId}</span>
            <span>Ingestion run: {feed.runId}</span>
            <span>Generated: {new Date(feed.generatedAt).toLocaleString()}</span>
            <span>Total shown: {recommendations.length}</span>
          </section>

          <section className="recommendation-list">
            {recommendations.map((item) => (
              <article key={item.candidateId} className="recommendation-card">
                <header className="card-header">
                  <div>
                    <h2>
                      #{item.rank} {item.title ?? "Untitled candidate"}
                    </h2>
                    <p className="meta-line">
                      <span>Score {item.finalScore.toFixed(3)}</span>
                      {item.publishedAt ? (
                        <span>Published {new Date(item.publishedAt).toLocaleDateString()}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="badges">
                    {item.sources.map((source) => (
                      <span className="badge source" key={`${item.candidateId}-${source}`}>
                        {source}
                      </span>
                    ))}
                    {item.journal?.quartile ? (
                      <span className="badge journal">{item.journal.quartile}</span>
                    ) : null}
                  </div>
                </header>

                <section className="identifier-row">
                  {item.identifiers.doi ? <span>DOI: {item.identifiers.doi}</span> : null}
                  {item.identifiers.pmid ? <span>PMID: {item.identifiers.pmid}</span> : null}
                  {item.identifiers.arxivId ? <span>arXiv: {item.identifiers.arxivId}</span> : null}
                  {item.identifiers.bioRxivId ? <span>bioRxiv: {item.identifiers.bioRxivId}</span> : null}
                </section>

                {item.summary ? (
                  <section className="summary-grid">
                    <div>
                      <h3>Research question</h3>
                      <p>{item.summary.researchQuestion || "N/A"}</p>
                    </div>
                    <div>
                      <h3>Method</h3>
                      <p>{item.summary.method || "N/A"}</p>
                    </div>
                    <div>
                      <h3>Main finding</h3>
                      <p>{item.summary.mainFinding || "N/A"}</p>
                    </div>
                    <div>
                      <h3>Why relevant</h3>
                      <p>{item.summary.relevanceToUser || "N/A"}</p>
                    </div>
                  </section>
                ) : null}

                <section className="labels-row">
                  {item.labels.contentRecall?.label ? (
                    <span className="badge label">#{item.labels.contentRecall.label}</span>
                  ) : null}
                  {item.labels.researchType ? (
                    <span className="badge label">
                      {item.labels.researchType.category ?? "unknown"} |{" "}
                      {item.labels.researchType.primaryKeyword ?? "n/a"}
                      {item.labels.researchType.secondaryKeyword
                        ? `, ${item.labels.researchType.secondaryKeyword}`
                        : ""}
                    </span>
                  ) : null}
                </section>

                <section className="reasons">
                  <strong>Reasons:</strong>{" "}
                  {item.reasons.length > 0 ? item.reasons.join(", ") : "No explicit reason tags"}
                </section>

                <section className="actions">
                  <button
                    type="button"
                    onClick={() => setTriageState((previous) => ({ ...previous, [item.candidateId]: "save" }))}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTriageState((previous) => ({ ...previous, [item.candidateId]: "dismiss" }))
                    }
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTriageState((previous) => ({ ...previous, [item.candidateId]: "promote" }))
                    }
                  >
                    Promote
                  </button>
                  <span className="triage-state">
                    {triageState[item.candidateId]
                      ? `Action: ${triageState[item.candidateId]} (local only)`
                      : "No action yet"}
                  </span>
                </section>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
