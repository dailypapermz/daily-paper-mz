import { NextResponse } from "next/server";

import { runMonthlyProfileReminderCheck } from "../../../../modules/scheduler";

export async function POST() {
  const result = await runMonthlyProfileReminderCheck();

  return NextResponse.json({
    status: "ok",
    result
  });
}
