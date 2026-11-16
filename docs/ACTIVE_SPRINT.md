# GO Field Notes — Active Sprint and Release Roadmap

> Operational roadmap. Last reviewed **16 November 2026** against `main` at `67d3082`. **Always check GitHub PRs, Actions and production before treating any status here as current.** Detailed historical work remains in [ROADMAP.md](ROADMAP.md). How data reaches the app is in [DATA_FLOW.md](DATA_FLOW.md).

## North star
Ship a complete, reliable, premium mobile-first Pokémon GO companion with trustworthy source-backed events, research, raids, shiny boosts, GO Pass, Schedule and Collection. Future events must work through reusable templates and importer rules, not event-specific patches. Preserve public/private boundaries. Do not add Pokémon Track/Follow controls to Today or Event Details.

## Evidence ladder (use these words, and only for what was actually checked)
implemented → committed → CI (checks passed on the exact head) → reviewed → merged → deployed → production-verified. A later rung is never implied by an earlier one. In particular, **merged is not deployed, and deployed is not production-verified**, and nothing below claims physical-device (iPhone/PWA) verification.

## Current release status (16 November 2026)

- **Foundation (Phase 1) was accepted on 11 November** as a milestone (importer identity, sources, CI, coverage). It is not a claim that the whole release is complete. Its evidence is kept in git history of this file and in [ROADMAP.md](ROADMAP.md).
- **Release issue [#428](https://github.com/Wood468/crispy-barnacle/issues/428)** was shown as closed by GitHub when this was written. Treat that as bookkeeping only: it is **not** evidence of device/PWA acceptance, and this document does not claim release acceptance.
- **Merged to `main` since 11 November (all merge timestamps 15 November 2026 UTC; state = merged, per GitHub):** CI results for each PR are on its page; deployment and production state are **not** asserted here.
- **No physical-device or production verification is claimed** for any item below. Phone checks are pending (see Pending owner actions).

### What shipped (merged) 11–16 November

| Area | PRs | Summary |
| --- | --- | --- |
| Store completeness | [#799](https://github.com/Wood468/crispy-barnacle/pull/799) | Current vs historical offers, regional estimates, safe artwork provenance |
| Research retention | [#820](https://github.com/Wood468/crispy-barnacle/pull/820)–[#823](https://github.com/Wood468/crispy-barnacle/pull/823) | #822/#823: published research is retained when extraction health is unproven and unrecognised research is "unknown, not removed", with retention diagnostics; #820 rejects non-standard publisher ports before facet eligibility; #821 preserves explicit Gigantamax event-day artwork identity |
| Store currency | [#824](https://github.com/Wood468/crispy-barnacle/pull/824) | Store watch accepts listings when the page exposes no currency (no false missing-currency hold) |
| Importer research parsing and explicit denial | [#825](https://github.com/Wood468/crispy-barnacle/pull/825), [#826](https://github.com/Wood468/crispy-barnacle/pull/826), [#830](https://github.com/Wood468/crispy-barnacle/pull/830), [#831](https://github.com/Wood468/crispy-barnacle/pull/831) | Tolerant Hub timed-research parsing with markup diagnostics; an event's own explicit "no research" page confirms removal of retained research; past-tense "was only available" accepted as denial; main-content research keywords and denial diagnostics in the report |
| iOS status bar | [#827](https://github.com/Wood468/crispy-barnacle/pull/827) | Opaque safe-area top mask for the status-bar overlap (implemented/merged; **not phone-verified**) |
| Minimal Store cards | [#828](https://github.com/Wood468/crispy-barnacle/pull/828) | Name, exact image and region prices only |
| Dedupe and Dynamax art | [#829](https://github.com/Wood468/crispy-barnacle/pull/829) | Live and curated Community Day twins merged on Today/Schedule; compact cards (e.g. Dynamax Trails) show the exact official banner or no blank art slot |
| Owner AU prices | [#832](https://github.com/Wood468/crispy-barnacle/pull/832) | Validated owner-supplied A$ path (`scripts/store-au-owner.mjs`, [store-au-owner-prices.md](store-au-owner-prices.md)) |
| Niantic Store images | [#833](https://github.com/Wood468/crispy-barnacle/pull/833) | Item images on exact-match Store cards; `img-src` allows `assets.pgo.webstore.nianticlabs.com` (**owner-approved** exact host) |
| CI / pipeline fixes | [#834](https://github.com/Wood468/crispy-barnacle/pull/834), [#835](https://github.com/Wood468/crispy-barnacle/pull/835), [#838](https://github.com/Wood468/crispy-barnacle/pull/838), [#839](https://github.com/Wood468/crispy-barnacle/pull/839) | #834 research-emptying test requires source-denies evidence; #835 ended events keep published research and Into the Wild tasks restored; #838 artwork-manifest checksums recorded for newly mirrored pictures; #839 manifest validity test is count-agnostic |
| Raids lower tiers | [#836](https://github.com/Wood468/crispy-barnacle/pull/836), [#837](https://github.com/Wood468/crispy-barnacle/pull/837) | Every pending lower tier is named; 1-3 star bosses filled daily; Leek Duck as a second source for 1-3 star and Shadow tiers |
| Bold A$ | [#840](https://github.com/Wood468/crispy-barnacle/pull/840) | Converted A$ is the bold price, local currency secondary |

## Open and parked items

| Item | State | Needs |
| --- | --- | --- |
| [#598](https://github.com/Wood468/crispy-barnacle/pull/598) Collection (canonical identities, National Dex, private inventory) | **Parked** | Scope decision after release |
| [#760](https://github.com/Wood468/crispy-barnacle/pull/760) and [#768](https://github.com/Wood468/crispy-barnacle/pull/768) CSP / browser-header drafts | Draft | **Owner approval** and preview-header evidence from a real Cloudflare preview before any merge |
| [#800](https://github.com/Wood468/crispy-barnacle/pull/800) Store current-only listings and pictograms | **Parked** (draft) | Re-scope against the merged Store work (#799, #828) before any reuse |
| [#669](https://github.com/Wood468/crispy-barnacle/pull/669) Official ticket claims linked to exact events | **Deferred** (draft) | Post-release |
| GO Pass [#612](https://github.com/Wood468/crispy-barnacle/pull/612) / [#613](https://github.com/Wood468/crispy-barnacle/pull/613) | Open | **After release** |
| GO Aider worker pilot | Not a release gate | See Worker lane below |
| Other open PRs not triaged in this refresh | e.g. [#748](https://github.com/Wood468/crispy-barnacle/pull/748), [#568](https://github.com/Wood468/crispy-barnacle/pull/568) | Check on GitHub |

## Pending owner actions
- **A$ price screenshots / readings** from the Australian Web Store, to feed `data/au-store-input.json` and `scripts/store-au-owner.mjs` (the US CI runner cannot see A$).
- **Phone checks (not yet done, so nothing is claimed):** Today, Store, Raids (Battle), and the iOS status-bar mask from #827, on a real iPhone/PWA. Use [IPHONE_PWA_VERIFICATION.md](IPHONE_PWA_VERIFICATION.md).
- Approve or decline the CSP drafts (#760/#768) when preview-header evidence exists.

## Post-release backlog (suggestions; do not start before release without permission)
- Go info header safe-area handling.
- Store snapshot **staleness alert** (Telegram System message when held or unchanged for hours).
- **Pin the Playwright version** in `store-watch.yml`.
- **Large-drop owner-approval path** for Store holds.
- **AU price automation via the home server** (PR-only, still through `store-au-owner.mjs` validation).
- **Leek Duck raid parser live verification** (second source from #837 is fixture-tested).
- Make remaining tests data-agnostic (see [DATA_FLOW.md](DATA_FLOW.md) section (e)).

## How the importer handles research (short note)
Source: `scripts/importer/run.mjs` (retention contract above `RETENTION_CONFIRM_DAYS`).
1. If a source was not fetched, is incomplete or truncated, the previously published research is **retained** (unknown is not removed).
2. A fully read page where nothing is recognised is also retained on first sight (stamped `researchRetainedAt`), and dropped only after the same "none" persists for 7 days.
3. An event's **own** page that explicitly says there is no timed research confirms removal immediately, if every other source is healthy.
4. **Ended events keep** their published research when sources merely disappear; positive removal evidence still drops it.
5. Every decision and reason is written to `data/importer-report.json` (`researchRetention`).

## Active work lanes
- **Phase 2:** complete real-data journeys and remaining core features (Today, Schedule, Research, Battle, Store, GO Pass).
- **Phase 3:** premium artwork cards, accessible event hierarchy, egg markers, visual inspection. A new verified, material identity/artwork bug is P1 or P0 by severity, not a reason to reopen all foundation contracts.
- **Phase 4:** exact-head required CI, production deployment, mobile Safari/PWA/offline checks, public/private regression, release acceptance. Preserve previously validated data if a later importer/source refresh fails.
- **Worker lane:** GO Aider is not a release gate. Its earlier test-only queue attempt (#475) failed and was marked needs-review; editing/queue/publishing were disabled and approval withdrawn. A pilot is not blocking app completion.

**Release acceptance:** complete importer regeneration with preserved research/forms/dates; passing required merge and main CI on the exact head; no known critical false encounter cards, blank core screens or private-data leakage; successful live mobile/PWA check against the deployed build. If a gate fails, keep previous validated data, triage logs and continue other independent tasks. Never mark the overall release done while exact-head CI or device/PWA production acceptance is outstanding.

### P1, P2 and later decisions
- **P1 parallel:** complete verified event information and exact artwork without expanding scope; audit source freshness, mobile accessibility and major-screen hierarchy. Keep overseas in-person events visible on Today.
- **Deferred notification preference — [#452](https://github.com/Wood468/crispy-barnacle/issues/452):** decide Telegram system topic versus opted-in PWA push **after** current correctness gates. Alert only on actionable source-backed information that cannot be mapped/rendered; do not expose private diagnostics publicly.
- **P2:** optional animation, speculative data and decoration. No Track/Follow controls on Today or Event Details.

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