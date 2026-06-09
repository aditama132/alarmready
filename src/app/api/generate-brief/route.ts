import { NextResponse } from "next/server";
import { preWoDiagnosticBriefInstructions } from "@/lib/prompts";
import type { TriageDecision as RuleEngineOutput } from "@/lib/rules";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";
import type {
  AlarmRecord,
  GeneratedDiagnosticBrief,
  SiteContext,
  TriageDecision as HumanDecisionState,
  WorkRecord
} from "@/lib/types";

export const runtime = "nodejs";

type GenerateBriefRequest = {
  alarm: AlarmRecord;
  recentAlarms: string[];
  workRecords: WorkRecord[];
  context: SiteContext;
  ruleEngineOutput: RuleEngineOutput;
};

const generatedBriefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    situation: { type: "string" },
    likely_pattern: { type: "string" },
    missing_checks: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3
    },
    priority_wo_readiness: {
      type: "object",
      additionalProperties: false,
      properties: {
        raw_severity: { type: "string" },
        normalized_priority: { type: "string" },
        wo_readiness: { type: "string" },
        reason: { type: "string" }
      },
      required: ["raw_severity", "normalized_priority", "wo_readiness", "reason"]
    },
    suggested_next_move: {
      type: "object",
      additionalProperties: false,
      properties: {
        recommended_decision_state: {
          type: "string",
          enum: [
            "monitor",
            "remote_verify",
            "update_existing_wo",
            "create_new_wo",
            "escalate",
            "defer",
            "false_not_actionable"
          ]
        },
        recommended: { type: "string" },
        supporting_action: { type: "string" },
        alternative: { type: "string" },
        human_must_confirm: { type: "string" }
      },
      required: [
        "recommended_decision_state",
        "recommended",
        "supporting_action",
        "alternative",
        "human_must_confirm"
      ]
    },
    evidence_to_request: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3
    },
    safety_note: {
      type: "string",
      enum: ["This is pre-WO decision support, not fault confirmation."]
    }
  },
  required: [
    "situation",
    "likely_pattern",
    "missing_checks",
    "priority_wo_readiness",
    "suggested_next_move",
    "evidence_to_request",
    "safety_note"
  ]
} as const;

export async function POST(request: Request) {
  let apiKey: string;

  try {
    apiKey = getRequiredServerEnv("OPENAI_API_KEY");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof MissingServerEnvError
            ? error.message
            : "Server configuration is invalid."
      },
      { status: error instanceof MissingServerEnvError ? error.status : 500 }
    );
  }

  let payload: GenerateBriefRequest;

  try {
    const body = (await request.json()) as unknown;
    payload = validateRequestBody(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 }
    );
  }

  const ruleAnchors = getRuleAnchors(payload.ruleEngineOutput);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      instructions: preWoDiagnosticBriefInstructions,
      input: JSON.stringify(
        {
          alarm: payload.alarm,
          recent_alarms: payload.recentAlarms,
          work_records: payload.workRecords,
          site_context: payload.context,
          faultCodeReference: payload.ruleEngineOutput.faultCodeReference ?? null,
          rule_engine_output: payload.ruleEngineOutput,
          rule_anchors: ruleAnchors
        },
        null,
        2
      ),
      text: {
        format: {
          type: "json_schema",
          name: "alarmready_pre_wo_diagnostic_brief",
          strict: true,
          schema: generatedBriefSchema
        }
      },
      max_output_tokens: 900,
      store: false
    })
  });

  const responseBody = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return NextResponse.json(
      { error: getOpenAiErrorMessage(responseBody) },
      { status: response.status }
    );
  }

  try {
    const outputText = extractOutputText(responseBody);
    const parsed = JSON.parse(outputText) as unknown;

    if (!isGeneratedDiagnosticBrief(parsed)) {
      throw new Error("OpenAI response did not match the expected brief schema.");
    }

    return NextResponse.json(applyRuleAnchors(parsed, ruleAnchors, payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse OpenAI response." },
      { status: 502 }
    );
  }
}

function validateRequestBody(body: unknown): GenerateBriefRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (!isRecord(body.alarm)) {
    throw new Error("Request body must include an alarm record.");
  }

  if (!Array.isArray(body.recentAlarms)) {
    throw new Error("Request body must include recentAlarms.");
  }

  if (!Array.isArray(body.workRecords)) {
    throw new Error("Request body must include workRecords.");
  }

  if (!isRecord(body.context)) {
    throw new Error("Request body must include site context.");
  }

  if (!isRecord(body.ruleEngineOutput)) {
    throw new Error("Request body must include ruleEngineOutput.");
  }

  return body as GenerateBriefRequest;
}

function extractOutputText(responseBody: unknown) {
  if (!isRecord(responseBody)) {
    throw new Error("OpenAI response was not a JSON object.");
  }

  if (typeof responseBody.output_text === "string") {
    return responseBody.output_text;
  }

  if (Array.isArray(responseBody.output)) {
    for (const outputItem of responseBody.output) {
      if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) {
        continue;
      }

      for (const contentItem of outputItem.content) {
        if (isRecord(contentItem) && typeof contentItem.text === "string") {
          return contentItem.text;
        }
      }
    }
  }

  throw new Error("OpenAI response did not include output text.");
}

function getOpenAiErrorMessage(responseBody: unknown) {
  if (isRecord(responseBody) && isRecord(responseBody.error)) {
    return typeof responseBody.error.message === "string"
      ? responseBody.error.message
      : "OpenAI request failed.";
  }

  return "OpenAI request failed.";
}

function getRuleAnchors(ruleEngineOutput: RuleEngineOutput) {
  return {
    mode: ruleEngineOutput.mode,
    context_coverage: ruleEngineOutput.contextCoverage,
    repeat_related_work_risk: getRepeatRelatedWorkRisk(ruleEngineOutput),
    fault_code_reference: ruleEngineOutput.faultCodeReference ?? null,
    raw_severity: ruleEngineOutput.priority.rawSeverity ?? "unknown",
    normalized_priority: formatPriority(ruleEngineOutput),
    wo_readiness: getWoReadiness(ruleEngineOutput),
    recommended_decision_state: getRecommendedDecisionState(ruleEngineOutput),
    supporting_action_hint: getSupportingActionHint(ruleEngineOutput),
    recommended_action: ruleEngineOutput.recommendedAction
  };
}

function applyRuleAnchors(
  brief: GeneratedDiagnosticBrief,
  ruleAnchors: ReturnType<typeof getRuleAnchors>,
  payload: GenerateBriefRequest
): GeneratedDiagnosticBrief {
  const anchoredBrief = {
    situation: brief.situation,
    likely_pattern: brief.likely_pattern,
    missing_checks: brief.missing_checks,
    priority_wo_readiness: {
      raw_severity: ruleAnchors.raw_severity,
      normalized_priority: ruleAnchors.normalized_priority,
      wo_readiness: ruleAnchors.wo_readiness,
      reason: brief.priority_wo_readiness.reason
    },
    suggested_next_move: {
      recommended_decision_state: ruleAnchors.recommended_decision_state,
      recommended: getPrimaryRecommendationLabel(
        brief.suggested_next_move.recommended,
        ruleAnchors.recommended_decision_state,
        payload
      ),
      supporting_action:
        brief.suggested_next_move.supporting_action?.trim() ||
        ruleAnchors.supporting_action_hint,
      alternative: brief.suggested_next_move.alternative,
      human_must_confirm: brief.suggested_next_move.human_must_confirm
    },
    evidence_to_request: brief.evidence_to_request,
    safety_note: "This is pre-WO decision support, not fault confirmation."
  };

  if (mentionsFaultCode39(payload)) {
    return applyFaultCode39Guardrail(anchoredBrief, ruleAnchors, payload);
  }

  return anchoredBrief;
}

function applyFaultCode39Guardrail(
  brief: GeneratedDiagnosticBrief,
  ruleAnchors: ReturnType<typeof getRuleAnchors>,
  payload: GenerateBriefRequest
): GeneratedDiagnosticBrief {
  const assetLabel = payload.alarm.assetId || "the inverter";
  const siteLabel = payload.alarm.siteName ? ` at ${payload.alarm.siteName}` : "";
  const searchableText = getPayloadSearchableText(payload);
  const hasMpptContext = /mppt-?08|string-current imbalance|string current imbalance/i.test(searchableText);
  const hasRainContext = /rain|humidity|moisture|damp|drying/i.test(searchableText);
  const hasOpenWo1086 = /wo-1086/i.test(searchableText);
  const hasClosedWo1042 = /wo-1042/i.test(searchableText);
  const contextPhrase = [
    hasRainContext ? "after rainy or high-humidity context" : "with limited supplied context",
    hasMpptContext ? "recent MPPT-08 string-current imbalance context" : "",
    hasOpenWo1086 ? "an open related WO" : "",
    /underperformance|below peer|production impact/i.test(searchableText)
      ? "limited but measurable underperformance"
      : ""
  ]
    .filter(Boolean)
    .join(", ");
  const reasonSignals = [
    "safety-relevant insulation-resistance reference",
    hasRainContext ? "rainy-weather or moisture context" : "",
    hasOpenWo1086 || hasClosedWo1042 || hasMpptContext ? "repeat/related-work risk" : "",
    hasOpenWo1086 ? "open WO-1086" : "",
    hasClosedWo1042 ? "recent WO-1042 repair history" : "",
    /underperformance|below peer|production impact/i.test(searchableText)
      ? "limited site-level production impact"
      : ""
  ].filter(Boolean);

  return {
    ...brief,
    situation: `${assetLabel}${siteLabel} reports Fault code 39 — Low System Insulation Resistance ${contextPhrase}. This is a pre-WO triage signal, not confirmation of the actual fault.`,
    likely_pattern:
      hasOpenWo1086 || hasClosedWo1042 || hasMpptContext
        ? "unclear: Possible recurrence or related-work pattern because the alarm appears near related alarm/work history; the actual fault is not confirmed."
        : "unclear: Current alarm alone is not enough to determine whether this is primary, repeat, or consequence; the actual fault is not confirmed.",
    missing_checks: [
      hasRainContext
        ? "Confirm array insulation impedance / ISO resistance trend and whether fault code 39 clears after the drying period."
        : "Confirm array insulation impedance / ISO resistance trend and whether fault code 39 remains active.",
      "Check resistance to ground of the relevant string and DC cable following site safety procedure.",
      hasOpenWo1086
        ? `Confirm whether open WO-1086 already covers this issue${hasClosedWo1042 ? " and whether prior WO-1042 close-out evidence is sufficient" : ""}.`
        : "Check weather/moisture context and recent alarm/work-order history before creating new work."
    ],
    priority_wo_readiness: {
      raw_severity: ruleAnchors.raw_severity,
      normalized_priority: ruleAnchors.normalized_priority,
      wo_readiness: ruleAnchors.wo_readiness,
      reason: `${capitalizeFirst(reasonSignals.join(", "))}.`
    },
    suggested_next_move: {
      recommended_decision_state: hasOpenWo1086 ? "update_existing_wo" : "remote_verify",
      recommended:
        hasOpenWo1086
          ? "Update existing WO-1086"
          : "Remote verify Fault code 39 context",
      supporting_action: hasOpenWo1086
        ? "Remote-verify fault code 39 persistence and add the evidence/context to WO-1086 before creating new work."
        : "Collect missing insulation, weather/moisture, and work-history evidence before WO preparation.",
      alternative: hasRainContext
        ? "Monitor only if fault code 39 clears after the drying period and does not repeat."
        : "Monitor only if fault code 39 clears, does not repeat, and human review accepts the missing context.",
      human_must_confirm:
        hasOpenWo1086
          ? "Human reviewer must confirm whether this belongs to the open WO and whether qualified field inspection should proceed today."
          : "Human reviewer must confirm whether remote evidence is sufficient and whether qualified follow-up is needed."
    },
    evidence_to_request: [
      "iSolarCloud fault record showing Fault code 39 with timestamp, plus array insulation impedance / ISO resistance trend.",
      "Resistance-to-ground test result for the relevant string and DC cable, performed under site safety procedure.",
      hasOpenWo1086 || hasClosedWo1042
        ? "Photos or test evidence for connectors, cables, moisture ingress, prior repaired string 08B, and close-out/update evidence on the existing WO."
        : "Weather/moisture context and any recent alarm or work-order evidence for the same inverter, string, connector, or DC cable."
    ],
    safety_note: "This is pre-WO decision support, not fault confirmation."
  };
}

function mentionsFaultCode39(payload: GenerateBriefRequest) {
  return /fault\s*code\s*39|low system insulation resistance/i.test(getPayloadSearchableText(payload));
}

function capitalizeFirst(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function getPayloadSearchableText(payload: GenerateBriefRequest) {
  return [
    payload.alarm.alarmType,
    payload.alarm.rawMessage,
    payload.alarm.assetId,
    payload.context.operatorNotes,
    payload.context.relatedAlarms,
    payload.context.recentWork,
    ...payload.recentAlarms,
    ...payload.workRecords.map((record) => record.operationalNote)
  ]
    .filter(Boolean)
    .join(" ");
}

function getRepeatRelatedWorkRisk(ruleEngineOutput: RuleEngineOutput) {
  const findings = [
    ...ruleEngineOutput.duplicateFindings,
    ...ruleEngineOutput.relatedWorkFindings
  ];

  if (ruleEngineOutput.mode === "quick") {
    return "Not applicable";
  }

  if (
    findings.some((finding) =>
      ["duplicate_wo_risk", "update_or_link_open_wo", "update_scheduled_wo_first"].includes(
        finding.code
      )
    )
  ) {
    return "Risk";
  }

  if (findings.length > 0) {
    return "Review";
  }

  return "Clear";
}

function getRecommendedDecisionState(ruleEngineOutput: RuleEngineOutput): HumanDecisionState {
  const findings = [
    ...ruleEngineOutput.duplicateFindings,
    ...ruleEngineOutput.relatedWorkFindings
  ];
  const hasExistingWorkSignal = findings.some((finding) =>
    ["duplicate_wo_risk", "update_or_link_open_wo", "update_scheduled_wo_first"].includes(
      finding.code
    )
  );

  if (ruleEngineOutput.faultCodeReference?.safetyRelevance === "safety_critical") {
    return "escalate";
  }

  if (hasExistingWorkSignal) {
    return "update_existing_wo";
  }

  if (getWoReadiness(ruleEngineOutput) === "Escalate") {
    return "escalate";
  }

  if (getWoReadiness(ruleEngineOutput) === "Ready") {
    return "create_new_wo";
  }

  return "remote_verify";
}

function getSupportingActionHint(ruleEngineOutput: RuleEngineOutput) {
  const recommendedDecisionState = getRecommendedDecisionState(ruleEngineOutput);
  const existingWorkLabel = getExistingWorkLabel(ruleEngineOutput);

  if (recommendedDecisionState === "update_existing_wo") {
    return `Remote-verify alarm persistence and add the new alarm/context evidence to ${
      existingWorkLabel ?? "the existing WO"
    } before creating separate work.`;
  }

  if (recommendedDecisionState === "escalate") {
    return "Prepare the available alarm, safety, and evidence context for specialist/OEM/manager review.";
  }

  if (recommendedDecisionState === "create_new_wo") {
    return "Include confirmed alarm context, missing checks, and evidence needs in the technician handoff.";
  }

  return "Collect remote evidence and verify persistence before deciding whether field work is needed.";
}

function getPrimaryRecommendationLabel(
  recommended: string,
  recommendedDecisionState: HumanDecisionState,
  payload: GenerateBriefRequest
) {
  const trimmed = recommended.trim();

  if (trimmed && !isCompoundRecommendation(trimmed)) {
    return trimmed;
  }

  if (recommendedDecisionState === "update_existing_wo") {
    const workLabel = getExistingWorkLabelFromPayload(payload);
    return `Update existing ${workLabel ?? "WO"}`;
  }

  if (recommendedDecisionState === "remote_verify") {
    return "Remote verify";
  }

  if (recommendedDecisionState === "create_new_wo") {
    return "Create new WO";
  }

  if (recommendedDecisionState === "escalate") {
    return "Escalate";
  }

  if (recommendedDecisionState === "monitor") {
    return "Monitor";
  }

  if (recommendedDecisionState === "defer") {
    return "Defer with reason";
  }

  return "False alarm / not actionable";
}

function isCompoundRecommendation(value: string) {
  return /remote[-\s]?verify.+update|update.+remote[-\s]?verify|monitor.+create|create.+monitor|escalate.+create|create.+escalate| and /i.test(
    value
  );
}

function getWoReadiness(ruleEngineOutput: RuleEngineOutput) {
  const findings = [
    ...ruleEngineOutput.duplicateFindings,
    ...ruleEngineOutput.relatedWorkFindings
  ];
  const reference = ruleEngineOutput.faultCodeReference;

  if (reference?.safetyRelevance === "safety_critical") {
    return "Escalate";
  }

  if (
    findings.some((finding) =>
      ["duplicate_wo_risk", "update_or_link_open_wo", "update_scheduled_wo_first"].includes(
        finding.code
      )
    )
  ) {
    return "Update existing WO first";
  }

  if (ruleEngineOutput.contextCoverage === "low") {
    return "Not ready yet";
  }

  if (reference?.safetyRelevance === "safety_relevant") {
    return ruleEngineOutput.contextCoverage === "high"
      ? "Ready after remote verification"
      : "Not ready yet";
  }

  if (ruleEngineOutput.priority.normalizedPriority === "high") {
    return "Escalate";
  }

  if (
    ruleEngineOutput.mode === "quick" ||
    ruleEngineOutput.contextCoverage !== "high" ||
    ruleEngineOutput.priority.priorityConfidence !== "high" ||
    findings.length > 0
  ) {
    return "Ready after remote verification";
  }

  return "Ready";
}

function getExistingWorkLabel(ruleEngineOutput: RuleEngineOutput) {
  const evidenceText = [
    ...ruleEngineOutput.duplicateFindings,
    ...ruleEngineOutput.relatedWorkFindings
  ]
    .flatMap((finding) => finding.evidence)
    .join(" ");

  return evidenceText.match(/\bWO-\d+\b/i)?.[0].toUpperCase() ?? null;
}

function getExistingWorkLabelFromPayload(payload: GenerateBriefRequest) {
  return getPayloadSearchableText(payload).match(/\bWO-\d+\b/i)?.[0].toUpperCase() ?? null;
}

function formatPriority(ruleEngineOutput: RuleEngineOutput) {
  const priority = ruleEngineOutput.priority.normalizedPriority;

  if (priority === "high") {
    return "High";
  }

  return priority === "medium" ? "Medium" : "Low";
}

function isGeneratedDiagnosticBrief(value: unknown): value is GeneratedDiagnosticBrief {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.situation === "string" &&
    typeof value.likely_pattern === "string" &&
    isFixedStringArray(value.missing_checks, 3) &&
    isRecord(value.priority_wo_readiness) &&
    typeof value.priority_wo_readiness.raw_severity === "string" &&
    typeof value.priority_wo_readiness.normalized_priority === "string" &&
    typeof value.priority_wo_readiness.wo_readiness === "string" &&
    typeof value.priority_wo_readiness.reason === "string" &&
    isRecord(value.suggested_next_move) &&
    isDecisionState(value.suggested_next_move.recommended_decision_state) &&
    typeof value.suggested_next_move.recommended === "string" &&
    typeof value.suggested_next_move.supporting_action === "string" &&
    typeof value.suggested_next_move.alternative === "string" &&
    typeof value.suggested_next_move.human_must_confirm === "string" &&
    isFixedStringArray(value.evidence_to_request, 3) &&
    typeof value.safety_note === "string"
  );
}

function isDecisionState(value: unknown): value is HumanDecisionState {
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

function isFixedStringArray(value: unknown, length: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
