# AlarmReady Demo Scenarios

These flows use synthetic demo data only. They are intended for prototype testing and public hackathon presentation.

## Low-Context Manual Test

1. Fill only the current alarm fields manually.
2. Leave optional context empty.
3. Review Triage Checks.
4. Generate Pre-WO Diagnostic Brief.
5. Select Remote verify.
6. Generate Operational Note.
7. Mark feedback.

This alarm-only scenario uses synthetic Sungrow SG350HX code 39 data. It should recognize Fault code 39 — Low System Insulation Resistance, show Low context, surface missing-context needs, keep normalized priority at Medium, and avoid WO-ready language until remote verification or additional context is supplied.

## Sungrow SG350HX Demo Flow

1. Load Context-Rich Example.
2. Expand optional context if needed.
3. Review Triage Checks.
4. Generate Pre-WO Diagnostic Brief.
5. Select Remote verify or Update existing WO depending on brief output.
6. Generate Operational Note.
7. Mark feedback.

This scenario uses Sungrow SG320HX / SG350HX manual-grounded Fault code 39 — Low System Insulation Resistance as synthetic demo data. It is not a real site, customer, Sungrow alarm export, or operational event.

Use it to demonstrate context-rich triage around an insulation-resistance alarm after rainy weather, recent MPPT-08 current-imbalance context, an open WO on the same inverter, related-work risk, priority normalization, WO readiness, and human validation before any next step. AlarmReady does not diagnose the actual fault, does not confirm a grounding fault, and does not dispatch work automatically.

## Curated Fault-Code Reference

AlarmReady includes a small Sungrow SG320HX / SG350HX fault-code reference subset for local triage support. It is used for missing checks, evidence requests, safety relevance, priority floors, and WO readiness hints only.

The reference does not replace the OEM manual, site safety procedure, or qualified personnel. It does not confirm root cause and does not automate dispatch.
