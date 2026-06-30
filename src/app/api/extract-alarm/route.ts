import { NextResponse } from "next/server";
import { alarmExtractionInstructions } from "@/lib/alarmExtractionPrompt";
import {
  conflictEligibleAlarmExtractionFields,
  isAlarmExtractionResult,
  normalizeAlarmExtractionResult
} from "@/lib/extraction";
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
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: {
            type: "string",
            enum: conflictEligibleAlarmExtractionFields
          },
          candidates: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                value: { type: "string" },
                sourceText: { type: "string" }
              },
              required: ["value", "sourceText"]
            }
          }
        },
        required: ["field", "candidates"]
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
    "evidence",
    "conflicts"
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

    return NextResponse.json(normalizeAlarmExtractionResult(parsed, { rawInput: payload.rawText }));
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
