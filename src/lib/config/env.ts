export class EnvValidationError extends Error {
  missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(`Missing required environment variables: ${missingKeys.join(", ")}`);
    this.name = "EnvValidationError";
    this.missingKeys = missingKeys;
  }
}

export type AppEnv = {
  DATABASE_URL: string;
  ZOTERO_KEY: string;
  ZOTERO_ID: string;
  LLM_API_KEY?: string;
  LLM_API_BASE_URL?: string;
  LLM_MODEL?: string;
  EASYSCHOLAR_API_KEY?: string;
  EASYSCHOLAR_API_URL?: string;
  JOURNAL_ENRICHMENT_CACHE_TTL_HOURS: number;
  ARXIV_CATEGORY_SCOPES: string[];
  BIORXIV_SUBJECT_SCOPES: string[];
  PUBMED_QUERY_SCOPE?: string;
  JOURNAL_FEED_URLS: string[];
};

let cachedEnv: AppEnv | null = null;

function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function loadEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const requiredKeys = ["DATABASE_URL", "ZOTERO_KEY", "ZOTERO_ID"] as const;
  const missing = requiredKeys.filter((key) => {
    const value = rawEnv[key];
    return value === undefined || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new EnvValidationError([...missing]);
  }

  return {
    DATABASE_URL: rawEnv.DATABASE_URL as string,
    ZOTERO_KEY: rawEnv.ZOTERO_KEY as string,
    ZOTERO_ID: rawEnv.ZOTERO_ID as string,
    LLM_API_KEY: rawEnv.LLM_API_KEY,
    LLM_API_BASE_URL: rawEnv.LLM_API_BASE_URL,
    LLM_MODEL: rawEnv.LLM_MODEL,
    EASYSCHOLAR_API_KEY: rawEnv.EASYSCHOLAR_API_KEY,
    EASYSCHOLAR_API_URL: rawEnv.EASYSCHOLAR_API_URL,
    JOURNAL_ENRICHMENT_CACHE_TTL_HOURS: parsePositiveInteger(
      rawEnv.JOURNAL_ENRICHMENT_CACHE_TTL_HOURS,
      24 * 30
    ),
    ARXIV_CATEGORY_SCOPES: parseList(rawEnv.ARXIV_CATEGORY_SCOPES),
    BIORXIV_SUBJECT_SCOPES: parseList(rawEnv.BIORXIV_SUBJECT_SCOPES),
    PUBMED_QUERY_SCOPE: rawEnv.PUBMED_QUERY_SCOPE,
    JOURNAL_FEED_URLS: parseList(rawEnv.JOURNAL_FEED_URLS)
  };
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }
  cachedEnv = loadEnv();
  return cachedEnv;
}
