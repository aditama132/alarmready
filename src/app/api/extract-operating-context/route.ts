import { NextResponse } from "next/server";
import { isOperatingContextExtractionResult } from "@/lib/extraction";
import {
  OpenAiResponseError,
  isRecord,
  requestStructuredOpenAiResponse
} from "@/lib/openaiResponses";
import { MissingServerEnvError, getRequiredServerEnv } from "@/lib/serverEnv";

export const runtime = "nodejs";

type ExtractOperatingContextRequest = {
  rawText: string;
  chips: string[];
};

const operatingContextExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    weather: { type: ["string", "null"] },
    irradiance: { type: ["string", "null"] },
    commsStatus: { type: ["string", "null"] },
    productionImpactText: { type: ["string", "null"] },
    estimatedImpactKw: { type: ["number", "null"] },
    estimatedImpactPercent: { type: ["number", "null"] },
    slaText: { type: ["string", "null"] },
    safetyHseText: { type: ["string", "null"] },
    accessConstraint: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    missingContext: {
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
    "weather",
    "irradiance",
    "commsStatus",
    "productionImpactText",
    "estimatedImpactKw",
    "estimatedImpactPercent",
    "slaText",
    "safetyHseText",
    "accessConstraint",
    "confidence",
    "missingContext",
    "evidence"
  ]
} as const;

const operatingContextExtractionInstructions = [
  "You extract structured site and operating context for AlarmReady solar alarm triage.",
  "Return only JSON matching the schema.",
  "Extract only values present in raw text or explicitly represented by selected chips.",
  "Extract numeric impact only when explicitly present.",
  "If text says less than 0.2% total site capacity, extract estimatedImpactPercent as 0.2 and preserve the upper-bound text in productionImpactText or evidence.",
  "Do not invent kW or percentage values.",
  "Preserve SLA phrases such as same-business-day, same day, 24h, 48h, urgent, immediate, or breached.",
  "Preserve safety/HSE phrases.",
  "Do not diagnose, decide priority, decide WO readiness, or recommend dispatch.",
  "missingContext should list useful missing operating context, not rule-engine decisions."
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

  let payload: ExtractOperatingContextRequest;

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
      instructions: operatingContextExtractionInstructions,
      input: {
        raw_operating_context_text: payload.rawText,
        selected_context_chips: payload.chips
      },
      schemaName: "alarmready_operating_context_extraction",
      schema: operatingContextExtractionSchema,
      maxOutputTokens: 1100
    });

    if (!isOperatingContextExtractionResult(parsed)) {
      throw new Error("OpenAI response did not match the expected operating-context schema.");
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

function validateRequestBody(body: unknown): ExtractOperatingContextRequest {
  if (!isRecord(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof body.rawText !== "string" || !body.rawText.trim()) {
    throw new Error("Request body must include rawText.");
  }

  if (!Array.isArray(body.chips) || !body.chips.every((chip) => typeof chip === "string")) {
    throw new Error("Request body must include chips.");
  }

  return {
    rawText: body.rawText,
    chips: body.chips
  };
}
