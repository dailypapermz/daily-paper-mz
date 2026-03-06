import { AppError } from "../../lib/errors";
import {
  buildCollectionTree,
  computeEffectivePriorities,
  ROOT_DEFAULT_PRIORITY
} from "./priority-resolver";
import type {
  CollectionPriorityService,
  CollectionPriorityValue,
  CollectionTreeNode,
  CollectionPriorityRepository,
  CollectionRecord,
  ComputedPriorityState
} from "./types";

export class DefaultCollectionPriorityService implements CollectionPriorityService {
  constructor(private readonly repository: CollectionPriorityRepository) {}

  async getPriorityTree(): Promise<CollectionTreeNode[]> {
    const context = await this.loadContext();
    const effectiveByCollectionKey = computeEffectivePriorities(
      context.collections,
      context.explicitByCollectionKey,
      ROOT_DEFAULT_PRIORITY
    );

    await this.repository.replaceEffectivePriorities(
      context.collections.map((collection) => {
        const effective = effectiveByCollectionKey.get(collection.zoteroCollectionKey);
        return {
          collectionId: collection.collectionId,
          priority: effective?.priority ?? ROOT_DEFAULT_PRIORITY,
          isExplicitOverride: effective?.isExplicitOverride ?? false
        };
      })
    );

    return buildCollectionTree(
      context.collections,
      context.explicitByCollectionKey,
      effectiveByCollectionKey,
      ROOT_DEFAULT_PRIORITY
    );
  }

  async updateCollectionPriority(input: {
    zoteroCollectionKey: string;
    priority: CollectionPriorityValue | null;
  }): Promise<{ updatedNode: CollectionTreeNode; tree: CollectionTreeNode[] }> {
    const collection = await this.repository.findCollectionByKey(input.zoteroCollectionKey);

    if (!collection) {
      throw new AppError(
        "COLLECTION_NOT_FOUND",
        `Collection not found: ${input.zoteroCollectionKey}`,
        404
      );
    }

    if (input.priority === null) {
      await this.repository.deleteExplicitSelection(collection.collectionId);
    } else {
      await this.repository.upsertExplicitSelection({
        collectionId: collection.collectionId,
        priority: input.priority
      });
    }

    const tree = await this.getPriorityTree();
    const updatedNode = findNodeByCollectionKey(tree, input.zoteroCollectionKey);

    if (!updatedNode) {
      throw new AppError(
        "COLLECTION_PRIORITY_UPDATE_FAILED",
        "Unable to resolve updated collection after priority recompute",
        500
      );
    }

    return {
      updatedNode,
      tree
    };
  }

  private async loadContext(): Promise<{
    collections: CollectionRecord[];
    explicitByCollectionKey: Map<string, CollectionPriorityValue>;
    effectiveByCollectionKey: Map<string, ComputedPriorityState>;
  }> {
    const [collections, explicitSelections, effectiveSelections] = await Promise.all([
      this.repository.getCollections(),
      this.repository.getExplicitSelections(),
      this.repository.getEffectivePriorities()
    ]);

    const explicitByCollectionKey = new Map(
      explicitSelections.map((selection) => [selection.zoteroCollectionKey, selection.priority])
    );

    const effectiveByCollectionKey = new Map(
      effectiveSelections.map((selection) => [
        selection.zoteroCollectionKey,
        {
          priority: selection.priority,
          isExplicitOverride: selection.isExplicitOverride
        }
      ])
    );

    return {
      collections,
      explicitByCollectionKey,
      effectiveByCollectionKey
    };
  }
}

function findNodeByCollectionKey(
  nodes: CollectionTreeNode[],
  zoteroCollectionKey: string
): CollectionTreeNode | null {
  for (const node of nodes) {
    if (node.zoteroCollectionKey === zoteroCollectionKey) {
      return node;
    }

    const nested = findNodeByCollectionKey(node.children, zoteroCollectionKey);
    if (nested) {
      return nested;
    }
  }

  return null;
}
