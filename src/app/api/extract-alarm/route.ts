import { NextResponse } from "next/server";
import { isAlarmExtractionResult } from "@/lib/extraction";
import {
  OpenAiResponseError,
  isRecord,
  requestStructuredOpenAiResponse
} from "@/lib/openaiResponses";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";

export const runtime = "nodejs";

type ExtractAlarmRequest = {
  rawText: string;
};

const alarmExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    sitePlant: { type: ["string", "null"] },
    assetDevice: { type: ["string", "null"] },
    manufacturer: { type: ["string", "null"] },
    model: { type: ["string", "null"] },
    alarmTextCode: { type: ["string", "null"] },
    faultCode: { type: ["string", "null"] },
    timestamp: { type: ["string", "null"] },
    severity: { type: ["string", "null"] },
    shortNote: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    missingFields: {
      type: "array",
      items: { type: "string" }
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string" },
          sourceText: { type: "string" }
        },
        required: ["field", "sourceText"]
      }
    }
  },
  required: [
    "sitePlant",
    "assetDevice",
    "manufacturer",
    "model",
    "alarmTextCode",
    "faultCode",
    "timestamp",
    "severity",
    "shortNote",
    "confidence",
    "missingFields",
    "evidence"
  ]
} as const;

const alarmExtractionInstructions = [
  "You extract structured fields from messy solar monitoring alarm exports for AlarmReady.",
  "Return only JSON matching the schema.",
  "Extract only values that are present in the provided text.",
  "Do not infer root cause, diagnose, or explain the alarm.",
  "Do not invent site, asset, severity, timestamp, manufacturer, model, or fault code.",
  "If a value is uncertain, use null when appropriate and lower confidence.",
  "Preserve short source evidence for extracted fields. Evidence snippets must be concise.",
  "Fault code 39 should be extracted as faultCode 39 if present, but do not explain or diagnose it.",
  "missingFields should include missing required AlarmReady fields: sitePlant, assetDevice, alarmTextCode, timestamp."
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

  let payload: ExtractAlarmRequest;

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
      instructions: alarmExtractionInstructions,
      input: {
        raw_alarm_text: payload.rawText
      },
      schemaName: "alarmready_alarm_extraction",
      schema: alarmExtractionSchema,
      maxOutputTokens: 900
    });

    if (!isAlarmExtractionResult(parsed)) {
      throw new Error("OpenAI response did not match the expected alarm extraction schema.");
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

function validateRequestBody(body: unknown): ExtractAlarmRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof body.rawText !== "string" || !body.rawText.trim()) {
    throw new Error("Request body must include rawText.");
  }

  return { rawText: body.rawText };
}
