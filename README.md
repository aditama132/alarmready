# AlarmReady

AlarmReady is a public hackathon prototype for solar monitoring teams. It turns alarm, diagnostic, ticket-history, and operating context into a short human-validation checkpoint before work or ticket changes are propagated.

## Product Purpose

The prototype organizes alarm details, system context, rule checks, a Human Validation Summary, and an optional Decision Brief. It helps engineers start with the alarm, add context when available, and see how much context supports triage. Messy pasted or uploaded inputs can be structured with LLM extraction before the local rule engine runs. It is designed to support a narrow demo workflow:

1. Enter or load a current alarm.
2. Confirm extracted alarm fields or fill them manually.
3. Add system context when available.
4. Review deterministic local Triage Checks.
5. Review the Human Validation Summary.
6. Select the final human decision.
7. Submit feedback.
8. Optionally generate a Decision Brief for reporting, handover, or evidence-trail support.

AlarmReady is now organized around a decision-first flow. The Human Validation Summary is the primary artifact. It appears after Triage Checks and before the Human Decision. After the Human Validation Summary, the user selects a final Human Decision and the workflow can stop there. The Human Decision stage uses directly editable decision options, so users can revise the decision by selecting another option; no separate Change or Clear buttons are needed. Feedback appears after a valid decision. The optional Decision Brief is only for documentation, reporting, handover, or evidence trail, and is not required for feedback or case completion. Start new case is the only global reset action.

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

LLM extraction and optional Decision Brief generation use server-side OpenAI API routes. Add a local environment file:

```bash
OPENAI_API_KEY=
FEEDBACK_STORAGE_MODE=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Use `.env.example` as the template. `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must stay server-side and must not be renamed with a `NEXT_PUBLIC_` prefix.

Feedback storage modes:

- `FEEDBACK_STORAGE_MODE=local` stores feedback only in the visitor's browser.
- `FEEDBACK_STORAGE_MODE=supabase` sends privacy-safe feedback metadata to Supabase through `/api/feedback`.

## Public Deployment

Before sharing a public URL:

- Run `npm run build` and confirm the production build passes.
- Set `OPENAI_API_KEY` in the hosting provider's server-side environment settings.
- For central feedback collection, set `FEEDBACK_STORAGE_MODE=supabase`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Project Settings.
- Redeploy after changing Vercel environment variables.
- Keep `.env.local` out of git. The repository includes `.env.example` for safe configuration documentation.
- Use synthetic or non-confidential data only. Do not paste real customer, site, asset, or confidential operational data into a public demo.
- Confirm the full synthetic flow works: load the Context-Rich Example, extract and confirm each section, review Triage Checks and the Human Validation Summary, choose a human decision, submit feedback, and optionally generate the Decision Brief.

## Demo Scenarios

Use the visible scenario button in the Input Stage for the main demo path.

- To test low-context behavior, enter only the current alarm manually and leave system context empty. This tests missing-context discovery, low-context triage, and remote-verification readiness.
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

Feedback stores only privacy-safe fields: usefulness, issue tags, optional comment, context level, selected human decision, suggested decision state, normalized priority, WO readiness, scenario type, app version, and prompt version.

Feedback does not store user identity, raw alarm text, site names, asset names, generated brief snapshots, or generated note snapshots.

## Retrieving Feedback

Local mode stores feedback only in each visitor's browser `localStorage` under `alarmready_feedback_v1`; it is not centrally retrievable.

Supabase mode stores privacy-safe feedback in the `alarmready_feedback` table. Feedback can be reviewed or exported from the Supabase dashboard.

Suggested table shape:

```sql
create table if not exists alarmready_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  useful boolean,
  tags text[] not null default '{}',
  comment text,
  context_level text check (context_level in ('low', 'partial', 'high')),
  human_decision_state text check (
    human_decision_state in (
      'monitor',
      'remote_verify',
      'update_existing_wo',
      'create_new_wo',
      'escalate',
      'defer',
      'false_not_actionable'
    )
  ),
  normalized_priority text check (normalized_priority in ('low', 'medium', 'high')),
  wo_readiness text,
  ai_suggested_decision_state text,
  scenario_type text check (scenario_type in ('context_rich_demo', 'custom')),
  app_version text,
  prompt_version text
);
```

The app intentionally does not store user identity, raw alarm data, site names, asset names, or generated output snapshots.

## Vercel Feedback Setup

Configure these variables in Vercel Project Settings:

```bash
FEEDBACK_STORAGE_MODE=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Redeploy the project after saving environment variable changes. `SUPABASE_SERVICE_ROLE_KEY` is used only by server routes and must never be exposed client-side.

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

- Optional Decision Brief generation reuses server-side OpenAI Responses API routes when `OPENAI_API_KEY` is configured.
- Fault-code matching uses a small curated Sungrow SG320HX / SG350HX subset, not the full manual.
- The Decision Brief does not diagnose the actual fault.
- The app does not create or dispatch work orders.
- Sample data is synthetic and demo-oriented.
- Persistence, authentication, audit logs, integrations, and alert ingestion are out of scope.

## Safety And Trust Statement

AlarmReady is decision support only. It prepares a human-validation checkpoint and optional Decision Brief, does not claim to diagnose faults, and does not dispatch work automatically. A qualified human must validate the evidence and approve any next step.

## Hackathon Submission Checklist

- Public URL
- Novus installed and dashboard screenshot captured
- 2-3 minute demo video
- Short written description
- Synthetic data disclaimer
