type RequiredServerEnvName =
  | "OPENAI_API_KEY"
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY";

export function getRequiredServerEnv(name: RequiredServerEnvName) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new MissingServerEnvError(
      name,
      `Server configuration missing: ${name}. Add it in the deployment environment or .env.local for local development. Do not expose this value with a NEXT_PUBLIC_ prefix.`
    );
  }

  return value;
}

export class MissingServerEnvError extends Error {
  status = 500;
  variableName: string;

  constructor(variableName: string, message: string) {
    super(message);
    this.name = "MissingServerEnvError";
    this.variableName = variableName;
  }
}
