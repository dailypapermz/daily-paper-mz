import { NextResponse } from "next/server";
import { EnvValidationError, getEnv } from "../../../lib/config";

export function GET() {
  try {
    const env = getEnv();
    return NextResponse.json({
      status: "ok",
      service: "daily-paper",
      timestamp: new Date().toISOString(),
      requiredConfigLoaded: {
        databaseUrl: Boolean(env.DATABASE_URL),
        zoteroKey: Boolean(env.ZOTERO_KEY),
        zoteroId: Boolean(env.ZOTERO_ID)
      }
    });
  } catch (error) {
    if (error instanceof EnvValidationError) {
      return NextResponse.json(
        {
          status: "error",
          code: "ENV_VALIDATION_ERROR",
          missingKeys: error.missingKeys,
          message: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: "error",
        code: "UNKNOWN_ERROR"
      },
      { status: 500 }
    );
  }
}
