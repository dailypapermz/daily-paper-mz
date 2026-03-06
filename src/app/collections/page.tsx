"use client";

import { useEffect, useMemo, useState } from "react";

type CollectionPriorityValue = "primary" | "secondary" | "excluded";

type CollectionTreeNode = {
  collectionId: string;
  zoteroCollectionKey: string;
  name: string;
  parentCollectionKey?: string;
  explicitPriority: CollectionPriorityValue | null;
  effectivePriority: CollectionPriorityValue;
  isExplicitOverride: boolean;
  depth: number;
  children: CollectionTreeNode[];
};

export default function CollectionsPage() {
  const [tree, setTree] = useState<CollectionTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadTree();
  }, []);

  const flattened = useMemo(() => flattenTree(tree), [tree]);

  async function loadTree() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/zotero/collections/priorities", {
        method: "GET"
      });

      const payload = (await response.json()) as {
        status: string;
        tree?: CollectionTreeNode[];
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.tree) {
        throw new Error(payload.message ?? "Failed to load collection priorities");
      }

      setTree(payload.tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function updatePriority(
    zoteroCollectionKey: string,
    priority: CollectionPriorityValue | null
  ) {
    setPendingKey(zoteroCollectionKey);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/zotero/collections/priorities", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          zoteroCollectionKey,
          priority
        })
      });

      const payload = (await response.json()) as {
        status: string;
        tree?: CollectionTreeNode[];
        message?: string;
      };

      if (!response.ok || payload.status !== "ok" || !payload.tree) {
        throw new Error(payload.message ?? "Failed to update priority");
      }

      setTree(payload.tree);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <main>
      <h1>Collection Priorities</h1>
      <p>Set explicit collection priorities and review effective inherited state.</p>

      {loading ? <p>Loading collections...</p> : null}
      {errorMessage ? <p style={{ color: "#b42318" }}>{errorMessage}</p> : null}

      {!loading && flattened.length === 0 ? <p>No collections are synced yet.</p> : null}

      {!loading && flattened.length > 0 ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {flattened.map((node) => {
            const isPending = pendingKey === node.zoteroCollectionKey;

            return (
              <div
                key={node.zoteroCollectionKey}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: 8,
                  padding: "0.75rem",
                  marginLeft: `${node.depth * 20}px`
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{node.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "#52525b" }}>
                      Key: {node.zoteroCollectionKey}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.85rem" }}>
                    <div>Explicit: {node.explicitPriority ?? "none"}</div>
                    <div>
                      Effective: {node.effectivePriority}
                      {node.isExplicitOverride ? " (explicit)" : " (inherited/default)"}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "0.6rem", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void updatePriority(node.zoteroCollectionKey, "primary")}
                    disabled={isPending}
                  >
                    Primary
                  </button>
                  <button
                    type="button"
                    onClick={() => void updatePriority(node.zoteroCollectionKey, "secondary")}
                    disabled={isPending}
                  >
                    Secondary
                  </button>
                  <button
                    type="button"
                    onClick={() => void updatePriority(node.zoteroCollectionKey, "excluded")}
                    disabled={isPending}
                  >
                    Excluded
                  </button>
                  <button
                    type="button"
                    onClick={() => void updatePriority(node.zoteroCollectionKey, null)}
                    disabled={isPending}
                  >
                    Clear Override
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </main>
  );
}

function flattenTree(tree: CollectionTreeNode[]): CollectionTreeNode[] {
  const output: CollectionTreeNode[] = [];

  const visit = (nodes: CollectionTreeNode[]) => {
    for (const node of nodes) {
      output.push(node);
      visit(node.children);
    }
  };

  visit(tree);
  return output;
}
