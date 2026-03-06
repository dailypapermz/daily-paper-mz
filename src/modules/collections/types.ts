import type { CollectionPriority } from "../../generated/prisma";

export type CollectionPriorityValue = "primary" | "secondary" | "excluded";

export type CollectionRecord = {
  collectionId: string;
  zoteroCollectionKey: string;
  name: string;
  parentCollectionKey?: string;
  path?: string;
};

export type ExplicitPriorityRecord = {
  collectionId: string;
  zoteroCollectionKey: string;
  priority: CollectionPriorityValue;
};

export type EffectivePriorityRecord = {
  collectionId: string;
  zoteroCollectionKey: string;
  priority: CollectionPriorityValue;
  isExplicitOverride: boolean;
};

export type ComputedPriorityState = {
  priority: CollectionPriorityValue;
  isExplicitOverride: boolean;
};

export type CollectionTreeNode = {
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

export interface CollectionPriorityRepository {
  getCollections(): Promise<CollectionRecord[]>;
  findCollectionByKey(zoteroCollectionKey: string): Promise<CollectionRecord | null>;
  getExplicitSelections(): Promise<ExplicitPriorityRecord[]>;
  upsertExplicitSelection(input: {
    collectionId: string;
    priority: CollectionPriorityValue;
  }): Promise<void>;
  deleteExplicitSelection(collectionId: string): Promise<void>;
  replaceEffectivePriorities(
    entries: Array<{
      collectionId: string;
      priority: CollectionPriorityValue;
      isExplicitOverride: boolean;
    }>
  ): Promise<void>;
  getEffectivePriorities(): Promise<EffectivePriorityRecord[]>;
}

export interface CollectionPriorityService {
  getPriorityTree(): Promise<CollectionTreeNode[]>;
  updateCollectionPriority(input: {
    zoteroCollectionKey: string;
    priority: CollectionPriorityValue | null;
  }): Promise<{ updatedNode: CollectionTreeNode; tree: CollectionTreeNode[] }>;
}

export function toDbCollectionPriority(priority: CollectionPriorityValue): CollectionPriority {
  if (priority === "primary") {
    return "PRIMARY";
  }
  if (priority === "secondary") {
    return "SECONDARY";
  }
  return "EXCLUDED";
}

export function fromDbCollectionPriority(priority: CollectionPriority): CollectionPriorityValue {
  if (priority === "PRIMARY") {
    return "primary";
  }
  if (priority === "SECONDARY") {
    return "secondary";
  }
  return "excluded";
}
