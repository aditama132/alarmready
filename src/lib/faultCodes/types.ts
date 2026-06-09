export type FaultCodeCategory =
  | "grid"
  | "dc_insulation"
  | "dc_string"
  | "dc_grounding"
  | "arc_fault"
  | "temperature"
  | "communication"
  | "metering"
  | "system"
  | "unknown";

export type SafetyRelevance = "none" | "safety_relevant" | "safety_critical";

export type FaultCodeReference = {
  manufacturer: "Sungrow";
  models: string[];
  codes: string[];
  name: string;
  category: FaultCodeCategory;
  severityHint: "low" | "medium" | "high";
  safetyRelevance: SafetyRelevance;
  likelyPatternHint: "primary" | "consequence" | "repeat" | "duplicate" | "unclear";
  priorityFloor?: "low" | "medium" | "high";
  woReadinessHint:
    | "not_ready"
    | "ready_after_remote_verification"
    | "update_existing_wo_first"
    | "escalate";
  missingChecks: string[];
  evidenceToRequest: string[];
  ruleTags: string[];
  doNotClaim: string[];
  sourceNote: string;
};

export type FaultCodeReferenceMetadata = {
  manufacturer: FaultCodeReference["manufacturer"];
  codes: string[];
  name: string;
  category: FaultCodeCategory;
  safetyRelevance: SafetyRelevance;
  priorityFloor?: "low" | "medium" | "high";
  woReadinessHint: FaultCodeReference["woReadinessHint"];
  missingChecks: string[];
  evidenceToRequest: string[];
  doNotClaim: string[];
  sourceNote: string;
};
