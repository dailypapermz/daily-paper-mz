export type TriageAction = "save" | "dismiss" | "promote";

export function excludeDismissedRecommendations<T extends { candidateId: string }>(
  recommendations: readonly T[],
  actions: Readonly<Record<string, TriageAction | undefined>>
): T[] {
  return recommendations.filter((recommendation) => actions[recommendation.candidateId] !== "dismiss");
}

export function latestTriageActions(logs: unknown): Record<string, TriageAction> {
  if (!Array.isArray(logs)) {
    return {};
  }

  const state: Record<string, TriageAction> = {};

  for (const entry of logs) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const candidateId = (entry as Record<string, unknown>).candidateId;
    const actionType = (entry as Record<string, unknown>).actionType;
    if (
      typeof candidateId !== "string" ||
      candidateId === "" ||
      candidateId in state ||
      !isTriageAction(actionType)
    ) {
      continue;
    }

    state[candidateId] = actionType;
  }

  return state;
}

function isTriageAction(value: unknown): value is TriageAction {
  return value === "save" || value === "dismiss" || value === "promote";
}
