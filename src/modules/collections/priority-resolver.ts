import type {
  CollectionPriorityValue,
  CollectionRecord,
  CollectionTreeNode,
  ComputedPriorityState
} from "./types";

export const ROOT_DEFAULT_PRIORITY: CollectionPriorityValue = "excluded";

export function computeEffectivePriorities(
  collections: CollectionRecord[],
  explicitByCollectionKey: Map<string, CollectionPriorityValue>,
  defaultPriority: CollectionPriorityValue = ROOT_DEFAULT_PRIORITY
): Map<string, ComputedPriorityState> {
  const collectionByKey = new Map(collections.map((collection) => [collection.zoteroCollectionKey, collection]));
  const childrenByParent = buildChildrenByParent(collections);

  const roots = collections.filter(
    (collection) =>
      !collection.parentCollectionKey || !collectionByKey.has(collection.parentCollectionKey)
  );

  const orderedRoots = sortCollections(roots);
  const results = new Map<string, ComputedPriorityState>();
  const visited = new Set<string>();

  const visit = (
    collection: CollectionRecord,
    inheritedPriority: CollectionPriorityValue | null
  ) => {
    if (visited.has(collection.zoteroCollectionKey)) {
      return;
    }

    visited.add(collection.zoteroCollectionKey);

    const explicitPriority = explicitByCollectionKey.get(collection.zoteroCollectionKey);
    const effectivePriority = explicitPriority ?? inheritedPriority ?? defaultPriority;
    const state: ComputedPriorityState = {
      priority: effectivePriority,
      isExplicitOverride: explicitPriority !== undefined
    };

    results.set(collection.zoteroCollectionKey, state);

    const children = sortCollections(childrenByParent.get(collection.zoteroCollectionKey) ?? []);
    for (const child of children) {
      visit(child, effectivePriority);
    }
  };

  for (const root of orderedRoots) {
    visit(root, null);
  }

  for (const collection of sortCollections(collections)) {
    if (!visited.has(collection.zoteroCollectionKey)) {
      visit(collection, null);
    }
  }

  return results;
}

export function buildCollectionTree(
  collections: CollectionRecord[],
  explicitByCollectionKey: Map<string, CollectionPriorityValue>,
  effectiveByCollectionKey: Map<string, ComputedPriorityState>,
  defaultPriority: CollectionPriorityValue = ROOT_DEFAULT_PRIORITY
): CollectionTreeNode[] {
  const childrenByParent = buildChildrenByParent(collections);
  const collectionByKey = new Map(collections.map((collection) => [collection.zoteroCollectionKey, collection]));

  const roots = sortCollections(
    collections.filter(
      (collection) =>
        !collection.parentCollectionKey || !collectionByKey.has(collection.parentCollectionKey)
    )
  );

  const visited = new Set<string>();

  const buildNode = (collection: CollectionRecord, depth: number): CollectionTreeNode => {
    visited.add(collection.zoteroCollectionKey);

    const explicitPriority = explicitByCollectionKey.get(collection.zoteroCollectionKey) ?? null;
    const effectiveState = effectiveByCollectionKey.get(collection.zoteroCollectionKey);

    const children = sortCollections(childrenByParent.get(collection.zoteroCollectionKey) ?? []).map(
      (child) => buildNode(child, depth + 1)
    );

    return {
      collectionId: collection.collectionId,
      zoteroCollectionKey: collection.zoteroCollectionKey,
      name: collection.name,
      parentCollectionKey: collection.parentCollectionKey,
      explicitPriority,
      effectivePriority: effectiveState?.priority ?? explicitPriority ?? defaultPriority,
      isExplicitOverride: effectiveState?.isExplicitOverride ?? explicitPriority !== null,
      depth,
      children
    };
  };

  const tree = roots.map((root) => buildNode(root, 0));

  for (const collection of sortCollections(collections)) {
    if (!visited.has(collection.zoteroCollectionKey)) {
      tree.push(buildNode(collection, 0));
    }
  }

  return tree;
}

function buildChildrenByParent(collections: CollectionRecord[]) {
  const childrenByParent = new Map<string, CollectionRecord[]>();

  for (const collection of collections) {
    if (!collection.parentCollectionKey) {
      continue;
    }

    if (!childrenByParent.has(collection.parentCollectionKey)) {
      childrenByParent.set(collection.parentCollectionKey, []);
    }

    childrenByParent.get(collection.parentCollectionKey)?.push(collection);
  }

  return childrenByParent;
}

function sortCollections(collections: CollectionRecord[]): CollectionRecord[] {
  return [...collections].sort((left, right) => {
    if (left.name !== right.name) {
      return left.name.localeCompare(right.name);
    }
    return left.zoteroCollectionKey.localeCompare(right.zoteroCollectionKey);
  });
}
