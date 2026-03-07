import { createProfileRefreshService } from "../modules/profile-build";

export async function runMonthlyProfileReminder() {
  const service = createProfileRefreshService();
  return service.runMonthlyReminderCheck();
}
