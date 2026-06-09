# AlarmReady

AlarmReady is a public hackathon prototype for solar monitoring teams. It helps an engineer move from a raw alarm record to a Pre-WO Diagnostic Brief that can be reviewed by a human operator.

## Product Purpose

The prototype organizes alarm details, optional site context, rule checks, and an operational note. It helps engineers start with the alarm, add context when available, and see how much context supports triage. Messy pasted or uploaded inputs can be structured with LLM extraction before the local rule engine runs. It is designed to support a narrow demo workflow:

1. Enter or load a current alarm.
2. Confirm extracted alarm fields or fill them manually.
3. Add optional context when available.
4. Review deterministic local Triage Checks.
5. Generate a Pre-WO Diagnostic Brief.
6. Select a human decision.
7. Generate and copy an operational note.

## Local Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

Useful checks:

```bash
npm run lint
npm run build
```

## Environment Variables

LLM extraction, Diagnostic Brief generation, and Operational Note generation use server-side OpenAI API routes. Add a local environment file:

```bash
OPENAI_API_KEY=
FEEDBACK_STORAGE_MODE=
```

Use `.env.example` as the template. `OPENAI_API_KEY` must stay server-side and must not be renamed with a `NEXT_PUBLIC_` prefix. `FEEDBACK_STORAGE_MODE` is a deployment placeholder for the current V0 local feedback storage behavior.

## Public Deployment

Before sharing a public URL:

- Run `npm run build` and confirm the production build passes.
- Set `OPENAI_API_KEY` in the hosting provider's server-side environment settings.
- Keep `.env.local` out of git. The repository includes `.env.example` for safe configuration documentation.
- Use synthetic or non-confidential data only. Do not paste real customer, site, asset, or confidential operational data into a public demo.
- Confirm the full synthetic flow works: load the Context-Rich Example, extract and confirm each section, review Triage Checks, generate the Pre-WO Diagnostic Brief, choose a human decision, generate the Operational Note, and submit feedback.

## Demo Scenarios

Use the visible scenario button in the Input Stage for the main demo path.

- To test low-context behavior, enter only the current alarm manually and leave optional context empty. This tests missing-context discovery, low-context triage, and remote-verification readiness.
- **Context-Rich Example** loads a synthetic utility-scale Sungrow SG350HX string-inverter scenario using manual-grounded Fault code 39 — Low System Insulation Resistance. It treats recent MPPT-08 imbalance as related context only, then tests related-work risk, priority normalization, WO readiness, and human validation before any WO step.

Both scenarios are synthetic and for prototype demonstration only. The Sungrow SG350HX scenario is not a real alarm export, does not represent a real site/customer/operational event, and AlarmReady does not diagnose the actual fault.

## Fault-Code Reference

AlarmReady includes a curated Sungrow SG320HX / SG350HX fault-code reference subset for demo triage. The reference is used only to inform local rules, missing checks, safety relevance, WO readiness, and evidence requests.

It does not diagnose faults, replace the OEM manual, replace site procedure, replace qualified personnel, or automate dispatch.

## Extraction And Triage

- LLM extraction uses server-side OpenAI Responses API routes to structure messy alarm exports, work records, and operating context when `OPENAI_API_KEY` is configured.
- Manual alarm entry remains available if extraction fails or context is unavailable.
- Triage checks remain local deterministic demo logic and own context level, related-work risk, priority normalization, WO readiness, and fault-code priority floors.
- Human validation remains required before any operational next step.

## Feedback Privacy

V0 feedback is stored in browser `localStorage` under `alarmready_feedback_v1`. It stores only privacy-safe feedback metadata: usefulness, issue tags, whether a comment was provided, comment length, context level, selected human decision, suggested decision state, normalized priority, and WO readiness.

Feedback does not store user identity, raw alarm text, site names, asset names, generated brief snapshots, or generated note snapshots.

## Novus.ai Readiness

Do not manually add Novus instrumentation unless a Novus-generated pull request is available. For hackathon measurement:

1. Deploy AlarmReady to a public URL.
2. Connect the GitHub repository to Novus.ai.
3. Allow Novus to scan the repository.
4. Review the Novus-generated pull request.
5. Merge the Novus PR after checking that it does not expose secrets or change safety behavior.
6. Redeploy the app.
7. Confirm behavior appears in the Novus dashboard.
8. Capture a Novus dashboard screenshot for the Devpost submission.

## Demo Limitations

- Pre-WO Diagnostic Brief and Operational Note generation call the OpenAI Responses API from server routes when `OPENAI_API_KEY` is configured.
- Fault-code matching uses a small curated Sungrow SG320HX / SG350HX subset, not the full manual.
- The Pre-WO Diagnostic Brief does not diagnose the actual fault.
- The app does not create or dispatch work orders.
- Sample data is synthetic and demo-oriented.
- Persistence, authentication, audit logs, integrations, and alert ingestion are out of scope.

## Safety And Trust Statement

AlarmReady is decision support only. It prepares a Pre-WO Diagnostic Brief for human validation, does not claim to diagnose faults, and does not dispatch work automatically. A qualified human must validate the evidence and approve any next step.

## Hackathon Submission Checklist

- Public URL
- Novus installed and dashboard screenshot captured
- 2-3 minute demo video
- Short written description
- Synthetic data disclaimer
