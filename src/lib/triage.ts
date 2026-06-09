import type {
  AlarmRecord,
  DiagnosticBrief,
  RuleCheck,
  SiteContext,
  TriageDecision,
  WorkRecord
} from "./types";

const hasValue = (value: string) => value.trim().length > 0;
const isString = (value: string | false): value is string => typeof value === "string";

export function hasContext(context: SiteContext) {
  return Object.values(context).some(hasValue);
}

export function getRuleChecks(alarm: AlarmRecord, context: SiteContext): RuleCheck[] {
  const checks: RuleCheck[] = [
    {
      label: "Alarm record completeness",
      status:
        (hasValue(alarm.siteName) || hasValue(alarm.siteId)) &&
        hasValue(alarm.assetId) &&
        hasValue(alarm.rawMessage)
          ? "Pass"
          : "Missing",
      detail: "Site or plant, asset or device, and alarm text are required before brief generation."
    },
    {
      label: "Severity gate",
      status: alarm.severity === "Critical" ? "Review" : "Pass",
      detail:
        alarm.severity === "Critical"
          ? "Critical severity should be reviewed by an authorized human before any next step."
          : "Severity does not force automatic escalation in this demo."
    },
    {
      label: "Threshold evidence",
      status: hasValue(alarm.currentValue) && hasValue(alarm.threshold) ? "Pass" : "Missing",
      detail: "Current value and threshold help frame the alarm without claiming root cause."
    },
    {
      label: "Context availability",
      status: hasContext(context) ? "Pass" : "Review",
      detail: hasContext(context)
        ? "Optional context is available for a richer pre-work-order brief."
        : "Brief will use the raw alarm only; human validation remains required."
    },
    {
      label: "Dispatch control",
      status: "Pass",
      detail: "This prototype only prepares notes and does not dispatch work automatically."
    }
  ];

  return checks;
}

export function generateDiagnosticBrief(
  alarm: AlarmRecord,
  context: SiteContext
): DiagnosticBrief {
  const contextAvailable = hasContext(context);
  const ruleChecks = getRuleChecks(alarm, context);
  const alarmName = hasValue(alarm.alarmType) ? alarm.alarmType : "Unspecified alarm";
  const assetLabel = [alarm.assetType, alarm.assetId].filter(hasValue).join(" ");

  const evidence = [
    `Raw alarm: ${alarm.rawMessage || "No raw alarm message provided."}`,
    `Asset: ${assetLabel || "No asset identified."}`,
    `Observed value: ${alarm.currentValue || "Not provided."}`,
    `Reference threshold: ${alarm.threshold || "Not provided."}`,
    `Status: ${alarm.status || "Not provided."}`,
    `Source system: ${alarm.sourceSystem || "Not provided."}`
  ];

  const contextSignals = contextAvailable
    ? [
        context.weatherSummary && `Weather: ${context.weatherSummary}`,
        context.irradianceTrend && `Irradiance: ${context.irradianceTrend}`,
        context.recentWork && `Recent work: ${context.recentWork}`,
        context.relatedAlarms && `Related alarms: ${context.relatedAlarms}`,
        context.productionImpact && `Production impact: ${context.productionImpact}`,
        context.operatorNotes && `Operator notes: ${context.operatorNotes}`
      ].filter(isString)
    : ["No optional context supplied; treat this as a raw-alarm brief."];

  const dataGaps = [
    !hasValue(alarm.currentValue) && "Missing current measured value.",
    !hasValue(alarm.threshold) && "Missing threshold or operating bound.",
    !hasValue(context.weatherSummary) && "Weather context not supplied.",
    !hasValue(context.recentWork) && "Recent maintenance context not supplied.",
    !hasValue(context.relatedAlarms) && "Related alarm scan not supplied."
  ].filter(isString);

  return {
    title: `${alarmName} Pre-WO Diagnostic Brief`,
    summary: `${alarm.severity} alarm at ${alarm.siteName || alarm.siteId || "unknown site"} for ${
      assetLabel || "an unspecified asset"
    }. This brief organizes evidence for human review and does not diagnose the actual fault.`,
    ruleChecks,
    likelyWorkstream:
      alarm.severity === "Critical"
        ? "Human review before any work order recommendation"
        : contextAvailable
          ? "Context-aware review package"
          : "Quick raw-alarm review package",
    evidence,
    contextSignals,
    humanValidation: [
      "Confirm alarm is still active in the monitoring system.",
      "Compare against site operating conditions and recent maintenance records.",
      "Validate whether a work order is warranted before dispatch.",
      "Record the human decision and rationale."
    ],
    dataGaps: dataGaps.length > 0 ? dataGaps : ["No major demo data gaps flagged."],
    safetyStatement:
      "Decision support only: AlarmReady does not diagnose the actual fault and does not dispatch work automatically."
  };
}

export function generateOperationalNote(
  alarm: AlarmRecord,
  brief: DiagnosticBrief,
  decision: TriageDecision,
  validationNote: string,
  generatedNote?: string
): WorkRecord {
  const createdAt = new Date().toISOString();
  const isWorkOrderReviewDecision =
    decision === "update_existing_wo" || decision === "create_new_wo";
  const note =
    generatedNote ??
    [
      `AlarmReady operational note`,
      `Alarm: ${alarm.alarmId || "Unspecified"} - ${alarm.alarmType || "Unspecified alarm"}`,
      `Site / asset: ${alarm.siteName || alarm.siteId || "Unknown site"} / ${
        alarm.assetId || "Unknown asset"
      }`,
      `Human decision state: ${decision}`,
      `Brief focus: ${brief.likelyWorkstream}`,
      `Human decision reason: ${validationNote || "No decision reason entered."}`,
      `Safety: decision support only; no actual fault diagnosis; no automatic dispatch. Human validation required before next step.`
    ].join("\n");

  return {
    workRecordId: `PRE-WO-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    alarmId: alarm.alarmId,
    createdAt,
    decision,
    operationalNote: note,
    requiresHumanValidation: true,
    dispatchStatus: isWorkOrderReviewDecision ? "Ready for review" : "Not dispatched"
  };
}
