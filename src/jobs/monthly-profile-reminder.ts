import { runMonthlyProfileReminderCheck } from "../modules/scheduler";

export async function runMonthlyProfileReminder() {
  return runMonthlyProfileReminderCheck();
}
