import { NextResponse } from "next/server";

import { verifyCloudflareAccess } from "../../../../lib/http/cloudflare-access";
import {
  isCloudDeployment,
  readJsonMutationBody,
  sanitizedInternalError
} from "../../../../lib/http/cloud-boundary";
import {
  createOperationsDispatcher,
  createOperationsService,
  OperationsDispatcherUnavailableError,
  OperationsError,
  type OperationsAccessVerifier,
  type OperationsDispatcher
} from "../../../../modules/operations";

type RetryDependencies = {
  getRetryDispatch: (runId: string) => Promise<{ runDate: string }>;
  dispatcher: OperationsDispatcher;
  verifyAccess: OperationsAccessVerifier;
  isCloud: () => boolean;
};

export async function POST(request: Request) {
  const service = createOperationsService();
  return handleOperationsRetry(request, {
    getRetryDispatch: (runId) => service.getRetryDispatch(runId),
    dispatcher: createOperationsDispatcher(),
    verifyAccess: async (accessRequest) => verifyCloudflareAccess(accessRequest),
    isCloud: isCloudDeployment
  });
}

export async function handleOperationsRetry(
  request: Request,
  dependencies: RetryDependencies
): Promise<NextResponse> {
  if (dependencies.isCloud()) {
    const access = await dependencies.verifyAccess(request);
    if (!access.ok) return accessDenied(access.code);
  }

  const body = await readJsonMutationBody(request, { maxBytes: 1_024 });
  if (!body.ok) return body.response;
  const parsed = parseRetryBody(body.value);
  if (!parsed.ok) {
    return NextResponse.json(
      { status: "error", code: "INVALID_RETRY_REQUEST", message: "Body must contain only action='retry' and a valid runId." },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  try {
    const dispatch = await dependencies.getRetryDispatch(parsed.runId);
    await dependencies.dispatcher.dispatchDaily(dispatch);
    return NextResponse.json(
      { status: "accepted", action: "retry", runId: parsed.runId, runDate: dispatch.runDate },
      { status: 202, headers: noStoreHeaders() }
    );
  } catch (error) {
    if (error instanceof OperationsError) {
      return NextResponse.json(
        { status: "error", code: error.code, message: error.message },
        { status: error.statusCode, headers: noStoreHeaders() }
      );
    }
    if (error instanceof OperationsDispatcherUnavailableError) {
      return NextResponse.json(
        {
          status: "unavailable",
          code: "OPERATIONS_DISPATCH_UNAVAILABLE",
          message: "Operations retry is not configured in this deployment."
        },
        { status: 503, headers: noStoreHeaders() }
      );
    }
    const response = sanitizedInternalError("OPERATIONS_DISPATCH_FAILED");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}

function parseRetryBody(value: unknown): { ok: true; runId: string } | { ok: false } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== "action" || keys[1] !== "runId") return { ok: false };
  if (body.action !== "retry") return { ok: false };
  if (typeof body.runId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.runId)) {
    return { ok: false };
  }
  return { ok: true, runId: body.runId };
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
