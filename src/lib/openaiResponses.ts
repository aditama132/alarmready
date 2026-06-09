type StructuredResponseInput = {
  apiKey: string;
  instructions: string;
  input: unknown;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
};

export class OpenAiResponseError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OpenAiResponseError";
    this.status = status;
  }
}

export async function requestStructuredOpenAiResponse({
  apiKey,
  instructions,
  input,
  schemaName,
  schema,
  maxOutputTokens
}: StructuredResponseInput): Promise<unknown> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      instructions,
      input: typeof input === "string" ? input : JSON.stringify(input, null, 2),
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      },
      max_output_tokens: maxOutputTokens,
      store: false
    })
  });
  const responseBody = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new OpenAiResponseError(getOpenAiErrorMessage(responseBody), response.status);
  }

  try {
    return JSON.parse(extractOutputText(responseBody)) as unknown;
  } catch (error) {
    throw new OpenAiResponseError(
      error instanceof Error ? error.message : "Failed to parse OpenAI response.",
      502
    );
  }
}

export function getOpenAiErrorMessage(responseBody: unknown) {
  if (isRecord(responseBody) && isRecord(responseBody.error)) {
    return typeof responseBody.error.message === "string"
      ? responseBody.error.message
      : "OpenAI request failed.";
  }

  return "OpenAI request failed.";
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
