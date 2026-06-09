import {
  extractCandidateFaultCodes,
  findSungrowFaultCodeReference
} from "./faultCodes/sungrowSgHx";
import { evaluateDecisionAlignment } from "./decisionAlignment";
import { mapAlarmExtractionDraftToFields, mapAlarmExtractionToDraft } from "./extraction";
import { normalizeInput } from "./input-normalizer";
import { contextAwareExample, quickModeExample } from "./sampleData";
import { checkRelatedWork, normalizePriority, runRuleEngine } from "./rules";
import type { PriorityInput } from "./rules";

export function runRuleAssertions() {
  assert(
    findSungrowFaultCodeReference("Fault code 39 — Low System Insulation Resistance")?.name ===
      "Low System Insulation Resistance",
    "code 39 lookup works"
  );
  assert(
    findSungrowFaultCodeReference("2026-06-04 08:37") === null &&
      extractCandidateFaultCodes("2026-06-04 08:37").length === 0,
    "timestamp is not treated as a fault code"
  );
  const alarmExtractionDraft = mapAlarmExtractionToDraft({
    sitePlant: "Sierra Verde Solar PV",
    assetDevice: "INV-07",
    manufacturer: "Sungrow",
    model: "SG350HX",
    alarmTextCode: "Low System Insulation Resistance",
    faultCode: "39",
    timestamp: "2026-06-04 08:37 CEST",
    severity: "Warning",
    shortNote: "Appeared during morning ramp-up after overnight rain.",
    confidence: "high",
    missingFields: [],
    evidence: []
  });
  assert(
    alarmExtractionDraft.alarmTextCode ===
      "Fault code 39 — Low System Insulation Resistance",
    "alarm extraction combines fault code into visible alarm text"
  );
  assert(
    mapAlarmExtractionToDraft({
      sitePlant: "Sierra Verde Solar PV",
      assetDevice: "INV-07",
      manufacturer: null,
      model: null,
      alarmTextCode: "Fault code 39 — Low System Insulation Resistance",
      faultCode: "39",
      timestamp: "2026-06-04 08:37 CEST",
      severity: "Warning",
      shortNote: null,
      confidence: "high",
      missingFields: [],
      evidence: []
    }).alarmTextCode === "Fault code 39 — Low System Insulation Resistance",
    "alarm extraction does not duplicate an existing fault code"
  );
  assert(
    mapAlarmExtractionDraftToFields(alarmExtractionDraft).alarmTextCode.includes("Fault code 39"),
    "confirmed extracted alarm preserves visible fault code for rule lookup"
  );
  const extractedAlarmInput = normalizeInput(
    mapAlarmExtractionDraftToFields(alarmExtractionDraft),
    quickModeExample.advancedDetails,
    "",
    quickModeExample.contextInput
  );
  assert(
    Boolean(runRuleEngine(extractedAlarmInput).faultCodeReference?.codes.includes("39")),
    "confirmed extracted alarm triggers code 39 rule lookup"
  );
  assertSla("same-business-day review required");
  assertSla("same business day review required");
  assertSla("review today");
  assertSla("24h response window");
  assertSla("24 h response window");
  assertSla("48h response window");
  assertSla("48 h response window");

  const limitedImpact = normalizePriority({
    rawSeverity: "Warning",
    affectedCapacityKw: null,
    siteCapacityKwp: null,
    productionImpactText: "less than 0.2% total site capacity",
    slaCategory: "weekly",
    recurrenceStatus: "none",
    safetyComplianceFlag: "none"
  });
  assert(limitedImpact.factors.impactScore === 0, "limited production impact text scores low");
  assert(
    limitedImpact.reasonFragments.some((reason) => /inferred|from text|needs verification/i.test(reason)),
    "limited production impact text keeps verification caveat"
  );

  const contextInput = normalizeInput(
    contextAwareExample.alarmFields,
    contextAwareExample.advancedDetails,
    "",
    contextAwareExample.contextInput
  );
  const mc4ClosedWo = contextInput.workRecords.filter((record) =>
    record.operationalNote.includes("WO-1042")
  );
  const trackerClosedWo = contextInput.workRecords.filter((record) =>
    record.operationalNote.includes("WO-1027")
  );
  assert(
    checkRelatedWork(contextInput.alarm, mc4ClosedWo).some(
      (finding) => finding.code === "possible_failed_closure"
    ),
    "closed MC4/insulation WO triggers possible_failed_closure"
  );
  assert(
    !checkRelatedWork(contextInput.alarm, trackerClosedWo).some(
      (finding) => finding.code === "possible_failed_closure"
    ),
    "tracker calibration does not trigger recurrence"
  );

  const quickInput = normalizeInput(
    quickModeExample.alarmFields,
    quickModeExample.advancedDetails,
    "",
    quickModeExample.contextInput
  );
  const quickDecision = runRuleEngine({
    ...quickInput,
    affectedCapacityKw: null,
    siteCapacityKwp: null,
    productionImpactText: quickInput.context.productionImpact
  });
  assert(quickDecision.mode === "quick", "Low-context scenario computes internal quick mode");
  assert(Boolean(quickDecision.faultCodeReference?.codes.includes("39")), "Low-context scenario recognizes code 39");
  assert(quickDecision.priority.normalizedPriority === "medium", "Low-context code 39 returns medium priority");
  assert(quickDecision.priority.priorityConfidence === "low", "Low-context code 39 keeps low confidence");

  const contextDecision = runRuleEngine({
    ...contextInput,
    affectedCapacityKw: 80,
    siteCapacityKwp: null,
    productionImpactText: contextInput.context.productionImpact,
    slaCategory: contextInput.context.operatorNotes,
    safetyComplianceFlag: "hse_or_fire_or_electrical"
  });
  assert(contextDecision.mode === "context_aware", "Context-rich scenario computes internal context_aware mode");
  assert(
    Boolean(contextDecision.faultCodeReference?.codes.includes("39")),
    "Context-rich scenario recognizes code 39"
  );
  assert(
    contextDecision.relatedWorkFindings.some((finding) => finding.code === "update_or_link_open_wo"),
    "Context-rich scenario prefers update/link existing WO"
  );
  assert(
    contextDecision.relatedWorkFindings.some((finding) => finding.code === "possible_failed_closure"),
    "Context-rich scenario detects possible failed closure"
  );
  const contextGeneratedBrief = {
    situation: "Synthetic context-rich brief.",
    likely_pattern: "unclear: possible related-work pattern.",
    missing_checks: ["Check ISO trend.", "Check resistance to ground.", "Check WO coverage."],
    priority_wo_readiness: {
      raw_severity: "Warning",
      normalized_priority: "High",
      wo_readiness: "Update existing WO first",
      reason: "Open related WO and safety-relevant context."
    },
    suggested_next_move: {
      recommended_decision_state: "update_existing_wo" as const,
      recommended: "Update existing WO-1086",
      supporting_action:
        "Remote-verify fault code 39 persistence and add evidence/context to WO-1086 before creating new work.",
      alternative: "Monitor only if code 39 clears after drying and does not repeat.",
      human_must_confirm: "Confirm whether the issue belongs to WO-1086."
    },
    evidence_to_request: ["Fault record.", "ISO trend.", "WO evidence."],
    safety_note: "This is pre-WO decision support, not fault confirmation."
  };
  assert(
    evaluateDecisionAlignment({
      aiSuggestedNextMove: contextGeneratedBrief.suggested_next_move.recommended,
      selectedHumanDecision: "update_existing_wo",
      triageResult: contextDecision,
      generatedBrief: contextGeneratedBrief
    }).alignment === "aligned",
    "structured update-existing recommendation aligns with update_existing_wo"
  );
  const remoteInsteadOfUpdate = evaluateDecisionAlignment({
    aiSuggestedNextMove: contextGeneratedBrief.suggested_next_move.recommended,
    selectedHumanDecision: "remote_verify",
    triageResult: contextDecision,
    generatedBrief: contextGeneratedBrief
  });
  assert(
    remoteInsteadOfUpdate.alignment === "mismatch" &&
      /updating the existing WO as the primary action/i.test(remoteInsteadOfUpdate.message),
    "remote_verify selection gets specific mismatch when update_existing_wo is primary"
  );

  return [
    "code 39 lookup",
    "timestamp non-match",
    "extracted alarm fault-code display",
    "SLA phrase matching",
    "production-impact text scoring",
    "closed-WO recurrence detection",
    "low-context priority",
    "context-rich update-existing-WO signal",
    "structured decision alignment"
  ];
}

function assertSla(slaCategory: string) {
  const result = normalizePriority(basePriorityInput({ slaCategory }));
  assert(result.factors.slaUrgency === 2, `${slaCategory} recognized as same-day SLA`);
}

function basePriorityInput(overrides: Partial<PriorityInput>): PriorityInput {
  return {
    rawSeverity: "Info",
    affectedCapacityKw: 0,
    siteCapacityKwp: 1000,
    slaCategory: "weekly",
    recurrenceStatus: "none",
    safetyComplianceFlag: "none",
    ...overrides
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Rule assertion failed: ${message}`);
  }
}
