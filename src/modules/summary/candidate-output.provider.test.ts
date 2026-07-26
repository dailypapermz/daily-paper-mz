import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCandidateOutputProvider,
  GenericLlmCandidateOutputProvider,
  UnavailableCandidateOutputProvider
} from "./candidate-output.provider";

describe("createCandidateOutputProvider", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns unavailable provider when api config is missing", () => {
    const provider = createCandidateOutputProvider({});

    expect(provider).toBeInstanceOf(UnavailableCandidateOutputProvider);
  });

  it("uses configured model when provided", () => {
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      model: "glm-4.6v"
    });

    expect(provider).toBeInstanceOf(GenericLlmCandidateOutputProvider);
    expect((provider as GenericLlmCandidateOutputProvider)["model"]).toBe("glm-4.6v");
  });

  it("falls back to the default model when model is blank", () => {
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      model: "   "
    });

    expect(provider).toBeInstanceOf(GenericLlmCandidateOutputProvider);
    expect((provider as GenericLlmCandidateOutputProvider)["model"]).toBe("gpt-4o-mini");
  });

  it("reports non-secret readiness and execution limits", () => {
    const provider = createCandidateOutputProvider({
      apiKey: "secret-token",
      apiBaseUrl: "https://example.com/v1",
      model: "model-1",
      timeoutMs: 1234,
      maxRetries: 3,
      concurrency: 2
    });

    expect(provider.getHealth()).toEqual({
      name: "generic-llm",
      status: "ready",
      model: "model-1",
      endpoint: "https://example.com/v1",
      timeoutMs: 1234,
      maxRetries: 3,
      concurrency: 2
    });
    expect(JSON.stringify(provider.getHealth())).not.toContain("secret-token");
  });

  it("retries transient responses and accepts strictly valid labels", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: JSON.stringify({
          contentRecallLabel: "single-cell atlas",
          researchType: {
            category: "resource",
            primaryKeyword: "atlas",
            secondaryKeyword: "single-cell"
          }
        }) } }]
      }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      maxRetries: 1
    });

    const labels = await provider.generateLabels(candidateFixture());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(labels.researchType?.category).toBe("resource");
  });

  it("generates and validates labels in batches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: JSON.stringify({
        items: [
          {
            candidateId: "candidate-1",
            labels: {
              contentRecallLabel: "single-cell atlas",
              researchType: {
                category: "resource",
                primaryKeyword: "atlas",
                secondaryKeyword: "single-cell"
              }
            }
          },
          {
            candidateId: "candidate-2",
            labels: {
              contentRecallLabel: "regulatory genomics",
              researchType: {
                category: "method",
                primaryKeyword: "motif",
                secondaryKeyword: "chromatin"
              }
            }
          }
        ]
      }) } }]
    })) as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      maxRetries: 0
    });

    const labels = await provider.generateLabelsBatch!([
      candidateFixture(),
      { ...candidateFixture(), candidateId: "candidate-2" }
    ]);

    expect(labels).toHaveLength(2);
    expect(labels[1].candidateId).toBe("candidate-2");
    expect(labels[1].labels.researchType?.category).toBe("method");
  });

  it("rejects invalid output with an actionable field path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: JSON.stringify({
        researchQuestion: "question",
        method: 42,
        mainFinding: "finding",
        relevanceToUser: "relevance"
      }) } }]
    })) as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      maxRetries: 0
    });

    await expect(provider.generateSummary(candidateFixture())).rejects.toMatchObject({
      code: "CANDIDATE_OUTPUT_INVALID_SCHEMA",
      details: { path: "summary.method" }
    });
  });

  it("rejects structurally valid but empty generated content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: JSON.stringify({
        researchQuestion: "",
        method: "",
        mainFinding: "",
        relevanceToUser: ""
      }) } }]
    })) as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      maxRetries: 0
    });

    await expect(provider.generateSummary(candidateFixture())).rejects.toMatchObject({
      code: "CANDIDATE_OUTPUT_INVALID_SCHEMA",
      details: { path: "summary" }
    });
  });

  it("accepts Chinese summaries with English technical names and requests evidence-bounded Chinese prose", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: JSON.stringify({
        researchQuestion: "研究旨在解析单细胞染色质可及性的变化。",
        method: "作者使用 scATAC-seq 进行单细胞分析。",
        mainFinding: "结果显示候选调控元件具有细胞类型特异性。",
        relevanceToUser: "该方法可为类似数据的分析流程提供参考。"
      }) } }]
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      maxRetries: 0
    });

    const summary = await provider.generateSummary(candidateFixture());

    expect(summary.method).toContain("scATAC-seq");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.messages[1].content).toContain("Simplified Chinese");
    expect(request.messages[1].content).toContain("do not claim knowledge of the user's profile");
    expect(request.messages[1].content).toContain("not a full-text review");
  });

  it("rejects an all-English generated summary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: JSON.stringify({
        researchQuestion: "What changes across cell types?",
        method: "The authors use scATAC-seq.",
        mainFinding: "Accessibility differs across cell types.",
        relevanceToUser: "The workflow may be reusable."
      }) } }]
    })) as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      maxRetries: 0
    });

    await expect(provider.generateSummary(candidateFixture())).rejects.toMatchObject({
      code: "CANDIDATE_OUTPUT_INVALID_SCHEMA",
      details: { path: "summary.researchQuestion" }
    });
  });

  it("aborts timed-out requests and reports configured retry exhaustion", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch);
    const provider = createCandidateOutputProvider({
      apiKey: "token",
      apiBaseUrl: "https://example.com/v1",
      timeoutMs: 5,
      maxRetries: 0
    });

    await expect(provider.generateSummary(candidateFixture())).rejects.toMatchObject({
      code: "CANDIDATE_OUTPUT_PROVIDER_REQUEST_FAILED",
      details: { timeoutMs: 5, maxRetries: 0 }
    });
  });
});

function candidateFixture() {
  return {
    candidateId: "candidate-1",
    runId: "run-1",
    canonicalKey: "key-1",
    title: "Single-cell atlas",
    sourceProvenance: []
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
