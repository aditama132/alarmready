import { NextResponse } from "next/server";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";
import type {
  AlarmRecord,
  GeneratedDiagnosticBrief,
  SiteContext,
  TriageDecision as HumanDecisionState,
  WorkRecord
} from "@/lib/types";
import type { TriageDecision as RuleEngineDecision } from "@/lib/rules";
import type { DecisionAlignment } from "@/lib/decisionAlignment";

export const runtime = "nodejs";

type GenerateNoteRequest = {
  confirmedAlarm: AlarmRecord;
  confirmedRecentAlarms: string[];
  confirmedWorkRecords: WorkRecord[];
  confirmedOperatingContext: SiteContext;
  triageResult: RuleEngineDecision;
  generatedBrief: GeneratedDiagnosticBrief;
  selectedHumanDecision: HumanDecisionState;
  humanDecisionReason: string;
  decisionAlignment: DecisionAlignment;
};

type GeneratedOperationalNoteParts = {
  decision_object: string;
  current_issue: string;
  decision_basis: string;
  requested_action_condition: string;
  evidence_needed_trigger: string;
};

const decisionStates: HumanDecisionState[] = [
  "monitor",
  "remote_verify",
  "update_existing_wo",
  "create_new_wo",
  "escalate",
  "defer",
  "false_not_actionable"
];

const decisionLabels: Record<HumanDecisionState, string> = {
  monitor: "Monitor",
  remote_verify: "Remote verify",
  update_existing_wo: "Update existing WO",
  create_new_wo: "Create new WO",
  escalate: "Escalate",
  defer: "Defer with reason",
  false_not_actionable: "False alarm / not actionable"
};

const operationalNoteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision_object: { type: "string" },
    current_issue: { type: "string" },
    decision_basis: { type: "string" },
    requested_action_condition: { type: "string" },
    evidence_needed_trigger: { type: "string" }
  },
  required: [
    "decision_object",
    "current_issue",
    "decision_basis",
    "requested_action_condition",
    "evidence_needed_trigger"
  ]
} as const;

const noteInstructions = [
  "You write concise operational notes for solar monitoring engineers after a human has selected the decision state.",
  "Return only JSON that matches the provided schema.",
  "The JSON fields will be formatted into a copyable operational note.",
  "Use the selected_human_decision_state as the final decision; do not override it with the AI brief suggestion.",
  "Treat generated_diagnostic_brief.suggested_next_move.recommended_decision_state as the AI primary suggestion only. Do not treat supporting_action as a separate primary decision.",
  "Generate based on confirmed triage context, the generated brief, and the human-selected decision. Do not use or refer to raw unconfirmed input.",
  "Do not diagnose, confirm, or imply the actual fault.",
  "Do not dispatch work, imply dispatch is automatic, or say work has been created.",
  "Do not provide unsafe field instructions.",
  "Keep each field short, specific, and operational. Prefer one sentence per field.",
  "decision_object should be a compact first line: human decision label + site/asset/alarm object.",
  "current_issue should state the alarm, asset, site, timestamp, and the most relevant confirmed context using uncertainty-aware language.",
  "decision_basis should state why the human decision was selected using priority, context level, related-work risk, existing work, uncertainty, SLA, safety relevance, or the human rationale.",
  "requested_action_condition should state what happens next or what condition should be watched.",
  "evidence_needed_trigger should state what evidence is needed now or later and what should trigger escalation or reopening.",
  "If the selected human decision differs from the AI suggestion or WO readiness, preserve the human rationale and make any duplicate-work, under-response, over-response, or safety-review trigger explicit.",
  "When the selected decision is update_existing_wo, include compatible supporting actions such as remote verification under requested_action_condition, not as a separate primary decision.",
  "Decision behavior:",
  "monitor: include watch condition, review interval or escalation trigger, and avoid passive waiting without a trigger.",
  "remote_verify: include remote checks/actions, evidence needed, and failure or persistence trigger.",
  "update_existing_wo: add context to the current WO, avoid duplicate work, and reference/link existing work if possible.",
  "create_new_wo: create a technician handoff note with required checks and explain why existing work is absent or insufficient, but do not dispatch.",
  "escalate: prepare an evidence pack and identify the expert/OEM/manager decision needed, with urgency or safety basis if present.",
  "defer: state priority/SLA rationale plus a review time or condition and trigger for reopening/escalation.",
  "false_not_actionable: state reason for non-action, confidence limitation, and a reopen trigger.",
  "Do not over-explain."
].join(" ");

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

  let payload: GenerateNoteRequest;

  try {
    const body = (await request.json()) as unknown;
    payload = validateRequestBody(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 }
    );
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      instructions: noteInstructions,
      input: JSON.stringify(
        {
          confirmed_alarm: payload.confirmedAlarm,
          confirmed_recent_alarms: payload.confirmedRecentAlarms,
          confirmed_work_records: payload.confirmedWorkRecords,
          confirmed_operating_context: payload.confirmedOperatingContext,
          triage_result: payload.triageResult,
          generated_diagnostic_brief: payload.generatedBrief,
          ai_suggested_primary_decision_state:
            payload.generatedBrief.suggested_next_move.recommended_decision_state ?? null,
          ai_suggested_next_move: payload.generatedBrief.suggested_next_move.recommended,
          ai_supporting_action:
            payload.generatedBrief.suggested_next_move.supporting_action ?? "",
          selected_human_decision_state: payload.selectedHumanDecision,
          selected_human_decision_label: decisionLabels[payload.selectedHumanDecision],
          human_decision_reason: payload.humanDecisionReason,
          decision_alignment: payload.decisionAlignment
        },
        null,
        2
      ),
      text: {
        format: {
          type: "json_schema",
          name: "alarmready_operational_note",
          strict: true,
          schema: operationalNoteSchema
        }
      },
      max_output_tokens: 500,
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

    if (!isGeneratedOperationalNoteParts(parsed)) {
      throw new Error("OpenAI response did not match the expected operational note schema.");
    }

    return NextResponse.json({
      operationalNote: formatOperationalNote(parsed)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse OpenAI response." },
      { status: 502 }
    );
  }
}

function validateRequestBody(body: unknown): GenerateNoteRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (!isRecord(body.confirmedAlarm)) {
    throw new Error("Request body must include confirmedAlarm.");
  }

  if (!Array.isArray(body.confirmedRecentAlarms)) {
    throw new Error("Request body must include confirmedRecentAlarms.");
  }

  if (!Array.isArray(body.confirmedWorkRecords)) {
    throw new Error("Request body must include confirmedWorkRecords.");
  }

  if (!isRecord(body.confirmedOperatingContext)) {
    throw new Error("Request body must include confirmedOperatingContext.");
  }

  if (!isRecord(body.triageResult)) {
    throw new Error("Request body must include triageResult.");
  }

  if (!isRecord(body.generatedBrief)) {
    throw new Error("Request body must include generatedBrief.");
  }

  if (
    typeof body.selectedHumanDecision !== "string" ||
    !decisionStates.includes(body.selectedHumanDecision as HumanDecisionState)
  ) {
    throw new Error("Request body must include a valid selected human decision state.");
  }

  if (typeof body.humanDecisionReason !== "string") {
    throw new Error("Request body must include humanDecisionReason.");
  }

  if (!isRecord(body.decisionAlignment)) {
    throw new Error("Request body must include decisionAlignment.");
  }

  return body as GenerateNoteRequest;
}

function formatOperationalNote(parts: GeneratedOperationalNoteParts) {
  return [
    cleanLine(parts.decision_object),
    "",
    "Current issue:",
    cleanLine(parts.current_issue),
    "",
    "Decision basis:",
    cleanLine(parts.decision_basis),
    "",
    "Requested action / condition:",
    cleanLine(parts.requested_action_condition),
    "",
    "Evidence needed / trigger:",
    cleanLine(parts.evidence_needed_trigger)
  ].join("\n");
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

function isGeneratedOperationalNoteParts(
  value: unknown
): value is GeneratedOperationalNoteParts {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.decision_object === "string" &&
    typeof value.current_issue === "string" &&
    typeof value.decision_basis === "string" &&
    typeof value.requested_action_condition === "string" &&
    typeof value.evidence_needed_trigger === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
