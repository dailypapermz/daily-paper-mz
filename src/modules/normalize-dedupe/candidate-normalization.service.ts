import type {
  CandidateDedupRunResult,
  CandidateMergeReasonValue,
  CandidateNormalizationRepository,
  CandidateNormalizationService,
  CanonicalDailyCandidateCreateInput,
  CanonicalDailyCandidateRecord,
  RawDailyCandidateRecord
} from "./types";

type GroupedCandidate = {
  candidate: RawDailyCandidateRecord;
  mergeReason: CandidateMergeReasonValue;
};

type CandidateGroup = {
  id: string;
  primaryKey: string;
  keys: Set<string>;
  entries: GroupedCandidate[];
};

type NormalizedCandidate = {
  candidate: RawDailyCandidateRecord;
  normalizedDoi?: string;
  normalizedTitle?: string;
  normalizedUrl?: string;
  matchKeys: string[];
};

export class DefaultCandidateNormalizationService implements CandidateNormalizationService {
  constructor(private readonly repository: CandidateNormalizationRepository) {}

  async runForIngestionRun(runId: string): Promise<CandidateDedupRunResult> {
    const candidates = await this.repository.listRunCandidates(runId);
    const groups = buildCandidateGroups(candidates);
    const canonicalCandidates = groups.map((group) => toCanonicalCandidate(runId, group));

    await this.repository.replaceCanonicalCandidates({
      runId,
      canonicalCandidates
    });

    const persisted = await this.repository.listCanonicalCandidates(runId);

    return {
      runId,
      inputCount: candidates.length,
      canonicalCount: persisted.length,
      mergedCount: Math.max(candidates.length - persisted.length, 0),
      canonicalCandidates: persisted
    };
  }

  async getCanonicalCandidates(runId: string): Promise<CanonicalDailyCandidateRecord[]> {
    return this.repository.listCanonicalCandidates(runId);
  }
}

export function buildCandidateGroups(candidates: RawDailyCandidateRecord[]): CandidateGroup[] {
  const keyToGroupId = new Map<string, string>();
  const groups = new Map<string, CandidateGroup>();
  let groupIndex = 0;

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate);

    const matched = normalized.matchKeys
      .map((key) => keyToGroupId.get(key))
      .filter((groupId): groupId is string => Boolean(groupId));
    const uniqueMatched = [...new Set(matched)];

    const matchReason =
      normalized.matchKeys.find((key) => keyToGroupId.has(key)) ?? normalized.matchKeys[0] ?? "";

    let targetGroupId: string;
    if (uniqueMatched.length === 0) {
      groupIndex += 1;
      targetGroupId = `group-${groupIndex}`;
      groups.set(targetGroupId, {
        id: targetGroupId,
        primaryKey: normalized.matchKeys[0] ?? `source_external_id:${candidate.source}:${candidate.externalId}`,
        keys: new Set(),
        entries: []
      });
    } else {
      targetGroupId = uniqueMatched[0];
      for (const groupId of uniqueMatched.slice(1)) {
        mergeGroups({
          targetGroupId,
          sourceGroupId: groupId,
          groups,
          keyToGroupId
        });
      }
    }

    const targetGroup = groups.get(targetGroupId);
    if (!targetGroup) {
      continue;
    }

    targetGroup.entries.push({
      candidate,
      mergeReason: reasonFromKey(matchReason)
    });

    for (const key of normalized.matchKeys) {
      targetGroup.keys.add(key);
      keyToGroupId.set(key, targetGroupId);
    }
  }

  return [...groups.values()];
}

function mergeGroups(input: {
  targetGroupId: string;
  sourceGroupId: string;
  groups: Map<string, CandidateGroup>;
  keyToGroupId: Map<string, string>;
}) {
  if (input.targetGroupId === input.sourceGroupId) {
    return;
  }

  const targetGroup = input.groups.get(input.targetGroupId);
  const sourceGroup = input.groups.get(input.sourceGroupId);
  if (!targetGroup || !sourceGroup) {
    return;
  }

  for (const entry of sourceGroup.entries) {
    targetGroup.entries.push(entry);
  }

  for (const key of sourceGroup.keys) {
    targetGroup.keys.add(key);
    input.keyToGroupId.set(key, input.targetGroupId);
  }

  input.groups.delete(input.sourceGroupId);
}

function normalizeCandidate(candidate: RawDailyCandidateRecord): NormalizedCandidate {
  const normalizedDoi = normalizeDoi(candidate.doi);
  const normalizedTitle = normalizeTitle(candidate.title);
  const normalizedUrl = normalizeUrl(candidate.url);

  const matchKeys: string[] = [];
  if (normalizedDoi) {
    matchKeys.push(`doi:${normalizedDoi}`);
  }
  if (normalizedTitle && normalizedUrl) {
    matchKeys.push(`title_url:${normalizedTitle}|${normalizedUrl}`);
  }
  if (normalizedTitle) {
    matchKeys.push(`title:${normalizedTitle}`);
  }

  matchKeys.push(`source_external_id:${candidate.source}:${candidate.externalId}`);

  return {
    candidate,
    normalizedDoi,
    normalizedTitle,
    normalizedUrl,
    matchKeys
  };
}

function toCanonicalCandidate(runId: string, group: CandidateGroup): CanonicalDailyCandidateCreateInput {
  const picked = pickCanonicalEntry(group.entries.map((entry) => entry.candidate));
  const unioned = mergeFields(group.entries.map((entry) => entry.candidate), picked);
  const canonicalKey = buildCanonicalKey(group, unioned);
  const provenance = group.entries.map((entry) => ({
    sourceCandidateId: entry.candidate.id,
    source: entry.candidate.source,
    externalId: entry.candidate.externalId,
    mergeReason: entry.mergeReason
  }));

  return {
    runId,
    canonicalKey,
    title: unioned.title,
    abstractNote: unioned.abstractNote,
    publishedAt: unioned.publishedAt,
    indexedAt: unioned.indexedAt,
    url: unioned.url,
    doi: normalizeDoi(unioned.doi),
    pmid: unioned.pmid,
    arxivId: unioned.arxivId,
    bioRxivId: unioned.bioRxivId,
    journalName: unioned.journalName,
    authors: unioned.authors,
    mergedSourceCount: new Set(provenance.map((entry) => entry.source)).size,
    sourceProvenance: provenance
  };
}

function pickCanonicalEntry(candidates: RawDailyCandidateRecord[]): RawDailyCandidateRecord {
  return [...candidates].sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0];
}

function scoreCandidate(candidate: RawDailyCandidateRecord): number {
  let score = 0;
  if (normalizeDoi(candidate.doi)) {
    score += 10;
  }
  if (candidate.pmid) {
    score += 4;
  }
  if (candidate.arxivId || candidate.bioRxivId) {
    score += 3;
  }
  if ((candidate.abstractNote ?? "").trim().length > 0) {
    score += 2;
  }
  if ((candidate.title ?? "").trim().length > 0) {
    score += 1;
  }
  return score;
}

function mergeFields(
  candidates: RawDailyCandidateRecord[],
  preferred: RawDailyCandidateRecord
): RawDailyCandidateRecord {
  return {
    ...preferred,
    title: pickString(candidates.map((candidate) => candidate.title)),
    abstractNote: pickString(candidates.map((candidate) => candidate.abstractNote)),
    publishedAt: pickDate(candidates.map((candidate) => candidate.publishedAt)),
    indexedAt: pickDate(candidates.map((candidate) => candidate.indexedAt)),
    url: pickString(candidates.map((candidate) => candidate.url)),
    doi: pickString(candidates.map((candidate) => candidate.doi)),
    pmid: pickString(candidates.map((candidate) => candidate.pmid)),
    arxivId: pickString(candidates.map((candidate) => candidate.arxivId)),
    bioRxivId: pickString(candidates.map((candidate) => candidate.bioRxivId)),
    journalName: pickString(candidates.map((candidate) => candidate.journalName)),
    authors: pickAuthors(candidates)
  };
}

function pickString(values: Array<string | undefined>): string | undefined {
  const normalized = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.sort((left, right) => right.length - left.length)[0];
}

function pickDate(values: Array<Date | undefined>): Date | undefined {
  const valid = values.filter((value): value is Date => value instanceof Date);
  if (valid.length === 0) {
    return undefined;
  }

  return [...valid].sort((left, right) => left.getTime() - right.getTime())[0];
}

function pickAuthors(candidates: RawDailyCandidateRecord[]): string[] {
  const sorted = [...candidates].sort((left, right) => right.authors.length - left.authors.length);
  const selected = sorted[0]?.authors ?? [];
  return [...selected];
}

function buildCanonicalKey(group: CandidateGroup, candidate: RawDailyCandidateRecord): string {
  const normalizedDoi = normalizeDoi(candidate.doi);
  if (normalizedDoi) {
    return `doi:${normalizedDoi}`;
  }
  if (candidate.pmid) {
    return `pmid:${candidate.pmid}`;
  }
  if (candidate.arxivId) {
    return `arxiv:${candidate.arxivId}`;
  }
  if (candidate.bioRxivId) {
    return `biorxiv:${candidate.bioRxivId}`;
  }
  const normalizedTitle = normalizeTitle(candidate.title);
  if (normalizedTitle) {
    return `title:${normalizedTitle.slice(0, 160)}`;
  }
  return group.primaryKey;
}

function reasonFromKey(key: string): CandidateMergeReasonValue {
  if (key.startsWith("doi:")) {
    return "doi";
  }
  if (key.startsWith("title_url:")) {
    return "title_url";
  }
  if (key.startsWith("title:")) {
    return "title";
  }
  return "source_external_id";
}

export function normalizeDoi(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  const withoutPrefix = trimmed.replace(/^https?:\/\/(dx\.)?doi\.org\//, "").replace(/^doi:\s*/, "");
  return withoutPrefix.length > 0 ? withoutPrefix : undefined;
}

export function normalizeTitle(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeUrl(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return undefined;
  }
}
