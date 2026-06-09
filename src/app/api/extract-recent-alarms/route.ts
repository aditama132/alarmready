import { NextResponse } from "next/server";
import { isRecentAlarmExtractionResult } from "@/lib/extraction";
import {
  OpenAiResponseError,
  isRecord,
  requestStructuredOpenAiResponse
} from "@/lib/openaiResponses";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";

export const runtime = "nodejs";

type ExtractRecentAlarmsRequest = {
  rawText: string;
};

const recentAlarmsExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: { type: ["string", "null"] },
          assetDevice: { type: ["string", "null"] },
          alarmTextCode: { type: ["string", "null"] },
          faultCode: { type: ["string", "null"] },
          severity: { type: ["string", "null"] },
          status: {
            type: "string",
            enum: ["active", "cleared", "unknown"]
          },
          sourceText: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: [
          "timestamp",
          "assetDevice",
          "alarmTextCode",
          "faultCode",
          "severity",
          "status",
          "sourceText",
          "confidence"
        ]
      }
    }
  },
  required: ["records"]
} as const;

const recentAlarmsExtractionInstructions = [
  "You extract structured recent-alarm records for AlarmReady solar alarm triage.",
  "Return only JSON matching the schema.",
  "Extract each alarm line, event, or alarm row separately when possible.",
  "Extract only what is present. Do not invent timestamps, assets, severity, status, or fault code.",
  "Use status active, cleared, or unknown from the text only.",
  "Fault code 39 should be extracted as faultCode 39 if present, but do not explain or diagnose it.",
  "Do not decide repeat risk, priority, WO readiness, or operational action.",
  "Do not diagnose or confirm root cause.",
  "Keep sourceText concise but recognizable enough for user confirmation."
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

  let payload: ExtractRecentAlarmsRequest;

  try {
    payload = validateRequestBody((await request.json()) as unknown);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request body." },
      { status: 400 }
    );
  }

  try {
    const parsed = await requestStructuredOpenAiResponse({
      apiKey,
      instructions: recentAlarmsExtractionInstructions,
      input: {
        raw_recent_alarm_text: payload.rawText
      },
      schemaName: "alarmready_recent_alarm_extraction",
      schema: recentAlarmsExtractionSchema,
      maxOutputTokens: 1200
    });

    if (!isRecentAlarmExtractionResult(parsed)) {
      throw new Error("OpenAI response did not match the expected recent-alarm schema.");
    }

    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof OpenAiResponseError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Extraction failed." },
      { status: 502 }
    );
  }
}

function validateRequestBody(body: unknown): ExtractRecentAlarmsRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof body.rawText !== "string" || !body.rawText.trim()) {
    throw new Error("Request body must include rawText.");
  }

  return { rawText: body.rawText };
}
