# GO Field Notes — Phase 2 Core Experience Execution

> Established 11 November 2026. This document coordinates **multiple ChatGPT workstreams and GO Aider**, not a promise that an unassigned chat/worker is actually running. GitHub issues, open PR file lists, main, CI and deployment evidence override any snapshot here. Update owner/branch reservations before editing. Release tracker: [#428](https://github.com/Wood468/crispy-barnacle/issues/428).

## Mission and entry gate

**Finish the seven connected core experiences:** Today, Event Details, Schedule, Raids/Max Battles, Research, GO Pass and Collection. Prefer completing an accurate user journey over creating new features. Phase 1 foundation is accepted in [ACTIVE_SPRINT.md](ACTIVE_SPRINT.md), following real importer run [42968681082](https://github.com/Wood468/crispy-barnacle/actions/runs/42968681082) and production data-parity check [42970871140](https://github.com/Wood468/crispy-barnacle/actions/runs/42970871140). Do not reopen Phase 1 for historical fixed failures.

At the planning baseline main `fd10cb1`, [Tests 42977403874](https://github.com/Wood468/crispy-barnacle/actions/runs/42977403874) passed JS, Python, Chromium A–E and WebKit; image audit **skipped** on that push, not claimed green. [PR #503](https://github.com/Wood468/crispy-barnacle/pull/503) added real live multi-screen acceptance at 360/390/430px, and [#506](https://github.com/Wood468/crispy-barnacle/pull/506) checked 20px egg markers; both are merged. Automated viewport tests are not proof of physical iPhone Safari/PWA behaviour (Phase 4).

## Multi-chat allocation: four nonoverlapping lanes

| Lane / proposed coordinator | Ownership (reserve exact paths in your GitHub issue first) | Exit result |
| --- | --- | --- |
| A — Today + Schedule (ChatGPT workstream A) | Today cards, live boosts, countdowns, Done/Undo per occurrence, overseas visibility, week/calendar UX. Primary: `public/today.js`, `public/today-logic.js`, `public/today.css`; coordinate `public/dash.js`, `public/dash.css` with Collection before touching. | Today shows live/upcoming/boosts without noise; Schedule shows the same occurrence with accurate local dates and restores Done. |
| B — Event Details + Research (ChatGPT workstream B) | Universal Overview/Pokémon/Research/Bonuses, day/hour grouping, exact art and method, source-backed egg/encounter edges. Primary: `public/event-contract.js`, `public/event-adapter.js`, `public/event-components.js`, `public/detail.js`, `public/research.js`, `public/event-redesign.css`. | One future event schema works without one-off patches, source-backed rewards/roles/methods and egg pools render correctly. |
| C — Raids, Max Battles + GO Pass (ChatGPT workstream C) | Current/upcoming raid rotations, source-backed bosses, Max battle forms, illustrated free/Deluxe pass rank stages, deadlines. Primary: `public/season.js`, verified `public/season.json`, `public/event-encounter-rotations.js`, `public/raid-share.js`; reserve shared layout changes separately. | Correct live/upcoming battle windows, form artwork and linked Event Details; GO Pass ranks and reward ownership source-backed. |
| D — Collection + integration QA (this release-lead ChatGPT) | Cross-screen navigation, Dex loading/persistence, public/private boundary, live read-only viewport/accessibility and acceptance reports. Primary: `test/live_core_journey_qa.py`, related independent QA fixtures. **Coordinate any** `public/dash.js`/CSS edits with A. | All seven screens connected in real-data journeys, no critical blank state or broken navigation; defects routed to lane owner with reproducible evidence. |

These are **proposed lanes, not claims of assigned running agents**. Each ChatGPT chat should comment on the relevant issue with its owner alias, exact branch and file list before making changes. Claim a small set of paths, not an entire repository. Confirm current main and all open PR diffs every session; if claimed files overlap, stop and agree a handoff.

### Shared-file and stale-PR protections

- `public/index.html` and `public/sw.js` are **shared PWA integration assets**. Do not independently version-bump them on concurrent branches. Coordinate one final base-aware cache update per PR. GO Aider pilot [#505](https://github.com/Wood468/crispy-barnacle/issues/505) reserves these two paths if/when safely retried; while it is in needs-review, do not activate its queue or race the pilot.
- Existing open PRs [#395](https://github.com/Wood468/crispy-barnacle/pull/395), [#400](https://github.com/Wood468/crispy-barnacle/pull/400) and [#387](https://github.com/Wood468/crispy-barnacle/pull/387) all touch `public/event-components.js`; treat as stale potential collisions. Rebase/supersede or close only after comparing current main; never stack them blindly.
- Old research/avatar CI PRs #388–#391, artwork test #406, asset CI #419, regional Store #377/#386 and inventory #355/#356 need evidence-based disposition, not automatic inclusion in Phase 2. Store comparison is not a Phase 2 release blocker unless a current core journey actually breaks.
- Shared event IDs, device timezone, precise venue time, official source URLs, correct forms, overseas in-person Today cards, and **no Track/Follow controls on Today or Event Details** are invariant across lanes. No invented bonuses, shiny boosts, costs or Pokémon pools.

## Core-screen acceptance matrix

**A — Today + Schedule**
- Today first viewport: live event overview, confirmed live shiny-boost Pokémon gallery, upcoming next 24 hours, ending-soon/upcoming countdowns, compact GO Pass summary; overseas in-person events visible with explicit location.
- Major events = artwork cards; raids medium; minor/stamp activities compact rows; no long blank gaps or duplicate cards.
- Done hides only that event occurrence on Today and permits Undo/restore; the same event remains on Schedule. Across Melbourne DST and alternate device zones, upcoming/ending labels remain correct.
- Schedule defaults to **This week**, has calendar navigation and event-to-detail links, explicit local/venue clock where appropriate, sensible empty/loading states.

**B — Event Details + Research**
- Details open Overview first with navigable Pokémon, Research and Bonuses sections; compact three-column Pokémon artwork grid; verified encounter method, shiny/debut/boost labels; distinct daily and hourly wild/raid/Mighty/habitat pools.
- Egg gallery shows correctly sourced 2/5/7/10/12 km **small bare egg icon**, preserving exact distance in accessibility/details, never guessing distance for ambiguous pools. [Issue #491](https://github.com/Wood468/crispy-barnacle/issues/491): investigate per-encounter distance dropped by normalizer, preserve multiple valid same-species egg pools, add edge/provenance and browser tests. Do **not** edit event-component files simultaneously with open PRs listed above.
- Research: accurate source-backed individual task and reward quantity, repeated claimable tasks retained, current event groups available separately; no fabricated gaps or duplicate reward rows.
- Correct Crowned Sword/Shield, Roaming/Chest, Shadow and Dynamax/Gigantamax artwork; if unavailable, label a safe fallback rather than substitute an incorrect form.

**C — Raids + Max Battles + GO Pass**
- Readable present/next rotation windows, standard/Mega/Shadow and Max formats; event-local dates and linked Event Details, sourced forms and CP/shiny claims only.
- GO Pass current/active/upcoming states; compact Today card and accurate illustrated free/Deluxe rank ranges in Details. Into the Wild's rank 45 Dynamax Meltan and rank 100 Deluxe Silver Bottle Cap were already verified in live automated QA; do not duplicate those fixes.
- No fake player rank progression or unannounced reward tiles. Unknown information says more details pending.

**D — Collection + integration**
- Collection/Dex loads in public-safe state, handles empty/loading/error, persists existing player data through Today Done and navigation. No public spoofing/private API leakage.
- Real deployed site journey: Today → an actual Event Details record → Schedule → Research → Battle → GO Pass (when active) → Collection, with back/close links, source integrity, safe-area and touch-target checks; preserve read-only browser requests.
- Browser screenshots and explicit failures at 360/390/430px; 320px and actual hardware Safari/PWA/offline verification remain final Phase 4 gates. Never claim screenshots manually reviewed unless actually inspected.

## Worker lane — paused pending four-file safety gate

Actual observed Home Assistant add-on at planning time: **v0.5.12 installed, stopped, `job_action=queue_status`, queue/edit/publish flags OFF**. Worker task [#505](https://github.com/Wood468/crispy-barnacle/issues/505) has a **needs-review** durable ledger record after a failed four-file pilot; label not approved. DO NOT turn on `queue_loop`, restore credentials or retry/retire #505 without independent reviewed safeguards and pilot resolution. Worker capability owner issue [Go-aide-worker #23](https://github.com/Wood468/Go-aide-worker/issues/23).

Existing bounded future tasks [#476](https://github.com/Wood468/crispy-barnacle/issues/476) (Today timezone precedence, one test file) and [#485](https://github.com/Wood468/crispy-barnacle/issues/485) (egg distance unknown-pool regression, one test file) are **prepared but unapproved/unexecuted**; no duplicate issues while waiting. Upon successful worker pilot, revalidate actual current-main path availability, exact GO_WORKER_TASK_JSON and issue approval before enabling one serial task. Worker publishes drafts only; ChatGPT reviews code/diff/CI and handles eligible merges/deployments. Do not hold Phase 2 delivery for worker capability expansion.

## Bounded delivery order

1. **Now: resolve core correctness gaps**, starting with [#491](https://github.com/Wood468/crispy-barnacle/issues/491) egg edge metadata and any real latest-main P0. Split fixes by independent source/test paths and explicitly reserve shared PWA cache files.
2. **Run focused integrations in parallel**: A Today/Done/Schedule clock, B Event Details/research, C Battle/GO Pass, D Collection and navigation. Accept existing successful implementations rather than recreate them.
3. **Review and merge eligible PRs** one at a time when shared files overlap, with actual diff/security/reviews/conflicts and latest-head required JS/Python/Chromium/WebKit/artwork/CodeQL checks.
4. **Verify production separately** after actual Cloudflare deployment: source-backed content, no private links, real live screen journeys, screenshots and updated main SHA. New failures become scoped issues with owner and regression.
5. **Exit Phase 2** when core-screen acceptance above is complete and no known reproducible P0 remains; move optional style refinements to Phase 3 and final hardware Safari/PWA, security, deployment signoff to Phase 4. Do not turn optional P2 into blockers.

## Reporting contract

For each lane, maintain on [#428](https://github.com/Wood468/crispy-barnacle/issues/428): owner alias, branch/PR, reserved file list, actual failing/passing test IDs, review status, merge SHA, deployment run, production verification and next independent work. Only report verified states. At every new session recheck current main, open PRs, CI, this document and the worker's **live** installed safety state.
