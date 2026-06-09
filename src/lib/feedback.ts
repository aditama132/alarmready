import type { TriageDecision as RuleEngineDecision } from "./rules";
import type {
  GeneratedDiagnosticBrief,
  TriageDecision as HumanDecisionState
} from "./types";

export const feedbackStorageKey = "alarmready_feedback_v1";

export const feedbackTags = [
  "Too generic",
  "Missing context",
  "Unsafe / too confident",
  "Wrong priority",
  "Wrong interpretation",
  "Wrong note type",
  "Other"
] as const;

export type FeedbackTag = (typeof feedbackTags)[number];
export type FeedbackContextLevel = "low" | "partial" | "high";
export type FeedbackScenarioType = "context_rich_demo" | "custom";
export type FeedbackStorageMode = "local" | "supabase";

export const feedbackAppVersion = "0.1.0";
export const feedbackPromptVersion = "pre-wo-v1";

export type FeedbackRecord = {
  useful: boolean | null;
  tags: string[];
  comment?: string;
  context_level?: FeedbackContextLevel;
  human_decision_state?: HumanDecisionState;
  normalized_priority?: "low" | "medium" | "high";
  wo_readiness?: string;
  ai_suggested_decision_state?: HumanDecisionState | "unknown";
  scenario_type?: FeedbackScenarioType;
  app_version?: string;
  prompt_version?: string;
};

type CreateFeedbackRecordInput = {
  ruleEngineOutput: RuleEngineDecision;
  generatedBrief: GeneratedDiagnosticBrief;
  humanDecisionState: HumanDecisionState;
  useful: boolean | null;
  tags: string[];
  comment: string;
  scenarioType: FeedbackScenarioType;
};

export function createFeedbackRecord(input: CreateFeedbackRecordInput): FeedbackRecord {
  return {
    useful: input.useful,
    tags: [...input.tags],
    ...(input.comment.trim() ? { comment: input.comment.trim() } : {}),
    context_level: mapContextCoverage(input.ruleEngineOutput.contextCoverage),
    human_decision_state: input.humanDecisionState,
    ai_suggested_decision_state:
      input.generatedBrief.suggested_next_move.recommended_decision_state ?? "unknown",
    normalized_priority: input.ruleEngineOutput.priority.normalizedPriority,
    wo_readiness: input.generatedBrief.priority_wo_readiness.wo_readiness,
    scenario_type: input.scenarioType,
    app_version: feedbackAppVersion,
    prompt_version: feedbackPromptVersion
  };
}

export async function saveFeedbackRecord(record: FeedbackRecord): Promise<FeedbackStorageMode> {
  const serverResult = await saveFeedbackRecordToServer(record);

  if (serverResult === "supabase") {
    return "supabase";
  }

  if (!canUseLocalStorage()) {
    return "local";
  }

  const records = getFeedbackRecords();
  window.localStorage.setItem(feedbackStorageKey, JSON.stringify([...records, record]));
  return "local";
}

export function getFeedbackRecords(): FeedbackRecord[] {
  if (!canUseLocalStorage()) {
    return [];
  }

  const rawRecords = window.localStorage.getItem(feedbackStorageKey);

  if (!rawRecords) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRecords) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isFeedbackRecord) : [];
  } catch {
    return [];
  }
}

export function clearFeedbackRecords() {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(feedbackStorageKey);
}

export function exportFeedbackRecords() {
  return JSON.stringify(getFeedbackRecords(), null, 2);
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function isFeedbackRecord(value: unknown): value is FeedbackRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (typeof value.useful === "boolean" || value.useful === null) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    isOptionalString(value.comment) &&
    isOptionalContextLevel(value.context_level) &&
    isOptionalHumanDecisionState(value.human_decision_state) &&
    isOptionalPriority(value.normalized_priority) &&
    isOptionalString(value.wo_readiness) &&
    isOptionalString(value.ai_suggested_decision_state) &&
    isOptionalScenarioType(value.scenario_type) &&
    isOptionalString(value.app_version) &&
    isOptionalString(value.prompt_version)
  );
}

async function saveFeedbackRecordToServer(record: FeedbackRecord) {
  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(record)
    });
    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new Error(getFeedbackApiErrorMessage(data));
    }

    if (isRecord(data) && data.storageMode === "supabase") {
      return "supabase" as const;
    }
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to save feedback.");
  }

  return "local" as const;
}

function mapContextCoverage(value: RuleEngineDecision["contextCoverage"]): FeedbackContextLevel {
  return value === "medium" ? "partial" : value;
}

function getFeedbackApiErrorMessage(value: unknown) {
  if (isRecord(value) && typeof value.error === "string") {
    return value.error;
  }

  return "Failed to save feedback.";
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isOptionalContextLevel(value: unknown) {
  return value === undefined || value === "low" || value === "partial" || value === "high";
}

function isOptionalHumanDecisionState(value: unknown) {
  return (
    value === undefined ||
    value === "monitor" ||
    value === "remote_verify" ||
    value === "update_existing_wo" ||
    value === "create_new_wo" ||
    value === "escalate" ||
    value === "defer" ||
    value === "false_not_actionable"
  );
}

function isOptionalPriority(value: unknown) {
  return value === undefined || value === "low" || value === "medium" || value === "high";
}

function isOptionalScenarioType(value: unknown) {
  return value === undefined || value === "context_rich_demo" || value === "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
