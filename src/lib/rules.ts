import {
  findSungrowFaultCodeReference,
  toFaultCodeReferenceMetadata
} from "./faultCodes/sungrowSgHx";
import type { FaultCodeReference, FaultCodeReferenceMetadata } from "./faultCodes/types";
import type { AlarmRecord, RuleCheck, SiteContext, WorkRecord } from "./types";

export type RuleMode = "quick" | "context_aware";
export type ContextCoverage = "low" | "medium" | "high";
export type NormalizedPriority = "low" | "medium" | "high";
export type PriorityConfidence = "low" | "medium" | "high";

export type RuleFindingCode =
  | "possible_repeat"
  | "possible_episode"
  | "duplicate_wo_risk"
  | "possible_recurrence"
  | "update_or_link_open_wo"
  | "update_scheduled_wo_first"
  | "possible_failed_closure";

export type RuleFinding = {
  code: RuleFindingCode;
  label: string;
  detail: string;
  evidence: string[];
};

export type PriorityInput = {
  rawSeverity?: string;
  affectedCapacityKw?: number | null;
  siteCapacityKwp?: number | null;
  productionImpactText?: string | null;
  slaCategory?: string | null;
  recurrenceStatus?:
    | "none"
    | "same_day_repeat"
    | "open_related_wo"
    | "recent_closed_wo"
    | "recurs_after_fix"
    | "unknown";
  safetyComplianceFlag?:
    | "none"
    | "sensor_or_reporting_risk"
    | "hse_or_fire_or_electrical"
    | "unknown";
  faultCodeReference?: Pick<
    FaultCodeReference,
    "name" | "priorityFloor" | "safetyRelevance"
  > | null;
};

export type PriorityResult = {
  rawSeverity: string | null;
  normalizedPriority: NormalizedPriority;
  priorityConfidence: PriorityConfidence;
  score: number;
  factors: {
    impactScore: number;
    slaUrgency: number;
    recurrenceRisk: number;
    safetyComplianceRisk: number;
  };
  affectedCapacityPct: number | null;
  highPriorityOverrides: string[];
  reasonFragments: string[];
  missingInputs: string[];
};

export type RuleEngineInput = {
  alarm: AlarmRecord;
  recentAlarms: string[];
  workRecords: WorkRecord[];
  context: SiteContext;
  affectedCapacityKw?: number | null;
  siteCapacityKwp?: number | null;
  productionImpactText?: string | null;
  slaCategory?: string;
  safetyComplianceFlag?: PriorityInput["safetyComplianceFlag"];
};

export type TriageDecision = {
  mode: RuleMode;
  contextCoverage: ContextCoverage;
  faultCodeReference?: FaultCodeReferenceMetadata;
  duplicateFindings: RuleFinding[];
  relatedWorkFindings: RuleFinding[];
  priority: PriorityResult;
  checks: RuleCheck[];
  recommendedAction: string;
  explanation: string;
};

type ParsedContextRecord = {
  raw: string;
  site: string;
  asset: string;
  alarmText: string;
  timestamp: Date | null;
  lifecycle: "open" | "scheduled" | "closed" | "unknown";
};

const shortWindowHours = 24;

export function selectMode(input: Pick<RuleEngineInput, "recentAlarms" | "workRecords">): RuleMode {
  return input.recentAlarms.length > 0 || input.workRecords.length > 0
    ? "context_aware"
    : "quick";
}

export function getContextCoverage(
  input: Pick<RuleEngineInput, "recentAlarms" | "workRecords" | "context">
): ContextCoverage {
  const hasRecentAlarms = input.recentAlarms.length > 0;
  const hasWorkRecords = input.workRecords.length > 0;
  const hasSiteOrSlaContext = hasSiteContext(input.context);

  if (hasRecentAlarms && hasWorkRecords && hasSiteOrSlaContext) {
    return "high";
  }

  if (hasRecentAlarms || hasWorkRecords || hasSiteOrSlaContext) {
    return "medium";
  }

  return "low";
}

export function checkDuplicateRepeatEpisode(
  alarm: AlarmRecord,
  recentAlarms: string[],
  workRecords: WorkRecord[]
): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const parsedRecentAlarms = recentAlarms.map(parseContextRecord);
  const parsedWorkRecords = workRecords.map((record) => parseContextRecord(record.operationalNote));
  const sameAssetRecentAlarm = parsedRecentAlarms.find(
    (record) =>
      isSame(record.asset, alarm.assetId) &&
      isSimilar(record.alarmText || record.raw, alarm.alarmType || alarm.rawMessage) &&
      isWithinShortWindow(alarm.startedAt, record.timestamp)
  );
  const sameSiteRecentAlarms = parsedRecentAlarms.filter(
    (record) => isSame(record.site, alarm.siteName) && isWithinShortWindow(alarm.startedAt, record.timestamp)
  );
  const implicitSameSiteRelatedAlarms = parsedRecentAlarms.filter(
    (record) =>
      !record.site &&
      isSimilar(record.alarmText || record.raw, alarm.alarmType || alarm.rawMessage) &&
      isWithinShortWindow(alarm.startedAt, record.timestamp)
  );
  const possibleEpisodeAlarms =
    sameSiteRecentAlarms.length >= 2 ? sameSiteRecentAlarms : implicitSameSiteRelatedAlarms;
  const sameAssetOpenWork = parsedWorkRecords.find(
    (record) =>
      record.lifecycle === "open" &&
      isSame(record.asset, alarm.assetId) &&
      isSimilar(record.alarmText || record.raw, alarm.alarmType || alarm.rawMessage)
  );
  const sameAssetClosedWork = parsedWorkRecords.find(
    (record) =>
      record.lifecycle === "closed" &&
      isSame(record.asset, alarm.assetId) &&
      (isSimilar(record.alarmText || record.raw, alarm.alarmType || alarm.rawMessage) ||
        isClosedWoRecurrenceRisk(alarm, record.raw))
  );

  if (sameAssetRecentAlarm) {
    findings.push({
      code: "possible_repeat",
      label: "Possible repeat",
      detail: `Same asset and similar alarm text found within ${shortWindowHours} hours.`,
      evidence: [sameAssetRecentAlarm.raw]
    });
  }

  if (possibleEpisodeAlarms.length >= 2) {
    findings.push({
      code: "possible_episode",
      label: "Possible episode",
      detail: "Multiple related alarms appear close together in the supplied recent-alarm context.",
      evidence: possibleEpisodeAlarms.slice(0, 3).map((record) => record.raw)
    });
  }

  if (sameAssetOpenWork) {
    findings.push({
      code: "duplicate_wo_risk",
      label: "Duplicate WO risk",
      detail: "Open work record on the same asset has similar issue language.",
      evidence: [sameAssetOpenWork.raw]
    });
  }

  if (sameAssetClosedWork) {
    findings.push({
      code: "possible_recurrence",
      label: "Possible recurrence",
      detail: "Recently closed work record on the same asset has similar issue language.",
      evidence: [sameAssetClosedWork.raw]
    });
  }

  return findings;
}

export function checkRelatedWork(alarm: AlarmRecord, workRecords: WorkRecord[]): RuleFinding[] {
  const parsedWorkRecords = workRecords.map((record) => parseContextRecord(record.operationalNote));
  const sameAssetOpen = parsedWorkRecords.find(
    (record) => record.lifecycle === "open" && isSame(record.asset, alarm.assetId)
  );
  const sameAssetScheduled = parsedWorkRecords.find(
    (record) => record.lifecycle === "scheduled" && isSame(record.asset, alarm.assetId)
  );
  const sameIssueClosed = parsedWorkRecords.find(
    (record) =>
      record.lifecycle === "closed" &&
      isSame(record.asset, alarm.assetId) &&
      (isSimilar(record.alarmText || record.raw, alarm.alarmType || alarm.rawMessage) ||
        isClosedWoRecurrenceRisk(alarm, record.raw))
  );
  const findings: RuleFinding[] = [];

  if (sameAssetOpen) {
    findings.push({
      code: "update_or_link_open_wo",
      label: "Open WO on same asset",
      detail: "Update or link the open work order instead of creating a new one.",
      evidence: [sameAssetOpen.raw]
    });
  }

  if (sameAssetScheduled) {
    findings.push({
      code: "update_scheduled_wo_first",
      label: "Scheduled WO on same asset",
      detail: "Review the scheduled work order before preparing a new WO.",
      evidence: [sameAssetScheduled.raw]
    });
  }

  if (sameIssueClosed) {
    findings.push({
      code: "possible_failed_closure",
      label: "Recently closed same issue",
      detail: "Treat as possible recurrence or failed closure for human review.",
      evidence: [sameIssueClosed.raw]
    });
  }

  return findings;
}

export function normalizePriority(input: PriorityInput): PriorityResult {
  const rawSeverity = input.rawSeverity?.trim() || null;
  const normalizedRawSeverity = normalizeRawSeverity(rawSeverity);
  const affectedCapacityPct = getAffectedCapacityPct(
    input.affectedCapacityKw,
    input.siteCapacityKwp
  );
  const missingInputs: string[] = [];
  const highPriorityOverrides: string[] = [];
  const reasonFragments: string[] = [];
  const impactScore = scoreImpact(
    affectedCapacityPct,
    input.affectedCapacityKw,
    input.siteCapacityKwp,
    input.productionImpactText,
    missingInputs,
    highPriorityOverrides,
    reasonFragments
  );
  const slaUrgency = scoreSla(
    input.slaCategory,
    missingInputs,
    highPriorityOverrides,
    reasonFragments
  );
  const recurrenceRisk = scoreRecurrence(
    input.recurrenceStatus,
    missingInputs,
    reasonFragments
  );
  const safetyComplianceRisk = scoreSafetyCompliance(
    input.safetyComplianceFlag,
    missingInputs,
    highPriorityOverrides,
    reasonFragments,
    slaUrgency
  );
  const score = impactScore + slaUrgency + recurrenceRisk + safetyComplianceRisk;
  const contextIncomplete = missingInputs.length > 0;
  let normalizedPriority: NormalizedPriority =
    highPriorityOverrides.length > 0 ? "high" : score <= 2 ? "low" : score <= 5 ? "medium" : "high";

  if (
    normalizedPriority === "low" &&
    contextIncomplete &&
    (normalizedRawSeverity === "high" || normalizedRawSeverity === "critical")
  ) {
    normalizedPriority = "medium";
    reasonFragments.push("Raw severity is high/critical and context is incomplete, so priority stays at least Medium.");
  }

  if (
    normalizedPriority === "low" &&
    normalizedRawSeverity === "medium" &&
    contextIncomplete &&
    !(affectedCapacityPct !== null && affectedCapacityPct < 1 && slaUrgency <= 1 && recurrenceRisk === 0 && safetyComplianceRisk === 0)
  ) {
    normalizedPriority = "medium";
    reasonFragments.push("Raw severity is medium and context is incomplete, so priority needs verification.");
  }

  if (normalizedPriority === "medium" && score >= 5 && highPriorityOverrides.length === 0) {
    reasonFragments.push("Score is close to High; verify priority before WO preparation.");
  }

  const referenceFloor = getFaultCodePriorityFloor(input.faultCodeReference);

  if (referenceFloor) {
    if (referenceFloor === "high" && !highPriorityOverrides.includes("safety-critical fault-code reference")) {
      highPriorityOverrides.push("safety-critical fault-code reference");
    }

    if (priorityRank(referenceFloor) > priorityRank(normalizedPriority)) {
      normalizedPriority = referenceFloor;
      reasonFragments.push(
        `${input.faultCodeReference?.name} reference floors priority to ${formatPriority(referenceFloor)} for triage; this does not confirm root cause.`
      );
    } else if (input.faultCodeReference?.safetyRelevance === "safety_relevant") {
      reasonFragments.push(
        `${input.faultCodeReference.name} is safety-relevant reference context for triage.`
      );
    }
  }

  return {
    rawSeverity,
    normalizedPriority,
    priorityConfidence: getPriorityConfidence(missingInputs),
    score,
    factors: {
      impactScore,
      slaUrgency,
      recurrenceRisk,
      safetyComplianceRisk
    },
    affectedCapacityPct,
    highPriorityOverrides,
    reasonFragments,
    missingInputs: unique(missingInputs)
  };
}

export function runRuleEngine(input: RuleEngineInput): TriageDecision {
  const mode = selectMode(input);
  const contextCoverage = getContextCoverage(input);
  const faultCodeReference = getCurrentAlarmFaultCodeReference(input);
  const duplicateFindings = checkDuplicateRepeatEpisode(
    input.alarm,
    input.recentAlarms,
    input.workRecords
  );
  const relatedWorkFindings = checkRelatedWork(input.alarm, input.workRecords);
  const priority = normalizePriority({
    rawSeverity: input.alarm.severity,
    affectedCapacityKw: input.affectedCapacityKw,
    siteCapacityKwp: input.siteCapacityKwp,
    productionImpactText: input.productionImpactText ?? input.context.productionImpact,
    slaCategory: input.slaCategory ?? input.context.operatorNotes,
    recurrenceStatus: getRecurrenceStatus(duplicateFindings, relatedWorkFindings, input),
    safetyComplianceFlag:
      input.safetyComplianceFlag ?? getSafetyComplianceFlag(input.alarm, input.context),
    faultCodeReference
  });
  const checks = buildRuleChecks(
    mode,
    contextCoverage,
    duplicateFindings,
    relatedWorkFindings,
    priority,
    faultCodeReference
  );

  return {
    mode,
    contextCoverage,
    ...(faultCodeReference
      ? { faultCodeReference: toFaultCodeReferenceMetadata(faultCodeReference) }
      : {}),
    duplicateFindings,
    relatedWorkFindings,
    priority,
    checks,
    recommendedAction: getRecommendedAction(relatedWorkFindings, duplicateFindings, priority),
    explanation:
      "Local deterministic rules only. These checks organize review signals and do not diagnose the actual fault."
  };
}

function buildRuleChecks(
  mode: RuleMode,
  coverage: ContextCoverage,
  duplicateFindings: RuleFinding[],
  relatedWorkFindings: RuleFinding[],
  priority: PriorityResult,
  faultCodeReference: FaultCodeReference | null
): RuleCheck[] {
  return [
    {
      label: "Mode selection",
      status: "Pass",
      detail:
        mode === "quick"
          ? "Low context: current alarm only."
          : "Context source available: recent alarms or work records are present."
    },
    {
      label: "Context coverage",
      status: coverage === "high" ? "Pass" : "Review",
      detail:
        coverage === "high"
          ? "High coverage: alarm, recent alarms, work records, and site/SLA context are present."
          : coverage === "medium"
            ? "Medium coverage: some optional context is available."
            : "Low coverage: current alarm only."
    },
    {
      label: "Duplicate / repeat / episode check",
      status: duplicateFindings.length > 0 ? "Review" : "Pass",
      detail:
        duplicateFindings.length > 0
          ? duplicateFindings.map((finding) => finding.label).join("; ")
          : "No repeat, episode, duplicate-WO, or recurrence signal found from supplied context."
    },
    {
      label: "Related work check",
      status: relatedWorkFindings.length > 0 ? "Review" : "Pass",
      detail:
        relatedWorkFindings.length > 0
          ? relatedWorkFindings.map((finding) => finding.detail).join(" ")
          : "No open, scheduled, or recently closed related work signal found."
    },
    {
      label: "Priority normalization",
      status: priority.normalizedPriority === "high" ? "Review" : "Pass",
      detail: `${formatPriority(priority.normalizedPriority)} priority with ${priority.priorityConfidence} confidence. ${priority.reasonFragments
        .slice(0, 2)
        .join(" ")}`
    },
    {
      label: "Fault-code reference",
      status: faultCodeReference ? "Review" : "Missing",
      detail: faultCodeReference
        ? `${faultCodeReference.manufacturer} ${faultCodeReference.codes.join(", ")}: ${faultCodeReference.name}. Used only for triage support, missing checks, and evidence requests.`
        : "No curated Sungrow SG320HX / SG350HX fault-code reference matched the current alarm text."
    }
  ];
}

function getRecommendedAction(
  relatedWorkFindings: RuleFinding[],
  duplicateFindings: RuleFinding[],
  priority: PriorityResult
) {
  if (relatedWorkFindings.some((finding) => finding.code === "update_or_link_open_wo")) {
    return "Human reviewer should update or link the existing open WO before preparing any new WO.";
  }

  if (relatedWorkFindings.some((finding) => finding.code === "update_scheduled_wo_first")) {
    return "Human reviewer should review the scheduled WO first.";
  }

  if (duplicateFindings.length > 0) {
    return "Human reviewer should validate repeat, episode, or recurrence signals before WO preparation.";
  }

  if (priority.normalizedPriority === "high") {
    return "Human reviewer should validate normalized priority before deciding the operational next step.";
  }

  return "No rule requires automatic action; continue human review before any next step.";
}

function isClosedWoRecurrenceRisk(alarm: AlarmRecord, closedWorkText: string) {
  if (!isCurrentAlarmInsulationDcStringRelated(alarm)) {
    return false;
  }

  const normalizedWorkText = closedWorkText.toLowerCase();

  if (/no inverter or dc string work recorded/.test(normalizedWorkText)) {
    return false;
  }

  return /insulation|\biso\b|ground|connector|mc4|dc cable|string|mppt|fault code 39|repaired|replaced|test passed|no measurement screenshot|close-out evidence missing/.test(
    normalizedWorkText
  );
}

function isCurrentAlarmInsulationDcStringRelated(alarm: AlarmRecord) {
  const alarmText = `${alarm.alarmType} ${alarm.rawMessage}`.toLowerCase();

  return /fault code 39|low system insulation resistance|insulation|\biso\b|array insulation impedance|resistance to ground|dc cable|connector|string|mppt|pv abnormal|string current/.test(
    alarmText
  );
}

function getCurrentAlarmFaultCodeReference(input: RuleEngineInput) {
  const primaryText = [input.alarm.alarmType, input.alarm.rawMessage].filter(Boolean).join(" ");

  return findSungrowFaultCodeReference(primaryText);
}

function getFaultCodePriorityFloor(
  reference: PriorityInput["faultCodeReference"] | undefined
): NormalizedPriority | null {
  if (!reference) {
    return null;
  }

  if (reference.safetyRelevance === "safety_critical") {
    return "high";
  }

  if (reference.priorityFloor) {
    return reference.priorityFloor;
  }

  if (reference.safetyRelevance === "safety_relevant") {
    return "medium";
  }

  return null;
}

function priorityRank(priority: NormalizedPriority) {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function scoreImpact(
  affectedCapacityPct: number | null,
  affectedCapacityKw: number | null | undefined,
  siteCapacityKwp: number | null | undefined,
  productionImpactText: string | null | undefined,
  missingInputs: string[],
  highPriorityOverrides: string[],
  reasonFragments: string[]
) {
  if (affectedCapacityKw == null || siteCapacityKwp == null || siteCapacityKwp <= 0) {
    if (affectedCapacityKw == null) {
      missingInputs.push("affected capacity");
    }

    if (siteCapacityKwp == null || siteCapacityKwp <= 0) {
      missingInputs.push("site capacity");
    }

    const textImpactScore = scoreProductionImpactText(productionImpactText, reasonFragments);

    if (textImpactScore !== null) {
      return textImpactScore;
    }

    reasonFragments.push("Affected capacity is unknown, so impact needs verification.");
    return 1;
  }

  if (affectedCapacityPct === null) {
    reasonFragments.push("Affected capacity is unknown, so impact needs verification.");
    return 1;
  }

  if (affectedCapacityPct >= 50) {
    highPriorityOverrides.push("large share of plant affected");
    reasonFragments.push(`Estimated plant-level impact is high at around ${formatPct(affectedCapacityPct)}.`);
    return 3;
  }

  if (affectedCapacityPct >= 20) {
    reasonFragments.push(`Estimated plant-level impact is material at around ${formatPct(affectedCapacityPct)}.`);
    return 3;
  }

  if (affectedCapacityPct >= 5) {
    reasonFragments.push(`Estimated plant-level impact is moderate at around ${formatPct(affectedCapacityPct)}.`);
    return 2;
  }

  if (affectedCapacityPct >= 1) {
    reasonFragments.push(`Estimated plant-level impact is localized at around ${formatPct(affectedCapacityPct)}.`);
    return 1;
  }

  reasonFragments.push(`Estimated plant-level impact is very low at around ${formatPct(affectedCapacityPct)}.`);
  return 0;
}

function scoreProductionImpactText(
  productionImpactText: string | null | undefined,
  reasonFragments: string[]
) {
  const normalized = productionImpactText?.trim().toLowerCase() ?? "";

  if (!normalized) {
    return null;
  }

  if (
    /less than\s*0\.2%\s*(?:of\s*)?total site capacity|below\s*0\.2%\s*(?:of\s*)?total site capacity|under\s*0\.2%\s*(?:of\s*)?total site capacity|low site-level impact|limited production impact|limited site-level production impact|minor production impact|measurable but limited impact|no material production impact/i.test(
      normalized
    )
  ) {
    reasonFragments.push(
      "Production impact appears limited from text and needs verification because numeric capacity inputs are missing."
    );
    return 0;
  }

  if (
    /major production loss|high production impact|whole inverter offline|inverter offline|multiple inverters affected|plant-level loss|significant site-level loss/i.test(
      normalized
    )
  ) {
    reasonFragments.push(
      "Production impact appears high from text and needs verification because numeric capacity inputs are missing."
    );
    return 3;
  }

  return null;
}

function scoreSla(
  slaCategory: string | null | undefined,
  missingInputs: string[],
  highPriorityOverrides: string[],
  reasonFragments: string[]
) {
  const normalized = slaCategory?.trim().toLowerCase() ?? "";

  if (!normalized || normalized === "unknown") {
    missingInputs.push("SLA category");
    reasonFragments.push("SLA urgency is unknown and needs verification.");
    return 0;
  }

  if (/\b(urgent|breached|immediate|emergency)\b/.test(normalized)) {
    reasonFragments.push("SLA risk is high or already breached.");

    if (/\b(breached|immediate|emergency)\b/.test(normalized)) {
      highPriorityOverrides.push("SLA breached or immediate");
    }

    return 3;
  }

  if (
    /\b(same[-_\s]?business[-_\s]?day|same[-_\s]?day|review today|today|24\s*h|48\s*h)\b/.test(
      normalized
    )
  ) {
    reasonFragments.push("SLA urgency appears same-day or short-window.");
    return 2;
  }

  if (["low", "weekly"].includes(normalized)) {
    reasonFragments.push("SLA urgency appears low-to-medium.");
    return 1;
  }

  reasonFragments.push("SLA urgency appears low-to-medium.");
  return 1;
}

function scoreRecurrence(
  recurrenceStatus: PriorityInput["recurrenceStatus"] | undefined,
  missingInputs: string[],
  reasonFragments: string[]
) {
  if (!recurrenceStatus || recurrenceStatus === "unknown") {
    missingInputs.push("recurrence history");
    reasonFragments.push("Recurrence history is unknown and needs verification.");
    return 0;
  }

  if (recurrenceStatus === "none") {
    reasonFragments.push("No related recurrence signal was provided.");
    return 0;
  }

  if (recurrenceStatus === "same_day_repeat") {
    reasonFragments.push("Similar alarms repeated in the same operating window.");
    return 1;
  }

  if (recurrenceStatus === "open_related_wo" || recurrenceStatus === "recent_closed_wo") {
    reasonFragments.push("Related work history suggests unresolved or recurring issue risk.");
    return 2;
  }

  reasonFragments.push("Issue appears to recur after a prior fix.");
  return 3;
}

function scoreSafetyCompliance(
  safetyComplianceFlag: PriorityInput["safetyComplianceFlag"] | undefined,
  missingInputs: string[],
  highPriorityOverrides: string[],
  reasonFragments: string[],
  slaUrgency: number
) {
  if (!safetyComplianceFlag || safetyComplianceFlag === "unknown") {
    missingInputs.push("safety/HSE context");
    reasonFragments.push("No HSE or site-wide impact was provided.");
    return 0;
  }

  if (safetyComplianceFlag === "none") {
    reasonFragments.push("No HSE or site-wide impact was provided.");
    return 0;
  }

  if (safetyComplianceFlag === "sensor_or_reporting_risk") {
    reasonFragments.push("Sensor or reporting risk may affect operational confidence.");
    return slaUrgency >= 2 ? 2 : 1;
  }

  highPriorityOverrides.push("safety/HSE risk");
  reasonFragments.push("Safety/HSE risk requires high priority.");
  return 3;
}

function getAffectedCapacityPct(
  affectedCapacityKw: number | null | undefined,
  siteCapacityKwp: number | null | undefined
) {
  if (affectedCapacityKw == null || siteCapacityKwp == null || siteCapacityKwp <= 0) {
    return null;
  }

  return (affectedCapacityKw / siteCapacityKwp) * 100;
}

function getPriorityConfidence(missingInputs: string[]): PriorityConfidence {
  const missing = unique(missingInputs);
  const capacityMissing = missing.includes("affected capacity") || missing.includes("site capacity");
  const slaOrRecurrenceMissing =
    missing.includes("SLA category") || missing.includes("recurrence history");

  if (capacityMissing && slaOrRecurrenceMissing) {
    return "low";
  }

  if (missing.length === 0) {
    return "high";
  }

  if (missing.length <= 2) {
    return "medium";
  }

  return "low";
}

function getRecurrenceStatus(
  duplicateFindings: RuleFinding[],
  relatedWorkFindings: RuleFinding[],
  input: RuleEngineInput
): PriorityInput["recurrenceStatus"] {
  const codes = [...duplicateFindings, ...relatedWorkFindings].map((finding) => finding.code);

  if (codes.includes("possible_failed_closure")) {
    return "recurs_after_fix";
  }

  if (codes.includes("duplicate_wo_risk") || codes.includes("update_or_link_open_wo")) {
    return "open_related_wo";
  }

  if (codes.includes("possible_recurrence")) {
    return "recent_closed_wo";
  }

  if (codes.includes("possible_repeat") || codes.includes("possible_episode")) {
    return "same_day_repeat";
  }

  if (input.recentAlarms.length === 0 && input.workRecords.length === 0) {
    return "unknown";
  }

  return "none";
}

function getSafetyComplianceFlag(
  alarm: AlarmRecord,
  context: SiteContext
): PriorityInput["safetyComplianceFlag"] {
  const combinedText = `${alarm.rawMessage} ${alarm.alarmType} ${context.operatorNotes}`.toLowerCase();

  if (/\bhse\b|fire|electrical|arc|injury|shock|emergency|safety|compliance/.test(combinedText)) {
    return "hse_or_fire_or_electrical";
  }

  if (/sensor|reporting|meter|telemetry|comms|communication/.test(combinedText)) {
    return "sensor_or_reporting_risk";
  }

  return hasSiteContext(context) ? "none" : "unknown";
}

function formatPriority(priority: NormalizedPriority) {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function normalizeRawSeverity(rawSeverity: string | null) {
  const normalized = rawSeverity?.toLowerCase() ?? "";

  if (normalized === "critical" || normalized === "high") {
    return "high";
  }

  if (normalized === "warning" || normalized === "warn" || normalized === "medium") {
    return "medium";
  }

  if (normalized === "info" || normalized === "low") {
    return "low";
  }

  return normalized;
}

function formatPct(value: number) {
  if (value < 1) {
    return `${value.toFixed(1)}%`;
  }

  return `${Math.round(value)}%`;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function hasSiteContext(context: SiteContext) {
  return Boolean(
    context.weatherSummary.trim() ||
      context.irradianceTrend.trim() ||
      context.productionImpact.trim() ||
      context.operatorNotes.trim()
  );
}

function parseContextRecord(raw = ""): ParsedContextRecord {
  const site = trimAtKnownLabel(
    extractValue(raw, /\b(?:site|plant)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 _.-]{2,70})/i)
  );
  const alarmText = trimAtKnownLabel(
    extractValue(raw, /\b(?:alarm|issue|code|message)\s*[:#-]?\s*([^\n]+)/i) || raw
  );

  return {
    raw,
    site,
    asset:
      extractValue(raw, /\b(?:asset|device|equipment)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_.-]{1,24})/i) ||
      raw.match(/\b(?:INV|CB|STR|MTR|TRK)-?\d{1,4}\b/i)?.[0] ||
      "",
    alarmText,
    timestamp: parseDate(raw),
    lifecycle: parseLifecycle(raw)
  };
}

function parseDate(raw: string) {
  const dateText =
    raw.match(/\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\b/)?.[0] ??
    raw.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];

  if (!dateText) {
    return null;
  }

  const parsed = new Date(dateText.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLifecycle(raw: string): ParsedContextRecord["lifecycle"] {
  if (/\bopen|active|in progress|assigned\b/i.test(raw)) {
    return "open";
  }

  if (/\bscheduled|planned\b/i.test(raw)) {
    return "scheduled";
  }

  if (/\bclosed|complete|completed|resolved\b/i.test(raw)) {
    return "closed";
  }

  return "unknown";
}

function isWithinShortWindow(alarmTimestamp: string, contextTimestamp: Date | null) {
  const alarmDate = parseDate(alarmTimestamp);

  if (!alarmDate || !contextTimestamp) {
    return false;
  }

  const hours = Math.abs(alarmDate.getTime() - contextTimestamp.getTime()) / 36e5;
  return hours <= shortWindowHours;
}

function isSame(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return (
    normalizedLeft !== "" &&
    normalizedRight !== "" &&
    (normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  );
}

function isSimilar(left: string, right: string) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;
  return overlap / Math.min(leftTokens.length, rightTokens.length) >= 0.45;
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !["alarm", "issue", "code", "message"].includes(token));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extractValue(input: string, pattern: RegExp) {
  return input.match(pattern)?.[1]?.trim().replace(/[;|,]$/, "") ?? "";
}

function trimAtKnownLabel(value: string) {
  return value
    .replace(
      /\s+(?:asset|device|equipment|alarm|issue|code|message|timestamp|time|status|wo|work)\s*[:#-]?.*$/i,
      ""
    )
    .trim();
}
