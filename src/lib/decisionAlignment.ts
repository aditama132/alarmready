import type { TriageDecision as RuleEngineDecision } from "./rules";
import type {
  GeneratedDiagnosticBrief,
  TriageDecision as HumanDecisionState
} from "./types";

export type DecisionAlignmentStatus = "aligned" | "mismatch" | "high_risk_mismatch";

export type DecisionMismatchType =
  | "duplicate_work_risk"
  | "under_response_risk"
  | "over_response_risk"
  | "not_ready_but_create_work"
  | "safety_context_downgraded"
  | "unclear";

export type DecisionAlignment = {
  alignment: DecisionAlignmentStatus;
  mismatchType: DecisionMismatchType;
  message: string;
  requiresReason: boolean;
};

type DecisionAlignmentInput = {
  aiSuggestedNextMove: string;
  selectedHumanDecision: HumanDecisionState;
  triageResult: RuleEngineDecision;
  generatedBrief: GeneratedDiagnosticBrief;
};

const passiveDecisions: HumanDecisionState[] = [
  "monitor",
  "defer",
  "false_not_actionable"
];
const strongerThanRemoteDecisions: HumanDecisionState[] = ["create_new_wo", "escalate"];

export function mapSuggestedMoveToDecisionState(
  text: string
): HumanDecisionState | null {
  const value = normalizeSuggestionText(text);

  if (!value) {
    return null;
  }

  if (
    /(?:update|link|add|append|attach|reference).{0,48}(?:existing|current|open)\s*(?:wo|work order)/.test(
      value
    ) ||
    /(?:existing|current|open)\s*(?:wo|work order).{0,48}(?:update|link|add|append|attach|reference)/.test(
      value
    )
  ) {
    return "update_existing_wo";
  }

  if (/escalat|oem|specialist|expert review|manager review|engineering review/.test(value)) {
    return "escalate";
  }

  if (
    /create.{0,20}(?:new\s*)?(?:wo|work order)/.test(value) ||
    /new\s*(?:wo|work order)/.test(value) ||
    /prepare.{0,24}(?:wo|work order)/.test(value) ||
    /technician handoff/.test(value)
  ) {
    return "create_new_wo";
  }

  if (
    /remote verify|remote verification|verify remotely|remotely verify|remote checks?|remote actions?|validate remotely|review remotely/.test(
      value
    )
  ) {
    return "remote_verify";
  }

  if (/false alarm|not actionable|non-action|no action/.test(value)) {
    return "false_not_actionable";
  }

  if (/defer|delay|hold|postpone|review later/.test(value)) {
    return "defer";
  }

  if (/monitor|watch|observe|continue monitoring/.test(value)) {
    return "monitor";
  }

  return null;
}

export function evaluateDecisionAlignment({
  aiSuggestedNextMove,
  selectedHumanDecision,
  triageResult,
  generatedBrief
}: DecisionAlignmentInput): DecisionAlignment {
  const suggestedDecision =
    getStructuredSuggestedDecision(generatedBrief) ??
    mapSuggestedMoveToDecisionState(aiSuggestedNextMove);
  const selectedIsPassive = passiveDecisions.includes(selectedHumanDecision);
  const selectedIsStrongerThanRemote = strongerThanRemoteDecisions.includes(
    selectedHumanDecision
  );
  const aiSuggestsEscalation = suggestedDecision === "escalate" || suggestsEscalation(aiSuggestedNextMove);
  const duplicateWorkRisk = hasDuplicateOrExistingWorkRisk(triageResult);
  const notReadyForNewWork = isNotReadyOrRemoteReadiness(
    generatedBrief.priority_wo_readiness.wo_readiness
  );
  const safetyContext = hasSafetyRelevantContext(triageResult, generatedBrief);
  const highPriority =
    triageResult.priority.normalizedPriority === "high" ||
    normalizeSuggestionText(generatedBrief.priority_wo_readiness.normalized_priority) === "high";

  if (safetyContext && selectedIsPassive) {
    return {
      alignment: "high_risk_mismatch",
      mismatchType: "safety_context_downgraded",
      message: "Safety-relevant context exists. Add a clear rationale and review/escalation trigger.",
      requiresReason: true
    };
  }

  if (duplicateWorkRisk && selectedHumanDecision === "create_new_wo") {
    return {
      alignment: "high_risk_mismatch",
      mismatchType: "duplicate_work_risk",
      message:
        "Triage checks suggest existing work may already cover this issue. Confirm why a new WO is needed and consider linking to the existing WO.",
      requiresReason: true
    };
  }

  if (notReadyForNewWork && selectedHumanDecision === "create_new_wo") {
    return {
      alignment: "high_risk_mismatch",
      mismatchType: "not_ready_but_create_work",
      message:
        "Triage checks indicate more verification may be needed before creating work. Add why creating a WO is still appropriate.",
      requiresReason: true
    };
  }

  if ((highPriority || aiSuggestsEscalation) && selectedIsPassive) {
    return {
      alignment: "high_risk_mismatch",
      mismatchType: "under_response_risk",
      message:
        "The selected decision is less active than the triage recommendation. Add a review trigger or rationale before generating the note.",
      requiresReason: true
    };
  }

  if (
    (suggestedDecision === "monitor" || suggestedDecision === "remote_verify") &&
    selectedIsStrongerThanRemote
  ) {
    return {
      alignment: "mismatch",
      mismatchType: "over_response_risk",
      message:
        "The selected decision is stronger than the triage recommendation. Add the additional context that justifies this action.",
      requiresReason: false
    };
  }

  if (suggestedDecision === "update_existing_wo" && selectedHumanDecision === "remote_verify") {
    return {
      alignment: "mismatch",
      mismatchType: "unclear",
      message:
        "Triage guidance suggests updating the existing WO as the primary action. Remote verification can still be included as the supporting condition.",
      requiresReason: false
    };
  }

  if (suggestedDecision && suggestedDecision !== selectedHumanDecision) {
    return {
      alignment: "mismatch",
      mismatchType: "unclear",
      message:
        "The selected decision differs from the AI-suggested next move. Add a short rationale so the note preserves why you chose a different action.",
      requiresReason: false
    };
  }

  return {
    alignment: "aligned",
    mismatchType: "unclear",
    message: "",
    requiresReason: false
  };
}

function hasDuplicateOrExistingWorkRisk(triageResult: RuleEngineDecision) {
  const riskCodes = new Set([
    "duplicate_wo_risk",
    "update_or_link_open_wo",
    "update_scheduled_wo_first",
    "possible_failed_closure"
  ]);
  const findings = [...triageResult.duplicateFindings, ...triageResult.relatedWorkFindings];

  return (
    findings.some((finding) => riskCodes.has(finding.code)) ||
    /existing|open wo|open work order|scheduled wo|update or link|link the existing|review the scheduled/i.test(
      triageResult.recommendedAction
    )
  );
}

function isNotReadyOrRemoteReadiness(value: string) {
  return /not ready|ready after remote verification|remote verification|remote verify|verify before|more verification/i.test(
    value
  );
}

function hasSafetyRelevantContext(
  triageResult: RuleEngineDecision,
  generatedBrief: GeneratedDiagnosticBrief
) {
  const referenceSafety = triageResult.faultCodeReference?.safetyRelevance;

  if (referenceSafety === "safety_relevant" || referenceSafety === "safety_critical") {
    return true;
  }

  const safetyText = [
    triageResult.priority.highPriorityOverrides.join(" "),
    triageResult.priority.reasonFragments.join(" "),
    triageResult.faultCodeReference?.name ?? "",
    triageResult.faultCodeReference?.category ?? "",
    generatedBrief.safety_note,
    generatedBrief.priority_wo_readiness.reason,
    generatedBrief.suggested_next_move.supporting_action ?? "",
    generatedBrief.suggested_next_move.human_must_confirm
  ].join(" ");

  return /safety|hse|fire|electrical|arc|grounding|shock|qualified personnel|compliance/i.test(
    safetyText
  );
}

function suggestsEscalation(text: string) {
  return /escalat|oem|specialist|expert review|manager review|engineering review/i.test(text);
}

function normalizeSuggestionText(text: string) {
  return text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function getStructuredSuggestedDecision(
  generatedBrief: GeneratedDiagnosticBrief
): HumanDecisionState | null {
  const state = generatedBrief.suggested_next_move.recommended_decision_state;

  return isHumanDecisionState(state) ? state : null;
}

function isHumanDecisionState(value: unknown): value is HumanDecisionState {
  return (
    value === "monitor" ||
    value === "remote_verify" ||
    value === "update_existing_wo" ||
    value === "create_new_wo" ||
    value === "escalate" ||
    value === "defer" ||
    value === "false_not_actionable"
  );
}
