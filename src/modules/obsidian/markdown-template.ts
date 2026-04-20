import type {
  DailyRecommendationFeed,
  DailyRecommendationRecord
} from "../ranking/explain/types";

export function renderDailyNote(feed: DailyRecommendationFeed): string {
  const generatedDate = new Date(feed.generatedAt);
  const title = `Daily Literature Triage - ${toDateOnly(generatedDate)}`;
  const lines = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `daily_paper_run: "${feed.runId}"`,
    `rerank_run: "${feed.rerankRunId}"`,
    `generated_at: "${feed.generatedAt}"`,
    "tags:",
    "  - daily-paper",
    "  - literature-triage",
    "---",
    "",
    `# ${title}`,
    "",
    `Generated from Daily Paper run \`${feed.runId}\`.`,
    "",
    "## Recommendations",
    "",
    ...feed.recommendations.flatMap((item) => renderDailyRecommendationListItem(item)),
    "",
    "## Triage Notes",
    "",
    "- Saved:",
    "- Dismissed:",
    "- Follow up:",
    ""
  ];

  return `${lines.join("\n")}\n`;
}

export function renderPaperNote(input: {
  recommendation: DailyRecommendationRecord;
  feed: DailyRecommendationFeed;
}): string {
  const { recommendation, feed } = input;
  const title = recommendation.title ?? "Untitled paper";
  const primaryUrl = buildPrimaryUrl(recommendation);
  const researchType = recommendation.labels.researchType;
  const contentRecall = recommendation.labels.contentRecall;

  const lines = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `daily_paper_candidate: "${recommendation.candidateId}"`,
    `daily_paper_run: "${feed.runId}"`,
    `recommended_on: "${toDateOnly(new Date(feed.generatedAt))}"`,
    `rank: ${recommendation.rank}`,
    `score: ${roundScore(recommendation.finalScore)}`,
    `status: unread`,
    recommendation.identifiers.doi ? `doi: "${escapeYaml(recommendation.identifiers.doi)}"` : undefined,
    recommendation.identifiers.pmid ? `pmid: "${escapeYaml(recommendation.identifiers.pmid)}"` : undefined,
    recommendation.identifiers.arxivId
      ? `arxiv: "${escapeYaml(recommendation.identifiers.arxivId)}"`
      : undefined,
    recommendation.identifiers.bioRxivId
      ? `biorxiv: "${escapeYaml(recommendation.identifiers.bioRxivId)}"`
      : undefined,
    "sources:",
    ...recommendation.sources.map((source) => `  - ${source}`),
    "tags:",
    "  - paper",
    "  - daily-paper",
    contentRecall?.label ? `  - ${toTag(contentRecall.label)}` : undefined,
    researchType?.category ? `research_type: "${researchType.category}"` : undefined,
    researchType?.primaryKeyword
      ? `primary_keyword: "${escapeYaml(researchType.primaryKeyword)}"`
      : undefined,
    researchType?.secondaryKeyword
      ? `secondary_keyword: "${escapeYaml(researchType.secondaryKeyword)}"`
      : undefined,
    "---",
    "",
    `# ${title}`,
    "",
    "<!-- daily-paper:start -->",
    "",
    "## Recommendation",
    "",
    `- Rank: ${recommendation.rank}`,
    `- Score: ${roundScore(recommendation.finalScore)}`,
    `- Sources: ${recommendation.sources.join(", ") || "unknown"}`,
    recommendation.publishedAt
      ? `- Published: ${toDateOnly(new Date(recommendation.publishedAt))}`
      : undefined,
    primaryUrl ? `- Link: ${primaryUrl}` : undefined,
    recommendation.identifiers.doi ? `- DOI: ${recommendation.identifiers.doi}` : undefined,
    recommendation.identifiers.pmid ? `- PMID: ${recommendation.identifiers.pmid}` : undefined,
    recommendation.identifiers.arxivId ? `- arXiv: ${recommendation.identifiers.arxivId}` : undefined,
    recommendation.identifiers.bioRxivId ? `- bioRxiv: ${recommendation.identifiers.bioRxivId}` : undefined,
    "",
    "## AI Summary",
    "",
    recommendation.summary
      ? [
          `- Research question: ${recommendation.summary.researchQuestion || "N/A"}`,
          `- Method: ${recommendation.summary.method || "N/A"}`,
          `- Main finding: ${recommendation.summary.mainFinding || "N/A"}`,
          `- Why relevant: ${recommendation.summary.relevanceToUser || "N/A"}`
        ].join("\n")
      : "No generated summary is available yet.",
    "",
    "## Labels",
    "",
    contentRecall?.label ? `- Content recall: ${contentRecall.label}` : "- Content recall: N/A",
    researchType
      ? `- Research type: ${researchType.category ?? "unknown"} | ${
          researchType.primaryKeyword ?? "n/a"
        }${researchType.secondaryKeyword ? `, ${researchType.secondaryKeyword}` : ""}`
      : "- Research type: N/A",
    "",
    "## Recommendation Reasons",
    "",
    recommendation.reasons.length > 0
      ? recommendation.reasons.map((reason) => `- ${reason}`).join("\n")
      : "- No explicit reason tags.",
    "",
    "<!-- daily-paper:end -->",
    "",
    "## My Notes",
    "",
    ""
  ].filter((line): line is string => line !== undefined);

  return `${lines.join("\n")}\n`;
}

export function replaceGeneratedBlock(existing: string, generated: string): string {
  const start = "<!-- daily-paper:start -->";
  const end = "<!-- daily-paper:end -->";
  const startIndex = existing.indexOf(start);
  const endIndex = existing.indexOf(end);

  if (startIndex < 0 || endIndex < startIndex) {
    return existing;
  }

  const generatedStart = generated.indexOf(start);
  const generatedEnd = generated.indexOf(end);
  if (generatedStart < 0 || generatedEnd < generatedStart) {
    return existing;
  }

  const replacement = generated.slice(generatedStart, generatedEnd + end.length);
  return `${existing.slice(0, startIndex)}${replacement}${existing.slice(endIndex + end.length)}`;
}

export function buildPrimaryUrl(recommendation: DailyRecommendationRecord): string | undefined {
  if (recommendation.identifiers.doi) {
    return `https://doi.org/${recommendation.identifiers.doi}`;
  }
  if (recommendation.identifiers.pmid) {
    return `https://pubmed.ncbi.nlm.nih.gov/${recommendation.identifiers.pmid}/`;
  }
  if (recommendation.identifiers.arxivId) {
    return `https://arxiv.org/abs/${recommendation.identifiers.arxivId}`;
  }
  if (recommendation.identifiers.bioRxivId) {
    return `https://www.biorxiv.org/content/${recommendation.identifiers.bioRxivId}`;
  }
  return undefined;
}

function renderDailyRecommendationListItem(recommendation: DailyRecommendationRecord): string[] {
  const title = recommendation.title ?? "Untitled paper";
  const url = buildPrimaryUrl(recommendation);
  return [
    `### ${recommendation.rank}. ${title}`,
    "",
    `- Score: ${roundScore(recommendation.finalScore)}`,
    `- Sources: ${recommendation.sources.join(", ") || "unknown"}`,
    recommendation.publishedAt ? `- Published: ${toDateOnly(new Date(recommendation.publishedAt))}` : "- Published: N/A",
    url ? `- Link: ${url}` : "- Link: N/A",
    recommendation.labels.contentRecall?.label
      ? `- Content recall: ${recommendation.labels.contentRecall.label}`
      : "- Content recall: N/A",
    recommendation.labels.researchType
      ? `- Research type: ${recommendation.labels.researchType.category ?? "unknown"} | ${
          recommendation.labels.researchType.primaryKeyword ?? "n/a"
        }${
          recommendation.labels.researchType.secondaryKeyword
            ? `, ${recommendation.labels.researchType.secondaryKeyword}`
            : ""
        }`
      : "- Research type: N/A",
    ""
  ];
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundScore(value: number): string {
  return value.toFixed(4);
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toTag(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
