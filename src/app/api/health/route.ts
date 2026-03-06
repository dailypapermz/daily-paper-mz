import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "daily-paper",
    timestamp: new Date().toISOString()
  });
}
