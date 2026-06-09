import type { AlarmRecord, SiteContext, WorkRecord } from "./types";

export type AlarmConfirmationFields = {
  sitePlant: string;
  assetDevice: string;
  alarmTextCode: string;
  timestamp: string;
  severity: AlarmRecord["severity"] | "";
  shortNote: string;
};

export type AdvancedAlarmDetails = {
  alarmId: string;
  siteId: string;
  assetType: AlarmRecord["assetType"];
  sourceSystem: string;
  currentValue: string;
  threshold: string;
  status: string;
};

export type OperatingContextChip =
  | "Operating conditions normal"
  | "Comms / data issue suspected"
  | "Production impact known"
  | "SLA-sensitive"
  | "Site access constraint"
  | "Safety / HSE concern";

export type ContextInput = {
  recentAlarmsText: string;
  relatedWorkRecordsText: string;
  siteOperatingContext: string;
  chips: OperatingContextChip[];
  estimatedImpact: string;
  slaNote: string;
  accessConstraintNote: string;
  safetyHseNote: string;
};

export type NormalizedAlarmInput = {
  alarm: AlarmRecord;
  workRecords: WorkRecord[];
  recentAlarms: string[];
  context: SiteContext;
};

export const requiredAlarmFields: Array<keyof Pick<
  AlarmConfirmationFields,
  "sitePlant" | "assetDevice" | "alarmTextCode" | "timestamp"
>> = ["sitePlant", "assetDevice", "alarmTextCode", "timestamp"];

export const alarmFieldLabels: Record<keyof AlarmConfirmationFields, string> = {
  sitePlant: "site/plant",
  assetDevice: "asset/device",
  alarmTextCode: "alarm text/code",
  timestamp: "timestamp",
  severity: "severity",
  shortNote: "short note"
};

export const emptyAlarmFields: AlarmConfirmationFields = {
  sitePlant: "",
  assetDevice: "",
  alarmTextCode: "",
  timestamp: "",
  severity: "",
  shortNote: ""
};

export const emptyAdvancedAlarmDetails: AdvancedAlarmDetails = {
  alarmId: "",
  siteId: "",
  assetType: "Inverter",
  sourceSystem: "",
  currentValue: "",
  threshold: "",
  status: ""
};

export const emptyContextInput: ContextInput = {
  recentAlarmsText: "",
  relatedWorkRecordsText: "",
  siteOperatingContext: "",
  chips: [],
  estimatedImpact: "",
  slaNote: "",
  accessConstraintNote: "",
  safetyHseNote: ""
};

export const contextChips: OperatingContextChip[] = [
  "Operating conditions normal",
  "Comms / data issue suspected",
  "Production impact known",
  "SLA-sensitive",
  "Site access constraint",
  "Safety / HSE concern"
];

export function parseAlarmText(input: string): AlarmConfirmationFields {
  const text = input.trim();

  if (!text) {
    return emptyAlarmFields;
  }

  return mergeAlarmFields(parseFreeTextAlarm(text), parseKeyValueAlarm(text), parseCsvAlarm(text));
}

export function validateAlarmFields(fields: AlarmConfirmationFields) {
  const missingFields = requiredAlarmFields.filter((field) => !fields[field].trim());

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

export function normalizeAlarmInput(
  fields: AlarmConfirmationFields,
  advanced: AdvancedAlarmDetails,
  rawInput: string
): AlarmRecord {
  const rawMessage = [fields.alarmTextCode, fields.shortNote].filter(Boolean).join(" | ");

  return {
    alarmId: advanced.alarmId,
    siteId: advanced.siteId || fields.sitePlant,
    siteName: fields.sitePlant,
    assetId: fields.assetDevice,
    assetType: advanced.assetType,
    severity: fields.severity || "Warning",
    alarmType: fields.alarmTextCode,
    startedAt: normalizeTimestamp(fields.timestamp),
    rawMessage: rawInput.trim() || rawMessage,
    currentValue: advanced.currentValue,
    threshold: advanced.threshold,
    sourceSystem: advanced.sourceSystem || (rawInput.trim() ? "Pasted/uploaded export" : "Manual intake"),
    status: advanced.status
  };
}

export function normalizeContextInput(contextInput: ContextInput): {
  context: SiteContext;
  recentAlarms: string[];
  workRecords: WorkRecord[];
} {
  const hasChip = (chip: OperatingContextChip) => contextInput.chips.includes(chip);
  const chipLines = [
    hasChip("Operating conditions normal") && "Flag: Operating conditions normal.",
    hasChip("Comms / data issue suspected") && "Flag: Comms / data issue suspected.",
    hasChip("Production impact known") && "Flag: Production impact known.",
    hasChip("Production impact known") &&
      contextInput.estimatedImpact.trim() &&
      `Estimated impact, if known: ${contextInput.estimatedImpact.trim()}`,
    hasChip("SLA-sensitive") && "Flag: SLA-sensitive.",
    hasChip("SLA-sensitive") &&
      contextInput.slaNote.trim() &&
      `SLA / response-time note: ${contextInput.slaNote.trim()}`,
    hasChip("Site access constraint") && "Flag: Site access constraint.",
    hasChip("Site access constraint") &&
      contextInput.accessConstraintNote.trim() &&
      `Access constraint note: ${contextInput.accessConstraintNote.trim()}`,
    hasChip("Safety / HSE concern") && "Flag: Safety / HSE concern.",
    hasChip("Safety / HSE concern") &&
      contextInput.safetyHseNote.trim() &&
      `Safety / HSE note: ${contextInput.safetyHseNote.trim()}`
  ].filter((line): line is string => Boolean(line));
  const operatingContext = [contextInput.siteOperatingContext.trim(), ...chipLines]
    .filter(Boolean)
    .join("\n");
  const productionImpact =
    (hasChip("Production impact known") && contextInput.estimatedImpact.trim()) ||
    (hasChip("Production impact known") ? "Production impact known; details not provided." : "");

  return {
    context: {
      weatherSummary: hasChip("Operating conditions normal") ? "Operating conditions normal." : "",
      irradianceTrend: hasChip("Operating conditions normal") ? "Irradiance appears stable." : "",
      recentWork: contextInput.relatedWorkRecordsText.trim(),
      relatedAlarms: contextInput.recentAlarmsText.trim(),
      productionImpact,
      operatorNotes: operatingContext
    },
    recentAlarms: splitLines(contextInput.recentAlarmsText),
    workRecords: parseRelatedWorkRecords(contextInput.relatedWorkRecordsText)
  };
}

export function normalizeInput(
  fields: AlarmConfirmationFields,
  advanced: AdvancedAlarmDetails,
  rawInput: string,
  contextInput: ContextInput
): NormalizedAlarmInput {
  const normalizedContext = normalizeContextInput(contextInput);

  return {
    alarm: normalizeAlarmInput(fields, advanced, rawInput),
    workRecords: normalizedContext.workRecords,
    recentAlarms: normalizedContext.recentAlarms,
    context: normalizedContext.context
  };
}

function parseCsvAlarm(input: string): AlarmConfirmationFields {
  const rows = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2 || !rows[0].includes(",")) {
    return emptyAlarmFields;
  }

  const headers = splitCsvLine(rows[0]).map(normalizeHeader);
  const values = splitCsvLine(rows[1]);
  const get = (aliases: string[]) => {
    const index = headers.findIndex((header) => aliases.includes(header));
    return index >= 0 ? values[index]?.trim() ?? "" : "";
  };

  return {
    sitePlant: get(["site", "plant", "siteplant", "sitename", "plantname"]),
    assetDevice: get(["asset", "device", "assetdevice", "assetid", "deviceid", "equipment"]),
    alarmTextCode: get(["alarm", "alarmtext", "alarmcode", "code", "message", "rawmessage"]),
    timestamp: get(["timestamp", "time", "startedat", "starttime", "date"]),
    severity: normalizeSeverity(get(["severity", "priority"])),
    shortNote: get(["note", "notes", "operatornote", "description"])
  };
}

function parseKeyValueAlarm(input: string): AlarmConfirmationFields {
  const fields = { ...emptyAlarmFields };
  const labelMap: Array<[keyof AlarmConfirmationFields, RegExp]> = [
    ["sitePlant", /^(site|plant|site name|plant name)$/i],
    ["assetDevice", /^(asset|device|equipment|inverter|combiner|string|meter|tracker)$/i],
    ["alarmTextCode", /^(alarm|alarm text|alarm code|code|message|raw message)$/i],
    ["timestamp", /^(timestamp|time|started at|start time|date)$/i],
    ["severity", /^(severity|priority)$/i],
    ["shortNote", /^(note|notes|operator note|description)$/i]
  ];

  input.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([^:|=,]+)\s*[:|=,]\s*(.+?)\s*$/);

    if (!match) {
      return;
    }

    const label = match[1].trim();
    const value = match[2].trim();
    const mapped = labelMap.find(([, pattern]) => pattern.test(label));

    if (!mapped) {
      return;
    }

    const [field] = mapped;

    if (field === "severity") {
      fields.severity = normalizeSeverity(value);
      return;
    }

    fields[field] = value;
  });

  return fields;
}

function parseFreeTextAlarm(input: string): AlarmConfirmationFields {
  const firstLine = input.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  const timestamp =
    input.match(/\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?\b/)?.[0] ??
    input.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    "";

  return {
    sitePlant: extractValue(input, /\b(?:site|plant)\s*[:#-]?\s*([A-Z0-9][A-Z0-9 _.-]{2,50})/i),
    assetDevice:
      extractValue(input, /\b(?:asset|device|equipment)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_.-]{1,24})/i) ||
      input.match(/\b(?:INV|CB|STR|MTR|TRK)-?\d{1,4}\b/i)?.[0] ||
      "",
    alarmTextCode:
      extractValue(input, /\b(?:alarm|code|message)\s*[:#-]?\s*([^\n]+)/i) || firstLine,
    timestamp,
    severity: normalizeSeverity(input.match(/\b(critical|warning|warn|info|low|medium|high)\b/i)?.[0] ?? ""),
    shortNote: ""
  };
}

function parseRelatedWorkRecords(input: string): WorkRecord[] {
  return splitLines(input).map((line, index) => {
    const id = line.match(/\b(?:WO|WORK|WR)-?[A-Z0-9-]+\b/i)?.[0] ?? `RELATED-WO-${index + 1}`;

    return {
      workRecordId: id,
      alarmId: "",
      createdAt: "",
      decision: "remote_verify",
      operationalNote: line,
      requiresHumanValidation: true,
      dispatchStatus: "Not dispatched"
    };
  });
}

function splitLines(input: string) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const character of line) {
    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeSeverity(value: string): AlarmRecord["severity"] | "" {
  const normalized = value.toLowerCase();

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

function normalizeTimestamp(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return trimmed.replace(" ", "T").slice(0, 16);
}

function extractValue(input: string, pattern: RegExp) {
  return input.match(pattern)?.[1]?.trim().replace(/[;|,]$/, "") ?? "";
}

function mergeAlarmFields(...fieldSets: AlarmConfirmationFields[]): AlarmConfirmationFields {
  return fieldSets.reduce<AlarmConfirmationFields>(
    (merged, fields) => ({
      sitePlant: merged.sitePlant || fields.sitePlant,
      assetDevice: merged.assetDevice || fields.assetDevice,
      alarmTextCode: merged.alarmTextCode || fields.alarmTextCode,
      timestamp: merged.timestamp || fields.timestamp,
      severity: merged.severity || fields.severity,
      shortNote: merged.shortNote || fields.shortNote
    }),
    { ...emptyAlarmFields }
  );
}
