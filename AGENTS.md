# AGENTS.md

You are helping build a public hackathon prototype called AlarmReady.

## Product Goal

Help solar monitoring engineers move from a raw alarm to work-order-ready context by structuring alarm meaning, missing context, normalized priority, and technician handover requirements.

## Core Principles

- Workflow-first, not chatbot-first.
- Rules handle reliable checks.
- LLM handles messy interpretation and drafting.
- Human validates before any operational decision.
- The tool must not claim to diagnose actual faults.
- The tool must not dispatch work automatically.
- Keep all outputs concise, operational, and copyable.

## MVP Scope

- Current alarm input
- Optional context input
- Rule-check summary
- Pre-WO Diagnostic Brief
- Human decision selector
- Decision-specific operational note
- Feedback buttons

## Do Not Add

- authentication
- real CMMS integration
- real SCADA integration
- dashboards
- user management
- predictive maintenance claims
- automatic dispatch

## Code Standards

- TypeScript
- small components
- clear types
- readable business logic
- keep rule engine transparent
- run lint/build after meaningful changes if available
