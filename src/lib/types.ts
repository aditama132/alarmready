export type AlarmRecord = {
  alarmId: string;
  siteId: string;
  siteName: string;
  assetId: string;
  assetType: "Inverter" | "String" | "Combiner" | "Meter" | "Tracker" | "Other";
  severity: "Info" | "Warning" | "Critical";
  alarmType: string;
  startedAt: string;
  rawMessage: string;
  currentValue: string;
  threshold: string;
  sourceSystem: string;
  status: string;
};

export type WorkRecord = {
  workRecordId: string;
  alarmId: string;
  createdAt: string;
  decision: TriageDecision;
  operationalNote: string;
  requiresHumanValidation: boolean;
  dispatchStatus: "Not dispatched" | "Ready for review";
};

export type SiteContext = {
  weatherSummary: string;
  irradianceTrend: string;
  recentWork: string;
  relatedAlarms: string;
  productionImpact: string;
  operatorNotes: string;
};

export type TriageDecision =
  | "monitor"
  | "remote_verify"
  | "update_existing_wo"
  | "create_new_wo"
  | "escalate"
  | "defer"
  | "false_not_actionable";

export type DecisionState = {
  selectedDecision: TriageDecision | "";
  validationNote: string;
  operationalNote: string;
  feedback: "Useful" | "Needs adjustment" | null;
};

export type RuleCheck = {
  label: string;
  status: "Pass" | "Review" | "Missing";
  detail: string;
};

export type DiagnosticBrief = {
  title: string;
  summary: string;
  ruleChecks: RuleCheck[];
  likelyWorkstream: string;
  evidence: string[];
  contextSignals: string[];
  humanValidation: string[];
  dataGaps: string[];
  safetyStatement: string;
};

export type GeneratedDiagnosticBrief = {
  situation: string;
  likely_pattern: string;
  missing_checks: string[];
  priority_wo_readiness: {
    raw_severity: string;
    normalized_priority: string;
    wo_readiness: string;
    reason: string;
  };
  suggested_next_move: {
    recommended_decision_state?: TriageDecision;
    recommended: string;
    supporting_action?: string;
    alternative: string;
    human_must_confirm: string;
  };
  evidence_to_request: string[];
  safety_note: string;
};
