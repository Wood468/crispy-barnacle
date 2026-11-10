# GO Field Notes — Active Sprint and Release Roadmap

> Operational roadmap. Last reviewed 11 November 2026. **Always check GitHub PRs, Actions and production before treating any status here as current.** Detailed historical work remains in [ROADMAP.md](ROADMAP.md).

## North star
Ship a complete, reliable, premium mobile-first Pokémon GO companion with trustworthy source-backed events, research, raids, shiny boosts, GO Pass, Schedule and Collection. Future events must work through reusable templates and importer rules, not event-specific patches. Preserve public/private boundaries. Do not add Pokémon Track/Follow controls to Today or Event Details.

## Current sprint — Release acceptance and importer integrity (11 November 2026)

**Release goal:** accurate reusable event records, working Today/Event Details/Battle/Schedule/Research/GO Pass/Collection, green required CI and verified production. Issue [#428](https://github.com/Wood468/crispy-barnacle/issues/428), open PRs and current GitHub Actions outrank this handoff; **these are observations, not deployment claims**.

### Recently merged work (do not recreate)
- **#441 / #443:** exact-form artwork QA and mobile production user-journey checks.
- **#442:** self-recovery for stalled hourly import runs.
- **#444:** Roaming Gimmighoul Coin Bag, egg-distance artwork and date-specific GO Wild raid cards; subsequent live QA found a separate fallback-route regression.
- **#445 / #447:** regenerate after importer/contract changes, validate the generated output before commit, preserve rejected snapshots for diagnostics.
- **#446:** day-specific Mighty encounters and hourly Wild Area habitats in reusable Event Details components.
- **#448 / #449:** preserve official event windows, Minior research and full source-backed dates across duplicate records.
- Earlier foundation #426, #430, #431, #433, #434, #437 and #438 are already merged; use the release tracker for details.

### Current P0 work (independent ownership; avoid overlapping branches)
1. **Importer exact-form preservation — [#453](https://github.com/Wood468/crispy-barnacle/pull/453).** A real refresh of main `95c3e4da` ([run 42904661195](https://github.com/Wood468/crispy-barnacle/actions/runs/42904661195)) failed the strict source-backed Crowned and Dynamax form checks; the workflow stopped before committing generated data. Test a fresh end-to-end importer run after #453, not just synthetic unit tests. Preserve Minior task/reward/source URLs and 6–8 November Mexico City dates too.
2. **Registry-only Event Details source join — [#451](https://github.com/Wood468/crispy-barnacle/pull/451).** Live post-#444 QA found 12 egg tiles instead of the four sourced Wild Area Global 10 km hatches when an event opened outside Today/Schedule's visible list. The fix uses canonical curated `detailIds`, without fuzzy title matches. Do not weaken the egg-count assertion.
3. **Production-only QA — [#450](https://github.com/Wood468/crispy-barnacle/pull/450).** Read-only 360/390/430px live WebKit/Chromium acceptance should verify four correct egg images, Saturday/Sunday raid differences, Roaming Gimmighoul and exact-form artwork after approved deployment. Initial live failure is evidence of the real bug, not a test to suppress.
4. **Release gate — [#428](https://github.com/Wood468/crispy-barnacle/issues/428).** Required JS/Python/browser A–E/WebKit/CodeQL/Cloudflare checks must be green on the actual merge heads. Confirm production deployment and critical user journeys separately. Do not confuse a Cloudflare preview with live production or assert the importer is fixed until regenerated output is verified.

### P1, P2 and later decisions
- **P1 parallel:** complete verified event information and exact artwork without expanding scope; audit source freshness, mobile accessibility and major-screen hierarchy. Keep overseas in-person events visible on Today.
- **Deferred notification preference — [#452](https://github.com/Wood468/crispy-barnacle/issues/452):** decide Telegram system topic versus opted-in PWA push **after** current correctness gates. Neither new alert channel is verified for this use case. Alert only on actionable source-backed information that cannot be mapped/rendered, deduplicated with evidence; do not expose private diagnostics publicly.
- **P2:** optional animation, speculative data and decoration. No Track/Follow controls on Today or Event Details.

**Release acceptance:** complete importer regeneration with preserved research/forms/dates; passing required merge and main CI; no known critical false encounter cards, blank core screens or private-data leakage; successful live mobile/PWA check against the deployed build. If a gate fails, keep previous validated data, triage its logs and continue other independent tasks.

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