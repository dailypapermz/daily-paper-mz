import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnvValidationError } from "../../lib/config";

const mocks = vi.hoisted(() => ({
  getEnv: vi.fn(),
  client: vi.fn(),
  repository: vi.fn(),
  service: vi.fn()
}));

vi.mock("../../lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/config")>();
  return { ...actual, getEnv: mocks.getEnv };
});
vi.mock("./zotero-client", () => ({ HttpZoteroClient: mocks.client }));
vi.mock("../../db/repositories", () => ({ PrismaZoteroSyncRepository: mocks.repository }));
vi.mock("./zotero-sync.service", () => ({ DefaultZoteroSyncService: mocks.service }));

import { createZoteroSyncService } from "./factory";

describe("createZoteroSyncService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [{ ZOTERO_KEY: "secret-key" }, ["ZOTERO_ID"]],
    [{ ZOTERO_ID: "12345" }, ["ZOTERO_KEY"]],
    [{}, ["ZOTERO_ID", "ZOTERO_KEY"]]
  ])("rejects missing Zotero Web credentials before constructing dependencies", (env, expectedMissing) => {
    mocks.getEnv.mockReturnValue(env);

    let thrown: unknown;
    try {
      createZoteroSyncService();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(EnvValidationError);
    expect((thrown as EnvValidationError).missingKeys).toEqual(expectedMissing);
    expect((thrown as Error).message).not.toContain("secret-key");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.repository).not.toHaveBeenCalled();
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("constructs the Web client when both credentials are present", () => {
    const client = {};
    const repository = {};
    const service = {};
    mocks.getEnv.mockReturnValue({ ZOTERO_ID: "12345", ZOTERO_KEY: "secret-key" });
    mocks.client.mockReturnValue(client);
    mocks.repository.mockReturnValue(repository);
    mocks.service.mockReturnValue(service);

    expect(createZoteroSyncService()).toBe(service);
    expect(mocks.client).toHaveBeenCalledWith({ userId: "12345", apiKey: "secret-key" });
    expect(mocks.repository).toHaveBeenCalledOnce();
    expect(mocks.service).toHaveBeenCalledWith(client, repository);
  });
});
