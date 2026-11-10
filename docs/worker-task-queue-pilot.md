# GO Worker Queue Pilot

> **Notice:** This is a queue acceptance test and not a production feature.

This pilot evaluates the safety and reliability of the automated GO worker task queue. 

## Worker Safety Rules Checklist

- [ ] **Pre-approved Tasks Only:** Execute strictly bounded, pre-approved tasks.
- [ ] **No Main Pushes:** Never push directly to the GitHub `main` branch.
- [ ] **Secret Protection:** Ensure no secrets or credentials are ever exposed.
- [ ] **Draft PRs Only:** Open all pull requests as drafts.
- [ ] **No Auto-Deployments:** Prevent any automatic deployments from worker branches.
- [ ] **Human CI Review:** Require human review for all CI results and code changes.