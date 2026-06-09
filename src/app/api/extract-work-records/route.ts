import { NextResponse } from "next/server";
import { isWorkRecordExtractionResult } from "@/lib/extraction";
import {
  OpenAiResponseError,
  isRecord,
  requestStructuredOpenAiResponse
} from "@/lib/openaiResponses";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";

export const runtime = "nodejs";

type ExtractWorkRecordsRequest = {
  rawText: string;
};

const workRecordsExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          workId: { type: ["string", "null"] },
          assetDevice: { type: ["string", "null"] },
          status: {
            type: "string",
            enum: ["open", "scheduled", "closed", "unknown"]
          },
          dateOrAge: { type: ["string", "null"] },
          issueTerms: {
            type: "array",
            items: { type: "string" }
          },
          actionTaken: { type: ["string", "null"] },
          evidenceAvailable: {
            type: "array",
            items: { type: "string" }
          },
          evidenceMissing: {
            type: "array",
            items: { type: "string" }
          },
          relevanceHint: {
            type: "string",
            enum: [
              "same_asset",
              "dc_insulation",
              "dc_string",
              "comms",
              "tracker",
              "unrelated",
              "unknown"
            ]
          },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          sourceText: { type: "string" }
        },
        required: [
          "workId",
          "assetDevice",
          "status",
          "dateOrAge",
          "issueTerms",
          "actionTaken",
          "evidenceAvailable",
          "evidenceMissing",
          "relevanceHint",
          "confidence",
          "sourceText"
        ]
      }
    }
  },
  required: ["records"]
} as const;

const workRecordsExtractionInstructions = [
  "You extract structured work-record fields for AlarmReady solar alarm triage.",
  "Return only JSON matching the schema.",
  "Extract each WO, work order, ticket, or work note separately when possible.",
  "Capture status as open, scheduled, closed, or unknown.",
  "Capture evidence gaps such as missing screenshots, missing test values, or missing close-out evidence.",
  "Do not decide recurrence, priority, WO readiness, or operational action.",
  "Do not diagnose or confirm root cause.",
  "relevanceHint is only an extraction hint from text terms, not a triage decision.",
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

  let payload: ExtractWorkRecordsRequest;

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
      instructions: workRecordsExtractionInstructions,
      input: {
        raw_work_record_text: payload.rawText
      },
      schemaName: "alarmready_work_record_extraction",
      schema: workRecordsExtractionSchema,
      maxOutputTokens: 1400
    });

    if (!isWorkRecordExtractionResult(parsed)) {
      throw new Error("OpenAI response did not match the expected work-record schema.");
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

function validateRequestBody(body: unknown): ExtractWorkRecordsRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof body.rawText !== "string" || !body.rawText.trim()) {
    throw new Error("Request body must include rawText.");
  }

  return { rawText: body.rawText };
}
