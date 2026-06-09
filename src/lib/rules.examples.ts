import { normalizePriority } from "./rules";
import type { PriorityInput, PriorityResult } from "./rules";

type PriorityExample = {
  input: PriorityInput;
  expected: Pick<PriorityResult, "normalizedPriority" | "priorityConfidence"> & {
    affectedCapacityPct?: number | null;
    expectedMissingInputs?: string[];
    expectedOverrides?: string[];
  };
  result: PriorityResult;
};

const currentAlarmOnlyInput: PriorityInput = {
  rawSeverity: "medium",
  affectedCapacityKw: null,
  siteCapacityKwp: null,
  slaCategory: null,
  recurrenceStatus: "unknown",
  safetyComplianceFlag: "unknown"
};

const inv07Input: PriorityInput = {
  rawSeverity: "medium",
  affectedCapacityKw: 30,
  siteCapacityKwp: 1000,
  slaCategory: "weekly",
  recurrenceStatus: "open_related_wo",
  safetyComplianceFlag: "none"
};

const highOverrideInput: PriorityInput = {
  rawSeverity: "medium",
  affectedCapacityKw: 600,
  siteCapacityKwp: 1000,
  slaCategory: "same_day",
  recurrenceStatus: "same_day_repeat",
  safetyComplianceFlag: "none"
};

const safetyOverrideInput: PriorityInput = {
  rawSeverity: "low",
  affectedCapacityKw: 5,
  siteCapacityKwp: 1000,
  slaCategory: "weekly",
  recurrenceStatus: "none",
  safetyComplianceFlag: "hse_or_fire_or_electrical"
};

export const priorityExamples: Record<string, PriorityExample> = {
  currentAlarmOnly: {
    input: currentAlarmOnlyInput,
    expected: {
      normalizedPriority: "medium",
      priorityConfidence: "low",
      expectedMissingInputs: [
        "affected capacity",
        "site capacity",
        "SLA category",
        "recurrence history",
        "safety/HSE context"
      ]
    },
    result: normalizePriority(currentAlarmOnlyInput)
  },
  inv07: {
    input: inv07Input,
    expected: {
      normalizedPriority: "medium",
      priorityConfidence: "high",
      affectedCapacityPct: 3
    },
    result: normalizePriority(inv07Input)
  },
  highOverride: {
    input: highOverrideInput,
    expected: {
      normalizedPriority: "high",
      priorityConfidence: "high",
      affectedCapacityPct: 60,
      expectedOverrides: ["large share of plant affected"]
    },
    result: normalizePriority(highOverrideInput)
  },
  safetyOverride: {
    input: safetyOverrideInput,
    expected: {
      normalizedPriority: "high",
      priorityConfidence: "high",
      expectedOverrides: ["safety/HSE risk"]
    },
    result: normalizePriority(safetyOverrideInput)
  }
};
