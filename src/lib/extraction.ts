import type {
  AlarmConfirmationFields,
  ContextInput,
  OperatingContextChip
} from "./input-normalizer";
import { emptyAlarmFields, requiredAlarmFields } from "./input-normalizer";

export type ExtractionConfidence = "low" | "medium" | "high";

export type ExtractionEvidence = {
  field: string;
  sourceText: string;
};

export type AlarmExtractionRequiredField =
  | "sitePlant"
  | "assetDevice"
  | "alarmTextCode"
  | "timestamp"
  | "severity"
  | "shortNote";

export type AlarmExtractionConflictCandidate = {
  value: string;
  sourceText: string;
};

export type AlarmExtractionConflict = {
  field: AlarmExtractionRequiredField;
  candidates: AlarmExtractionConflictCandidate[];
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
  conflicts: AlarmExtractionConflict[];
};

export const requiredAlarmExtractionFields: AlarmExtractionRequiredField[] = [
  ...requiredAlarmFields
];

export const alarmExtractionConflictFieldOrder: AlarmExtractionRequiredField[] = [
  "sitePlant",
  "assetDevice",
  "alarmTextCode",
  "timestamp",
  "severity",
  "shortNote"
];

type AlarmExtractionNormalizationOptions = {
  rawInput?: string;
  requiredFields?: readonly AlarmExtractionRequiredField[];
};

const alarmExtractionLabelAliases: Record<AlarmExtractionRequiredField, string[]> = {
  sitePlant: ["site/plant", "site", "plant", "site name", "plant name"],
  assetDevice: [
    "asset/device",
    "asset",
    "device",
    "equipment",
    "inverter",
    "combiner",
    "string",
    "meter",
    "tracker"
  ],
  alarmTextCode: [
    "alarm text/code",
    "alarm",
    "alarm text",
    "alarm code",
    "code",
    "fault code",
    "message",
    "raw message"
  ],
  timestamp: ["timestamp", "time", "date/time", "datetime", "started at", "start time", "date"],
  severity: ["severity", "priority"],
  shortNote: ["short note", "note", "notes", "operator note", "description"]
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
  const draft: AlarmExtractionDraftFields = {
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

  extraction.conflicts.forEach((conflict) => {
    draft[conflict.field] = "";
  });

  return draft;
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

export function normalizeAlarmExtractionResult(
  extraction: AlarmExtractionResult,
  options: AlarmExtractionNormalizationOptions = {}
): AlarmExtractionResult {
  const requiredFields = options.requiredFields ?? requiredAlarmExtractionFields;
  const conflicts = options.rawInput
    ? findAlarmExtractionConflicts(options.rawInput, requiredFields)
    : extraction.conflicts;
  const conflictedFields = conflicts.map((conflict) => conflict.field);
  const conflictGuardedExtraction =
    conflictedFields.length > 0 ? clearConflictedExtractionFields(extraction, conflictedFields) : extraction;
  const evidenceFilteredExtraction = options.rawInput
    ? filterAlarmExtractionEvidence(conflictGuardedExtraction, options.rawInput, conflictedFields)
    : conflictGuardedExtraction;
  const missingFields = computeMissingAlarmExtractionFields(evidenceFilteredExtraction, requiredFields);

  return {
    ...evidenceFilteredExtraction,
    confidence: missingFields.length > 0 ? "low" : extraction.confidence,
    missingFields,
    conflicts
  };
}

export function computeMissingAlarmExtractionFields(
  extraction: Partial<Pick<AlarmExtractionResult, AlarmExtractionRequiredField>>,
  requiredFields: readonly AlarmExtractionRequiredField[] = requiredAlarmExtractionFields
) {
  return requiredFields.filter((field) => !hasRequiredExtractionValue(extraction[field]));
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

function hasRequiredExtractionValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function findConflictedAlarmExtractionFields(
  rawInput: string,
  requiredFields: readonly AlarmExtractionRequiredField[] = requiredAlarmExtractionFields
): AlarmExtractionRequiredField[] {
  return findAlarmExtractionConflicts(rawInput, requiredFields).map((conflict) => conflict.field);
}

export function findAlarmExtractionConflicts(
  rawInput: string,
  requiredFields: readonly AlarmExtractionRequiredField[] = requiredAlarmExtractionFields
): AlarmExtractionConflict[] {
  const candidatesByField = getLabelledAlarmExtractionCandidates(rawInput, requiredFields);

  return requiredFields.flatMap((field) => {
    const candidates = candidatesByField.get(field) ?? [];
    const uniqueCandidates = dedupeAlarmExtractionConflictCandidates(candidates);

    return uniqueCandidates.length > 1 ? [{ field, candidates: uniqueCandidates }] : [];
  });
}

export function getFirstAlarmExtractionConflict(
  conflicts: readonly AlarmExtractionConflict[]
): AlarmExtractionConflict | undefined {
  return alarmExtractionConflictFieldOrder
    .map((field) => conflicts.find((conflict) => conflict.field === field))
    .find((conflict): conflict is AlarmExtractionConflict => Boolean(conflict));
}

export function getAlarmExtractionConflictElementId(field: AlarmExtractionRequiredField) {
  return `alarm-extraction-conflict-${field}`;
}

export function getAlarmExtractionFieldInputId(field: AlarmExtractionRequiredField) {
  return `alarm-extraction-field-${field}`;
}

export function getAlarmExtractionConflictNoticeCopy(conflictCount: number) {
  const normalizedCount = Math.max(0, conflictCount);

  return {
    message: `Resolve ${normalizedCount} conflicting ${
      normalizedCount === 1 ? "field" : "fields"
    } above to continue.`,
    actionLabel: normalizedCount === 1 ? "Review conflict" : "Review conflicts"
  };
}

export function getAlarmExtractionManualEntryCopy(fieldLabel: string) {
  return `Select the correct value below, or type a different value in the ${fieldLabel} field above.`;
}

export function shouldShowAlarmExtractionMissingState(
  value: string,
  hasUnresolvedConflict: boolean
) {
  return !value.trim() && !hasUnresolvedConflict;
}

function getLabelledAlarmExtractionCandidates(
  rawInput: string,
  trackedFields: readonly AlarmExtractionRequiredField[]
) {
  const trackedFieldSet = new Set(trackedFields);
  const candidatesByField = new Map<AlarmExtractionRequiredField, AlarmExtractionConflictCandidate[]>();

  rawInput.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^:|=,]+)\s*[:|=,]\s*(.+?)\s*$/);

    if (!match) {
      return;
    }

    const field = getAlarmExtractionFieldFromLabel(match[1]);
    const value = match[2].trim();

    if (!field || !trackedFieldSet.has(field) || !value) {
      return;
    }

    candidatesByField.set(field, [
      ...(candidatesByField.get(field) ?? []),
      {
        value,
        sourceText: line.trim()
      }
    ]);
  });

  return candidatesByField;
}

function dedupeAlarmExtractionConflictCandidates(
  candidates: AlarmExtractionConflictCandidate[]
): AlarmExtractionConflictCandidate[] {
  const seenValues = new Set<string>();
  const uniqueCandidates: AlarmExtractionConflictCandidate[] = [];

  candidates.forEach((candidate) => {
    const normalizedValue = normalizeCandidateValue(candidate.value);

    if (seenValues.has(normalizedValue)) {
      return;
    }

    seenValues.add(normalizedValue);
    uniqueCandidates.push(candidate);
  });

  return uniqueCandidates;
}

function clearConflictedExtractionFields(
  extraction: AlarmExtractionResult,
  conflictedFields: readonly AlarmExtractionRequiredField[]
) {
  const nextExtraction = { ...extraction };

  conflictedFields.forEach((field) => {
    nextExtraction[field] = null;
  });

  return nextExtraction;
}

function filterAlarmExtractionEvidence(
  extraction: AlarmExtractionResult,
  rawInput: string,
  conflictedFields: readonly AlarmExtractionRequiredField[]
): AlarmExtractionResult {
  const conflictedFieldSet = new Set(conflictedFields);

  return {
    ...extraction,
    evidence: extraction.evidence.filter((evidence) => {
      const field = getAlarmExtractionFieldFromLabel(evidence.field);

      return (
        (!field || !conflictedFieldSet.has(field)) &&
        Boolean(evidence.sourceText) &&
        rawInput.includes(evidence.sourceText)
      );
    })
  };
}

function getAlarmExtractionFieldFromLabel(label: string): AlarmExtractionRequiredField | null {
  const normalizedLabel = normalizeLabel(label);

  for (const [field, aliases] of Object.entries(alarmExtractionLabelAliases) as Array<
    [AlarmExtractionRequiredField, string[]]
  >) {
    if (aliases.some((alias) => normalizeLabel(alias) === normalizedLabel)) {
      return field;
    }
  }

  return null;
}

function normalizeLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCandidateValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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
    value.evidence.every(isExtractionEvidence) &&
    Array.isArray(value.conflicts) &&
    value.conflicts.every(isAlarmExtractionConflict)
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

function isAlarmExtractionConflict(value: unknown): value is AlarmExtractionConflict {
  return (
    isRecord(value) &&
    isAlarmExtractionRequiredField(value.field) &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isAlarmExtractionConflictCandidate)
  );
}

function isAlarmExtractionConflictCandidate(
  value: unknown
): value is AlarmExtractionConflictCandidate {
  return (
    isRecord(value) &&
    typeof value.value === "string" &&
    typeof value.sourceText === "string"
  );
}

function isAlarmExtractionRequiredField(value: unknown): value is AlarmExtractionRequiredField {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(alarmExtractionLabelAliases, value)
  );
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
