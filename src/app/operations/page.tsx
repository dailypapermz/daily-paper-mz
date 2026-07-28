"use client";

import { useCallback, useEffect, useState } from "react";

import type { OperationsRun } from "../../modules/operations";

export default function OperationsPage() {
  const [runs, setRuns] = useState<OperationsRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/operations/runs?limit=20", { cache: "no-store" });
      const payload = await response.json() as { status: string; runs?: OperationsRun[]; message?: string };
      if (!response.ok || payload.status !== "ok") {
        throw new Error(payload.message ?? `Operations request failed (${response.status})`);
      }
      setRuns(payload.runs ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load operations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function retry(runId: string) {
    try {
      setDispatching(runId);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/operations/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry", runId })
      });
      const payload = await response.json() as { message?: string; runDate?: string };
      if (!response.ok) throw new Error(payload.message ?? `Retry request failed (${response.status})`);
      setNotice(`Daily workflow accepted for stored date ${payload.runDate}.`);
      await loadRuns();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to dispatch retry.");
    } finally {
      setDispatching(null);
    }
  }

  return (
    <main className="operations-page">
      <header className="dashboard-header">
        <div>
          <h1>Operations</h1>
          <p className="subtitle">Recent persisted daily pipeline runs and safe workflow recovery.</p>
        </div>
        <div className="header-links">
          <a href="/">Recommendation Dashboard</a>
          <a href="/api/operations/runs">Operations API</a>
        </div>
      </header>

      {loading ? <p>Loading operations...</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="success" role="status">{notice}</p> : null}
      {!loading && runs.length === 0 ? <p>No aggregated daily runs are available.</p> : null}

      <section className="operations-list" aria-label="Recent daily runs">
        {runs.map((run) => (
          <article className="operation-card" key={run.runId}>
            <header className="operation-card-header">
              <div>
                <h2>{run.runDate}</h2>
                <p>Attempt {run.attempt} · started {new Date(run.startedAt).toLocaleString()}</p>
              </div>
              <span className={`operation-status status-${run.status}`}>{formatStatus(run.status)}</span>
            </header>

            {run.errorSummary ? <p className="operation-error">{run.errorSummary}</p> : null}
            {run.sourceDegradation.degraded ? (
              <p className="operation-warning">
                Degraded sources: {run.sourceDegradation.sources.filter((source) => source.status === "failed").map((source) => source.source).join(", ")}
              </p>
            ) : null}

            <ol className="stage-list">
              {run.stages.map((stage) => (
                <li key={stage.stage}>
                  <span>{stage.stage}</span>
                  <span className={`stage-status stage-${stage.status}`}>{stage.status}</span>
                  {stage.error ? <small>{stage.error}</small> : null}
                </li>
              ))}
            </ol>

            <footer className="operation-footer">
              <code>{run.runId}</code>
              {run.retryable ? (
                <button
                  type="button"
                  disabled={dispatching !== null}
                  onClick={() => retry(run.runId)}
                >
                  {dispatching === run.runId ? "Dispatching..." : "Retry / Resume"}
                </button>
              ) : null}
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}

function formatStatus(status: OperationsRun["status"]) {
  return status.replaceAll("_", " ");
}
