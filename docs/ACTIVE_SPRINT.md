# GO Field Notes — Active Sprint and Release Roadmap

> Operational roadmap. Last reviewed 10 November 2026. **Always check GitHub PRs, Actions and production before treating any status here as current.** Detailed historical work remains in [ROADMAP.md](ROADMAP.md).

## North star
Ship a complete, reliable, premium mobile-first Pokémon GO companion with trustworthy source-backed events, research, raids, shiny boosts, GO Pass, Schedule and Collection. Future events must work through reusable templates and importer rules, not event-specific patches. Preserve public/private boundaries. Do not add Pokémon Track/Follow controls to Today or Event Details.

## Current sprint — Release stabilisation (Sprint 1)
**Objective:** close data and CI reliability gaps, then produce an evidence-based release-blocker list.

- [x] PR #426: parallel browser shards, WebKit cache and research reward-name correction; merged after green CI
- [ ] PR #427: Minior Showers research regression; rebase/update against merged #426 and pass CI
- [ ] Regenerate and verify event-details data for source-backed Minior Leonid/Orionids research (never invent tasks)
- [ ] Audit importer identity joins, source freshness, timezone/DST, recurring events and future-event coverage
- [ ] Verify form-specific Pokémon artwork (crowned Zacian/Zamazenta, Dynamax/Gigantamax), fallback behavior and raid rotations
- [ ] Review CI, source freshness, artwork and coverage checks for automated scheduling and actionable reporting
- [ ] Classify remaining whole-app defects as P0/P1/P2 with evidence and owners

**Exit:** all critical tests green, reproducible source-backed data, no untriaged P0 issues, release candidate scope frozen.

## Parallel workstreams (phases overlap; not calendar weeks)

| Phase | Scope | Exit evidence | Parallel with |
| --- | --- | --- | --- |
| 1. Foundation | Importer accuracy, identity, sources, CI, coverage and tests | Green checks; importer output verified | 2, 3 |
| 2. Core completion | Today, Event Details, Schedule, Raids, Research, GO Pass, Collection | Main user journeys tested with real data | 1, 3 |
| 3. Premium UX | PokeRadar-inspired event cards, compact Pokémon grids, shiny boosts, GO Pass stages, mobile navigation, correct artwork | Screenshots and mobile accessibility review | 1, 2 |
| 4. Release candidate | End-to-end regression, privacy, deployment, iPhone/PWA and production checks | Verified deployed release and acceptance checklist | Final fixes from 1–3 |
| 5. Post-release | Optional animations, additional refinements, deeper history and enhancements | Tracked backlog, no release dependency | After release |

## Release gates
**P0 blocker:** core crash/blank critical screen; inaccurate essential event times, identity or research; public/private exposure; missing essential raid or Pokémon form information; broken importer; required CI failures; severe mobile usability regression.

**P1 important:** incomplete verified content, inconsistent card hierarchy, incorrect noncritical artwork, accessibility or navigation friction. Fix in parallel where feasible; only promote to P0 with evidence.

**P2 deferred:** decorative animations, optional filters, secondary polish, expanded historical details, nonessential badges and further speed optimisations. Do not delay release for P2.

## Delegation
- **CI/QA lane:** unit tests, browser shards, WebKit, image audit and failure triage.
- **Data lane:** source reconciliation, research extraction, raid schedule, shiny boosts and coverage reports.
- **Visual lane:** artwork form mapping, mobile screenshots, layout/accessibility review.
- **Release lead:** triage, acceptance, conflict resolution, merge/deploy verification.
- Separate branches and bounded PRs; no competing writes to one branch. Automated checks are not autonomous coding agents. Never claim agents or scheduled checks exist without verifying configuration.

## Daily operating loop
1. Read open PRs, current CI and [release issue #428](https://github.com/Wood468/crispy-barnacle/issues/428).
2. Select highest-risk P0 and independent P1 work; batch related fixes.
3. Commit with regression tests; run/observe CI. Continue independent work while jobs run.
4. Merge only after applicable checks pass and authorisation is in place; verify deployment separately.
5. Report: completed commit/PR, tests, merged/deployed/live state, next task, any user action.
6. Move P2 ideas to backlog without reopening release scope.

## Sources of truth
- [Release coordination issue #428](https://github.com/Wood468/crispy-barnacle/issues/428): blockers and deferred scope.
- [Detailed historical roadmap](ROADMAP.md): prior milestones and context.
- [Pull requests](https://github.com/Wood468/crispy-barnacle/pulls) and [Actions](https://github.com/Wood468/crispy-barnacle/actions): actual implementation and test status.
- [Production site](https://pogo.michaelpuff.com): live verification, not inferred from merges.

**Definition of done:** reliable and accurate core workflows, consistent premium mobile experience, green required tests, verified production deployment, and no open P0 blockers.