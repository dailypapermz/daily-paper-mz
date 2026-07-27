export type DeploymentMode = "local" | "cloud";
export type DatabaseProvider = "sqlite" | "postgresql";

export type DatabaseRuntime = {
  mode: DeploymentMode;
  provider: DatabaseProvider;
  databaseUrl: string;
};

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveDatabaseRuntime(
  environment: DatabaseEnvironment = process.env
): DatabaseRuntime {
  const configuredMode = environment.DEPLOYMENT_MODE?.trim().toLowerCase();
  const mode = configuredMode || "local";
  if (mode !== "local" && mode !== "cloud") {
    throw new Error("DEPLOYMENT_MODE must be local or cloud before creating a database client.");
  }

  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(`DATABASE_URL is required for ${mode} database mode.`);
  }

  if (mode === "local") {
    if (!databaseUrl.startsWith("file:")) {
      throw new Error("Local database mode requires a file: SQLite DATABASE_URL.");
    }
    return { mode, provider: "sqlite", databaseUrl };
  }

  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("Cloud database mode requires a postgresql: or postgres: DATABASE_URL.");
  }
  return { mode, provider: "postgresql", databaseUrl };
}
