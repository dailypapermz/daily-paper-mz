import { describe, expect, it } from "vitest";

import { buildCollectionTree, computeEffectivePriorities } from "./priority-resolver";
import type { CollectionRecord } from "./types";

const collections: CollectionRecord[] = [
  {
    collectionId: "root",
    zoteroCollectionKey: "ROOT",
    name: "Root"
  },
  {
    collectionId: "child-a",
    zoteroCollectionKey: "CHILD_A",
    name: "Child A",
    parentCollectionKey: "ROOT"
  },
  {
    collectionId: "grandchild-a",
    zoteroCollectionKey: "GRANDCHILD_A",
    name: "Grandchild A",
    parentCollectionKey: "CHILD_A"
  },
  {
    collectionId: "child-b",
    zoteroCollectionKey: "CHILD_B",
    name: "Child B",
    parentCollectionKey: "ROOT"
  }
];

describe("computeEffectivePriorities", () => {
  it("applies child explicit override over inherited parent priority", () => {
    const explicit = new Map<string, "primary" | "secondary" | "excluded">([
      ["ROOT", "primary"],
      ["CHILD_A", "excluded"]
    ]);

    const effective = computeEffectivePriorities(collections, explicit);

    expect(effective.get("ROOT")?.priority).toBe("primary");
    expect(effective.get("ROOT")?.isExplicitOverride).toBe(true);

    expect(effective.get("CHILD_A")?.priority).toBe("excluded");
    expect(effective.get("CHILD_A")?.isExplicitOverride).toBe(true);

    expect(effective.get("GRANDCHILD_A")?.priority).toBe("excluded");
    expect(effective.get("GRANDCHILD_A")?.isExplicitOverride).toBe(false);

    expect(effective.get("CHILD_B")?.priority).toBe("primary");
    expect(effective.get("CHILD_B")?.isExplicitOverride).toBe(false);
  });

  it("defaults top-level collections to excluded when no explicit selection exists", () => {
    const effective = computeEffectivePriorities(collections, new Map());

    expect(effective.get("ROOT")?.priority).toBe("excluded");
    expect(effective.get("CHILD_A")?.priority).toBe("excluded");
    expect(effective.get("GRANDCHILD_A")?.priority).toBe("excluded");
  });

  it("builds a tree with explicit and effective states", () => {
    const explicit = new Map<string, "primary" | "secondary" | "excluded">([["ROOT", "secondary"]]);
    const effective = computeEffectivePriorities(collections, explicit);

    const tree = buildCollectionTree(collections, explicit, effective);

    expect(tree).toHaveLength(1);
    expect(tree[0].zoteroCollectionKey).toBe("ROOT");
    expect(tree[0].explicitPriority).toBe("secondary");
    expect(tree[0].effectivePriority).toBe("secondary");
    expect(tree[0].children).toHaveLength(2);
  });
});
