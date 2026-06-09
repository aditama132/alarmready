# AlarmReady Rule Assertions

These are lightweight documented checks for the local rule engine until the prototype has a test runner. The executable version lives in `src/lib/rules.assertions.ts`.

## Fault-Code Lookup

- `Fault code 39 — Low System Insulation Resistance` maps to Sungrow code `39`, `Low System Insulation Resistance`, category `dc_insulation`, safety relevance `safety_relevant`, and priority floor `medium`.
- `Code 88 Electric Arc Fault` maps to Sungrow code `88`, `Electric Arc Fault`, safety relevance `safety_critical`, and priority floor `high`.
- `Fault 1550 String Current Reflux` maps to the `1548-1579` String Current Reflux range.
- `Fault 1602 PV Grounding Fault` maps to the `1600-1615` PV Grounding Fault range.
- `2026-06-04 08:37` must not be interpreted as a fault code.

## Rule Outcomes

- Low-context Sungrow code 39 scenario computes internal mode `quick`, recognizes code 39, and keeps normalized priority at `medium`.
- Context-rich Sungrow code 39 scenario computes internal mode `context_aware`, recognizes code 39, flags related-work risk from the open same-asset WO, and prefers updating existing work before creating new work.
- Code 39 alone floors priority to `medium`, but does not automatically force `high`.
- Code 88 and PV Grounding Fault codes floor priority to `high`.

## Safety Boundaries

- The reference library informs triage, missing checks, evidence requests, safety relevance, and WO readiness.
- The app must not claim actual root cause confirmation.
- The app must not recommend automatic dispatch.
- Human validation remains required before any operational next step.
