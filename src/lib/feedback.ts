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

export type FeedbackRecord = {
  id: string;
  created_at: string;
  schema_version: 2;
  useful: boolean | null;
  tags: string[];
  comment_provided: boolean;
  comment_length: number;
  mode: "quick" | "context_aware";
  context_coverage: "low" | "medium" | "high";
  human_decision_state: HumanDecisionState;
  ai_suggested_decision_state: HumanDecisionState | "unknown";
  normalized_priority: string;
  wo_readiness: string;
};

type CreateFeedbackRecordInput = {
  ruleEngineOutput: RuleEngineDecision;
  generatedBrief: GeneratedDiagnosticBrief;
  humanDecisionState: HumanDecisionState;
  useful: boolean | null;
  tags: string[];
  comment: string;
};

export function createFeedbackRecord(input: CreateFeedbackRecordInput): FeedbackRecord {
  const createdAt = new Date().toISOString();

  return {
    id: `feedback-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    created_at: createdAt,
    schema_version: 2,
    useful: input.useful,
    tags: [...input.tags],
    comment_provided: input.comment.trim().length > 0,
    comment_length: input.comment.trim().length,
    mode: input.ruleEngineOutput.mode,
    context_coverage: input.ruleEngineOutput.contextCoverage,
    human_decision_state: input.humanDecisionState,
    ai_suggested_decision_state:
      input.generatedBrief.suggested_next_move.recommended_decision_state ?? "unknown",
    normalized_priority: input.generatedBrief.priority_wo_readiness.normalized_priority,
    wo_readiness: input.generatedBrief.priority_wo_readiness.wo_readiness
  };
}

export function saveFeedbackRecord(record: FeedbackRecord) {
  if (!canUseLocalStorage()) {
    return;
  }

  const records = getFeedbackRecords();
  window.localStorage.setItem(feedbackStorageKey, JSON.stringify([...records, record]));
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
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    value.schema_version === 2 &&
    (typeof value.useful === "boolean" || value.useful === null) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    typeof value.comment_provided === "boolean" &&
    typeof value.comment_length === "number" &&
    (value.mode === "quick" || value.mode === "context_aware") &&
    (value.context_coverage === "low" ||
      value.context_coverage === "medium" ||
      value.context_coverage === "high") &&
    typeof value.human_decision_state === "string" &&
    typeof value.ai_suggested_decision_state === "string" &&
    typeof value.normalized_priority === "string" &&
    typeof value.wo_readiness === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
