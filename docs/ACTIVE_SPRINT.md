# GO Field Notes — Active Sprint and Release Roadmap

> Operational roadmap. Last reviewed 11 November 2026. **Always check GitHub PRs, Actions and production before treating any status here as current.** Detailed historical work remains in [ROADMAP.md](ROADMAP.md).

## North star
Ship a complete, reliable, premium mobile-first Pokémon GO companion with trustworthy source-backed events, research, raids, shiny boosts, GO Pass, Schedule and Collection. Future events must work through reusable templates and importer rules, not event-specific patches. Preserve public/private boundaries. Do not add Pokémon Track/Follow controls to Today or Event Details.

## Current sprint — Phase 1 foundation accepted; finish core and release verification (11 November 2026)

**Phase 1: COMPLETE for the verified 11 November foundation baseline.** This is a milestone acceptance, **not** a claim that the whole application/release #428 is complete. Always recheck actual GitHub CI and production for new commits.

### Phase 1 evidence (source-backed, independently verified)

- **Importer root cause corrected:** the old run [#42935062659](https://github.com/Wood468/crispy-barnacle/actions/runs/42935062659) stopped *before import* on stale hard-coded infographic-count tests; dynamic counts are now tested. [PR #495](https://github.com/Wood468/crispy-barnacle/pull/495) merged as `c0d37ae` after all 9 required checks; dedupe/research/form contract edits now trigger regeneration, excluding generated JSON to avoid loops.
- **Real regeneration succeeded:** [Event details importer #42968681082](https://github.com/Wood468/crispy-barnacle/actions/runs/42968681082) passed R2 restore, dedupe, fetch, source reconciliation, importer/research/form regression checks, validation and commit. [Generated commit `c5f989e`](https://github.com/Wood468/crispy-barnacle/commit/c5f989e74e8510b6907dceae37ca59c1175b80a8) refreshed `public/event-details.json` and `data/importer-report.json` at **2026-11-11T05:55:13.338Z**: 103 details records, 80 pages read, **zero reported importer errors**.
- **Essential identity/data retained:** both Minior events have eight source-attributed research tasks apiece, including separate 7,740 Stardust occurrences; verified Crowned, Dynamax and Roaming Gimmighoul identities, 64 world-event IDs and source-backed raid/egg/method detail retained. Before/after review of all 103 details records found no substantive record loss. Known fallback and source-join defects (#451/#444) have subsequent real production coverage.
- **Live data parity and public/privacy gate:** [PR #498](https://github.com/Wood468/crispy-barnacle/pull/498) merged as `2e5b2d1` after 9/9 CI plus CodeQL. The read-only [Site check #42970871140](https://github.com/Wood468/crispy-barnacle/actions/runs/42970871140) passed, including semantic equality of the deployed Event Details catalogue to validated main (ignoring timestamp-only changes) and the existing public/privacy checks.
- **Actual iPhone-width event acceptance:** [Live form and event QA #42968129055](https://github.com/Wood468/crispy-barnacle/actions/runs/42968129055) passed at 360/390/430px, checking Roaming Gimmighoul, exact Crowned art, four 10 km hatch icons, separate Saturday/Sunday raid bosses, 22+22 hour habitats, 9+9 daily Mighty and no horizontal overflow/browser errors. Source and form regression fixtures are retained.
- **Latest checked foundation merge-head CI:** [main Tests #42975512255](https://github.com/Wood468/crispy-barnacle/actions/runs/42975512255) passed JavaScript, Python, Chromium shards a–e and WebKit on `4db05ef9`; production-image-audit was explicitly skipped in that push run, **not counted as a pass**. The preceding change's [PR Tests #42974377492](https://github.com/Wood468/crispy-barnacle/actions/runs/42974377492) had a passing production image audit. Post-merge Site check #42975512231 passed. Current main has subsequently moved (e.g. #503): verify its separate checks, not silently inherit those statuses.

### Active next-phase work — do not reopen Phase 1 without a new reproducible P0

- **Phase 2:** complete/review real-data journeys and remaining core features. [PR #503](https://github.com/Wood468/crispy-barnacle/pull/503) merged, adding real read-only mobile Today, both active GO Passes, Schedule, Research, Battle and Collection with screenshots and actual rank 45 Dynamax Meltan / rank 100 Deluxe Silver Bottle Cap; verify any newer main-run checks.
- **Phase 3:** finish premium artwork cards, accessible event hierarchy, egg markers and visual inspection. A new verified, material identity/artwork bug is P1 or P0 by severity, not a reason to re-open all foundation contracts.
- **Phase 4:** complete latest-head required CI, production deployment, mobile Safari/PWA/offline, public/private regression and release #428 acceptance. Preserve successful previous validated data if a later importer/source refresh fails.
- **Worker lane:** GO Aider is not a release gate. Its #475 test-only queue attempt failed and was marked needs-review; editing/queue/publishing were disabled and approval withdrawn. Do not stall app completion for a worker capability upgrade.

**No remaining *known reproducible* Phase 1 importer/identity/data blocker as of this checkpoint.** Distinguish future newly observed P0 failures from deferred phase 2/3/4 work. Never mark the overall release done while required latest-main CI or device/PWA production acceptance is outstanding.

### P1, P2 and later decisions
- **P1 parallel:** complete verified event information and exact artwork without expanding scope; audit source freshness, mobile accessibility and major-screen hierarchy. Keep overseas in-person events visible on Today.
- **Deferred notification preference — [#452](https://github.com/Wood468/crispy-barnacle/issues/452):** decide Telegram system topic versus opted-in PWA push **after** current correctness gates. Neither new alert channel is verified for this use case. Alert only on actionable source-backed information that cannot be mapped/rendered, deduplicated with evidence; do not expose private diagnostics publicly.
- **P2:** optional animation, speculative data and decoration. No Track/Follow controls on Today or Event Details.

**Release acceptance:** complete importer regeneration with preserved research/forms/dates; passing required merge and main CI; no known critical false encounter cards, blank core screens or private-data leakage; successful live mobile/PWA check against the deployed build. If a gate fails, keep previous validated data, triage its logs and continue other independent tasks.

## Parallel workstreams (phases overlap; not calendar weeks)

| Phase | Scope | Exit evidence | Parallel with |
| --- | --- | --- | --- |
| 1. Foundation — **accepted 11 Nov 2026** | Importer accuracy, identity, sources, CI, coverage and tests | Real #42968681082 regeneration; validated output; live JSON parity; green foundation CI | 2, 3 |
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