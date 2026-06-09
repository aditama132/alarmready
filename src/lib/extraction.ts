import type {
  AlarmConfirmationFields,
  ContextInput,
  OperatingContextChip
} from "./input-normalizer";
import { emptyAlarmFields } from "./input-normalizer";

export type ExtractionConfidence = "low" | "medium" | "high";

export type ExtractionEvidence = {
  field: string;
  sourceText: string;
};

export type AlarmExtractionResult = {
  sitePlant: string | null;
  assetDevice: string | null;
  manufacturer: string | null;
  model: string | null;
  alarmTextCode: string | null;
  faultCode: string | null;
  timestamp: string | null;
  severity: string | null;
  shortNote: string | null;
  confidence: ExtractionConfidence;
  missingFields: string[];
  evidence: ExtractionEvidence[];
};

export type AlarmExtractionDraftFields = {
  sitePlant: string;
  assetDevice: string;
  manufacturer: string;
  model: string;
  alarmTextCode: string;
  faultCode: string;
  timestamp: string;
  severity: AlarmConfirmationFields["severity"];
  shortNote: string;
  confidence: ExtractionConfidence;
};

export type RecentAlarmExtractionResult = {
  records: ExtractedRecentAlarm[];
};

export type ExtractedRecentAlarm = {
  timestamp: string | null;
  assetDevice: string | null;
  alarmTextCode: string | null;
  faultCode: string | null;
  severity: string | null;
  status: "active" | "cleared" | "unknown";
  sourceText: string;
  confidence: ExtractionConfidence;
};

export type WorkRecordExtractionResult = {
  records: ExtractedWorkRecord[];
};

export type ExtractedWorkRecord = {
  workId: string | null;
  assetDevice: string | null;
  status: "open" | "scheduled" | "closed" | "unknown";
  dateOrAge: string | null;
  issueTerms: string[];
  actionTaken: string | null;
  evidenceAvailable: string[];
  evidenceMissing: string[];
  relevanceHint:
    | "same_asset"
    | "dc_insulation"
    | "dc_string"
    | "comms"
    | "tracker"
    | "unrelated"
    | "unknown";
  confidence: ExtractionConfidence;
  sourceText: string;
};

export type OperatingContextExtractionResult = {
  weather: string | null;
  irradiance: string | null;
  commsStatus: string | null;
  productionImpactText: string | null;
  estimatedImpactKw: number | null;
  estimatedImpactPercent: number | null;
  slaText: string | null;
  safetyHseText: string | null;
  accessConstraint: string | null;
  confidence: ExtractionConfidence;
  missingContext: string[];
  evidence: ExtractionEvidence[];
};

export const emptyAlarmExtractionDraftFields: AlarmExtractionDraftFields = {
  sitePlant: "",
  assetDevice: "",
  manufacturer: "",
  model: "",
  alarmTextCode: "",
  faultCode: "",
  timestamp: "",
  severity: "",
  shortNote: "",
  confidence: "low"
};

export function mapAlarmExtractionToDraft(
  extraction: AlarmExtractionResult
): AlarmExtractionDraftFields {
  return {
    sitePlant: cleanNullable(extraction.sitePlant),
    assetDevice: cleanNullable(extraction.assetDevice),
    manufacturer: cleanNullable(extraction.manufacturer),
    model: cleanNullable(extraction.model),
    alarmTextCode: formatAlarmTextCodeWithFaultCode(
      cleanNullable(extraction.alarmTextCode),
      cleanNullable(extraction.faultCode)
    ),
    faultCode: cleanNullable(extraction.faultCode),
    timestamp: cleanNullable(extraction.timestamp),
    severity: normalizeExtractedSeverity(extraction.severity),
    shortNote: cleanNullable(extraction.shortNote),
    confidence: extraction.confidence
  };
}

export function mapAlarmExtractionDraftToFields(
  draft: AlarmExtractionDraftFields
): AlarmConfirmationFields {
  return {
    ...emptyAlarmFields,
    sitePlant: draft.sitePlant.trim(),
    assetDevice: draft.assetDevice.trim(),
    alarmTextCode: draft.alarmTextCode.trim(),
    timestamp: draft.timestamp.trim(),
    severity: draft.severity,
    shortNote: draft.shortNote.trim()
  };
}

export function formatAlarmTextCodeWithFaultCode(alarmTextCode: string, faultCode: string) {
  const alarmText = alarmTextCode.trim();
  const code = faultCode.trim();

  if (!code) {
    return alarmText;
  }

  if (!alarmText) {
    return `Fault code ${code}`;
  }

  if (alarmTextContainsFaultCode(alarmText, code)) {
    return alarmText;
  }

  return `Fault code ${code} — ${alarmText}`;
}

function alarmTextContainsFaultCode(alarmText: string, faultCode: string) {
  const escapedCode = faultCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const codePattern = new RegExp(`(?:fault\\s*code|code|fault)?\\s*${escapedCode}\\b`, "i");

  return codePattern.test(alarmText);
}

export function formatExtractedRecentAlarms(records: ExtractedRecentAlarm[]) {
  return records
    .map((record) => {
      const parts = [
        record.timestamp ?? "",
        record.assetDevice ?? "",
        record.alarmTextCode ?? (record.faultCode ? `Fault code ${record.faultCode}` : ""),
        record.severity ?? "",
        record.status,
        `Source: ${record.sourceText}`
      ].filter(Boolean);

      return parts.join(" | ");
    })
    .join("\n");
}

export function formatExtractedWorkRecords(records: ExtractedWorkRecord[]) {
  return records
    .map((record, index) => {
      const parts = [
        record.workId ? `WO: ${record.workId}` : `WO: EXTRACTED-WO-${index + 1}`,
        record.assetDevice ? `Asset: ${record.assetDevice}` : "",
        `Status: ${record.status}`,
        record.dateOrAge ? `Date/age: ${record.dateOrAge}` : "",
        record.issueTerms.length > 0 ? `Issue: ${record.issueTerms.join(", ")}` : "",
        record.actionTaken ? `Action: ${record.actionTaken}` : "",
        record.evidenceAvailable.length > 0
          ? `Evidence available: ${record.evidenceAvailable.join(", ")}`
          : "",
        record.evidenceMissing.length > 0
          ? `Evidence missing: ${record.evidenceMissing.join(", ")}`
          : "",
        `Relevance: ${record.relevanceHint}`,
        `Source: ${record.sourceText}`
      ].filter(Boolean);

      return parts.join(" | ");
    })
    .join("\n");
}

export function applyOperatingContextExtraction(
  current: ContextInput,
  extraction: OperatingContextExtractionResult
): ContextInput {
  const operatingLines = [
    extraction.weather ? `Weather: ${extraction.weather}` : "",
    extraction.irradiance ? `Irradiance: ${extraction.irradiance}` : "",
    extraction.commsStatus ? `Comms/data status: ${extraction.commsStatus}` : "",
    extraction.productionImpactText ? `Production impact: ${extraction.productionImpactText}` : "",
    extraction.estimatedImpactKw !== null
      ? `Estimated impact: ${extraction.estimatedImpactKw} kW.`
      : "",
    extraction.estimatedImpactPercent !== null
      ? `Estimated impact percent: <= ${extraction.estimatedImpactPercent}% total site capacity if stated as an upper bound.`
      : "",
    extraction.slaText ? `SLA / response-time note: ${extraction.slaText}` : "",
    extraction.safetyHseText ? `Safety / HSE note: ${extraction.safetyHseText}` : "",
    extraction.accessConstraint ? `Access constraint: ${extraction.accessConstraint}` : ""
  ].filter(Boolean);
  const chips = mergeChips(current.chips, inferChips(extraction));

  return {
    ...current,
    siteOperatingContext: operatingLines.join("\n"),
    chips,
    estimatedImpact:
      extraction.productionImpactText ??
      formatImpactValue(extraction.estimatedImpactKw, extraction.estimatedImpactPercent) ??
      current.estimatedImpact,
    slaNote: extraction.slaText ?? current.slaNote,
    accessConstraintNote: extraction.accessConstraint ?? current.accessConstraintNote,
    safetyHseNote: extraction.safetyHseText ?? current.safetyHseNote
  };
}

export function isAlarmExtractionResult(value: unknown): value is AlarmExtractionResult {
  return (
    isRecord(value) &&
    isNullableString(value.sitePlant) &&
    isNullableString(value.assetDevice) &&
    isNullableString(value.manufacturer) &&
    isNullableString(value.model) &&
    isNullableString(value.alarmTextCode) &&
    isNullableString(value.faultCode) &&
    isNullableString(value.timestamp) &&
    isNullableString(value.severity) &&
    isNullableString(value.shortNote) &&
    isConfidence(value.confidence) &&
    isStringArray(value.missingFields) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isExtractionEvidence)
  );
}

export function isWorkRecordExtractionResult(value: unknown): value is WorkRecordExtractionResult {
  return (
    isRecord(value) &&
    Array.isArray(value.records) &&
    value.records.every(isExtractedWorkRecord)
  );
}

export function isRecentAlarmExtractionResult(
  value: unknown
): value is RecentAlarmExtractionResult {
  return (
    isRecord(value) &&
    Array.isArray(value.records) &&
    value.records.every(isExtractedRecentAlarm)
  );
}

export function isOperatingContextExtractionResult(
  value: unknown
): value is OperatingContextExtractionResult {
  return (
    isRecord(value) &&
    isNullableString(value.weather) &&
    isNullableString(value.irradiance) &&
    isNullableString(value.commsStatus) &&
    isNullableString(value.productionImpactText) &&
    isNullableNumber(value.estimatedImpactKw) &&
    isNullableNumber(value.estimatedImpactPercent) &&
    isNullableString(value.slaText) &&
    isNullableString(value.safetyHseText) &&
    isNullableString(value.accessConstraint) &&
    isConfidence(value.confidence) &&
    isStringArray(value.missingContext) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isExtractionEvidence)
  );
}

function normalizeExtractedSeverity(value: string | null): AlarmConfirmationFields["severity"] {
  const normalized = value?.toLowerCase().trim() ?? "";

  if (normalized.includes("critical") || normalized === "high") {
    return "Critical";
  }

  if (normalized.includes("info") || normalized === "low") {
    return "Info";
  }

  if (normalized.includes("warn") || normalized === "medium") {
    return "Warning";
  }

  return "";
}

function inferChips(extraction: OperatingContextExtractionResult): OperatingContextChip[] {
  return [
    extraction.commsStatus && !/normal|no gap|available|healthy/i.test(extraction.commsStatus)
      ? "Comms / data issue suspected"
      : null,
    extraction.productionImpactText ||
    extraction.estimatedImpactKw !== null ||
    extraction.estimatedImpactPercent !== null
      ? "Production impact known"
      : null,
    extraction.slaText ? "SLA-sensitive" : null,
    extraction.accessConstraint ? "Site access constraint" : null,
    extraction.safetyHseText ? "Safety / HSE concern" : null,
    extraction.weather &&
    extraction.irradiance &&
    /normal|stable|clear|within expected/i.test(`${extraction.weather} ${extraction.irradiance}`)
      ? "Operating conditions normal"
      : null
  ].filter((chip): chip is OperatingContextChip => Boolean(chip));
}

function mergeChips(
  current: OperatingContextChip[],
  extracted: OperatingContextChip[]
): OperatingContextChip[] {
  return Array.from(new Set([...current, ...extracted]));
}

function formatImpactValue(kw: number | null, percent: number | null) {
  if (kw !== null && percent !== null) {
    return `${kw} kW; <= ${percent}% total site capacity if stated as an upper bound.`;
  }

  if (kw !== null) {
    return `${kw} kW.`;
  }

  if (percent !== null) {
    return `<= ${percent}% total site capacity if stated as an upper bound.`;
  }

  return null;
}

function cleanNullable(value: string | null) {
  return value?.trim() ?? "";
}

function isExtractedWorkRecord(value: unknown): value is ExtractedWorkRecord {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNullableString(value.workId) &&
    isNullableString(value.assetDevice) &&
    isWorkStatus(value.status) &&
    isNullableString(value.dateOrAge) &&
    isStringArray(value.issueTerms) &&
    isNullableString(value.actionTaken) &&
    isStringArray(value.evidenceAvailable) &&
    isStringArray(value.evidenceMissing) &&
    isRelevanceHint(value.relevanceHint) &&
    isConfidence(value.confidence) &&
    typeof value.sourceText === "string"
  );
}

function isExtractedRecentAlarm(value: unknown): value is ExtractedRecentAlarm {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNullableString(value.timestamp) &&
    isNullableString(value.assetDevice) &&
    isNullableString(value.alarmTextCode) &&
    isNullableString(value.faultCode) &&
    isNullableString(value.severity) &&
    isRecentAlarmStatus(value.status) &&
    typeof value.sourceText === "string" &&
    isConfidence(value.confidence)
  );
}

function isExtractionEvidence(value: unknown): value is ExtractionEvidence {
  return isRecord(value) && typeof value.field === "string" && typeof value.sourceText === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isConfidence(value: unknown): value is ExtractionConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function isWorkStatus(value: unknown): value is ExtractedWorkRecord["status"] {
  return value === "open" || value === "scheduled" || value === "closed" || value === "unknown";
}

function isRecentAlarmStatus(value: unknown): value is ExtractedRecentAlarm["status"] {
  return value === "active" || value === "cleared" || value === "unknown";
}

function isRelevanceHint(value: unknown): value is ExtractedWorkRecord["relevanceHint"] {
  return (
    value === "same_asset" ||
    value === "dc_insulation" ||
    value === "dc_string" ||
    value === "comms" ||
    value === "tracker" ||
    value === "unrelated" ||
    value === "unknown"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
