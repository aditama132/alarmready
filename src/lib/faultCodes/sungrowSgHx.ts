import type { FaultCodeReference, FaultCodeReferenceMetadata } from "./types";

const sungrowSgHxModels = ["SG320HX", "SG350HX"];

export const sungrowSgHxFaultCodes: FaultCodeReference[] = [
  {
    manufacturer: "Sungrow",
    models: sungrowSgHxModels,
    codes: ["39"],
    name: "Low System Insulation Resistance",
    category: "dc_insulation",
    severityHint: "medium",
    safetyRelevance: "safety_relevant",
    likelyPatternHint: "unclear",
    priorityFloor: "medium",
    woReadinessHint: "ready_after_remote_verification",
    missingChecks: [
      "Confirm array insulation impedance / ISO resistance trend and whether the fault remains active.",
      "Check resistance to ground of the relevant string and DC cable according to site safety procedure.",
      "Check weather/moisture context and recent alarm/work-order history before creating new work."
    ],
    evidenceToRequest: [
      "iSolarCloud fault record showing fault code 39 with timestamp.",
      "Array insulation impedance / ISO resistance trend.",
      "Resistance-to-ground test result for relevant string/DC cable.",
      "Weather or moisture context if the event occurred after rain or high humidity.",
      "Open/recent WO evidence for the same inverter, string, connector, or DC cable."
    ],
    ruleTags: [
      "insulation",
      "iso",
      "dc",
      "ground_resistance",
      "weather_sensitive",
      "safety_relevant"
    ],
    doNotClaim: [
      "Do not confirm damaged cable.",
      "Do not confirm grounding fault.",
      "Do not recommend automatic dispatch.",
      "Do not instruct unsafe field action."
    ],
    sourceNote:
      "Curated from Sungrow SG320HX / SG350HX user manual troubleshooting table: fault code 39, Low System Insulation Resistance."
  },
  {
    manufacturer: "Sungrow",
    models: sungrowSgHxModels,
    codes: ["12"],
    name: "Excess Leakage Current",
    category: "dc_insulation",
    severityHint: "medium",
    safetyRelevance: "safety_relevant",
    likelyPatternHint: "unclear",
    priorityFloor: "medium",
    woReadinessHint: "ready_after_remote_verification",
    missingChecks: [
      "Check whether the event coincides with poor sunlight, damp conditions, or weather changes.",
      "If environment appears normal, verify AC and DC cable insulation condition.",
      "Check recent repeat alarms and related work before creating new work."
    ],
    evidenceToRequest: [
      "Fault record showing code 12 with timestamp.",
      "Weather and irradiance context around the event.",
      "AC/DC insulation check evidence if the alarm repeats.",
      "Recent alarm and work-order history for the same inverter."
    ],
    ruleTags: ["leakage_current", "insulation", "damp_environment", "safety_relevant"],
    doNotClaim: [
      "Do not confirm cable insulation failure.",
      "Do not confirm leakage path.",
      "Do not recommend automatic dispatch."
    ],
    sourceNote:
      "Curated from Sungrow SG320HX / SG350HX user manual troubleshooting table: fault code 12, Excess Leakage Current."
  },
  {
    manufacturer: "Sungrow",
    models: sungrowSgHxModels,
    codes: ["88"],
    name: "Electric Arc Fault",
    category: "arc_fault",
    severityHint: "high",
    safetyRelevance: "safety_critical",
    likelyPatternHint: "primary",
    priorityFloor: "high",
    woReadinessHint: "escalate",
    missingChecks: [
      "Confirm fault record and current inverter state.",
      "Check whether site procedure requires immediate specialist/OEM escalation.",
      "Confirm whether DC-side inspection evidence is available from qualified personnel."
    ],
    evidenceToRequest: [
      "Fault record showing code 88 with timestamp.",
      "Inverter state and alarm persistence/clearance evidence.",
      "Qualified inspection evidence for DC cables, terminals, fuses, and possible weak contacts.",
      "Evidence that any required clear/reset procedure followed site/OEM procedure."
    ],
    ruleTags: ["arc", "dc", "safety_critical", "escalate"],
    doNotClaim: [
      "Do not instruct unqualified personnel to inspect DC components.",
      "Do not imply the arc location is known.",
      "Do not recommend automatic reset or dispatch.",
      "Do not down-rank safety relevance based only on low production impact."
    ],
    sourceNote:
      "Curated from Sungrow SG320HX / SG350HX user manual troubleshooting table: fault code 88, Electric Arc Fault."
  },
  {
    manufacturer: "Sungrow",
    models: sungrowSgHxModels,
    codes: ["548-563", "580-595"],
    name: "PV Abnormal Alarm",
    category: "dc_string",
    severityHint: "medium",
    safetyRelevance: "none",
    likelyPatternHint: "unclear",
    priorityFloor: "low",
    woReadinessHint: "ready_after_remote_verification",
    missingChecks: [
      "Check whether corresponding module/string is sheltered or soiled.",
      "Check whether string/module wiring is loose.",
      "Check DC fuse status if applicable and safe under site procedure."
    ],
    evidenceToRequest: [
      "Fault/alarm record with specific string code.",
      "String voltage/current comparison.",
      "Visual or remote evidence of shading/soiling.",
      "Related work history for same string, combiner, or inverter."
    ],
    ruleTags: ["pv_abnormal", "string", "shading", "wiring", "dc_fuse"],
    doNotClaim: [
      "Do not confirm shading, loose wiring, or fuse failure without evidence.",
      "Do not recommend automatic field dispatch."
    ],
    sourceNote:
      "Curated from Sungrow SG320HX / SG350HX user manual troubleshooting table: codes 548-563 and 580-595, PV Abnormal Alarm."
  },
  {
    manufacturer: "Sungrow",
    models: sungrowSgHxModels,
    codes: ["1548-1579"],
    name: "String Current Reflux",
    category: "dc_string",
    severityHint: "medium",
    safetyRelevance: "safety_relevant",
    likelyPatternHint: "unclear",
    priorityFloor: "medium",
    woReadinessHint: "ready_after_remote_verification",
    missingChecks: [
      "Check whether the affected string has fewer PV modules than other strings.",
      "Check whether the PV module/string is shaded.",
      "Check open-circuit voltage, wiring, configuration, and module orientation according to site procedure."
    ],
    evidenceToRequest: [
      "Fault record showing specific code in the 1548-1579 range.",
      "String configuration evidence.",
      "String current and open-circuit voltage comparison.",
      "Shading and orientation evidence."
    ],
    ruleTags: ["string_current", "reflux", "configuration", "shading", "orientation"],
    doNotClaim: [
      "Do not confirm module-count mismatch.",
      "Do not confirm reverse current root cause.",
      "Do not recommend unsafe DC-side action."
    ],
    sourceNote:
      "Curated from Sungrow SG320HX / SG350HX user manual troubleshooting table: codes 1548-1579, String Current Reflux."
  },
  {
    manufacturer: "Sungrow",
    models: sungrowSgHxModels,
    codes: ["1600-1615", "1632-1655"],
    name: "PV Grounding Fault",
    category: "dc_grounding",
    severityHint: "high",
    safetyRelevance: "safety_critical",
    likelyPatternHint: "primary",
    priorityFloor: "high",
    woReadinessHint: "escalate",
    missingChecks: [
      "Confirm specific PV grounding fault code and affected string range.",
      "Confirm inverter DC current state before any physical action according to OEM/site safety procedure.",
      "Confirm whether qualified personnel or OEM support is required."
    ],
    evidenceToRequest: [
      "Fault record showing specific grounding fault code with timestamp.",
      "Affected string identifier.",
      "DC current state or safe-to-isolate evidence.",
      "Qualified technician or OEM inspection evidence."
    ],
    ruleTags: ["grounding_fault", "dc", "safety_critical", "escalate"],
    doNotClaim: [
      "Do not instruct direct DC switch disconnection if current state is unknown.",
      "Do not instruct unplugging PV terminals.",
      "Do not confirm the faulty string before evidence.",
      "Do not recommend reinserting strings before the grounding fault is cleared."
    ],
    sourceNote:
      "Curated from Sungrow SG320HX / SG350HX user manual troubleshooting table: codes 1600-1615 and 1632-1655, PV Grounding Fault."
  }
];

export function findSungrowFaultCodeReference(inputText: string): FaultCodeReference | null {
  const candidates = extractCandidateFaultCodes(inputText);

  for (const candidate of candidates) {
    const match = sungrowSgHxFaultCodes.find((reference) =>
      reference.codes.some((code) => codeMatches(candidate, code))
    );

    if (match) {
      return match;
    }
  }

  return null;
}

export function extractCandidateFaultCodes(inputText: string): string[] {
  const text = inputText.replace(/[–—]/g, "-");
  const candidates = new Set<string>();
  const contextualPatterns = [
    /\b(?:fault|alarm|event|error)\s*(?:code|no\.?|number|#)?\s*[:#-]?\s*(\d{1,4})\b/gi,
    /\bcode\s*[:#-]?\s*(\d{1,4})\b/gi,
    /\b(\d{1,4})\s*(?:fault|alarm|event|error)\b/gi
  ];

  for (const pattern of contextualPatterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = normalizeCandidate(match[1]);

      if (candidate) {
        candidates.add(candidate);
      }
    }
  }

  return [...candidates];
}

export function toFaultCodeReferenceMetadata(
  reference: FaultCodeReference
): FaultCodeReferenceMetadata {
  return {
    manufacturer: reference.manufacturer,
    codes: reference.codes,
    name: reference.name,
    category: reference.category,
    safetyRelevance: reference.safetyRelevance,
    priorityFloor: reference.priorityFloor,
    woReadinessHint: reference.woReadinessHint,
    missingChecks: reference.missingChecks,
    evidenceToRequest: reference.evidenceToRequest,
    doNotClaim: reference.doNotClaim,
    sourceNote: reference.sourceNote
  };
}

function codeMatches(candidate: string, codeOrRange: string) {
  const candidateNumber = Number(candidate);

  if (!Number.isInteger(candidateNumber)) {
    return false;
  }

  if (!codeOrRange.includes("-")) {
    return candidate === codeOrRange;
  }

  const [start, end] = codeOrRange.split("-").map(Number);
  return candidateNumber >= start && candidateNumber <= end;
}

function normalizeCandidate(candidate: string) {
  const normalized = candidate.replace(/^0+/, "") || "0";
  return /^\d{1,4}$/.test(normalized) ? normalized : "";
}
