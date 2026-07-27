import type { CloudProfileOperation, CloudProfileResult } from "./cloud-profile";

export type ProfileCliDependencies = {
  run(operation: CloudProfileOperation): Promise<CloudProfileResult>;
  disconnect(): Promise<void>;
  writeResult(result: CloudProfileResult | { operation?: CloudProfileOperation; status: "failed" }): void;
};

export function parseProfileArgs(args: string[]): CloudProfileOperation {
  if (args.length !== 2 || args[0] !== "--operation") {
    throw new Error("Usage: cloud profile --operation <sync|refresh>");
  }
  if (args[1] !== "sync" && args[1] !== "refresh") {
    throw new Error("--operation must be sync or refresh");
  }
  return args[1];
}

export async function executeProfileCli(
  args: string[],
  dependencies: ProfileCliDependencies
): Promise<0 | 1> {
  let operation: CloudProfileOperation | undefined;
  try {
    operation = parseProfileArgs(args);
    dependencies.writeResult(await dependencies.run(operation));
    return 0;
  } catch {
    dependencies.writeResult({ operation, status: "failed" });
    return 1;
  } finally {
    await dependencies.disconnect();
  }
}
