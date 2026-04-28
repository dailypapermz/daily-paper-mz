"use client";

import { useEffect, useMemo, useState } from "react";

type JournalFeedRecord = {
  id: string;
  journalName: string;
  feedUrl: string;
  isActive: boolean;
};

type JournalFeedHealthRecord = {
  id: string;
  status: "healthy" | "http_error" | "invalid_feed" | "request_failed";
  checkedAt: string;
  itemCount: number;
  httpStatus?: number;
  contentType?: string;
  finalUrl?: string;
  errorMessage?: string;
};

export default function JournalsPage() {
  const [feeds, setFeeds] = useState<JournalFeedRecord[]>([]);
  const [healthById, setHealthById] = useState<Record<string, JournalFeedHealthRecord>>({});
  const [loading, setLoading] = useState(true);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [journalName, setJournalName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [allowBootstrapWhenNotEmpty, setAllowBootstrapWhenNotEmpty] = useState(false);

  useEffect(() => {
    void loadFeeds();
  }, []);

  const activeCount = useMemo(() => feeds.filter((feed) => feed.isActive).length, [feeds]);

  async function loadFeeds() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/journals/pool", {
        method: "GET"
      });
      const payload = (await response.json()) as {
        status: string;
        feeds?: JournalFeedRecord[];
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.feeds) {
        throw new Error(payload.message ?? "Failed to load journal pool");
      }

      setFeeds(payload.feeds);
      void loadHealth();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown journal pool load error");
    } finally {
      setLoading(false);
    }
  }

  async function loadHealth() {
    setCheckingHealth(true);

    try {
      const response = await fetch("/api/journals/pool/health", {
        method: "GET"
      });
      const payload = (await response.json()) as {
        status: string;
        reports?: JournalFeedHealthRecord[];
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.reports) {
        throw new Error(payload.message ?? "Failed to check journal feed health");
      }

      setHealthById(
        Object.fromEntries(payload.reports.map((report) => [report.id, report]))
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown journal feed health error");
    } finally {
      setCheckingHealth(false);
    }
  }

  async function importFeed() {
    if (!journalName.trim() || !feedUrl.trim()) {
      setErrorMessage("journal name and feed URL are required");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/journals/pool", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          feeds: [
            {
              journalName: journalName.trim(),
              feedUrl: feedUrl.trim(),
              isActive: true
            }
          ]
        })
      });

      const payload = (await response.json()) as {
        status: string;
        feeds?: JournalFeedRecord[];
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.feeds) {
        throw new Error(payload.message ?? "Failed to import journal feed");
      }

      setFeeds(payload.feeds);
      setJournalName("");
      setFeedUrl("");
      void loadHealth();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown journal feed import error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeed(feed: JournalFeedRecord) {
    setSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/journals/pool", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: feed.id,
          isActive: !feed.isActive
        })
      });

      const payload = (await response.json()) as {
        status: string;
        feed?: JournalFeedRecord;
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.feed) {
        throw new Error(payload.message ?? "Failed to update journal feed status");
      }

      setFeeds((previous) =>
        previous.map((entry) => (entry.id === payload.feed?.id ? payload.feed : entry))
      );
      void loadHealth();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown journal feed update error");
    } finally {
      setSaving(false);
    }
  }

  async function bootstrapFromEnv() {
    setSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/journals/pool/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          allowWhenNotEmpty: allowBootstrapWhenNotEmpty
        })
      });
      const payload = (await response.json()) as {
        status: string;
        feeds?: JournalFeedRecord[];
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.feeds) {
        throw new Error(payload.message ?? "Failed to bootstrap journal pool");
      }

      setFeeds(payload.feeds);
      void loadHealth();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown bootstrap error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <h1>Journal Pool</h1>
      <p>Manage journal feeds used by daily source ingestion.</p>
      <p>
        Current pool: {feeds.length} feeds ({activeCount} active)
      </p>

      <section className="controls" style={{ marginTop: 0 }}>
        <label>
          Journal name
          <input
            value={journalName}
            onChange={(event) => setJournalName(event.target.value)}
            placeholder="Nature Methods"
          />
        </label>
        <label style={{ minWidth: 320 }}>
          Feed URL
          <input
            value={feedUrl}
            onChange={(event) => setFeedUrl(event.target.value)}
            placeholder="https://example.org/rss.xml"
          />
        </label>
        <button type="button" onClick={() => void importFeed()} disabled={saving}>
          Import Feed
        </button>
      </section>

      <section className="controls">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={allowBootstrapWhenNotEmpty}
            onChange={(event) => setAllowBootstrapWhenNotEmpty(event.target.checked)}
          />
          Allow bootstrap when pool is not empty
        </label>
        <button type="button" onClick={() => void bootstrapFromEnv()} disabled={saving}>
          Bootstrap from JOURNAL_FEED_URLS
        </button>
        <button type="button" onClick={() => void loadHealth()} disabled={saving || checkingHealth}>
          {checkingHealth ? "Checking Feeds..." : "Refresh Feed Health"}
        </button>
      </section>

      {loading ? <p>Loading journal pool...</p> : null}
      {errorMessage ? <p className="error">{errorMessage}</p> : null}

      {!loading && feeds.length === 0 ? (
        <p>No journal feeds found. Import feeds manually or bootstrap from env.</p>
      ) : null}

      {!loading && feeds.length > 0 ? (
        <section className="recommendation-list">
          {feeds.map((feed) => (
            <article key={feed.id} className="recommendation-card">
              <header className="card-header">
                <div>
                  <h2>{feed.journalName}</h2>
                  <p className="meta-line">{feed.feedUrl}</p>
                  {healthById[feed.id] ? (
                    <p className="meta-line">
                      Feed health: {formatHealthStatus(healthById[feed.id])}
                      {healthById[feed.id]?.itemCount !== undefined
                        ? ` | entries: ${healthById[feed.id]?.itemCount}`
                        : ""}
                    </p>
                  ) : null}
                  {healthById[feed.id]?.finalUrl &&
                  healthById[feed.id]?.finalUrl !== feed.feedUrl ? (
                    <p className="meta-line">Resolved URL: {healthById[feed.id]?.finalUrl}</p>
                  ) : null}
                  {healthById[feed.id]?.errorMessage ? (
                    <p className="error">{healthById[feed.id]?.errorMessage}</p>
                  ) : null}
                </div>
                <span className="badge">{feed.isActive ? "active" : "inactive"}</span>
              </header>
              <section className="actions">
                <button type="button" onClick={() => void toggleFeed(feed)} disabled={saving}>
                  {feed.isActive ? "Deactivate" : "Activate"}
                </button>
              </section>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function formatHealthStatus(health: JournalFeedHealthRecord): string {
  if (health.status === "healthy") {
    return "healthy";
  }

  if (health.httpStatus) {
    return `${health.status} (${health.httpStatus})`;
  }

  return health.status;
}
