import type {
  AdvancedAlarmDetails,
  AlarmConfirmationFields,
  ContextInput
} from "./input-normalizer";

export type DemoScenario = {
  alarmFields: AlarmConfirmationFields;
  advancedDetails: AdvancedAlarmDetails;
  contextInput: ContextInput;
};

// Internal/dev-only sample used by rule assertions; not exposed in the main UI.
export const quickModeExample: DemoScenario = {
  alarmFields: {
    sitePlant: "Cedar Flats Solar",
    assetDevice: "INV-07 — Sungrow SG350HX string inverter",
    alarmTextCode: "Fault code 39 — Low System Insulation Resistance",
    timestamp: "2026-06-03 09:00",
    severity: "Warning",
    shortNote:
      "Current-alarm-only demo. Insulation resistance alarm appeared during morning startup; no recent alarm or work-order context supplied."
  },
  advancedDetails: {
    alarmId: "DEMO-SUNGROW-QUICK-001",
    siteId: "DEMO-CEDAR-FLATS",
    assetType: "Inverter",
    sourceSystem: "Synthetic demo data",
    currentValue: "",
    threshold: "",
    status: "Active"
  },
  contextInput: {
    recentAlarmsText: "",
    relatedWorkRecordsText: "",
    siteOperatingContext: "",
    chips: [],
    estimatedImpact: "",
    slaNote: "",
    accessConstraintNote: "",
    safetyHseNote: ""
  }
};

export const contextAwareExample: DemoScenario = {
  alarmFields: {
    sitePlant: "Sierra Verde Solar PV",
    assetDevice: "INV-07 — Sungrow SG350HX string inverter",
    alarmTextCode: "Fault code 39 — Low System Insulation Resistance",
    timestamp: "2026-06-04 08:37 CEST",
    severity: "Warning",
    shortNote:
      "Insulation resistance alarm appeared during morning ramp-up after overnight rain. Recent MPPT-08 string-current imbalance also observed; INV-07 output is below peer inverters in the same block."
  },
  advancedDetails: {
    alarmId: "DEMO-SUNGROW-SG350HX-001",
    siteId: "DEMO-SIERRA-VERDE",
    assetType: "Inverter",
    sourceSystem: "Synthetic demo data",
    currentValue: "~80 kW below peer inverter median",
    threshold: "",
    status: "Active"
  },
  contextInput: {
    recentAlarmsText: [
      "2026-06-04 08:12 | INV-07 | MPPT-08 string current imbalance | Warning | Cleared after 6 minutes.",
      "2026-06-04 08:29 | INV-07 | Fault code 39 — Low System Insulation Resistance | Warning | Active.",
      "2026-06-04 08:35 | INV-07 | Active power below peer median | Minor | INV-07 approx. 80 kW below similar inverters.",
      "2026-06-04 08:40 | INV-08 | No active alarm | Info | Adjacent inverter operating normally."
    ].join("\n"),
    relatedWorkRecordsText: [
      "WO-1086 | INV-07 | Open | String/MPPT inspection scheduled today 14:00 | Created after repeated MPPT-08 imbalance alarms. No field evidence uploaded yet.",
      "WO-1042 | INV-07 | Closed | DC connector inspection completed 5 days ago | MC4 connector on string 08B replaced. Close-out note says insulation test passed, but no measurement screenshot attached.",
      "WO-1027 | Block B | Closed | Tracker calibration completed yesterday | No inverter or DC string work recorded."
    ].join("\n"),
    siteOperatingContext: [
      "Overnight rain and high humidity reported before morning startup.",
      "Current irradiance stable between 760–790 W/m² for the last 25 minutes.",
      "No SCADA communication gap for INV-07.",
      "Estimated underperformance: ~80 kW versus peer inverter median, less than 0.2% of total site capacity.",
      "SLA note: same-business-day review required if fault code 39 remains active or repeats after drying period.",
      "Operator requested validation before creating any additional WO because an open WO already exists for INV-07."
    ].join("\n"),
    chips: ["Production impact known", "SLA-sensitive", "Safety / HSE concern"],
    estimatedImpact: "~80 kW below peer inverter median; less than 0.2% total site capacity.",
    slaNote: "Same-business-day review if fault code 39 remains active or repeats after drying period.",
    accessConstraintNote: "",
    safetyHseNote:
      "Low system insulation resistance should be treated as safety-relevant until verified by qualified personnel."
  }
};
