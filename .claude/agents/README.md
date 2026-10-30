# GO Field Notes specialist subagents

Project-level [Claude Code subagents](https://docs.anthropic.com/en/docs/claude-code/sub-agents) for this repo. Claude Code loads every `*.md` file with YAML frontmatter in `.claude/agents/` automatically.

## The team

| Agent | Role | Tools |
|---|---|---|
| `go-field-notes-qa` | Independent QA: real-browser testing (Node Playwright), mobile/desktop layouts, time zones, a11y, offline, console errors, performance | Read, Grep, Glob, Bash, WebFetch |
| `go-field-notes-research` | Pokémon GO research and data verification against official/community sources; audits the importer and data files | Read, Grep, Glob, Bash, WebFetch, WebSearch |
| `go-field-notes-ux` | Senior product designer: IA, visual consistency, event cards, touch targets, states, accessibility | Read, Grep, Glob, Bash, WebFetch |
| `go-field-notes-engineering` | Architect, security and performance review: Worker, D1, auth/sync, service worker, GitHub Actions | Read, Grep, Glob, Bash, WebFetch |

## Lead-coordinator model

- The **lead agent** (the main Claude Code session) owns scope, integration, branches, PRs, merges and deploys, and follows `docs/AI-COLLABORATION.md`.
- **Specialists are read-only by default.** They investigate and return a structured report (Summary, Findings table with severity P0–P4, Confirmed vs Suggestions, Recommended next actions). P0 security/data-integrity issues are reported at the top.
- A specialist **only implements** when the lead explicitly authorises it in the task prompt, naming an isolated branch and scope. Even then it never touches `main`, never merges and never deploys.
- All specialists check current `main` and open PRs/issues first to avoid duplicate work, back every claim with evidence, and never invent test results.

## How to invoke

- Let Claude delegate automatically based on each agent's `description`, or ask explicitly:
  - "Use the go-field-notes-qa agent to verify event times at 375px in Melbourne and London."
  - "Have go-field-notes-research check this week's raid rotation against Leek Duck and official posts."
  - "Ask go-field-notes-engineering to review the sync endpoints for security issues."
- Run `/agents` in Claude Code to list, inspect or edit them.
- To authorise implementation, say so in the task prompt, e.g. "You may add a regression test on branch `test/qa-dst-fix`; do not merge."
