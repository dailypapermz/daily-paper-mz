"use client";

import { useEffect, useMemo, useState } from "react";

const IS_CLOUD_MODE = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === "cloud";

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
type LabelEditState = {
  contentRecallLabel: string;
  category: "" | "method" | "biology" | "resource" | "benchmark";
  primaryKeyword: string;
  secondaryKeyword: string;
};

export default function HomePage() {
  const [feed, setFeed] = useState<RecommendationFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<RecommendationSource | "all">("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(true);
  const [triageState, setTriageState] = useState<Record<string, TriageAction | undefined>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [labelEdits, setLabelEdits] = useState<Record<string, LabelEditState>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

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
  }, [sourceFilter, showSelectedOnly, refreshTick]);

  const recommendations = useMemo(() => feed?.recommendations ?? [], [feed]);

  async function handleTriageAction(candidateId: string, action: TriageAction) {
    if (!feed) {
      return;
    }

    try {
      setActionError(null);
      const response = await fetch("/api/feedback/actions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          runId: feed.runId,
          candidateId,
          action
        })
      });

      if (!response.ok) {
        throw new Error(`Action request failed (${response.status})`);
      }

      setTriageState((previous) => ({ ...previous, [candidateId]: action }));
    } catch (triageError) {
      setActionError(triageError instanceof Error ? triageError.message : "Unknown action error");
    }
  }

  function getEditState(item: Recommendation): LabelEditState {
    return (
      labelEdits[item.candidateId] ?? {
        contentRecallLabel: item.labels.contentRecall?.label ?? "",
        category: (item.labels.researchType?.category as LabelEditState["category"]) ?? "",
        primaryKeyword: item.labels.researchType?.primaryKeyword ?? "",
        secondaryKeyword: item.labels.researchType?.secondaryKeyword ?? ""
      }
    );
  }

  function updateEditState(candidateId: string, patch: Partial<LabelEditState>) {
    setLabelEdits((previous) => {
      const base = previous[candidateId] ?? {
        contentRecallLabel: "",
        category: "",
        primaryKeyword: "",
        secondaryKeyword: ""
      };

      return {
        ...previous,
        [candidateId]: {
          ...base,
          ...patch
        }
      };
    });
  }

  async function saveLabelEdit(item: Recommendation) {
    const edit = getEditState(item);

    try {
      setEditError(null);

      const response = await fetch("/api/candidates/content", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          candidateId: item.candidateId,
          labels: {
            contentRecallLabel: edit.contentRecallLabel,
            researchType: {
              category: edit.category || undefined,
              primaryKeyword: edit.primaryKeyword || undefined,
              secondaryKeyword: edit.secondaryKeyword || undefined
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Edit request failed (${response.status})`);
      }

      setRefreshTick((value) => value + 1);
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : "Unknown edit error");
    }
  }

  async function exportToObsidian() {
    if (!feed) {
      return;
    }

    try {
      setExportError(null);
      setExportState("Exporting to Obsidian...");

      const response = await fetch("/api/obsidian/export/daily", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          runId: feed.runId,
          selectedOnly: showSelectedOnly,
          source: sourceFilter === "all" ? undefined : sourceFilter
        })
      });

      const payload = (await response.json()) as {
        status: string;
        result?: {
          dailyNotePath: string;
          paperNotePaths: string[];
          recommendationCount: number;
        };
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.result) {
        throw new Error(payload.message ?? `Export failed (${response.status})`);
      }

      setExportState(
        `Exported ${payload.result.recommendationCount} recommendations to ${payload.result.dailyNotePath}`
      );
    } catch (exportFailure) {
      setExportState(null);
      setExportError(exportFailure instanceof Error ? exportFailure.message : "Unknown Obsidian export error");
    }
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Daily Recommendation Dashboard</h1>
          <p className="subtitle">Browse and triage today&apos;s personalized paper recommendations.</p>
        </div>
        <div className="header-links">
          <a href="/collections">Collection Priorities</a>
          <a href="/journals">Journal Pool</a>
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
          {IS_CLOUD_MODE ? (
            <>No recommendation run found yet. Run the GitHub Actions daily workflow, then refresh this page.</>
          ) : (
            <>No recommendation run found yet. Run <code>POST /api/jobs/mvp-flow</code> (full flow) or{" "}
            <code>POST /api/jobs/daily</code> (daily-only flow), then refresh this page.</>
          )}
        </p>
      )}

      {!loading && !error && feed && (
        <>
          <section className="run-meta">
            <span>Rerank run: {feed.rerankRunId}</span>
            <span>Ingestion run: {feed.runId}</span>
            <span>Generated: {new Date(feed.generatedAt).toLocaleString()}</span>
            <span>Total shown: {recommendations.length}</span>
            {!IS_CLOUD_MODE ? (
              <button type="button" onClick={exportToObsidian}>
                Export to Obsidian
              </button>
            ) : null}
          </section>
          {actionError ? <p className="error">Failed to persist feedback action: {actionError}</p> : null}
          {editError ? <p className="error">Failed to save label edit: {editError}</p> : null}
          {exportState ? <p className="success">{exportState}</p> : null}
          {exportError ? <p className="error">Failed to export to Obsidian: {exportError}</p> : null}

          <section className="recommendation-list">
            {recommendations.map((item) => {
              const edit = getEditState(item);
              return (
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

                <section className="label-edit">
                  <h3>Edit Labels</h3>
                  <div className="edit-grid">
                    <label>
                      Content recall
                      <input
                        type="text"
                        value={edit.contentRecallLabel}
                        onChange={(event) =>
                          updateEditState(item.candidateId, { contentRecallLabel: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Research category
                      <select
                        value={edit.category}
                        onChange={(event) =>
                          updateEditState(item.candidateId, {
                            category: event.target.value as LabelEditState["category"]
                          })
                        }
                      >
                        <option value="">unknown</option>
                        <option value="method">method</option>
                        <option value="biology">biology</option>
                        <option value="resource">resource</option>
                        <option value="benchmark">benchmark</option>
                      </select>
                    </label>
                    <label>
                      Primary keyword
                      <input
                        type="text"
                        value={edit.primaryKeyword}
                        onChange={(event) =>
                          updateEditState(item.candidateId, { primaryKeyword: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Secondary keyword
                      <input
                        type="text"
                        value={edit.secondaryKeyword}
                        onChange={(event) =>
                          updateEditState(item.candidateId, { secondaryKeyword: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <button type="button" onClick={() => saveLabelEdit(item)}>
                    Save label edit
                  </button>
                </section>

                <section className="reasons">
                  <strong>Reasons:</strong>{" "}
                  {item.reasons.length > 0 ? item.reasons.join(", ") : "No explicit reason tags"}
                </section>

                <section className="actions">
                  <button
                    type="button"
                    onClick={() => handleTriageAction(item.candidateId, "save")}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriageAction(item.candidateId, "dismiss")}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriageAction(item.candidateId, "promote")}
                  >
                    Promote
                  </button>
                  <span className="triage-state">
                    {triageState[item.candidateId]
                      ? `Action: ${triageState[item.candidateId]} (persisted)`
                      : "No action yet"}
                  </span>
                </section>
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
