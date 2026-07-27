import { NextResponse } from "next/server";

import { rejectCloudCapability, sanitizedInternalError } from "../../../../lib/http/cloud-boundary";

export async function POST() {
  const unavailable = rejectCloudCapability("monthly_profile_job");
  if (unavailable) return unavailable;
  try {
    const { runMonthlyProfileReminderCheck } = await import("../../../../modules/scheduler");
    const result = await runMonthlyProfileReminderCheck();

    return NextResponse.json({ status: "ok", result });
  } catch {
    return sanitizedInternalError("MONTHLY_PROFILE_JOB_FAILED");
  }
}
