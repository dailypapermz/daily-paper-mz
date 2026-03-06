import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPriorityTree: vi.fn(),
  updateCollectionPriority: vi.fn()
}));

vi.mock("../../../../../modules/collections", () => ({
  createCollectionPriorityService: () => ({
    getPriorityTree: mocks.getPriorityTree,
    updateCollectionPriority: mocks.updateCollectionPriority
  })
}));

import { GET, PUT } from "./route";

describe("/api/zotero/collections/priorities", () => {
  beforeEach(() => {
    mocks.getPriorityTree.mockReset();
    mocks.updateCollectionPriority.mockReset();
  });

  it("returns priority tree on GET", async () => {
    mocks.getPriorityTree.mockResolvedValueOnce([
      {
        collectionId: "c1",
        zoteroCollectionKey: "ROOT",
        name: "Root",
        explicitPriority: null,
        effectivePriority: "excluded",
        isExplicitOverride: false,
        depth: 0,
        children: []
      }
    ]);

    const response = await GET();
    const payload = (await response.json()) as { status: string; tree: unknown[] };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.tree).toHaveLength(1);
  });

  it("validates payload on PUT", async () => {
    const response = await PUT(
      new Request("http://localhost/api/zotero/collections/priorities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: "primary" })
      })
    );

    const payload = (await response.json()) as { code: string };

    expect(response.status).toBe(400);
    expect(payload.code).toBe("INVALID_PAYLOAD");
  });

  it("updates collection priority on PUT", async () => {
    mocks.updateCollectionPriority.mockResolvedValueOnce({
      updatedNode: {
        collectionId: "c1",
        zoteroCollectionKey: "ROOT",
        name: "Root",
        explicitPriority: "primary",
        effectivePriority: "primary",
        isExplicitOverride: true,
        depth: 0,
        children: []
      },
      tree: []
    });

    const response = await PUT(
      new Request("http://localhost/api/zotero/collections/priorities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoteroCollectionKey: "ROOT",
          priority: "primary"
        })
      })
    );

    const payload = (await response.json()) as { status: string; updatedNode: { explicitPriority: string } };

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.updatedNode.explicitPriority).toBe("primary");
    expect(mocks.updateCollectionPriority).toHaveBeenCalledWith({
      zoteroCollectionKey: "ROOT",
      priority: "primary"
    });
  });
});
