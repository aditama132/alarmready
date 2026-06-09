import { NextResponse } from "next/server";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";

export const runtime = "nodejs";

type FeedbackPayload = {
  useful: boolean | null;
  tags: string[];
  comment?: string;
  context_level?: "low" | "partial" | "high";
  human_decision_state?:
    | "monitor"
    | "remote_verify"
    | "update_existing_wo"
    | "create_new_wo"
    | "escalate"
    | "defer"
    | "false_not_actionable";
  normalized_priority?: "low" | "medium" | "high";
  wo_readiness?: string;
  ai_suggested_decision_state?: string;
  scenario_type?: "context_rich_demo" | "custom";
  app_version?: string;
  prompt_version?: string;
};

const allowedFields = new Set([
  "useful",
  "tags",
  "comment",
  "context_level",
  "human_decision_state",
  "normalized_priority",
  "wo_readiness",
  "ai_suggested_decision_state",
  "scenario_type",
  "app_version",
  "prompt_version"
]);

const forbiddenFields = new Set([
  "user_id",
  "name",
  "email",
  "ip",
  "ip_address",
  "user_agent",
  "site",
  "site_name",
  "asset",
  "asset_name",
  "asset_device",
  "device_name",
  "raw_alarm_text",
  "rawAlarmText",
  "recent_alarms_text",
  "recentAlarmsText",
  "work_records_text",
  "workRecordsText",
  "operating_context_text",
  "operatingContextText",
  "generated_brief_snapshot",
  "generatedBriefSnapshot",
  "generated_operational_note_snapshot",
  "generatedNoteSnapshot",
  "generated_note_snapshot",
  "alarm_summary"
]);

export async function POST(request: Request) {
  let payload: FeedbackPayload;

  try {
    payload = validateFeedbackPayload((await request.json()) as unknown);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid feedback payload." },
      { status: 400 }
    );
  }

  const storageMode = getFeedbackStorageMode();

  if (storageMode instanceof Error) {
    return NextResponse.json({ error: storageMode.message }, { status: 500 });
  }

  if (storageMode === "local") {
    return NextResponse.json({ success: true, storageMode: "local" });
  }

  let supabaseUrl: string;
  let supabaseServiceRoleKey: string;

  try {
    supabaseUrl = getRequiredServerEnv("SUPABASE_URL");
    supabaseServiceRoleKey = getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof MissingServerEnvError
            ? error.message
            : "Supabase feedback storage is not configured."
      },
      { status: error instanceof MissingServerEnvError ? error.status : 500 }
    );
  }

  let response: Response;

  try {
    response = await fetch(new URL("/rest/v1/alarmready_feedback", supabaseUrl), {
      method: "POST",
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    return NextResponse.json(
      { error: "Supabase feedback storage request failed. Check SUPABASE_URL." },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const responseBody = (await response.json().catch(() => null)) as unknown;

    return NextResponse.json(
      { error: getSupabaseErrorMessage(responseBody) },
      { status: response.status }
    );
  }

  return NextResponse.json({ success: true, storageMode: "supabase" });
}

function validateFeedbackPayload(value: unknown): FeedbackPayload {
  if (!isRecord(value)) {
    throw new Error("Feedback payload must be a JSON object.");
  }

  const keys = Object.keys(value);
  const forbiddenKey = keys.find((key) => forbiddenFields.has(key));

  if (forbiddenKey) {
    throw new Error(`Feedback field "${forbiddenKey}" is not stored by AlarmReady.`);
  }

  const unknownKey = keys.find((key) => !allowedFields.has(key));

  if (unknownKey) {
    throw new Error(`Unknown feedback field "${unknownKey}".`);
  }

  if (!(typeof value.useful === "boolean" || value.useful === null)) {
    throw new Error("Feedback field useful must be boolean or null.");
  }

  if (
    !Array.isArray(value.tags) ||
    !value.tags.every((tag) => typeof tag === "string" && tag.length <= 80)
  ) {
    throw new Error("Feedback field tags must be an array of short strings.");
  }

  const comment = getOptionalText(value.comment, "comment", 800);
  const woReadiness = getOptionalText(value.wo_readiness, "wo_readiness", 160);
  const aiSuggestedDecisionState = getOptionalText(
    value.ai_suggested_decision_state,
    "ai_suggested_decision_state",
    80
  );
  const appVersion = getOptionalText(value.app_version, "app_version", 80);
  const promptVersion = getOptionalText(value.prompt_version, "prompt_version", 80);

  return {
    useful: value.useful,
    tags: value.tags,
    ...(comment ? { comment } : {}),
    ...(optionalEnum(value.context_level, ["low", "partial", "high"])
      ? { context_level: value.context_level }
      : {}),
    ...(optionalEnum(value.human_decision_state, [
      "monitor",
      "remote_verify",
      "update_existing_wo",
      "create_new_wo",
      "escalate",
      "defer",
      "false_not_actionable"
    ])
      ? { human_decision_state: value.human_decision_state }
      : {}),
    ...(optionalEnum(value.normalized_priority, ["low", "medium", "high"])
      ? { normalized_priority: value.normalized_priority }
      : {}),
    ...(woReadiness ? { wo_readiness: woReadiness } : {}),
    ...(aiSuggestedDecisionState
      ? { ai_suggested_decision_state: aiSuggestedDecisionState }
      : {}),
    ...(optionalEnum(value.scenario_type, ["context_rich_demo", "custom"])
      ? { scenario_type: value.scenario_type }
      : {}),
    ...(appVersion ? { app_version: appVersion } : {}),
    ...(promptVersion ? { prompt_version: promptVersion } : {})
  };
}

function getFeedbackStorageMode() {
  const mode = (process.env.FEEDBACK_STORAGE_MODE?.trim() || "local").toLowerCase();

  if (mode === "local" || mode === "supabase") {
    return mode;
  }

  return new Error("FEEDBACK_STORAGE_MODE must be local or supabase.");
}

function getOptionalText(value: unknown, fieldName: string, maxLength: number) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Feedback field ${fieldName} must be a string.`);
  }

  if (value.trim().length > maxLength) {
    throw new Error(`Feedback field ${fieldName} is too long.`);
  }

  return value.trim() || undefined;
}

function optionalEnum<T extends string>(value: unknown, allowedValues: readonly T[]): value is T {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new Error(`Feedback field value "${String(value)}" is not supported.`);
  }

  return true;
}

function getSupabaseErrorMessage(responseBody: unknown) {
  if (isRecord(responseBody) && typeof responseBody.message === "string") {
    return `Supabase feedback insert failed: ${responseBody.message}`;
  }

  return "Supabase feedback insert failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
