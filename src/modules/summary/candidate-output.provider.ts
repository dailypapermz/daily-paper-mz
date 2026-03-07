import { AppError } from "../../lib/errors";
import type { CandidateGeneratedOutput, CandidateOutputProvider } from "./types";

type GenericLlmProviderOptions = {
  apiKey: string;
  apiBaseUrl: string;
  model?: string;
};

export class UnavailableCandidateOutputProvider implements CandidateOutputProvider {
  readonly name = "unavailable";

  constructor(private readonly reason = "Candidate output provider is not configured") {}

  async generateOutput(): Promise<CandidateGeneratedOutput> {
    throw new AppError("CANDIDATE_OUTPUT_UNAVAILABLE", this.reason, 503);
  }
}

export class GenericLlmCandidateOutputProvider implements CandidateOutputProvider {
  readonly name = "generic-llm";
  private readonly endpoint: string;
  private readonly model: string;

  constructor(private readonly options: GenericLlmProviderOptions) {
    this.endpoint = options.apiBaseUrl.replace(/\/+$/, "");
    this.model = options.model ?? "gpt-4o-mini";
  }

  async generateOutput(input: {
    candidateId: string;
    runId: string;
    canonicalKey: string;
    title?: string;
    abstractNote?: string;
    journalName?: string;
    doi?: string;
    sourceProvenance: Array<{ source: "biorxiv" | "arxiv" | "pubmed" | "journal"; externalId: string }>;
  }): Promise<CandidateGeneratedOutput> {
    const prompt = buildPrompt(input);

    const response = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "Return only valid JSON. Keep wording concise, factual, and suitable for later user editing."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: {
          type: "json_object"
        }
      })
    });

    if (!response.ok) {
      throw new AppError(
        "CANDIDATE_OUTPUT_PROVIDER_ERROR",
        `Candidate output generation failed with status ${response.status}`,
        502
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new AppError(
        "CANDIDATE_OUTPUT_PROVIDER_ERROR",
        "Candidate output generation response is missing content",
        502
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AppError(
        "CANDIDATE_OUTPUT_PROVIDER_ERROR",
        "Candidate output generation did not return valid JSON",
        502
      );
    }

    return normalizeGeneratedOutput(parsed);
  }
}

export function createCandidateOutputProvider(input: {
  apiKey?: string;
  apiBaseUrl?: string;
}): CandidateOutputProvider {
  const apiKey = input.apiKey?.trim();
  const apiBaseUrl = input.apiBaseUrl?.trim();

  if (!apiKey || !apiBaseUrl) {
    return new UnavailableCandidateOutputProvider(
      "LLM configuration is missing. Set LLM_API_KEY and LLM_API_BASE_URL."
    );
  }

  return new GenericLlmCandidateOutputProvider({
    apiKey,
    apiBaseUrl
  });
}

function buildPrompt(input: {
  title?: string;
  abstractNote?: string;
  journalName?: string;
  doi?: string;
  sourceProvenance: Array<{ source: "biorxiv" | "arxiv" | "pubmed" | "journal"; externalId: string }>;
}) {
  const context = {
    title: input.title ?? "",
    abstract: input.abstractNote ?? "",
    journal: input.journalName ?? "",
    doi: input.doi ?? "",
    sources: input.sourceProvenance
  };

  return `
Generate structured JSON with this exact shape:
{
  "summary": {
    "researchQuestion": "string",
    "method": "string",
    "mainFinding": "string",
    "relevanceToUser": "string"
  },
  "labels": {
    "contentRecallLabel": "string",
    "researchType": {
      "category": "method|biology|resource|benchmark",
      "primaryKeyword": "string",
      "secondaryKeyword": "string"
    }
  }
}

Use empty strings when information is missing.
Input:
${JSON.stringify(context)}
`.trim();
}

function normalizeGeneratedOutput(value: unknown): CandidateGeneratedOutput {
  const record = toObject(value);
  const summaryRecord = toObject(record.summary);
  const labelsRecord = toObject(record.labels);
  const researchTypeRecord = toObject(labelsRecord.researchType);

  const category = normalizeCategory(researchTypeRecord.category);

  return {
    summary: {
      researchQuestion: toStringValue(summaryRecord.researchQuestion) ?? "",
      method: toStringValue(summaryRecord.method) ?? "",
      mainFinding: toStringValue(summaryRecord.mainFinding) ?? "",
      relevanceToUser: toStringValue(summaryRecord.relevanceToUser) ?? ""
    },
    labels: {
      contentRecallLabel: toStringValue(labelsRecord.contentRecallLabel),
      researchType: {
        category,
        primaryKeyword: toStringValue(researchTypeRecord.primaryKeyword),
        secondaryKeyword: toStringValue(researchTypeRecord.secondaryKeyword),
        rawText: buildResearchTypeRawText({
          category,
          primaryKeyword: toStringValue(researchTypeRecord.primaryKeyword),
          secondaryKeyword: toStringValue(researchTypeRecord.secondaryKeyword)
        })
      }
    }
  };
}

function normalizeCategory(value: unknown): "method" | "biology" | "resource" | "benchmark" | undefined {
  const normalized = toStringValue(value)?.toLowerCase();
  if (
    normalized === "method" ||
    normalized === "biology" ||
    normalized === "resource" ||
    normalized === "benchmark"
  ) {
    return normalized;
  }
  return undefined;
}

function buildResearchTypeRawText(input: {
  category?: "method" | "biology" | "resource" | "benchmark";
  primaryKeyword?: string;
  secondaryKeyword?: string;
}) {
  if (!input.category && !input.primaryKeyword && !input.secondaryKeyword) {
    return undefined;
  }

  const category = input.category ?? "method";
  const primary = input.primaryKeyword ?? "";
  const secondary = input.secondaryKeyword ? `, ${input.secondaryKeyword}` : "";
  return `${category} | ${primary}${secondary}`.trim();
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
