# AI Collaboration Workflow

This repository is shared by the project owner, ChatGPT, Claude Code, and Claude's web app. GitHub is the durable source of truth for project work and handovers.

Related coordination issue: #189

## Architecture guardrails

- Preserve the Cloudflare Worker + static assets + D1 architecture.
- Keep the application plain JavaScript with no build step.
- Do not add a framework, bundler, paid API service, or new infrastructure without explicit approval.
- Never commit secrets, PINs, tokens, credentials, or private user data.
- Do not merge or manually deploy changes, change production data/secrets/configuration, or alter D1 schema/migrations without explicit approval.
- Exception, approved by the owner: the scheduled AI tasks (event check, picture matching, shiny/costume check) keep opening and merging their own data-only pull requests once tests pass.
- Exception, approved by the owner (2026-10-17): Claude may run the project's workflows (importer, discord sync, infographics, health) and merge pull requests itself, without asking each time, once tests pass and checks are green. Still needs explicit approval: secrets, PINs, D1 schema/migrations, the Worker's own cron, manual deploys, and changes that could damage production data. Every run and merge is recorded in the issue/PR handover.
- Scheduled-task behaviour (prompts, timing, what a run does) may be changed by Claude or ChatGPT without asking first, provided the change is recorded in the relevant issue/PR handover and does not touch secrets, D1, or the Worker's own cron.
- A successful GitHub Actions run is not, by itself, proof that the live deployment is healthy.

## Before starting a task

1. Read this file and issue #189.
2. Inspect `main`, recent commits, open issues and pull requests, and relevant Actions runs.
3. Search for an existing issue, PR, or branch covering the task. Do not start duplicate work.
4. If another assistant is already changing the same files, coordinate in the relevant issue/PR before editing.
5. State the intended scope and create a descriptive branch from the latest `main`.

## Working rules

- Make narrowly scoped changes on a dedicated branch.
- Do not force-push over another contributor's work.
- Run relevant tests and report exact results. Distinguish a new failure from a failure that also exists on clean `main`.
- Open or update a PR with the goal, implementation summary, changed areas, tests, known limitations, deployment implications, and next action.
- Ask for approval before risky production changes; do not treat silence as approval.
- Verify merge and deployment status separately. Never claim production is updated unless evidence confirms it.

## Assistant handover protocol

At the end of each work session, add a comment to the relevant issue or PR. If no suitable issue or PR exists, create a coordination issue rather than leaving the handover only in chat.

Use this template:

```markdown
### Handover — YYYY-MM-DD

- **Assistant:** ChatGPT / Claude Code / Claude web / human
- **Status:** completed / in progress / blocked / needs user input
- **Goal:**
- **Branch / PR / commit:**
- **Changes made:**
- **Checks and results:**
- **Known risks or unresolved questions:**
- **Next action:**
- **Suggested owner:** ChatGPT / Claude / human
- **Production status:** not requested / pending / verified (include evidence)
```

Keep handovers concise, factual, and linked to the relevant commit, PR, workflow run, or issue.

## Suggested division of work

- **Claude:** feature implementation, larger code changes, design implementation, data/source pipeline tasks.
- **ChatGPT:** independent audits, test and workflow analysis, code review, bug reproduction, focused fixes, and verification of Claude's changes.
- **Either assistant:** can take any task when the other is unavailable, after checking current work and recording ownership.
- **Project owner:** sets priorities and approves production-risk changes and merges/deployments where approval is required.

This is a suggested division, not an exclusive assignment. Avoid duplicate work by recording the active task in GitHub.

## How to hand work to the other assistant

1. Link the relevant issue or PR.
2. Summarise the observed behaviour, expected behaviour, files/areas involved, and tests already run.
3. State one clear next action and any boundaries.
4. Ask the receiving assistant to read the latest branch/PR and handover first, then report what it changed and tested.

Example prompt:

> Continue GO Field Notes work using the handover in [issue/PR link]. First inspect the latest repository state and check for conflicting work. Preserve the existing architecture. Take only the stated next action, run relevant tests, and update the handover with evidence and a next step.

## Scheduled checks are not continuous work

A scheduled repository check is a discrete run. It should inspect changes since the prior state when possible, report only verified findings, and avoid implying either assistant was working between runs. Claude's web app and Claude Code do not automatically poll this document unless their own workflow is explicitly configured to do so.
