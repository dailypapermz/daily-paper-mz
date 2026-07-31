import {
  buildProductionDailyRequestKey,
  type PersistedDailyWorkflowRun
} from "../../scripts/daily-workflow-state.mjs";

export type DailyWorkflowGuardDatabase = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export async function findPersistedProductionDailyRun(
  db: DailyWorkflowGuardDatabase,
  businessDate: string
): Promise<PersistedDailyWorkflowRun | null> {
  const table = await db.$queryRawUnsafe<Array<{ relation: string | null }>>(
    `SELECT to_regclass('"DailyIngestionRun"')::text AS "relation"`
  );
  if (!table[0]?.relation) return null;

  const rows = await db.$queryRawUnsafe<PersistedDailyWorkflowRun[]>(
    `SELECT
       r."id",
       r."pipelineStatus"::text AS "pipelineStatus",
       (to_jsonb(r) ? 'notificationDeliveryStatus') AS "hasNotificationDeliveryStatus",
       to_jsonb(r) ->> 'notificationDeliveryStatus' AS "notificationDeliveryStatus"
     FROM "DailyIngestionRun" AS r
     WHERE r."requestKey" = $1
     LIMIT 1`,
    buildProductionDailyRequestKey(businessDate)
  );
  return rows[0] ?? null;
}
