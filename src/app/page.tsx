"use client";

import {
  CheckCircle2,
  Clipboard,
  ClipboardCheck,
  Download,
  FileText,
  Info,
  ListChecks,
  RefreshCcw,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { generateOperationalNote } from "@/lib/triage";
import { contextAwareExample } from "@/lib/sampleData";
import { runRuleEngine } from "@/lib/rules";
import type { RuleFinding, TriageDecision as RuleEngineDecision } from "@/lib/rules";
import { evaluateDecisionAlignment } from "@/lib/decisionAlignment";
import type { DecisionAlignment } from "@/lib/decisionAlignment";
import {
  clearFeedbackRecords,
  createFeedbackRecord,
  exportFeedbackRecords,
  feedbackTags,
  getFeedbackRecords,
  saveFeedbackRecord
} from "@/lib/feedback";
import type { FeedbackTag } from "@/lib/feedback";
import {
  applyOperatingContextExtraction,
  emptyAlarmExtractionDraftFields,
  formatExtractedRecentAlarms,
  formatExtractedWorkRecords,
  isAlarmExtractionResult,
  isOperatingContextExtractionResult,
  isRecentAlarmExtractionResult,
  isWorkRecordExtractionResult,
  mapAlarmExtractionDraftToFields,
  mapAlarmExtractionToDraft
} from "@/lib/extraction";
import type {
  AlarmExtractionDraftFields,
  AlarmExtractionResult,
  OperatingContextExtractionResult,
  RecentAlarmExtractionResult,
  WorkRecordExtractionResult
} from "@/lib/extraction";
import {
  alarmFieldLabels,
  contextChips,
  emptyAdvancedAlarmDetails,
  emptyAlarmFields,
  emptyContextInput,
  normalizeInput,
  validateAlarmFields
} from "@/lib/input-normalizer";
import type {
  AdvancedAlarmDetails,
  AlarmConfirmationFields,
  ContextInput,
  OperatingContextChip
} from "@/lib/input-normalizer";
import type {
  DecisionState,
  DiagnosticBrief,
  GeneratedDiagnosticBrief,
  TriageDecision,
  WorkRecord
} from "@/lib/types";

type AlarmInputMode = "none" | "manual" | "extracted";
type FeedbackChoice = "Useful" | "Needs adjustment" | null;
type ExtractionStatus = "Idle" | "Loading" | "Error";
type SourceStatus =
  | "not_provided"
  | "raw_provided"
  | "extracting"
  | "extracted_needs_confirmation"
  | "confirmed"
  | "edited_needs_confirmation"
  | "cleared";
type ExtractionWorkflowStatus = SourceStatus;
type OptionalContextStatus = SourceStatus;
type OptionalContextSource = "recentAlarms" | "workRecords" | "operatingContext";

const decisionOptions: TriageDecision[] = [
  "monitor",
  "remote_verify",
  "update_existing_wo",
  "create_new_wo",
  "escalate",
  "defer",
  "false_not_actionable"
];

const decisionLabels: Record<TriageDecision, string> = {
  monitor: "Monitor",
  remote_verify: "Remote verify",
  update_existing_wo: "Update existing WO",
  create_new_wo: "Create new WO",
  escalate: "Escalate",
  defer: "Defer with reason",
  false_not_actionable: "False alarm / not actionable"
};

const decisionPlaceholder = "Select decision after reviewing brief";

const initialDecisionState: DecisionState = {
  selectedDecision: "",
  validationNote: "",
  operationalNote: "",
  feedback: null
};

export default function Home() {
  const [rawAlarmInput, setRawAlarmInput] = useState("");
  const [alarmFileName, setAlarmFileName] = useState("");
  const [inputMode, setInputMode] = useState<AlarmInputMode>("none");
  const [manualFields, setManualFields] = useState<AlarmConfirmationFields>(emptyAlarmFields);
  const [extractedFields, setExtractedFields] = useState<AlarmConfirmationFields>(emptyAlarmFields);
  const [alarmExtractionDraft, setAlarmExtractionDraft] =
    useState<AlarmExtractionDraftFields>(emptyAlarmExtractionDraftFields);
  const [extractedConfirmed, setExtractedConfirmed] = useState(false);
  const [alarmExtraction, setAlarmExtraction] = useState<AlarmExtractionResult | null>(null);
  const [alarmExtractionStatus, setAlarmExtractionStatus] = useState<ExtractionStatus>("Idle");
  const [alarmExtractionWorkflowStatus, setAlarmExtractionWorkflowStatus] =
    useState<ExtractionWorkflowStatus>("not_provided");
  const [alarmExtractionError, setAlarmExtractionError] = useState("");
  const [alarmRawDirty, setAlarmRawDirty] = useState(false);
  const [lastExtractedAlarmSignature, setLastExtractedAlarmSignature] = useState("");
  const [advancedDetails, setAdvancedDetails] =
    useState<AdvancedAlarmDetails>(emptyAdvancedAlarmDetails);
  const [contextInput, setContextInput] = useState<ContextInput>(emptyContextInput);
  const [recentAlarmsExtraction, setRecentAlarmsExtraction] =
    useState<RecentAlarmExtractionResult | null>(null);
  const [recentAlarmsExtractionStatus, setRecentAlarmsExtractionStatus] =
    useState<ExtractionStatus>("Idle");
  const [recentAlarmsExtractionWorkflowStatus, setRecentAlarmsExtractionWorkflowStatus] =
    useState<OptionalContextStatus>("not_provided");
  const [recentAlarmsExtractionError, setRecentAlarmsExtractionError] = useState("");
  const [recentAlarmsDraftText, setRecentAlarmsDraftText] = useState("");
  const [isEditingRecentAlarmsSummary, setIsEditingRecentAlarmsSummary] = useState(false);
  const [recentAlarmsRawDirty, setRecentAlarmsRawDirty] = useState(false);
  const [lastExtractedRecentAlarmsSignature, setLastExtractedRecentAlarmsSignature] =
    useState("");
  const [workRecordsExtraction, setWorkRecordsExtraction] =
    useState<WorkRecordExtractionResult | null>(null);
  const [workRecordsExtractionStatus, setWorkRecordsExtractionStatus] =
    useState<ExtractionStatus>("Idle");
  const [workRecordsExtractionWorkflowStatus, setWorkRecordsExtractionWorkflowStatus] =
    useState<OptionalContextStatus>("not_provided");
  const [workRecordsExtractionError, setWorkRecordsExtractionError] = useState("");
  const [workRecordsDraftText, setWorkRecordsDraftText] = useState("");
  const [isEditingWorkRecordsSummary, setIsEditingWorkRecordsSummary] = useState(false);
  const [workRecordsRawDirty, setWorkRecordsRawDirty] = useState(false);
  const [lastExtractedWorkRecordsSignature, setLastExtractedWorkRecordsSignature] =
    useState("");
  const [operatingContextExtraction, setOperatingContextExtraction] =
    useState<OperatingContextExtractionResult | null>(null);
  const [operatingContextExtractionStatus, setOperatingContextExtractionStatus] =
    useState<ExtractionStatus>("Idle");
  const [operatingContextExtractionWorkflowStatus, setOperatingContextExtractionWorkflowStatus] =
    useState<OptionalContextStatus>("not_provided");
  const [operatingContextExtractionError, setOperatingContextExtractionError] = useState("");
  const [operatingContextDraftInput, setOperatingContextDraftInput] =
    useState<ContextInput>(emptyContextInput);
  const [isEditingOperatingContextSummary, setIsEditingOperatingContextSummary] = useState(false);
  const [operatingContextRawDirty, setOperatingContextRawDirty] = useState(false);
  const [lastExtractedOperatingContextSignature, setLastExtractedOperatingContextSignature] =
    useState("");
  const [brief, setBrief] = useState<DiagnosticBrief | null>(null);
  const [generatedBrief, setGeneratedBrief] = useState<GeneratedDiagnosticBrief | null>(null);
  const [briefStatus, setBriefStatus] = useState<"Idle" | "Loading" | "Error">("Idle");
  const [briefError, setBriefError] = useState("");
  const [workRecord, setWorkRecord] = useState<WorkRecord | null>(null);
  const [noteStatus, setNoteStatus] = useState<"Idle" | "Loading" | "Error">("Idle");
  const [noteError, setNoteError] = useState("");
  const [decisionState, setDecisionState] = useState<DecisionState>(initialDecisionState);
  const [copyStatus, setCopyStatus] = useState<"Idle" | "Copied" | "Copy failed">("Idle");
  const [feedbackChoice, setFeedbackChoice] = useState<FeedbackChoice>(null);
  const [feedbackSelectedTags, setFeedbackSelectedTags] = useState<FeedbackTag[]>([]);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"Idle" | "Saved" | "Error">("Idle");
  const [feedbackError, setFeedbackError] = useState("");
  const [lastSavedFeedbackSignature, setLastSavedFeedbackSignature] = useState("");
  const lastSavedFeedbackSignatureRef = useRef("");
  const [feedbackRecordCount, setFeedbackRecordCount] = useState(0);
  const [demoDataLoaded, setDemoDataLoaded] = useState(false);
  const [isOptionalContextExpanded, setIsOptionalContextExpanded] = useState(false);
  const [isRecentAlarmsExpanded, setIsRecentAlarmsExpanded] = useState(false);
  const [isWorkRecordsExpanded, setIsWorkRecordsExpanded] = useState(false);
  const [isOperatingContextExpanded, setIsOperatingContextExpanded] = useState(false);

  const manualValidation = validateAlarmFields(manualFields);
  const extractedValidation = validateAlarmFields(extractedFields);
  const extractedAlarmHasFaultCode = hasExtractedAlarmFaultCode(
    alarmExtractionDraft,
    extractedFields
  );
  const activeAlarmFields =
    inputMode === "manual"
      ? manualFields
      : inputMode === "extracted" && extractedConfirmed
        ? extractedFields
        : emptyAlarmFields;
  const activeRawInput = "";
  const currentAlarmConfirmed =
    inputMode === "manual"
      ? manualValidation.isValid
      : inputMode === "extracted"
        ? extractedValidation.isValid &&
          extractedConfirmed &&
          alarmExtractionWorkflowStatus === "confirmed"
        : false;
  const triageBlockers = getTriageBlockers({
    currentAlarmConfirmed,
    recentAlarmsStatus: recentAlarmsExtractionWorkflowStatus,
    workRecordsStatus: workRecordsExtractionWorkflowStatus,
    operatingContextStatus: operatingContextExtractionWorkflowStatus
  });
  const triageReady = triageBlockers.length === 0;
  const triageContextInput = useMemo(
    () =>
      getTriageContextInput(contextInput, {
        recentAlarms: recentAlarmsExtractionWorkflowStatus,
        workRecords: workRecordsExtractionWorkflowStatus,
        operatingContext: operatingContextExtractionWorkflowStatus
      }),
    [
      contextInput,
      operatingContextExtractionWorkflowStatus,
      recentAlarmsExtractionWorkflowStatus,
      workRecordsExtractionWorkflowStatus
    ]
  );
  const normalizedInput = useMemo(
    () => normalizeInput(activeAlarmFields, advancedDetails, activeRawInput, triageContextInput),
    [activeAlarmFields, activeRawInput, advancedDetails, triageContextInput]
  );
  const alarm = normalizedInput.alarm;
  const context = normalizedInput.context;
  const ruleDecision = useMemo(
    () => {
      if (!triageReady) {
        return null;
      }

      return runRuleEngine({
        ...normalizedInput,
        affectedCapacityKw: parseCapacityNumber(advancedDetails.currentValue),
        siteCapacityKwp: parseSiteCapacityFromContext(context.operatorNotes),
        productionImpactText: context.productionImpact,
        slaCategory: context.operatorNotes,
        safetyComplianceFlag: getExplicitSafetyFlag(`${alarm.rawMessage} ${context.operatorNotes}`)
      });
    },
    [
      advancedDetails.currentValue,
      alarm.rawMessage,
      context.operatorNotes,
      context.productionImpact,
      normalizedInput,
      triageReady
    ]
  );
  const hasSelectedDecision = decisionState.selectedDecision !== "";
  const canGenerateBrief = Boolean(ruleDecision && triageReady);
  const triageChecks = ruleDecision ? getTriageChecks(ruleDecision, triageContextInput) : null;
  const contextSourceSummary = getContextSourceSummary({
    recentAlarms: recentAlarmsExtractionWorkflowStatus,
    workRecords: workRecordsExtractionWorkflowStatus,
    operatingContext: operatingContextExtractionWorkflowStatus
  });
  const optionalContextReviewPending = [
    recentAlarmsExtractionWorkflowStatus,
    workRecordsExtractionWorkflowStatus,
    operatingContextExtractionWorkflowStatus
  ].some(isReviewPendingStatus);
  const optionalContextExpanded =
    isOptionalContextExpanded || optionalContextReviewPending;
  const recentAlarmsExpanded =
    isRecentAlarmsExpanded || isReviewPendingStatus(recentAlarmsExtractionWorkflowStatus);
  const workRecordsExpanded =
    isWorkRecordsExpanded || isReviewPendingStatus(workRecordsExtractionWorkflowStatus);
  const operatingContextExpanded =
    isOperatingContextExpanded || isReviewPendingStatus(operatingContextExtractionWorkflowStatus);
  const optionalContextStatusSummary = getOptionalContextStatusSummary({
    recentAlarms: recentAlarmsExtractionWorkflowStatus,
    workRecords: workRecordsExtractionWorkflowStatus,
    operatingContext: operatingContextExtractionWorkflowStatus
  });
  const recentAlarmsCompactSummary = getRecentAlarmsCompactSummary(contextInput);
  const workRecordsCompactSummary = getWorkRecordsCompactSummary(contextInput);
  const operatingContextCompactSummary = getOperatingContextCompactSummary(contextInput);
  const hasRawAlarmInput = rawAlarmInput.trim().length > 0;
  const hasRecentAlarmsRawInput = contextInput.recentAlarmsText.trim().length > 0;
  const hasWorkRecordsRawInput = contextInput.relatedWorkRecordsText.trim().length > 0;
  const hasOperatingContextRawInput = hasOperatingContextInput(contextInput);
  const canExtractAlarm =
    hasRawAlarmInput && alarmRawDirty && alarmExtractionStatus !== "Loading";
  const canExtractRecentAlarms =
    hasRecentAlarmsRawInput &&
    recentAlarmsRawDirty &&
    recentAlarmsExtractionStatus !== "Loading";
  const canExtractWorkRecords =
    hasWorkRecordsRawInput &&
    workRecordsRawDirty &&
    workRecordsExtractionStatus !== "Loading";
  const canExtractOperatingContext =
    hasOperatingContextRawInput &&
    operatingContextRawDirty &&
    operatingContextExtractionStatus !== "Loading";
  const alarmExtractButtonLabel = getExtractButtonLabel({
    status: alarmExtractionStatus,
    defaultLabel: "Extract alarm fields",
    reextractLabel: "Re-extract alarm fields",
    extractedLabel: "Extracted",
    hasRawInput: hasRawAlarmInput,
    rawDirty: alarmRawDirty,
    hasLastExtraction: Boolean(lastExtractedAlarmSignature)
  });
  const recentAlarmsExtractButtonLabel = getExtractButtonLabel({
    status: recentAlarmsExtractionStatus,
    defaultLabel: "Extract recent alarms",
    reextractLabel: "Re-extract recent alarms",
    extractedLabel: "Extracted",
    hasRawInput: hasRecentAlarmsRawInput,
    rawDirty: recentAlarmsRawDirty,
    hasLastExtraction: Boolean(lastExtractedRecentAlarmsSignature)
  });
  const workRecordsExtractButtonLabel = getExtractButtonLabel({
    status: workRecordsExtractionStatus,
    defaultLabel: "Extract work records",
    reextractLabel: "Re-extract work records",
    extractedLabel: "Extracted",
    hasRawInput: hasWorkRecordsRawInput,
    rawDirty: workRecordsRawDirty,
    hasLastExtraction: Boolean(lastExtractedWorkRecordsSignature)
  });
  const operatingContextExtractButtonLabel = getExtractButtonLabel({
    status: operatingContextExtractionStatus,
    defaultLabel: "Extract operating context",
    reextractLabel: "Re-extract operating context",
    extractedLabel: "Extracted",
    hasRawInput: hasOperatingContextRawInput,
    rawDirty: operatingContextRawDirty,
    hasLastExtraction: Boolean(lastExtractedOperatingContextSignature)
  });
  const decisionAlignment =
    generatedBrief && ruleDecision && decisionState.selectedDecision
      ? evaluateDecisionAlignment({
          aiSuggestedNextMove: generatedBrief.suggested_next_move.recommended,
          selectedHumanDecision: decisionState.selectedDecision,
          triageResult: ruleDecision,
          generatedBrief
        })
      : null;
  const isDecisionReasonRequired = Boolean(decisionAlignment?.requiresReason);
  const isDecisionReasonMissing =
    isDecisionReasonRequired && decisionState.validationNote.trim().length === 0;
  const canGenerateNote = Boolean(
    brief &&
      generatedBrief &&
      ruleDecision &&
      decisionAlignment &&
      hasSelectedDecision &&
      !isDecisionReasonMissing
  );
  const hasSavedFeedback = Boolean(lastSavedFeedbackSignature);
  const canSaveNeedsAdjustmentFeedback =
    feedbackSelectedTags.length > 0 || feedbackComment.trim().length > 0;
  const needsAdjustmentSignature = workRecord
    ? getFeedbackSignature({
        useful: false,
        tags: feedbackSelectedTags,
        comment: feedbackComment
      })
    : "";
  const isNeedsAdjustmentDuplicate =
    Boolean(needsAdjustmentSignature) && needsAdjustmentSignature === lastSavedFeedbackSignature;
  const workflowSteps = getWorkflowSteps(
    Boolean(brief),
    hasSelectedDecision,
    Boolean(workRecord),
    hasSavedFeedback
  );
  const showFeedbackLog = process.env.NODE_ENV === "development";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFeedbackRecordCount(getFeedbackRecords().length);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const resetFeedbackState = () => {
    setFeedbackChoice(null);
    setFeedbackSelectedTags([]);
    setFeedbackComment("");
    setFeedbackStatus("Idle");
    setFeedbackError("");
    setLastSavedFeedbackSignature("");
    lastSavedFeedbackSignatureRef.current = "";
  };

  const resetExtractionState = () => {
    setAlarmExtraction(null);
    setAlarmExtractionStatus("Idle");
    setAlarmExtractionWorkflowStatus("not_provided");
    setAlarmExtractionError("");
    setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
    setAlarmRawDirty(false);
    setLastExtractedAlarmSignature("");
    setRecentAlarmsExtraction(null);
    setRecentAlarmsExtractionStatus("Idle");
    setRecentAlarmsExtractionWorkflowStatus("not_provided");
    setRecentAlarmsExtractionError("");
    setRecentAlarmsDraftText("");
    setIsEditingRecentAlarmsSummary(false);
    setRecentAlarmsRawDirty(false);
    setLastExtractedRecentAlarmsSignature("");
    setWorkRecordsExtraction(null);
    setWorkRecordsExtractionStatus("Idle");
    setWorkRecordsExtractionWorkflowStatus("not_provided");
    setWorkRecordsExtractionError("");
    setWorkRecordsDraftText("");
    setIsEditingWorkRecordsSummary(false);
    setWorkRecordsRawDirty(false);
    setLastExtractedWorkRecordsSignature("");
    setOperatingContextExtraction(null);
    setOperatingContextExtractionStatus("Idle");
    setOperatingContextExtractionWorkflowStatus("not_provided");
    setOperatingContextExtractionError("");
    setOperatingContextDraftInput(emptyContextInput);
    setIsEditingOperatingContextSummary(false);
    setOperatingContextRawDirty(false);
    setLastExtractedOperatingContextSignature("");
    setIsOptionalContextExpanded(false);
    setIsRecentAlarmsExpanded(false);
    setIsWorkRecordsExpanded(false);
    setIsOperatingContextExpanded(false);
  };

  const resetDownstream = () => {
    setBrief(null);
    setGeneratedBrief(null);
    setBriefStatus("Idle");
    setBriefError("");
    setWorkRecord(null);
    setNoteStatus("Idle");
    setNoteError("");
    setDecisionState(initialDecisionState);
    setCopyStatus("Idle");
    resetFeedbackState();
  };

  const updateManualField = (field: keyof AlarmConfirmationFields, value: string) => {
    const nextFields = { ...manualFields, [field]: value };

    setInputMode("manual");
    setAlarmExtraction(null);
    setAlarmExtractionStatus("Idle");
    setAlarmExtractionWorkflowStatus(
      validateAlarmFields(nextFields).isValid ? "confirmed" : "not_provided"
    );
    setAlarmExtractionError("");
    setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
    setExtractedConfirmed(false);
    setManualFields(nextFields);
    setDemoDataLoaded(false);
    resetDownstream();
  };

  const updateAlarmExtractionDraftField = <K extends keyof AlarmExtractionDraftFields>(
    field: K,
    value: AlarmExtractionDraftFields[K]
  ) => {
    const nextDraft = {
      ...alarmExtractionDraft,
      [field]: value
    };

    setAlarmExtractionDraft(nextDraft);
    setExtractedFields(mapAlarmExtractionDraftToFields(nextDraft));
    setExtractedConfirmed(false);
    setAlarmExtractionWorkflowStatus(getEditedExtractionStatus(alarmExtractionWorkflowStatus));
    resetDownstream();
  };

  const updateContext = (
    field: keyof Omit<ContextInput, "chips">,
    value: string,
    options?: { preserveExtraction?: boolean }
  ) => {
    const nextContext = { ...contextInput, [field]: value };

    setContextInput(nextContext);
    setDemoDataLoaded(false);

    if (!options?.preserveExtraction) {
      if (field === "recentAlarmsText") {
        setRecentAlarmsExtraction(null);
        setRecentAlarmsExtractionStatus("Idle");
        setRecentAlarmsExtractionWorkflowStatus(
          getOptionalContextStatusFromInput(nextContext, "recentAlarms")
        );
        setRecentAlarmsExtractionError("");
        setRecentAlarmsDraftText("");
        setIsEditingRecentAlarmsSummary(false);
        setRecentAlarmsRawDirty(Boolean(nextContext.recentAlarmsText.trim()));
      }

      if (field === "relatedWorkRecordsText") {
        setWorkRecordsExtraction(null);
        setWorkRecordsExtractionStatus("Idle");
        setWorkRecordsExtractionWorkflowStatus(
          getOptionalContextStatusFromInput(nextContext, "workRecords")
        );
        setWorkRecordsExtractionError("");
        setWorkRecordsDraftText("");
        setIsEditingWorkRecordsSummary(false);
        setWorkRecordsRawDirty(Boolean(nextContext.relatedWorkRecordsText.trim()));
      }

      if (
        field === "siteOperatingContext" ||
        field === "estimatedImpact" ||
        field === "slaNote" ||
        field === "accessConstraintNote" ||
        field === "safetyHseNote"
      ) {
        setOperatingContextExtraction(null);
        setOperatingContextExtractionStatus("Idle");
        setOperatingContextExtractionWorkflowStatus(
          getOptionalContextStatusFromInput(nextContext, "operatingContext")
        );
        setOperatingContextExtractionError("");
        setOperatingContextDraftInput(emptyContextInput);
        setIsEditingOperatingContextSummary(false);
        setOperatingContextRawDirty(hasOperatingContextInput(nextContext));
      }
    }

    resetDownstream();
  };

  const updateRawAlarmDraft = (value: string) => {
    setRawAlarmInput(value);
    setAlarmFileName("");
    setInputMode("none");
    setAlarmExtraction(null);
    setAlarmExtractionStatus("Idle");
    setAlarmExtractionWorkflowStatus(value.trim() ? "raw_provided" : "not_provided");
    setAlarmExtractionError("");
    setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
    setExtractedFields(emptyAlarmFields);
    setExtractedConfirmed(false);
    setAlarmRawDirty(Boolean(value.trim()));
    setDemoDataLoaded(false);

    resetDownstream();
  };

  const extractRawAlarmInput = async () => {
    if (!canExtractAlarm) {
      return;
    }

    await extractAlarmFromText(rawAlarmInput);
  };

  const extractAlarmFromText = async (input: string) => {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setInputMode("none");
      setExtractedFields(emptyAlarmFields);
      setExtractedConfirmed(false);
      setAlarmExtraction(null);
      setAlarmExtractionStatus("Idle");
      setAlarmExtractionWorkflowStatus("not_provided");
      setAlarmExtractionError("");
      setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
      setAlarmRawDirty(false);
      resetDownstream();
      return;
    }

    setAlarmExtractionStatus("Loading");
    setAlarmExtractionWorkflowStatus("extracting");
    setAlarmExtractionError("");
    setAlarmExtraction(null);

    try {
      const response = await fetch("/api/extract-alarm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rawText: trimmedInput })
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      if (!isAlarmExtractionResult(data)) {
        throw new Error("The extracted alarm did not match the expected format.");
      }

      const nextDraft = mapAlarmExtractionToDraft(data);

      setAlarmExtractionDraft(nextDraft);
      setExtractedFields(mapAlarmExtractionDraftToFields(nextDraft));
      setAlarmExtraction(data);
      setInputMode("extracted");
      setExtractedConfirmed(false);
      setAlarmExtractionStatus("Idle");
      setAlarmExtractionWorkflowStatus("extracted_needs_confirmation");
      setAlarmRawDirty(false);
      setLastExtractedAlarmSignature(getRawInputSignature(trimmedInput));
      resetDownstream();
    } catch {
      setInputMode("none");
      setExtractedFields(emptyAlarmFields);
      setExtractedConfirmed(false);
      setAlarmExtractionWorkflowStatus(trimmedInput ? "raw_provided" : "not_provided");
      setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
      setAlarmExtractionStatus("Error");
      setAlarmExtractionError("Extraction failed. You can still fill the alarm fields manually.");
      resetDownstream();
    }
  };

  const handleAlarmFileLoaded = async (text: string, fileName: string) => {
    setRawAlarmInput(text);
    setAlarmFileName(fileName);
    setInputMode("none");
    setExtractedFields(emptyAlarmFields);
    setExtractedConfirmed(false);
    setAlarmExtraction(null);
    setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
    setAlarmExtractionStatus("Idle");
    setAlarmExtractionWorkflowStatus(text.trim() ? "raw_provided" : "not_provided");
    setAlarmExtractionError("");
    setAlarmRawDirty(Boolean(text.trim()));
    setDemoDataLoaded(false);
    resetDownstream();
  };

  const extractRecentAlarmsInput = async (input = contextInput.recentAlarmsText) => {
    if (!canExtractRecentAlarms) {
      return;
    }

    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return;
    }

    setRecentAlarmsExtractionStatus("Loading");
    setRecentAlarmsExtractionError("");
    setRecentAlarmsExtraction(null);
    setRecentAlarmsExtractionWorkflowStatus("extracting");
    setRecentAlarmsDraftText("");
    setIsEditingRecentAlarmsSummary(false);

    try {
      const response = await fetch("/api/extract-recent-alarms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rawText: trimmedInput })
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      if (!isRecentAlarmExtractionResult(data)) {
        throw new Error("The extracted recent alarms did not match the expected format.");
      }

      setRecentAlarmsExtraction(data);
      setRecentAlarmsDraftText(formatExtractedRecentAlarms(data.records));
      setRecentAlarmsExtractionStatus("Idle");
      setRecentAlarmsExtractionWorkflowStatus("extracted_needs_confirmation");
      setRecentAlarmsRawDirty(false);
      setLastExtractedRecentAlarmsSignature(getRawInputSignature(trimmedInput));
      setIsOptionalContextExpanded(true);
      setIsRecentAlarmsExpanded(true);
      resetDownstream();
    } catch {
      setRecentAlarmsExtractionStatus("Error");
      setRecentAlarmsExtractionWorkflowStatus(
        getOptionalContextStatusFromInput(contextInput, "recentAlarms")
      );
      setRecentAlarmsExtractionError(
        "Extraction failed. You can still edit recent alarms manually."
      );
      resetDownstream();
    }
  };

  const handleRecentAlarmsFileLoaded = async (text: string) => {
    updateContext("recentAlarmsText", text);
  };

  const extractWorkRecordsInput = async (input = contextInput.relatedWorkRecordsText) => {
    if (!canExtractWorkRecords) {
      return;
    }

    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return;
    }

    setWorkRecordsExtractionStatus("Loading");
    setWorkRecordsExtractionError("");
    setWorkRecordsExtraction(null);
    setWorkRecordsExtractionWorkflowStatus("extracting");
    setWorkRecordsDraftText("");
    setIsEditingWorkRecordsSummary(false);

    try {
      const response = await fetch("/api/extract-work-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ rawText: trimmedInput })
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      if (!isWorkRecordExtractionResult(data)) {
        throw new Error("The extracted work records did not match the expected format.");
      }

      setWorkRecordsExtraction(data);
      setWorkRecordsDraftText(formatExtractedWorkRecords(data.records));
      setWorkRecordsExtractionStatus("Idle");
      setWorkRecordsExtractionWorkflowStatus("extracted_needs_confirmation");
      setWorkRecordsRawDirty(false);
      setLastExtractedWorkRecordsSignature(getRawInputSignature(trimmedInput));
      setIsOptionalContextExpanded(true);
      setIsWorkRecordsExpanded(true);
      resetDownstream();
    } catch {
      setWorkRecordsExtractionStatus("Error");
      setWorkRecordsExtractionWorkflowStatus(
        getOptionalContextStatusFromInput(contextInput, "workRecords")
      );
      setWorkRecordsExtractionError(
        "Extraction failed. You can still edit the work records manually."
      );
      resetDownstream();
    }
  };

  const handleWorkRecordsFileLoaded = async (text: string) => {
    updateContext("relatedWorkRecordsText", text);
  };

  const extractOperatingContextInput = async (input = getOperatingContextRawText(contextInput)) => {
    if (!canExtractOperatingContext) {
      return;
    }

    const trimmedInput = input.trim();

    if (!trimmedInput) {
      return;
    }

    setOperatingContextExtractionStatus("Loading");
    setOperatingContextExtractionError("");
    setOperatingContextExtraction(null);
    setOperatingContextExtractionWorkflowStatus("extracting");
    setOperatingContextDraftInput(emptyContextInput);
    setIsEditingOperatingContextSummary(false);

    try {
      const response = await fetch("/api/extract-operating-context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rawText: trimmedInput,
          chips: contextInput.chips
        })
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      if (!isOperatingContextExtractionResult(data)) {
        throw new Error("The extracted operating context did not match the expected format.");
      }

      setOperatingContextDraftInput(applyOperatingContextExtraction(contextInput, data));
      setOperatingContextExtraction(data);
      setOperatingContextExtractionStatus("Idle");
      setOperatingContextExtractionWorkflowStatus("extracted_needs_confirmation");
      setOperatingContextRawDirty(false);
      setLastExtractedOperatingContextSignature(getRawInputSignature(trimmedInput));
      setIsOptionalContextExpanded(true);
      setIsOperatingContextExpanded(true);
      resetDownstream();
    } catch {
      setOperatingContextExtractionStatus("Error");
      setOperatingContextExtractionWorkflowStatus(
        getOptionalContextStatusFromInput(contextInput, "operatingContext")
      );
      setOperatingContextExtractionError(
        "Extraction failed. You can still edit the operating context manually."
      );
      resetDownstream();
    }
  };

  const handleOperatingContextFileLoaded = async (text: string) => {
    updateContext("siteOperatingContext", text);
  };

  const toggleContextChip = (chip: OperatingContextChip) => {
    const nextContext = {
      ...contextInput,
      chips: contextInput.chips.includes(chip)
        ? contextInput.chips.filter((currentChip) => currentChip !== chip)
        : [...contextInput.chips, chip]
    };

    setContextInput(nextContext);
    setDemoDataLoaded(false);
    setOperatingContextExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(nextContext, "operatingContext")
    );
    setIsOptionalContextExpanded(true);
    setIsOperatingContextExpanded(true);
    setOperatingContextExtraction(null);
    setOperatingContextExtractionStatus("Idle");
    setOperatingContextExtractionError("");
    setOperatingContextDraftInput(emptyContextInput);
    setIsEditingOperatingContextSummary(false);
    setOperatingContextRawDirty(hasOperatingContextInput(nextContext));
    resetDownstream();
  };

  const updateContextChip = (chip: OperatingContextChip) => {
    setOperatingContextDraftInput((current) => ({
      ...current,
      chips: current.chips.includes(chip)
        ? current.chips.filter((currentChip) => currentChip !== chip)
        : [...current.chips, chip]
    }));
    setOperatingContextExtractionWorkflowStatus(
      getEditedExtractionStatus(operatingContextExtractionWorkflowStatus)
    );
    setIsOptionalContextExpanded(true);
    setIsOperatingContextExpanded(true);
    setIsEditingOperatingContextSummary(true);
    resetDownstream();
  };

  const useExtractedAlarm = () => {
    if (!extractedValidation.isValid || !isExtractionConfirmable(alarmExtractionWorkflowStatus)) {
      return;
    }

    setInputMode("extracted");
    setExtractedConfirmed(true);
    setAlarmExtractionWorkflowStatus("confirmed");
    resetDownstream();
  };

  const cancelExtractedAlarm = () => {
    setInputMode("none");
    setExtractedFields(emptyAlarmFields);
    setAlarmExtractionDraft(emptyAlarmExtractionDraftFields);
    setExtractedConfirmed(false);
    setAlarmExtraction(null);
    setAlarmExtractionStatus("Idle");
    setAlarmExtractionWorkflowStatus(rawAlarmInput.trim() ? "raw_provided" : "cleared");
    setAlarmExtractionError("");
    setAlarmRawDirty(Boolean(rawAlarmInput.trim()));
    resetDownstream();
  };

  const useExtractedRecentAlarms = () => {
    if (!isExtractionConfirmable(recentAlarmsExtractionWorkflowStatus)) {
      return;
    }

    setContextInput((current) => ({
      ...current,
      recentAlarmsText: recentAlarmsDraftText
    }));
    setRecentAlarmsExtractionWorkflowStatus("confirmed");
    setIsEditingRecentAlarmsSummary(false);
    resetDownstream();
  };

  const clearExtractedRecentAlarms = () => {
    setRecentAlarmsExtraction(null);
    setRecentAlarmsDraftText("");
    setRecentAlarmsExtractionStatus("Idle");
    setRecentAlarmsExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(contextInput, "recentAlarms")
    );
    setRecentAlarmsExtractionError("");
    setIsEditingRecentAlarmsSummary(false);
    setRecentAlarmsRawDirty(Boolean(contextInput.recentAlarmsText.trim()));
    resetDownstream();
  };

  const useExtractedWorkRecords = () => {
    if (!isExtractionConfirmable(workRecordsExtractionWorkflowStatus)) {
      return;
    }

    setContextInput((current) => ({
      ...current,
      relatedWorkRecordsText: workRecordsDraftText
    }));
    setWorkRecordsExtractionWorkflowStatus("confirmed");
    setIsEditingWorkRecordsSummary(false);
    resetDownstream();
  };

  const clearExtractedWorkRecords = () => {
    setWorkRecordsExtraction(null);
    setWorkRecordsDraftText("");
    setWorkRecordsExtractionStatus("Idle");
    setWorkRecordsExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(contextInput, "workRecords")
    );
    setWorkRecordsExtractionError("");
    setIsEditingWorkRecordsSummary(false);
    setWorkRecordsRawDirty(Boolean(contextInput.relatedWorkRecordsText.trim()));
    resetDownstream();
  };

  const updateOperatingContextDraft = (
    field: keyof Omit<ContextInput, "chips">,
    value: string
  ) => {
    setOperatingContextDraftInput((current) => ({ ...current, [field]: value }));
    setOperatingContextExtractionWorkflowStatus(
      getEditedExtractionStatus(operatingContextExtractionWorkflowStatus)
    );
    setIsOptionalContextExpanded(true);
    setIsOperatingContextExpanded(true);
    setIsEditingOperatingContextSummary(true);
    resetDownstream();
  };

  const useExtractedOperatingContext = () => {
    if (!isExtractionConfirmable(operatingContextExtractionWorkflowStatus)) {
      return;
    }

    setContextInput({
      ...operatingContextDraftInput,
      chips: [...operatingContextDraftInput.chips]
    });
    setOperatingContextExtractionWorkflowStatus("confirmed");
    setIsEditingOperatingContextSummary(false);
    resetDownstream();
  };

  const clearExtractedOperatingContext = () => {
    setOperatingContextExtraction(null);
    setOperatingContextDraftInput(emptyContextInput);
    setOperatingContextExtractionStatus("Idle");
    setOperatingContextExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(contextInput, "operatingContext")
    );
    setOperatingContextExtractionError("");
    setIsEditingOperatingContextSummary(false);
    setOperatingContextRawDirty(hasOperatingContextInput(contextInput));
    resetDownstream();
  };

  const loadSample = () => {
    const selected = contextAwareExample;
    const demoAlarmText = formatDemoAlarmExport(selected.alarmFields);
    const nextContext = {
      ...selected.contextInput,
      chips: [...selected.contextInput.chips]
    };

    resetDownstream();
    resetExtractionState();
    setRawAlarmInput(demoAlarmText);
    setAlarmFileName("");
    setInputMode("none");
    setManualFields(emptyAlarmFields);
    setExtractedFields(emptyAlarmFields);
    setExtractedConfirmed(false);
    setAlarmExtractionWorkflowStatus("raw_provided");
    setAlarmRawDirty(true);
    setLastExtractedAlarmSignature("");
    setAdvancedDetails(emptyAdvancedAlarmDetails);
    setContextInput(nextContext);
    setRecentAlarmsExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(nextContext, "recentAlarms")
    );
    setRecentAlarmsRawDirty(Boolean(nextContext.recentAlarmsText.trim()));
    setLastExtractedRecentAlarmsSignature("");
    setWorkRecordsExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(nextContext, "workRecords")
    );
    setWorkRecordsRawDirty(Boolean(nextContext.relatedWorkRecordsText.trim()));
    setLastExtractedWorkRecordsSignature("");
    setOperatingContextExtractionWorkflowStatus(
      getOptionalContextStatusFromInput(nextContext, "operatingContext")
    );
    setOperatingContextRawDirty(hasOperatingContextInput(nextContext));
    setLastExtractedOperatingContextSignature("");
    setIsOptionalContextExpanded(true);
    setIsRecentAlarmsExpanded(true);
    setIsWorkRecordsExpanded(true);
    setIsOperatingContextExpanded(true);
    setDemoDataLoaded(true);
  };

  const handleGenerateBrief = async () => {
    if (!canGenerateBrief || !ruleDecision) {
      return;
    }

    setBriefStatus("Loading");
    setBriefError("");
    setBrief(null);
    setGeneratedBrief(null);
    setWorkRecord(null);
    setDecisionState(initialDecisionState);
    setCopyStatus("Idle");

    try {
      const response = await fetch("/api/generate-brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          alarm,
          recentAlarms: normalizedInput.recentAlarms,
          workRecords: normalizedInput.workRecords,
          context,
          ruleEngineOutput: ruleDecision
        })
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      if (!isGeneratedDiagnosticBrief(data)) {
        throw new Error("The generated brief did not match the expected format.");
      }

      setGeneratedBrief(data);
      setBrief(mapGeneratedBriefToDiagnosticBrief(data, ruleDecision));
      setBriefStatus("Idle");
    } catch (error) {
      setBriefStatus("Error");
      setBriefError(error instanceof Error ? error.message : "Failed to generate the brief.");
    }
  };

  const handleGenerateNote = async () => {
    if (
      !brief ||
      !generatedBrief ||
      !ruleDecision ||
      !decisionAlignment ||
      decisionState.selectedDecision === "" ||
      isDecisionReasonMissing
    ) {
      return;
    }

    setNoteStatus("Loading");
    setNoteError("");
    setWorkRecord(null);
    setCopyStatus("Idle");
    resetFeedbackState();

    try {
      const response = await fetch("/api/generate-note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          confirmedAlarm: alarm,
          confirmedRecentAlarms: normalizedInput.recentAlarms,
          confirmedWorkRecords: normalizedInput.workRecords,
          confirmedOperatingContext: context,
          triageResult: ruleDecision,
          generatedBrief,
          selectedHumanDecision: decisionState.selectedDecision,
          humanDecisionReason: decisionState.validationNote,
          decisionAlignment
        })
      });
      const data = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data));
      }

      if (!isGeneratedOperationalNote(data)) {
        throw new Error("The generated operational note did not match the expected format.");
      }

      const nextRecord = generateOperationalNote(
        alarm,
        brief,
        decisionState.selectedDecision,
        decisionState.validationNote,
        data.operationalNote
      );

      setWorkRecord(nextRecord);
      setDecisionState((current) => ({
        ...current,
        operationalNote: nextRecord.operationalNote
      }));
      setNoteStatus("Idle");
    } catch (error) {
      setNoteStatus("Error");
      setNoteError(error instanceof Error ? error.message : "Failed to generate the operational note.");
    }
  };

  const copyNote = async () => {
    if (!workRecord?.operationalNote) {
      return;
    }

    const copied = await copyToClipboard(workRecord.operationalNote);
    setCopyStatus(copied ? "Copied" : "Copy failed");
  };

  const saveFeedback = (useful: boolean, tags: FeedbackTag[], comment: string) => {
    if (!workRecord || !generatedBrief || !ruleDecision || decisionState.selectedDecision === "") {
      return;
    }

    if (!useful && tags.length === 0 && !comment.trim()) {
      setFeedbackStatus("Error");
      setFeedbackError("Select at least one issue tag or add a short comment.");
      return;
    }

    const signature = getFeedbackSignature({
      useful,
      tags,
      comment
    });

    if (signature === lastSavedFeedbackSignatureRef.current) {
      setFeedbackStatus("Saved");
      setFeedbackError("");
      return;
    }

    const record = createFeedbackRecord({
      ruleEngineOutput: ruleDecision,
      generatedBrief,
      humanDecisionState: decisionState.selectedDecision,
      useful,
      tags,
      comment
    });

    saveFeedbackRecord(record);
    lastSavedFeedbackSignatureRef.current = signature;
    setLastSavedFeedbackSignature(signature);
    setFeedbackRecordCount(getFeedbackRecords().length);
    setFeedbackStatus("Saved");
    setFeedbackError("");
    setDecisionState((current) => ({
      ...current,
      feedback: useful ? "Useful" : "Needs adjustment"
    }));
  };

  const handleUsefulFeedback = () => {
    setFeedbackChoice("Useful");
    setFeedbackSelectedTags([]);
    setFeedbackComment("");
    saveFeedback(true, [], "");
  };

  const handleNeedsAdjustmentFeedback = () => {
    setFeedbackChoice("Needs adjustment");
    setFeedbackStatus("Idle");
    setFeedbackError("");
  };

  const toggleFeedbackTag = (tag: FeedbackTag) => {
    setFeedbackSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((currentTag) => currentTag !== tag)
        : [...current, tag]
    );
    setFeedbackStatus("Idle");
    setFeedbackError("");
  };

  const handleSaveNeedsAdjustmentFeedback = () => {
    saveFeedback(false, feedbackSelectedTags, feedbackComment);
  };

  const handleDownloadFeedback = () => {
    const feedbackJson = exportFeedbackRecords();
    const blob = new Blob([feedbackJson], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `alarmready-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleClearFeedback = () => {
    clearFeedbackRecords();
    setFeedbackRecordCount(0);
    setFeedbackStatus("Idle");
    setFeedbackError("");
    setLastSavedFeedbackSignature("");
    lastSavedFeedbackSignatureRef.current = "";
    setDecisionState((current) => ({
      ...current,
      feedback: null
    }));
  };

  const clearOperationalNoteState = () => {
    setWorkRecord(null);
    setNoteStatus("Idle");
    setNoteError("");
    setCopyStatus("Idle");
    resetFeedbackState();
  };

  const updateSelectedDecision = (selectedDecision: TriageDecision | "") => {
    setDecisionState((current) => ({
      ...current,
      selectedDecision,
      operationalNote: ""
    }));
    clearOperationalNoteState();
  };

  const updateHumanDecisionReason = (validationNote: string) => {
    setDecisionState((current) => ({
      ...current,
      validationNote,
      operationalNote: ""
    }));
    clearOperationalNoteState();
  };

  return (
    <main className="appShell">
      <section className="masthead" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Public hackathon prototype</p>
          <h1 id="page-title">AlarmReady</h1>
          <p className="lede">
            Move from a raw solar monitoring alarm to a Pre-WO Diagnostic Brief for human
            validation.
          </p>
        </div>
        <div className="trustBanner" aria-label="Safety and trust guardrails">
          <ShieldAlert aria-hidden="true" />
          <span>Decision support only. No fault diagnosis. No automatic dispatch.</span>
        </div>
      </section>

      <WorkflowStatus steps={workflowSteps} />

      <section className="panel intakePanel" aria-labelledby="input-heading">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Input stage</p>
            <h2 id="input-heading">Alarm Intake</h2>
          </div>
          <div className="buttonRow">
            <button type="button" className="secondaryButton" onClick={loadSample}>
              <ListChecks aria-hidden="true" />
              Load Context-Rich Example
            </button>
          </div>
        </div>

        <div className="inputIntro">
          <p className="helperText">
            Start with the alarm. Add context when available. AlarmReady will show how much
            context supports the triage.
          </p>
          <p className="helperText">
            AlarmReady only runs local triage rules after extracted input is confirmed.
          </p>
          <p className="publicDataNotice">
            <Info aria-hidden="true" />
            Use synthetic or non-confidential data only. Do not paste real customer, site, asset, or
            confidential operational data.
          </p>
          {demoDataLoaded ? <span className="demoBadge">Synthetic demo data loaded</span> : null}
        </div>

        <div className="inputStageGrid">
          <article className="inputStageCard">
            <div>
              <p className="stepKicker">Current alarm</p>
              <h3>Paste alarm export or raw message</h3>
            </div>
            <StatusBadge label={alarmExtractionWorkflowStatus} />
            <textarea
              className="rawAlarmTextarea"
              rows={5}
              value={rawAlarmInput}
              onChange={(event) => updateRawAlarmDraft(event.target.value)}
              placeholder="Paste a raw alarm message, key/value export, or CSV rows here."
            />
            <div className="inputActionRow">
              <button
                type="button"
                className="secondaryButton"
                onClick={extractRawAlarmInput}
                disabled={!canExtractAlarm}
              >
                <FileText aria-hidden="true" />
                {alarmExtractButtonLabel}
              </button>
              <p className="helperText compact">
                Uploaded or pasted data must be confirmed before use.
              </p>
            </div>
            {alarmExtractionStatus === "Error" ? (
              <p className="errorText">{alarmExtractionError}</p>
            ) : null}
          </article>

          <details className="collapsibleCard">
            <summary>Fill manually instead</summary>
            <div className="formGrid manualGrid">
              <EditableField
                label="Site/plant"
                value={manualFields.sitePlant}
                missing={inputMode === "manual" && !manualFields.sitePlant.trim()}
                onChange={(value) => updateManualField("sitePlant", value)}
              />
              <EditableField
                label="Asset/device"
                value={manualFields.assetDevice}
                missing={inputMode === "manual" && !manualFields.assetDevice.trim()}
                onChange={(value) => updateManualField("assetDevice", value)}
              />
              <EditableField
                label="Alarm text/code"
                value={manualFields.alarmTextCode}
                missing={inputMode === "manual" && !manualFields.alarmTextCode.trim()}
                onChange={(value) => updateManualField("alarmTextCode", value)}
              />
              <EditableField
                label="Timestamp"
                value={manualFields.timestamp}
                missing={inputMode === "manual" && !manualFields.timestamp.trim()}
                onChange={(value) => updateManualField("timestamp", value)}
              />
              <label>
                <span>Severity, if available</span>
                <select
                  value={manualFields.severity}
                  onChange={(event) => updateManualField("severity", event.target.value)}
                >
                  <option value="">Not provided</option>
                  <option>Info</option>
                  <option>Warning</option>
                  <option>Critical</option>
                </select>
              </label>
              <label>
                <span>Short note</span>
                <input
                  value={manualFields.shortNote}
                  onChange={(event) => updateManualField("shortNote", event.target.value)}
                />
              </label>
            </div>
          </details>

          <article className="inputStageCard uploadCard">
            <div>
              <p className="stepKicker">Alarm export</p>
              <h3>Upload alarm export</h3>
            </div>
            <FileUpload
              label={
                alarmExtractionStatus === "Loading" ? "Extracting upload..." : "Upload .txt or .csv"
              }
              onTextLoaded={handleAlarmFileLoaded}
            />
            {alarmFileName ? <span className="fileNamePill">{alarmFileName}</span> : null}
          </article>
        </div>

        {inputMode === "extracted" ? (
          <section
            className="confirmationCard inlineConfirmation"
            aria-labelledby="confirm-heading"
            data-has-fault-code={extractedAlarmHasFaultCode ? "true" : "false"}
          >
            <div className="compactHeader">
              <div>
                <p className="stepKicker">Extracted fields</p>
                <h3 id="confirm-heading">Confirm Extracted Alarm Fields</h3>
              </div>
              <div className="statusCluster">
                <StatusBadge label={alarmExtractionWorkflowStatus} />
                <StatusBadge label={`Confidence: ${alarmExtractionDraft.confidence}`} />
              </div>
            </div>
            <MissingFields missingFields={extractedValidation.missingFields} />
            {alarmExtraction ? <AlarmExtractionSummary extraction={alarmExtraction} /> : null}
            <div className="formGrid manualGrid">
              <AlarmExtractionDraftField
                label="site/plant"
                field="sitePlant"
                draft={alarmExtractionDraft}
                missing={!alarmExtractionDraft.sitePlant.trim()}
                onChange={updateAlarmExtractionDraftField}
              />
              <AlarmExtractionDraftField
                label="asset/device"
                field="assetDevice"
                draft={alarmExtractionDraft}
                missing={!alarmExtractionDraft.assetDevice.trim()}
                onChange={updateAlarmExtractionDraftField}
              />
              <AlarmExtractionDraftField
                label="alarm text/code"
                field="alarmTextCode"
                draft={alarmExtractionDraft}
                missing={!alarmExtractionDraft.alarmTextCode.trim()}
                onChange={updateAlarmExtractionDraftField}
              />
              <AlarmExtractionDraftField
                label="timestamp"
                field="timestamp"
                draft={alarmExtractionDraft}
                missing={!alarmExtractionDraft.timestamp.trim()}
                onChange={updateAlarmExtractionDraftField}
              />
              <label>
                <span>Severity</span>
                <select
                  value={alarmExtractionDraft.severity}
                  onChange={(event) =>
                    updateAlarmExtractionDraftField(
                      "severity",
                      event.target.value as AlarmExtractionDraftFields["severity"]
                    )
                  }
                >
                  <option value="">Not provided</option>
                  <option>Info</option>
                  <option>Warning</option>
                  <option>Critical</option>
                </select>
              </label>
              <AlarmExtractionDraftField
                label="short note"
                field="shortNote"
                draft={alarmExtractionDraft}
                onChange={updateAlarmExtractionDraftField}
              />
            </div>
            <div className="buttonRow extractionActions">
              <button
                type="button"
                className="primaryButton"
                disabled={
                  !extractedValidation.isValid ||
                  !isExtractionConfirmable(alarmExtractionWorkflowStatus)
                }
                onClick={useExtractedAlarm}
              >
                <CheckCircle2 aria-hidden="true" />
                {getConfirmationButtonLabel(
                  alarmExtractionWorkflowStatus,
                  "Use extracted alarm",
                  "Confirm edited alarm"
                )}
              </button>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => undefined}
              >
                Edit fields
              </button>
              <button type="button" className="ghostButton" onClick={cancelExtractedAlarm}>
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        <section className="optionalContextSection" aria-labelledby="optional-context-heading">
          <div className="optionalContextHeader">
            <span className="optionalContextSummary">
              <strong id="optional-context-heading">Add optional context</strong>
              <span>
                Optional context improves duplicate checks, related-work checks, priority
                normalization, and WO readiness. Context is optional, but provided context must be
                extracted and confirmed before it affects triage.
              </span>
              <span className="contextCompactSummary">{optionalContextStatusSummary}</span>
            </span>
            <button
              type="button"
              className="smallToggleButton"
              aria-expanded={optionalContextExpanded}
              disabled={optionalContextReviewPending && optionalContextExpanded}
              onClick={() => setIsOptionalContextExpanded((current) => !current)}
            >
              {optionalContextExpanded ? "Hide details" : "Show details"}
            </button>
          </div>

          {optionalContextExpanded ? (
            <div className="contextCardGrid">
              <article className="contextCard contextDisclosure">
                <div className="contextCardHeader">
                  <span className="contextCardTitleBlock">
                    <strong>Recent alarms</strong>
                    <span>{recentAlarmsCompactSummary}</span>
                  </span>
                  <span className="contextCardHeaderActions">
                    <span className="miniMeta">
                      {getOptionalContextStatusLabel(recentAlarmsExtractionWorkflowStatus)}
                    </span>
                    <button
                      type="button"
                      className="smallToggleButton"
                      aria-expanded={recentAlarmsExpanded}
                      disabled={
                        isReviewPendingStatus(recentAlarmsExtractionWorkflowStatus) &&
                        recentAlarmsExpanded
                      }
                      onClick={() => setIsRecentAlarmsExpanded((current) => !current)}
                    >
                      {recentAlarmsExpanded ? "Hide details" : "Show details"}
                    </button>
                  </span>
                </div>
                {recentAlarmsExpanded ? (
              <div className="contextCardBody">
                <textarea
                  rows={5}
                  value={contextInput.recentAlarmsText}
                  onChange={(event) => updateContext("recentAlarmsText", event.target.value)}
                  placeholder="Paste recent or duplicate alarm lines."
                />
                <div className="inputActionRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => extractRecentAlarmsInput()}
                    disabled={!canExtractRecentAlarms}
                  >
                    <FileText aria-hidden="true" />
                    {recentAlarmsExtractButtonLabel}
                  </button>
                  <FileUpload
                    label="Upload .txt or .csv"
                    onTextLoaded={handleRecentAlarmsFileLoaded}
                  />
                </div>
                {recentAlarmsExtractionStatus === "Error" ? (
                  <p className="errorText">{recentAlarmsExtractionError}</p>
                ) : null}
                {recentAlarmsExtraction ? (
                  <RecentAlarmsExtractionSummary
                    extraction={recentAlarmsExtraction}
                    draftText={recentAlarmsDraftText}
                    isEditing={isEditingRecentAlarmsSummary}
                    workflowStatus={recentAlarmsExtractionWorkflowStatus}
                    onDraftChange={(value) => {
                      setRecentAlarmsDraftText(value);
                      setRecentAlarmsExtractionWorkflowStatus(
                        getEditedExtractionStatus(recentAlarmsExtractionWorkflowStatus)
                      );
                      setIsEditingRecentAlarmsSummary(true);
                      resetDownstream();
                    }}
                    onEdit={() => {
                      setIsEditingRecentAlarmsSummary(true);
                    }}
                    onUse={useExtractedRecentAlarms}
                    onClear={clearExtractedRecentAlarms}
                  />
                ) : null}
              </div>
                ) : null}
              </article>

              <article className="contextCard contextDisclosure">
                <div className="contextCardHeader">
                  <span className="contextCardTitleBlock">
                    <strong>Related work records</strong>
                    <span>{workRecordsCompactSummary}</span>
                  </span>
                  <span className="contextCardHeaderActions">
                    <span className="miniMeta">
                      {getOptionalContextStatusLabel(workRecordsExtractionWorkflowStatus)}
                    </span>
                    <button
                      type="button"
                      className="smallToggleButton"
                      aria-expanded={workRecordsExpanded}
                      disabled={
                        isReviewPendingStatus(workRecordsExtractionWorkflowStatus) &&
                        workRecordsExpanded
                      }
                      onClick={() => setIsWorkRecordsExpanded((current) => !current)}
                    >
                      {workRecordsExpanded ? "Hide details" : "Show details"}
                    </button>
                  </span>
                </div>
                {workRecordsExpanded ? (
              <div className="contextCardBody">
                <textarea
                  rows={5}
                  value={contextInput.relatedWorkRecordsText}
                  onChange={(event) => updateContext("relatedWorkRecordsText", event.target.value)}
                  placeholder="Paste open or recently closed WO notes."
                />
                <div className="inputActionRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => extractWorkRecordsInput()}
                    disabled={!canExtractWorkRecords}
                  >
                    <FileText aria-hidden="true" />
                    {workRecordsExtractButtonLabel}
                  </button>
                  <FileUpload
                    label="Upload .txt or .csv"
                    onTextLoaded={handleWorkRecordsFileLoaded}
                  />
                </div>
                {workRecordsExtractionStatus === "Error" ? (
                  <p className="errorText">{workRecordsExtractionError}</p>
                ) : null}
                {workRecordsExtraction ? (
                  <WorkRecordsExtractionSummary
                    extraction={workRecordsExtraction}
                    draftText={workRecordsDraftText}
                    isEditing={isEditingWorkRecordsSummary}
                    workflowStatus={workRecordsExtractionWorkflowStatus}
                    onDraftChange={(value) => {
                      setWorkRecordsDraftText(value);
                      setWorkRecordsExtractionWorkflowStatus(
                        getEditedExtractionStatus(workRecordsExtractionWorkflowStatus)
                      );
                      setIsEditingWorkRecordsSummary(true);
                      resetDownstream();
                    }}
                    onEdit={() => {
                      setIsEditingWorkRecordsSummary(true);
                    }}
                    onUse={useExtractedWorkRecords}
                    onClear={clearExtractedWorkRecords}
                  />
                ) : null}
              </div>
                ) : null}
              </article>

              <article className="contextCard contextDisclosure">
                <div className="contextCardHeader">
                  <span className="contextCardTitleBlock">
                    <strong>Site / operating context</strong>
                    <span>{operatingContextCompactSummary}</span>
                  </span>
                  <span className="contextCardHeaderActions">
                    <span className="miniMeta">
                      {getOptionalContextStatusLabel(operatingContextExtractionWorkflowStatus)}
                    </span>
                    <button
                      type="button"
                      className="smallToggleButton"
                      aria-expanded={operatingContextExpanded}
                      disabled={
                        isReviewPendingStatus(operatingContextExtractionWorkflowStatus) &&
                        operatingContextExpanded
                      }
                      onClick={() => setIsOperatingContextExpanded((current) => !current)}
                    >
                      {operatingContextExpanded ? "Hide details" : "Show details"}
                    </button>
                  </span>
                </div>
                {operatingContextExpanded ? (
              <div className="contextCardBody">
                <p className="contextHelperText">
                  Describe anything that changes interpretation or readiness: weather, irradiance,
                  comms/data quality, affected capacity, SLA, safety, access, customer/business
                  impact.
                </p>
                <textarea
                  rows={5}
                  value={contextInput.siteOperatingContext}
                  onChange={(event) => updateContext("siteOperatingContext", event.target.value)}
                  placeholder="Weather, irradiance, comms/data quality, affected capacity, SLA, safety, access, customer/business impact."
                />
                <div className="chipGrid" aria-label="Optional context chips">
                  {contextChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className={contextInput.chips.includes(chip) ? "chipButton active" : "chipButton"}
                      onClick={() => toggleContextChip(chip)}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                {contextInput.chips.includes("Production impact known") ||
                contextInput.chips.includes("SLA-sensitive") ||
                contextInput.chips.includes("Site access constraint") ||
                contextInput.chips.includes("Safety / HSE concern") ? (
                  <div className="conditionalContextFields">
                    {contextInput.chips.includes("Production impact known") ? (
                      <label>
                        <span>Estimated impact, if known</span>
                        <input
                          value={contextInput.estimatedImpact}
                          onChange={(event) => updateContext("estimatedImpact", event.target.value)}
                          placeholder="Example: 1.2 MW affected or customer impact known"
                        />
                      </label>
                    ) : null}

                    {contextInput.chips.includes("SLA-sensitive") ? (
                      <label>
                        <span>SLA / response-time note</span>
                        <input
                          value={contextInput.slaNote}
                          onChange={(event) => updateContext("slaNote", event.target.value)}
                          placeholder="Example: respond within 4 hours"
                        />
                      </label>
                    ) : null}

                    {contextInput.chips.includes("Site access constraint") ? (
                      <label>
                        <span>Access constraint note</span>
                        <input
                          value={contextInput.accessConstraintNote}
                          onChange={(event) =>
                            updateContext("accessConstraintNote", event.target.value)
                          }
                          placeholder="Example: gate code, escort, road condition"
                        />
                      </label>
                    ) : null}

                    {contextInput.chips.includes("Safety / HSE concern") ? (
                      <label>
                        <span>Safety / HSE note</span>
                        <input
                          value={contextInput.safetyHseNote}
                          onChange={(event) => updateContext("safetyHseNote", event.target.value)}
                          placeholder="Example: fire, electrical, access, or compliance concern"
                        />
                      </label>
                    ) : null}
                  </div>
                ) : null}
                <div className="inputActionRow">
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => extractOperatingContextInput()}
                    disabled={!canExtractOperatingContext}
                  >
                    <FileText aria-hidden="true" />
                    {operatingContextExtractButtonLabel}
                  </button>
                  <FileUpload
                    label="Upload .txt or .csv"
                    onTextLoaded={handleOperatingContextFileLoaded}
                  />
                </div>
                {operatingContextExtractionStatus === "Error" ? (
                  <p className="errorText">{operatingContextExtractionError}</p>
                ) : null}
                {operatingContextExtraction ? (
                  <OperatingContextExtractionSummary
                    extraction={operatingContextExtraction}
                    draftInput={operatingContextDraftInput}
                    isEditing={isEditingOperatingContextSummary}
                    workflowStatus={operatingContextExtractionWorkflowStatus}
                    onDraftChange={updateOperatingContextDraft}
                    onDraftChipToggle={updateContextChip}
                    onEdit={() => {
                      setIsEditingOperatingContextSummary(true);
                    }}
                    onUse={useExtractedOperatingContext}
                    onClear={clearExtractedOperatingContext}
                  />
                ) : null}
              </div>
                ) : null}
              </article>
            </div>
          ) : null}
        </section>
      </section>

      <div className="resultSequence">
        <section className="panel" aria-labelledby="rules-heading">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Local rules</p>
              <h2 id="rules-heading">Triage Checks</h2>
            </div>
            {triageChecks ? (
              <span className="statusPill">Human validation required</span>
            ) : null}
          </div>

          {triageChecks ? (
            <>
              <p className="triageSummaryLine">{triageChecks.summaryLine}</p>
              <details className="contextSourceDetails">
                <summary>{contextSourceSummary}</summary>
                <p>
                  Local rules use manual alarm fields or confirmed extracted inputs only. Raw,
                  extracted, or edited-but-unconfirmed context is not used in triage.
                </p>
              </details>

              <div className="triageCardGrid" aria-label="Triage check outputs">
                {triageChecks.cards.map((card) => (
                  <TriageCard key={card.title} card={card} />
                ))}
              </div>

              <details className="reasoningDetails">
                <summary>Show priority reasoning</summary>
                <div className="reasoningGroup">
                  <h3>Priority signals</h3>
                  <ul>
                    {triageChecks.priorityReasoning.prioritySignals.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <div className="reasoningGroup">
                  <h3>Missing priority inputs</h3>
                  <ul>
                    {triageChecks.priorityReasoning.missingPriorityInputs.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </details>
            </>
          ) : (
            <TriageBlockedPanel blockers={triageBlockers} />
          )}
        </section>

        <section className="actionBand" aria-label="Brief actions">
          <div className="actionCopy">
            <p>Review the local triage checks before generating the brief.</p>
            {!canGenerateBrief ? (
              <p className="helperText compact">
                Triage Checks must run on confirmed input before a Pre-WO Diagnostic Brief can be
                generated.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="primaryButton"
            onClick={handleGenerateBrief}
            disabled={!canGenerateBrief || briefStatus === "Loading"}
          >
            <FileText aria-hidden="true" />
            {briefStatus === "Loading" ? "Generating brief..." : "Generate Pre-WO Diagnostic Brief"}
          </button>
          {briefStatus === "Error" ? <p className="errorText">{briefError}</p> : null}
        </section>

        <section className="panel briefPanel" aria-labelledby="brief-heading">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Pre-WO Diagnostic Brief</p>
              <h2 id="brief-heading">{brief?.title ?? "Brief Preview"}</h2>
            </div>
            {brief ? (
              <CheckCircle2 className="readyIcon" aria-hidden="true" />
            ) : (
              <Info aria-hidden="true" />
            )}
          </div>

          {generatedBrief ? (
            <GeneratedBriefContent brief={generatedBrief} />
          ) : brief ? (
            <div className="briefContent">
              <p className="summaryText">{brief.summary}</p>
              <div className="briefColumns">
                <BriefList title="Evidence" items={brief.evidence} />
                <BriefList title="Context Signals" items={brief.contextSignals} />
                <BriefList title="Human Validation" items={brief.humanValidation} />
                <BriefList title="Data Gaps" items={brief.dataGaps} />
              </div>
              <div className="safetyNote">{brief.safetyStatement}</div>
            </div>
          ) : briefStatus === "Loading" ? (
            <div className="emptyState">
              <FileText aria-hidden="true" />
              <p>Generating Pre-WO Diagnostic Brief...</p>
            </div>
          ) : (
            <div className="emptyState">
              <FileText aria-hidden="true" />
              <p>No Pre-WO Diagnostic Brief generated yet.</p>
            </div>
          )}
        </section>
      </div>

      <section
        className={brief ? "panel decisionPanel" : "panel decisionPanel isDeemphasized"}
        aria-labelledby="decision-heading"
      >
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Human decision</p>
            <h2 id="decision-heading">Operational Decision</h2>
          </div>
          {generatedBrief ? (
            <span className="guardrailPill">Human validation required</span>
          ) : null}
        </div>

        <div className="aiSuggestionBox" aria-live="polite">
          {generatedBrief ? (
            <>
              <p>
                <strong>AI suggested next move:</strong>{" "}
                {generatedBrief.suggested_next_move.recommended}
              </p>
              <p>
                <strong>Supporting action:</strong>{" "}
                {generatedBrief.suggested_next_move.supporting_action ||
                  "Supporting action not specified."}
              </p>
            </>
          ) : (
            <p>AI suggested next move will appear after the Pre-WO Diagnostic Brief is generated.</p>
          )}
          {generatedBrief ? (
            <p>
              Use this as guidance only. The operational decision must be selected by the human
              reviewer.
            </p>
          ) : null}
        </div>

        <div className="decisionGrid">
          <label>
            <span>Decision</span>
            <select
              value={decisionState.selectedDecision}
              disabled={!brief}
              onChange={(event) => updateSelectedDecision(event.target.value as TriageDecision)}
            >
              <option value="" disabled>
                {decisionPlaceholder}
              </option>
              {decisionOptions.map((option) => (
                <option key={option} value={option}>
                  {decisionLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Human decision reason</span>
            <textarea
              rows={4}
              disabled={!brief}
              value={decisionState.validationNote}
              placeholder="Add a short rationale, especially if your decision differs from the suggested next move or WO readiness."
              onChange={(event) => updateHumanDecisionReason(event.target.value)}
            />
          </label>
        </div>

        {decisionAlignment ? (
          <DecisionAlignmentWarning
            alignment={decisionAlignment}
            reasonMissing={isDecisionReasonMissing}
          />
        ) : null}

        <div className="buttonRow decisionActions">
          <button
            type="button"
            className="primaryButton"
            onClick={handleGenerateNote}
            disabled={!canGenerateNote || noteStatus === "Loading"}
          >
            <ClipboardCheck aria-hidden="true" />
            {noteStatus === "Loading" ? "Generating note..." : "Generate Operational Note"}
          </button>
          <button
            type="button"
            className="secondaryButton"
            onClick={copyNote}
            disabled={!workRecord?.operationalNote}
          >
            <Clipboard aria-hidden="true" />
            {copyStatus === "Idle" ? "Copy note" : copyStatus}
          </button>
          <button
            type="button"
            className="ghostButton"
            onClick={() => {
              setRawAlarmInput("");
              setAlarmFileName("");
              setInputMode("none");
              setManualFields(emptyAlarmFields);
              setExtractedFields(emptyAlarmFields);
              setExtractedConfirmed(false);
              setAdvancedDetails(emptyAdvancedAlarmDetails);
              setContextInput(emptyContextInput);
              resetExtractionState();
              resetDownstream();
              setDemoDataLoaded(false);
            }}
          >
            <RefreshCcw aria-hidden="true" />
            Reset
          </button>
        </div>

        {noteStatus === "Error" ? <p className="errorText">{noteError}</p> : null}

        {workRecord ? (
          <div className="noteBox" aria-live="polite">
            <div className="noteMeta">
              <span>{workRecord.workRecordId}</span>
              <span>{workRecord.dispatchStatus}</span>
            </div>
            <pre>{workRecord.operationalNote}</pre>
          </div>
        ) : null}
      </section>

      {workRecord ? (
        <section className="panel feedbackPanel" aria-labelledby="feedback-heading">
          <div className="panelHeader compactHeader">
            <div>
              <p className="eyebrow">Feedback</p>
              <h2 id="feedback-heading">Was this useful?</h2>
            </div>
          </div>

          <div className="feedbackControls" aria-label="Feedback choice">
            <button
              type="button"
              className={feedbackChoice === "Useful" ? "feedbackButton active" : "feedbackButton"}
              onClick={handleUsefulFeedback}
            >
              <ThumbsUp aria-hidden="true" />
              Useful
            </button>
            <button
              type="button"
              className={
                feedbackChoice === "Needs adjustment" ? "feedbackButton active" : "feedbackButton"
              }
              onClick={handleNeedsAdjustmentFeedback}
            >
              <ThumbsDown aria-hidden="true" />
              Needs adjustment
            </button>
          </div>

          {feedbackChoice === "Needs adjustment" ? (
            <div className="feedbackDetails">
              <div className="feedbackTagGrid" aria-label="Feedback issue tags">
                {feedbackTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={
                      feedbackSelectedTags.includes(tag)
                        ? "feedbackTagButton active"
                        : "feedbackTagButton"
                    }
                    onClick={() => toggleFeedbackTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <label>
                <span>Optional comment</span>
                <textarea
                  rows={3}
                  value={feedbackComment}
                  placeholder="What should be improved?"
                  onChange={(event) => {
                    setFeedbackComment(event.target.value);
                    setFeedbackStatus("Idle");
                    setFeedbackError("");
                  }}
                />
              </label>
              <p className="helperText compact">
                Comments are not stored verbatim. Local feedback saves only tags and privacy-safe
                metadata.
              </p>

              <div className="buttonRow feedbackActions">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={handleSaveNeedsAdjustmentFeedback}
                  disabled={!canSaveNeedsAdjustmentFeedback || isNeedsAdjustmentDuplicate}
                >
                  Save feedback
                </button>
                {!canSaveNeedsAdjustmentFeedback ? (
                  <p className="helperText compact">
                    Select at least one tag or add a short comment.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {feedbackStatus === "Saved" ? (
            <p className="feedbackSaved">Feedback saved. Thank you.</p>
          ) : null}
          {feedbackStatus === "Error" ? <p className="errorText">{feedbackError}</p> : null}

          {showFeedbackLog ? (
            <details className="feedbackLog">
              <summary>Feedback log</summary>
              <div className="feedbackLogBody">
                <span>{feedbackRecordCount} feedback records</span>
                <button type="button" className="secondaryButton" onClick={handleDownloadFeedback}>
                  <Download aria-hidden="true" />
                  Download feedback JSON
                </button>
                <button type="button" className="ghostButton" onClick={handleClearFeedback}>
                  <Trash2 aria-hidden="true" />
                  Clear feedback
                </button>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

type WorkflowStep = {
  label: string;
  state: "complete" | "current" | "locked";
};

function getFeedbackSignature({
  useful,
  tags,
  comment
}: {
  useful: boolean;
  tags: string[];
  comment: string;
}) {
  return JSON.stringify({
    useful,
    tags: [...tags].sort(),
    commentProvided: comment.trim().length > 0,
    commentLength: comment.trim().length
  });
}

function hasExtractedAlarmFaultCode(
  draft: Pick<AlarmExtractionDraftFields, "faultCode">,
  fields: Pick<AlarmConfirmationFields, "alarmTextCode">
) {
  return (
    Boolean(draft.faultCode.trim()) ||
    /(?:fault\s*code|code|fault)\s*\d+/i.test(fields.alarmTextCode)
  );
}

function formatDemoAlarmExport(fields: AlarmConfirmationFields) {
  return [
    `site/plant: ${fields.sitePlant}`,
    `asset/device: ${fields.assetDevice}`,
    `alarm text/code: ${fields.alarmTextCode}`,
    `timestamp: ${fields.timestamp}`,
    `severity: ${fields.severity || "Not provided"}`,
    `short note: ${fields.shortNote}`
  ].join("\n");
}

function getWorkflowSteps(
  hasBrief: boolean,
  hasDecision: boolean,
  hasOperationalNote: boolean,
  hasFeedback: boolean
): WorkflowStep[] {
  return [
    { label: "Input", state: hasBrief ? "complete" : "current" },
    {
      label: "Brief",
      state: !hasBrief ? "locked" : hasDecision || hasOperationalNote ? "complete" : "current"
    },
    {
      label: "Human Decision",
      state: !hasBrief ? "locked" : hasDecision ? "complete" : "current"
    },
    {
      label: "Operational Note",
      state: !hasDecision ? "locked" : hasOperationalNote ? "complete" : "current"
    },
    {
      label: "Feedback",
      state: !hasOperationalNote ? "locked" : hasFeedback ? "complete" : "current"
    }
  ];
}

function getTriageContextInput(
  contextInput: ContextInput,
  statuses: {
    recentAlarms: OptionalContextStatus;
    workRecords: OptionalContextStatus;
    operatingContext: OptionalContextStatus;
  }
): ContextInput {
  const useRecentAlarms = shouldUseContextTextForTriage(statuses.recentAlarms);
  const useWorkRecords = shouldUseContextTextForTriage(statuses.workRecords);
  const useOperatingContext = shouldUseContextTextForTriage(statuses.operatingContext);

  return {
    ...contextInput,
    recentAlarmsText: useRecentAlarms ? contextInput.recentAlarmsText : "",
    relatedWorkRecordsText: useWorkRecords ? contextInput.relatedWorkRecordsText : "",
    siteOperatingContext: useOperatingContext ? contextInput.siteOperatingContext : "",
    chips: useOperatingContext ? contextInput.chips : [],
    estimatedImpact: useOperatingContext ? contextInput.estimatedImpact : "",
    slaNote: useOperatingContext ? contextInput.slaNote : "",
    accessConstraintNote: useOperatingContext ? contextInput.accessConstraintNote : "",
    safetyHseNote: useOperatingContext ? contextInput.safetyHseNote : ""
  };
}

function getTriageBlockers({
  currentAlarmConfirmed,
  recentAlarmsStatus,
  workRecordsStatus,
  operatingContextStatus
}: {
  currentAlarmConfirmed: boolean;
  recentAlarmsStatus: OptionalContextStatus;
  workRecordsStatus: OptionalContextStatus;
  operatingContextStatus: OptionalContextStatus;
}) {
  return [
    !currentAlarmConfirmed && "Alarm fields need confirmation",
    isBlockingSourceStatus(recentAlarmsStatus) && "Recent alarms need confirmation",
    isBlockingSourceStatus(workRecordsStatus) && "Work records need confirmation",
    isBlockingSourceStatus(operatingContextStatus) && "Operating context needs confirmation"
  ].filter((blocker): blocker is string => Boolean(blocker));
}

function shouldUseContextTextForTriage(status: OptionalContextStatus) {
  return status === "confirmed";
}

function isBlockingSourceStatus(status: SourceStatus) {
  return (
    status === "raw_provided" ||
    status === "extracting" ||
    status === "extracted_needs_confirmation" ||
    status === "edited_needs_confirmation"
  );
}

function isReviewPendingStatus(status: SourceStatus) {
  return status === "extracted_needs_confirmation" || status === "edited_needs_confirmation";
}

function isExtractionConfirmable(status: SourceStatus) {
  return isReviewPendingStatus(status);
}

function getEditedExtractionStatus(status: SourceStatus): SourceStatus {
  return status === "confirmed" || status === "edited_needs_confirmation"
    ? "edited_needs_confirmation"
    : "extracted_needs_confirmation";
}

function getConfirmationButtonLabel(
  status: SourceStatus,
  initialLabel: string,
  editedLabel: string
) {
  if (status === "confirmed") {
    return "Confirmed";
  }

  return status === "edited_needs_confirmation" ? editedLabel : initialLabel;
}

function getExtractButtonLabel({
  status,
  defaultLabel,
  reextractLabel,
  extractedLabel,
  hasRawInput,
  rawDirty,
  hasLastExtraction
}: {
  status: ExtractionStatus;
  defaultLabel: string;
  reextractLabel: string;
  extractedLabel: string;
  hasRawInput: boolean;
  rawDirty: boolean;
  hasLastExtraction: boolean;
}) {
  if (status === "Loading") {
    return "Extracting...";
  }

  if (!hasRawInput) {
    return defaultLabel;
  }

  if (!rawDirty && hasLastExtraction) {
    return extractedLabel;
  }

  return rawDirty && hasLastExtraction ? reextractLabel : defaultLabel;
}

function getOptionalContextStatusFromInput(
  contextInput: ContextInput,
  source: OptionalContextSource
): OptionalContextStatus {
  if (source === "recentAlarms") {
    return contextInput.recentAlarmsText.trim() ? "raw_provided" : "not_provided";
  }

  if (source === "workRecords") {
    return contextInput.relatedWorkRecordsText.trim() ? "raw_provided" : "not_provided";
  }

  return hasOperatingContextInput(contextInput) ? "raw_provided" : "not_provided";
}

function hasOperatingContextInput(contextInput: ContextInput) {
  return Boolean(
    contextInput.siteOperatingContext.trim() ||
      contextInput.estimatedImpact.trim() ||
      contextInput.slaNote.trim() ||
      contextInput.accessConstraintNote.trim() ||
      contextInput.safetyHseNote.trim() ||
      contextInput.chips.length > 0
  );
}

function getOperatingContextRawText(contextInput: ContextInput) {
  const chipText =
    contextInput.chips.length > 0
      ? `Selected chips: ${contextInput.chips.join(", ")}`
      : "";
  const lines = [
    contextInput.siteOperatingContext.trim(),
    chipText,
    contextInput.estimatedImpact.trim()
      ? `Estimated impact, if known: ${contextInput.estimatedImpact.trim()}`
      : "",
    contextInput.slaNote.trim()
      ? `SLA / response-time note: ${contextInput.slaNote.trim()}`
      : "",
    contextInput.accessConstraintNote.trim()
      ? `Access constraint note: ${contextInput.accessConstraintNote.trim()}`
      : "",
    contextInput.safetyHseNote.trim()
      ? `Safety / HSE note: ${contextInput.safetyHseNote.trim()}`
      : ""
  ].filter(Boolean);

  return lines.join("\n");
}

function getRawInputSignature(value: string) {
  return value.trim().replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

function getOptionalContextStatusLabel(status: OptionalContextStatus) {
  return getSourceStatusLabel(status);
}

function getSourceStatusLabel(status: SourceStatus) {
  const labels: Record<SourceStatus, string> = {
    not_provided: "Not provided",
    raw_provided: "Raw text provided",
    extracting: "Extracting...",
    extracted_needs_confirmation: "Extracted, needs confirmation",
    confirmed: "Confirmed",
    edited_needs_confirmation: "Edited, needs confirmation",
    cleared: "Cleared"
  };

  return labels[status];
}

function isSourceStatus(value: string): value is SourceStatus {
  return [
    "not_provided",
    "raw_provided",
    "extracting",
    "extracted_needs_confirmation",
    "confirmed",
    "edited_needs_confirmation",
    "cleared"
  ].includes(value);
}

function getContextSourceSummary(statuses: Record<OptionalContextSource, OptionalContextStatus>) {
  const activeStatuses = Object.values(statuses).filter((status) => status !== "not_provided");

  if (activeStatuses.length === 0) {
    return "Context source: no optional context provided";
  }

  if (activeStatuses.every((status) => status === "confirmed")) {
    return "Context source: confirmed extracted context";
  }

  return "Context source: provided context waiting for confirmation";
}

function getOptionalContextStatusSummary(
  statuses: Record<OptionalContextSource, OptionalContextStatus>
) {
  const activeStatuses = Object.values(statuses).filter(
    (status) => status !== "not_provided" && status !== "cleared"
  );

  if (activeStatuses.length === 0) {
    return "No optional context provided";
  }

  const counts = activeStatuses.reduce<Partial<Record<OptionalContextStatus, number>>>(
    (currentCounts, status) => ({
      ...currentCounts,
      [status]: (currentCounts[status] ?? 0) + 1
    }),
    {}
  );

  return (Object.entries(counts) as Array<[OptionalContextStatus, number]>)
    .map(([status, count]) => formatOptionalContextStatusCount(status, count))
    .join(" · ");
}

function formatOptionalContextStatusCount(status: OptionalContextStatus, count: number) {
  const sectionLabel = count === 1 ? "section" : "sections";
  const verb = count === 1 ? "has" : "have";
  const phrases: Record<OptionalContextStatus, string> = {
    not_provided: "not provided",
    raw_provided: "raw text provided",
    extracting: "extracting",
    extracted_needs_confirmation: "extracted, needs confirmation",
    confirmed: "confirmed",
    edited_needs_confirmation: "edited, needs confirmation",
    cleared: "cleared"
  };

  return `${count} ${sectionLabel} ${verb} ${phrases[status]}`;
}

function getRecentAlarmsCompactSummary(contextInput: ContextInput) {
  const lineCount = countNonEmptyLines(contextInput.recentAlarmsText);
  return lineCount > 0 ? `${lineCount} ${lineCount === 1 ? "alarm line" : "alarm lines"}` : "No recent alarms";
}

function getWorkRecordsCompactSummary(contextInput: ContextInput) {
  const lineCount = countNonEmptyLines(contextInput.relatedWorkRecordsText);
  return lineCount > 0 ? `${lineCount} ${lineCount === 1 ? "work line" : "work lines"}` : "No work records";
}

function getOperatingContextCompactSummary(contextInput: ContextInput) {
  if (contextInput.chips.length > 0) {
    return `${contextInput.chips.length} ${
      contextInput.chips.length === 1 ? "chip" : "chips"
    } selected`;
  }

  return hasOperatingContextInput(contextInput) ? "Operating context provided" : "No operating context";
}

function countNonEmptyLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function WorkflowStatus({ steps }: { steps: WorkflowStep[] }) {
  return (
    <nav className="workflowStatus" aria-label="Workflow status">
      <ol>
        {steps.map((step) => (
          <li key={step.label} className={step.state}>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StatusBadge({ label }: { label: string }) {
  return <span className="statusPill">{isSourceStatus(label) ? getSourceStatusLabel(label) : label}</span>;
}

function AlarmExtractionSummary({ extraction }: { extraction: AlarmExtractionResult }) {
  return (
    <details className="extractionSummary">
      <summary>Show extraction evidence</summary>
      <div className="extractionSummaryBody">
        {extraction.missingFields.length > 0 ? (
          <p>Missing from source: {extraction.missingFields.join(", ")}</p>
        ) : (
          <p>Required fields were extracted from the supplied text.</p>
        )}
        <ul>
          {extraction.evidence.slice(0, 6).map((item) => (
            <li key={`${item.field}-${item.sourceText}`}>
              <strong>{item.field}:</strong> {item.sourceText}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function RecentAlarmsExtractionSummary({
  extraction,
  draftText,
  isEditing,
  workflowStatus,
  onDraftChange,
  onEdit,
  onUse,
  onClear
}: {
  extraction: RecentAlarmExtractionResult;
  draftText: string;
  isEditing: boolean;
  workflowStatus: OptionalContextStatus;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onUse: () => void;
  onClear: () => void;
}) {
  return (
    <div className="extractionSummary compact">
      <div className="compactHeader">
        <h3>Extracted recent-alarm summary</h3>
        <div className="statusCluster">
          <span className="miniMeta">{extraction.records.length} records</span>
          <span className="miniMeta">{getOptionalContextStatusLabel(workflowStatus)}</span>
        </div>
      </div>
      <ul>
        {extraction.records.map((record, index) => (
          <li key={`${record.sourceText}-${index}`}>
            <strong>{record.assetDevice ?? `Record ${index + 1}`}</strong>{" "}
            {record.alarmTextCode ?? (record.faultCode ? `Fault code ${record.faultCode}` : "alarm unknown")} ·{" "}
            {record.severity ?? "severity unknown"} · {record.status} · confidence{" "}
            {record.confidence}
          </li>
        ))}
      </ul>
      {isEditing ? (
        <label>
          <span>Editable recent-alarm summary</span>
          <textarea
            rows={4}
            value={draftText}
            onChange={(event) => onDraftChange(event.target.value)}
          />
        </label>
      ) : null}
      <ExtractionActionRow
        useLabel={getConfirmationButtonLabel(
          workflowStatus,
          "Use extracted recent alarms",
          "Confirm edited recent alarms"
        )}
        editLabel="Edit summary"
        clearLabel="Clear extracted recent alarms"
        canUse={isExtractionConfirmable(workflowStatus) && draftText.trim().length > 0}
        onUse={onUse}
        onEdit={onEdit}
        onClear={onClear}
      />
    </div>
  );
}

function WorkRecordsExtractionSummary({
  extraction,
  draftText,
  isEditing,
  workflowStatus,
  onDraftChange,
  onEdit,
  onUse,
  onClear
}: {
  extraction: WorkRecordExtractionResult;
  draftText: string;
  isEditing: boolean;
  workflowStatus: OptionalContextStatus;
  onDraftChange: (value: string) => void;
  onEdit: () => void;
  onUse: () => void;
  onClear: () => void;
}) {
  return (
    <div className="extractionSummary compact">
      <div className="compactHeader">
        <h3>Extracted work-record summary</h3>
        <div className="statusCluster">
          <span className="miniMeta">{extraction.records.length} records</span>
          <span className="miniMeta">{getOptionalContextStatusLabel(workflowStatus)}</span>
        </div>
      </div>
      <ul>
        {extraction.records.map((record, index) => (
          <li key={`${record.workId ?? "record"}-${index}`}>
            <strong>{record.workId ?? `Record ${index + 1}`}</strong>{" "}
            {record.assetDevice ?? "asset unknown"} · {record.status} ·{" "}
            {record.relevanceHint} · confidence {record.confidence}
            {record.evidenceMissing.length > 0
              ? ` · evidence gap: ${record.evidenceMissing.join(", ")}`
              : ""}
          </li>
        ))}
      </ul>
      {isEditing ? (
        <label>
          <span>Editable work-record summary</span>
          <textarea
            rows={4}
            value={draftText}
            onChange={(event) => onDraftChange(event.target.value)}
          />
        </label>
      ) : null}
      <ExtractionActionRow
        useLabel={getConfirmationButtonLabel(
          workflowStatus,
          "Use extracted work records",
          "Confirm edited work records"
        )}
        editLabel="Edit summary"
        clearLabel="Clear extracted work records"
        canUse={isExtractionConfirmable(workflowStatus) && draftText.trim().length > 0}
        onUse={onUse}
        onEdit={onEdit}
        onClear={onClear}
      />
    </div>
  );
}

function OperatingContextExtractionSummary({
  extraction,
  draftInput,
  isEditing,
  workflowStatus,
  onDraftChange,
  onDraftChipToggle,
  onEdit,
  onUse,
  onClear
}: {
  extraction: OperatingContextExtractionResult;
  draftInput: ContextInput;
  isEditing: boolean;
  workflowStatus: OptionalContextStatus;
  onDraftChange: (field: keyof Omit<ContextInput, "chips">, value: string) => void;
  onDraftChipToggle: (chip: OperatingContextChip) => void;
  onEdit: () => void;
  onUse: () => void;
  onClear: () => void;
}) {
  const extractedSignals = [
    extraction.weather && `Weather: ${extraction.weather}`,
    extraction.irradiance && `Irradiance: ${extraction.irradiance}`,
    extraction.commsStatus && `Comms/data: ${extraction.commsStatus}`,
    extraction.productionImpactText && `Production impact: ${extraction.productionImpactText}`,
    extraction.estimatedImpactKw !== null && `Estimated impact: ${extraction.estimatedImpactKw} kW`,
    extraction.estimatedImpactPercent !== null &&
      `Estimated impact percent: <= ${extraction.estimatedImpactPercent}%`,
    extraction.slaText && `SLA: ${extraction.slaText}`,
    extraction.safetyHseText && `Safety/HSE: ${extraction.safetyHseText}`,
    extraction.accessConstraint && `Access: ${extraction.accessConstraint}`
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="extractionSummary compact">
      <div className="compactHeader">
        <h3>Extracted operating context</h3>
        <div className="statusCluster">
          <span className="miniMeta">confidence {extraction.confidence}</span>
          <span className="miniMeta">{getOptionalContextStatusLabel(workflowStatus)}</span>
        </div>
      </div>
      <ul>
        {(extractedSignals.length > 0
          ? extractedSignals
          : ["No structured operating context was extracted."]
        ).map((signal) => (
          <li key={signal}>{signal}</li>
        ))}
      </ul>
      {extraction.missingContext.length > 0 ? (
        <p>Missing context: {extraction.missingContext.join(", ")}</p>
      ) : null}
      {isEditing ? (
        <div className="formGrid compact">
          <div className="wideField">
            <span className="fieldLabel">Extracted context chips</span>
            <div className="chipGrid" aria-label="Editable extracted context chips">
              {contextChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={draftInput.chips.includes(chip) ? "chipButton active" : "chipButton"}
                  onClick={() => onDraftChipToggle(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span>Editable operating context summary</span>
            <textarea
              rows={4}
              value={draftInput.siteOperatingContext}
              onChange={(event) => onDraftChange("siteOperatingContext", event.target.value)}
            />
          </label>
          <EditableField
            label="Estimated impact"
            value={draftInput.estimatedImpact}
            onChange={(value) => onDraftChange("estimatedImpact", value)}
          />
          <EditableField
            label="SLA / response-time note"
            value={draftInput.slaNote}
            onChange={(value) => onDraftChange("slaNote", value)}
          />
          <EditableField
            label="Access constraint"
            value={draftInput.accessConstraintNote}
            onChange={(value) => onDraftChange("accessConstraintNote", value)}
          />
          <EditableField
            label="Safety / HSE note"
            value={draftInput.safetyHseNote}
            onChange={(value) => onDraftChange("safetyHseNote", value)}
          />
        </div>
      ) : null}
      <ExtractionActionRow
        useLabel={getConfirmationButtonLabel(
          workflowStatus,
          "Use extracted operating context",
          "Confirm edited operating context"
        )}
        editLabel="Edit summary"
        clearLabel="Clear extracted operating context"
        canUse={
          isExtractionConfirmable(workflowStatus) &&
          (draftInput.siteOperatingContext.trim().length > 0 ||
            draftInput.estimatedImpact.trim().length > 0 ||
            draftInput.slaNote.trim().length > 0 ||
            draftInput.accessConstraintNote.trim().length > 0 ||
            draftInput.safetyHseNote.trim().length > 0 ||
            draftInput.chips.length > 0)
        }
        onUse={onUse}
        onEdit={onEdit}
        onClear={onClear}
      />
    </div>
  );
}

function ExtractionActionRow({
  useLabel,
  editLabel,
  clearLabel,
  canUse,
  onUse,
  onEdit,
  onClear
}: {
  useLabel: string;
  editLabel: string;
  clearLabel: string;
  canUse: boolean;
  onUse: () => void;
  onEdit: () => void;
  onClear: () => void;
}) {
  return (
    <div className="buttonRow extractionActions">
      <button type="button" className="primaryButton" disabled={!canUse} onClick={onUse}>
        <CheckCircle2 aria-hidden="true" />
        {useLabel}
      </button>
      <button type="button" className="secondaryButton" onClick={onEdit}>
        {editLabel}
      </button>
      <button type="button" className="ghostButton" onClick={onClear}>
        {clearLabel}
      </button>
    </div>
  );
}

type TriageCardTone = "clear" | "review" | "risk" | "missing";

type TriageCardModel = {
  title: string;
  status:
    | "Low"
    | "Partial"
    | "Medium"
    | "High"
    | "Clear"
    | "Review"
    | "Risk"
    | "Missing"
    | "Not applicable";
  explanation: string;
  tone: TriageCardTone;
};

type PriorityReasoningGroups = {
  prioritySignals: string[];
  missingPriorityInputs: string[];
};

type TriageChecksView = {
  summaryLine: string;
  cards: TriageCardModel[];
  priorityReasoning: PriorityReasoningGroups;
};

function DecisionAlignmentWarning({
  alignment,
  reasonMissing
}: {
  alignment: DecisionAlignment;
  reasonMissing: boolean;
}) {
  if (alignment.alignment === "aligned") {
    return null;
  }

  const isHighRisk = alignment.alignment === "high_risk_mismatch";

  return (
    <div className={isHighRisk ? "decisionAlignmentWarning highRisk" : "decisionAlignmentWarning"}>
      <strong>{isHighRisk ? "Decision rationale required" : "Decision differs from guidance"}</strong>
      <p>{alignment.message}</p>
      {isHighRisk && reasonMissing ? (
        <p>Reason required because your decision differs from the triage recommendation.</p>
      ) : alignment.requiresReason ? (
        <p>Reason captured. The note will use the human-selected decision.</p>
      ) : (
        <p>Recommended: add a short rationale so the note preserves why you chose a different action.</p>
      )}
    </div>
  );
}

function TriageCard({ card }: { card: TriageCardModel }) {
  return (
    <article className={`triageCard ${card.tone}`}>
      <div>
        <h3>{card.title}</h3>
        <strong>{card.status}</strong>
      </div>
      <p>{card.explanation}</p>
    </article>
  );
}

function TriageBlockedPanel({ blockers }: { blockers: string[] }) {
  return (
    <div className="triageBlockedPanel" aria-live="polite">
      <h3>Triage Checks waiting for confirmation</h3>
      <p>Extracted or edited input must be confirmed before local rules can run.</p>
      {blockers.length > 0 ? (
        <ul>
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function getTriageChecks(decision: RuleEngineDecision, contextInput: ContextInput): TriageChecksView {
  const contextCard = getContextCoverageCard(decision);
  const repeatRelatedCard = getRepeatRelatedWorkCard(decision);
  const priorityCard = getPriorityNormalizationCard(decision);

  const cards = [contextCard, repeatRelatedCard, priorityCard];

  return {
    summaryLine: `${formatContextLevel(decision.contextCoverage)} context · Human validation required`,
    cards,
    priorityReasoning: getPriorityReasoning(decision, contextInput)
  };
}

function getContextCoverageCard(decision: RuleEngineDecision): TriageCardModel {
  const status = formatContextLevel(decision.contextCoverage);
  const explanations = {
    low: "Current alarm only; optional context was not supplied.",
    medium: "Current alarm plus one optional context source is available.",
    high: "Alarm, recent alarms, work records, and site/SLA context are available."
  };

  return {
    title: "Context level",
    status,
    explanation: explanations[decision.contextCoverage],
    tone: decision.contextCoverage === "high" ? "clear" : "review"
  };
}

function getRepeatRelatedWorkCard(decision: RuleEngineDecision): TriageCardModel {
  const findings = getAllFindings(decision);
  const hasComparisonData = decision.mode === "context_aware";
  const hasUpdateExistingSignal = findings.some((finding) =>
    ["duplicate_wo_risk", "update_or_link_open_wo", "update_scheduled_wo_first"].includes(
      finding.code
    )
  );

  if (!hasComparisonData) {
    return {
      title: "Repeat / related-work risk",
      status: "Not applicable",
      explanation: "No recent alarms or work records were provided for comparison.",
      tone: "missing"
    };
  }

  if (hasUpdateExistingSignal) {
    return {
      title: "Repeat / related-work risk",
      status: "Risk",
      explanation: "Existing or scheduled work may need update/link before a new WO.",
      tone: "risk"
    };
  }

  if (findings.length > 0) {
    return {
      title: "Repeat / related-work risk",
      status: "Review",
      explanation: "Repeat, episode, or recurrence signal needs human validation.",
      tone: "review"
    };
  }

  return {
    title: "Repeat / related-work risk",
    status: "Clear",
    explanation: "No repeat or related-WO signal found in supplied context.",
    tone: "clear"
  };
}

function getPriorityNormalizationCard(decision: RuleEngineDecision): TriageCardModel {
  const status = getPriorityDisplayStatus(decision);
  const rawSeverity = decision.priority.rawSeverity ?? "unknown";
  const missingInputs = formatMissingPriorityInputs(decision.priority.missingInputs);
  const explanation =
    missingInputs.length > 0
      ? `Raw severity ${rawSeverity}; normalized to ${status} because ${formatInlineList(missingInputs)} ${
          missingInputs.length === 1 ? "is" : "are"
        } unknown.`
      : `Raw severity ${rawSeverity}; normalized to ${status} using supplied impact, SLA, recurrence, and safety signals.`;

  return {
    title: "Priority normalization",
    status,
    explanation,
    tone: status === "High" ? "risk" : status === "Medium" ? "review" : "clear"
  };
}

function getPriorityReasoning(
  decision: RuleEngineDecision,
  contextInput: ContextInput
): PriorityReasoningGroups {
  const missingInputs = new Set(decision.priority.missingInputs);
  const hasCommsSignal = hasCommsSensorDataQualitySignal(contextInput);
  const productionImpactSignal = getProductionImpactSignal(contextInput);
  const faultCodeSignal = decision.faultCodeReference
    ? `${decision.faultCodeReference.manufacturer} fault-code reference: ${decision.faultCodeReference.name}; safety relevance ${formatReferenceToken(
        decision.faultCodeReference.safetyRelevance
      )}; priority floor ${formatReferenceToken(decision.faultCodeReference.priorityFloor ?? "none")}.`
    : null;
  const prioritySignals = [
    faultCodeSignal,
    !missingInputs.has("affected capacity") &&
      (decision.priority.affectedCapacityPct === null
        ? "Affected capacity signal is supplied, but site percentage cannot be calculated without site capacity."
        : `Affected capacity signal: estimated ${formatPriorityPercent(
            decision.priority.affectedCapacityPct
          )} of site capacity.`),
    !missingInputs.has("site capacity") &&
      (decision.priority.affectedCapacityPct === null
        ? "Site capacity signal is supplied for priority scoring."
        : `Site capacity / percentage affected signal: ${formatPriorityPercent(
            decision.priority.affectedCapacityPct
          )} estimated affected.`),
    !missingInputs.has("SLA category") &&
      (getPriorityReasonFragment(decision, /SLA/i) ??
        "SLA urgency signal is supplied for priority scoring."),
    !missingInputs.has("recurrence history") &&
      (getPriorityReasonFragment(decision, /recurrence|repeat|related/i) ??
        "Recurrence / repeat signal is supplied for priority scoring."),
    !missingInputs.has("safety/HSE context") &&
      (getPriorityReasonFragment(decision, /HSE|safety|compliance/i) ??
        "Safety / HSE / compliance signal does not add a priority override."),
    hasCommsSignal &&
      (getPriorityReasonFragment(decision, /sensor|reporting|comms|communication|data/i) ??
        "Comms / sensor / data-quality business risk signal is supplied in operating context."),
    productionImpactSignal
  ].filter((reason): reason is string => Boolean(reason));
  const missingPriorityInputs = [
    missingInputs.has("affected capacity") && "Affected capacity is missing.",
    missingInputs.has("site capacity") && "Site capacity / percentage affected is missing.",
    missingInputs.has("SLA category") && "SLA category / response time is missing.",
    missingInputs.has("recurrence history") && "Recurrence history is missing.",
    missingInputs.has("safety/HSE context") && "Safety/HSE context is missing.",
    !hasCommsSignal && "Comms/sensor/data-quality status is missing.",
    !productionImpactSignal && "Production impact is missing."
  ].filter((reason): reason is string => Boolean(reason));

  return {
    prioritySignals: uniqueText(
      prioritySignals.length > 0
        ? prioritySignals
        : ["No optional priority signals were supplied beyond raw severity."]
    ),
    missingPriorityInputs: uniqueText(
      missingPriorityInputs.length > 0
        ? missingPriorityInputs
        : ["No missing priority inputs flagged by local rules."]
    )
  };
}

function formatMissingPriorityInputs(inputs: string[]) {
  const labels: Record<string, string> = {
    "affected capacity": "affected capacity",
    "site capacity": "site capacity / percentage affected",
    "SLA category": "SLA urgency",
    "recurrence history": "recurrence history",
    "safety/HSE context": "safety/HSE context"
  };

  return inputs.map((input) => labels[input] ?? input);
}

function formatInlineList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function getPriorityReasonFragment(decision: RuleEngineDecision, pattern: RegExp) {
  return decision.priority.reasonFragments.find((reason) => pattern.test(reason));
}

function hasCommsSensorDataQualitySignal(contextInput: ContextInput) {
  return (
    contextInput.chips.includes("Comms / data issue suspected") ||
    /comms?|communication|sensor|telemetry|data quality|data-quality/i.test(
      contextInput.siteOperatingContext
    )
  );
}

function getProductionImpactSignal(contextInput: ContextInput) {
  if (contextInput.estimatedImpact.trim()) {
    return `Production impact signal: ${trimTrailingPunctuation(contextInput.estimatedImpact)}.`;
  }

  if (
    contextInput.chips.includes("Production impact known") ||
    /production impact|production variance|site-level production|affected capacity/i.test(
      contextInput.siteOperatingContext
    )
  ) {
    return "Production impact signal is supplied in operating context.";
  }

  return null;
}

function trimTrailingPunctuation(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

function formatReferenceToken(value: string) {
  return value.replace(/_/g, " ");
}

function formatPriorityPercent(value: number | null) {
  if (value === null) {
    return "unknown percentage";
  }

  return value < 1 ? `${value.toFixed(1)}%` : `${Math.round(value)}%`;
}

function getPriorityDisplayStatus(
  decision: RuleEngineDecision
): Extract<TriageCardModel["status"], "Low" | "Medium" | "High"> {
  return formatCoverage(decision.priority.normalizedPriority);
}

function getAllFindings(decision: RuleEngineDecision): RuleFinding[] {
  return [...decision.duplicateFindings, ...decision.relatedWorkFindings];
}

function formatCoverage(value: RuleEngineDecision["contextCoverage"] | "low" | "medium" | "high") {
  return value === "high" ? "High" : value === "medium" ? "Medium" : "Low";
}

function formatContextLevel(value: RuleEngineDecision["contextCoverage"]) {
  return value === "high" ? "High" : value === "medium" ? "Partial" : "Low";
}

function uniqueText(values: string[]) {
  return Array.from(new Set(values));
}

function MissingFields({
  missingFields
}: {
  missingFields: Array<keyof Pick<AlarmConfirmationFields, "sitePlant" | "assetDevice" | "alarmTextCode" | "timestamp">>;
}) {
  if (missingFields.length === 0) {
    return <p className="readyMessage">Required fields are complete.</p>;
  }

  return (
    <div className="missingFieldRow" aria-label="Missing required fields">
      {missingFields.map((field) => (
        <span key={field}>Missing {alarmFieldLabels[field]}</span>
      ))}
    </div>
  );
}

function AlarmExtractionDraftField({
  label,
  field,
  draft,
  missing,
  onChange
}: {
  label: string;
  field: Exclude<keyof AlarmExtractionDraftFields, "severity" | "confidence">;
  draft: AlarmExtractionDraftFields;
  missing?: boolean;
  onChange: <K extends keyof AlarmExtractionDraftFields>(
    field: K,
    value: AlarmExtractionDraftFields[K]
  ) => void;
}) {
  return (
    <EditableField
      label={label}
      value={draft[field]}
      missing={missing}
      onChange={(value) => onChange(field, value)}
    />
  );
}

function EditableField({
  label,
  value,
  missing,
  onChange
}: {
  label: string;
  value: string;
  missing?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>
        {label}
        {missing ? <em>Missing</em> : null}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FileUpload({
  label,
  onTextLoaded
}: {
  label: string;
  onTextLoaded: (text: string, fileName: string) => void | Promise<void>;
}) {
  return (
    <label className="fileUpload">
      <Upload aria-hidden="true" />
      <span>{label}</span>
      <input
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        onChange={async (event) => {
          const file = event.target.files?.[0];

          if (!file) {
            return;
          }

          await onTextLoaded(await file.text(), file.name);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="briefList">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function GeneratedBriefContent({ brief }: { brief: GeneratedDiagnosticBrief }) {
  return (
    <div className="numberedBrief">
      <section className="briefSection">
        <h3>1. Situation</h3>
        <p>{brief.situation}</p>
      </section>

      <section className="briefSection">
        <h3>2. Likely pattern</h3>
        <p>{brief.likely_pattern}</p>
      </section>

      <section className="briefSection">
        <h3>3. Missing checks</h3>
        <p>Top 3 things to verify before deciding:</p>
        <ul>
          {brief.missing_checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </section>

      <section className="briefSection">
        <h3>4. Priority &amp; WO readiness</h3>
        <dl className="briefFieldList">
          <div>
            <dt>Raw severity:</dt>
            <dd>{brief.priority_wo_readiness.raw_severity}</dd>
          </div>
          <div>
            <dt>Normalized priority:</dt>
            <dd>{brief.priority_wo_readiness.normalized_priority}</dd>
          </div>
          <div>
            <dt>WO readiness:</dt>
            <dd>{brief.priority_wo_readiness.wo_readiness}</dd>
          </div>
          <div>
            <dt>Reason:</dt>
            <dd>{brief.priority_wo_readiness.reason}</dd>
          </div>
        </dl>
      </section>

      <section className="briefSection">
        <h3>5. Suggested next move</h3>
        <dl className="briefFieldList">
          <div>
            <dt>Recommended:</dt>
            <dd>{brief.suggested_next_move.recommended}</dd>
          </div>
          <div>
            <dt>Supporting action:</dt>
            <dd>{brief.suggested_next_move.supporting_action || "Not specified."}</dd>
          </div>
          <div>
            <dt>Alternative:</dt>
            <dd>{brief.suggested_next_move.alternative}</dd>
          </div>
          <div>
            <dt>Human must confirm:</dt>
            <dd>{brief.suggested_next_move.human_must_confirm}</dd>
          </div>
        </dl>
      </section>

      <section className="briefSection">
        <h3>6. Evidence to request if work proceeds</h3>
        <ul>
          {brief.evidence_to_request.map((evidence) => (
            <li key={evidence}>{evidence}</li>
          ))}
        </ul>
      </section>

      <footer className="safetyNote">{brief.safety_note}</footer>
    </div>
  );
}

function mapGeneratedBriefToDiagnosticBrief(
  generated: GeneratedDiagnosticBrief,
  ruleDecision: RuleEngineDecision
): DiagnosticBrief {
  return {
    title: "Pre-WO Diagnostic Brief",
    summary: generated.situation,
    ruleChecks: ruleDecision.checks,
    likelyWorkstream: generated.suggested_next_move.recommended,
    evidence: [
      `Likely pattern: ${generated.likely_pattern}`,
      ...generated.evidence_to_request
    ],
    contextSignals: [
      `Raw severity: ${generated.priority_wo_readiness.raw_severity}`,
      `Normalized priority: ${generated.priority_wo_readiness.normalized_priority}`,
      `WO readiness: ${generated.priority_wo_readiness.wo_readiness}`,
      generated.priority_wo_readiness.reason
    ],
    humanValidation: [
      generated.suggested_next_move.human_must_confirm,
      `Recommended: ${generated.suggested_next_move.recommended}`,
      generated.suggested_next_move.supporting_action
        ? `Supporting action: ${generated.suggested_next_move.supporting_action}`
        : "Supporting action: Not specified.",
      `Alternative: ${generated.suggested_next_move.alternative}`
    ],
    dataGaps:
      generated.missing_checks.length > 0
        ? generated.missing_checks
        : ["No missing checks returned by generated brief."],
    safetyStatement: generated.safety_note
  };
}

function isGeneratedDiagnosticBrief(value: unknown): value is GeneratedDiagnosticBrief {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.situation === "string" &&
    typeof value.likely_pattern === "string" &&
    isFixedStringArray(value.missing_checks, 3) &&
    isRecord(value.priority_wo_readiness) &&
    typeof value.priority_wo_readiness.raw_severity === "string" &&
    typeof value.priority_wo_readiness.normalized_priority === "string" &&
    typeof value.priority_wo_readiness.wo_readiness === "string" &&
    typeof value.priority_wo_readiness.reason === "string" &&
    isRecord(value.suggested_next_move) &&
    (value.suggested_next_move.recommended_decision_state === undefined ||
      isHumanDecisionState(value.suggested_next_move.recommended_decision_state)) &&
    typeof value.suggested_next_move.recommended === "string" &&
    (value.suggested_next_move.supporting_action === undefined ||
      typeof value.suggested_next_move.supporting_action === "string") &&
    typeof value.suggested_next_move.alternative === "string" &&
    typeof value.suggested_next_move.human_must_confirm === "string" &&
    isFixedStringArray(value.evidence_to_request, 3) &&
    typeof value.safety_note === "string"
  );
}

function isGeneratedOperationalNote(value: unknown): value is { operationalNote: string } {
  return isRecord(value) && typeof value.operationalNote === "string";
}

function isHumanDecisionState(value: unknown): value is TriageDecision {
  return decisionOptions.includes(value as TriageDecision);
}

function getApiErrorMessage(value: unknown) {
  if (isRecord(value) && typeof value.error === "string") {
    return value.error;
  }

  return "Failed to generate the brief.";
}

function isFixedStringArray(value: unknown, length: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCapacityNumber(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseSiteCapacityFromContext(value: string) {
  const match = value.match(/site\s*capacity\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function getExplicitSafetyFlag(value: string) {
  if (/\bhse\b|safety|fire|electrical|arc|injury|shock|emergency|compliance/i.test(value)) {
    return "hse_or_fire_or_electrical" as const;
  }

  if (/sensor|reporting|meter|telemetry|comms|communication/i.test(value)) {
    return "sensor_or_reporting_risk" as const;
  }

  return undefined;
}

async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back for demo browsers that block the async clipboard permission.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
