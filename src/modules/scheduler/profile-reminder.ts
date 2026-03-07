import { createProfileRefreshService } from "../profile-build";

export async function runMonthlyProfileReminderCheck() {
  const service = createProfileRefreshService();
  return service.runMonthlyReminderCheck();
}
