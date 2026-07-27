import { NextResponse } from "next/server";

const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

export function isCloudDeployment(): boolean {
  return process.env.DEPLOYMENT_MODE?.trim().toLowerCase() === "cloud";
}

export function cloudCapabilityUnavailable(capability: string): NextResponse {
  return NextResponse.json(
    {
      status: "unavailable",
      code: "CAPABILITY_UNAVAILABLE_IN_CLOUD",
      capability,
      message: "This operation is not available from the Cloud Mode web runtime."
    },
    { status: 503 }
  );
}

export function rejectCloudCapability(capability: string): NextResponse | null {
  return isCloudDeployment() ? cloudCapabilityUnavailable(capability) : null;
}

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

export async function readJsonMutationBody(
  request: Request,
  options: { maxBytes?: number } = {}
): Promise<JsonBodyResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;

  if (isCloudDeployment()) {
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
      return invalidRequest(
        "UNSUPPORTED_MEDIA_TYPE",
        "Cloud Mode mutations require Content-Type: application/json.",
        415
      );
    }

    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return invalidRequest("ORIGIN_MISMATCH", "The request origin is not allowed.", 403);
    }

    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin") {
      return invalidRequest("CROSS_SITE_REQUEST", "Cross-site mutations are not allowed.", 403);
    }

    const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return invalidRequest("PAYLOAD_TOO_LARGE", "The JSON request body is too large.", 413);
    }
  }

  const text = await request.text().catch(() => "");
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return invalidRequest("PAYLOAD_TOO_LARGE", "The JSON request body is too large.", 413);
  }

  try {
    return { ok: true, value: text.trim() ? JSON.parse(text) : {} };
  } catch {
    return invalidRequest("INVALID_JSON", "The request body must contain valid JSON.", 400);
  }
}

export function sanitizedInternalError(code = "INTERNAL_ERROR"): NextResponse {
  return NextResponse.json(
    {
      status: "error",
      code,
      message: "The request could not be completed."
    },
    { status: 500 }
  );
}

export function appErrorResponse(error: {
  code: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
}): NextResponse {
  if (isCloudDeployment() && error.statusCode >= 500) {
    return sanitizedInternalError(error.code);
  }
  return NextResponse.json(
    {
      status: "error",
      code: error.code,
      message: error.message,
      ...(isCloudDeployment() ? {} : { details: error.details })
    },
    { status: error.statusCode }
  );
}

function invalidRequest(code: string, message: string, status: number): JsonBodyResult {
  return {
    ok: false,
    response: NextResponse.json({ status: "error", code, message }, { status })
  };
}
