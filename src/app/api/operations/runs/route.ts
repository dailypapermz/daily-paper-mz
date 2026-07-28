import { NextResponse } from "next/server";

import { verifyCloudflareAccess } from "../../../../lib/http/cloudflare-access";
import { isCloudDeployment, sanitizedInternalError } from "../../../../lib/http/cloud-boundary";
import {
  createOperationsService,
  OPERATIONS_DEFAULT_LIMIT,
  OPERATIONS_MAX_LIMIT,
  sanitizeOperationsError,
  type OperationsAccessVerifier
} from "../../../../modules/operations";

export const dynamic = "force-dynamic";

type RunsDependencies = {
  listRecentRuns: (limit: number) => Promise<unknown[]>;
  verifyAccess: OperationsAccessVerifier;
  isCloud: () => boolean;
};

const defaultDependencies: RunsDependencies = {
  listRecentRuns: (limit) => createOperationsService().listRecentRuns(limit),
  verifyAccess: async (request) => verifyCloudflareAccess(request),
  isCloud: isCloudDeployment
};

export async function GET(request: Request) {
  return handleOperationsRuns(request, defaultDependencies);
}

export async function handleOperationsRuns(
  request: Request,
  dependencies: RunsDependencies
): Promise<NextResponse> {
  if (dependencies.isCloud()) {
    const access = await dependencies.verifyAccess(request);
    if (!access.ok) return accessDenied(access.code);
  }

  const limitResult = parseLimit(new URL(request.url).searchParams.get("limit"));
  if (!limitResult.ok) {
    return NextResponse.json(
      { status: "error", code: "INVALID_LIMIT", message: `limit must be an integer from 1 to ${OPERATIONS_MAX_LIMIT}.` },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  try {
    const runs = await dependencies.listRecentRuns(limitResult.limit);
    return NextResponse.json(
      { status: "ok", runs },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error("Operations runs read failed", {
      name: sanitizeOperationsError(error instanceof Error ? error.name : "UnknownError"),
      message: sanitizeOperationsError(error instanceof Error ? error.message : String(error))
    });
    const response = sanitizedInternalError("OPERATIONS_READ_FAILED");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

function parseLimit(value: string | null): { ok: true; limit: number } | { ok: false } {
  if (value === null) return { ok: true, limit: OPERATIONS_DEFAULT_LIMIT };
  if (!/^\d+$/.test(value)) return { ok: false };
  const limit = Number(value);
  return Number.isInteger(limit) && limit >= 1 && limit <= OPERATIONS_MAX_LIMIT
    ? { ok: true, limit }
    : { ok: false };
}

function accessDenied(code: string) {
  return NextResponse.json(
    { status: "error", code, message: "Cloudflare Access authentication is required." },
    { status: 403, headers: noStoreHeaders() }
  );
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store" };
}
