import type { OperationsDispatcher } from "./types";

const WORKFLOW_FILE = "daily.yml";
const GITHUB_API = "https://api.github.com";

type DispatcherEnvironment = Readonly<Record<string, string | undefined>>;

export class OperationsDispatcherUnavailableError extends Error {
  constructor() {
    super("Operations dispatch is not configured.");
    this.name = "OperationsDispatcherUnavailableError";
  }
}

export class GitHubOperationsDispatcher implements OperationsDispatcher {
  constructor(
    private readonly environment: DispatcherEnvironment = process.env,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async dispatchDaily(input: { runDate: string }): Promise<void> {
    const configuration = readConfiguration(this.environment);
    if (!configuration) throw new OperationsDispatcherUnavailableError();

    const response = await this.fetchImpl(
      `${GITHUB_API}/repos/${encodeURIComponent(configuration.owner)}/${encodeURIComponent(configuration.repo)}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${configuration.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          ref: configuration.ref,
          inputs: { runDate: input.runDate }
        })
      }
    );
    if (!response.ok) {
      throw new Error(`GitHub workflow dispatch failed with status ${response.status}.`);
    }
  }
}

function readConfiguration(environment: DispatcherEnvironment) {
  const owner = environment.OPERATIONS_GITHUB_OWNER?.trim();
  const repo = environment.OPERATIONS_GITHUB_REPO?.trim();
  const token = environment.OPERATIONS_GITHUB_TOKEN?.trim();
  const ref = environment.OPERATIONS_GITHUB_REF?.trim();
  if (!owner || !repo || !token || !ref) return null;
  return { owner, repo, token, ref };
}
