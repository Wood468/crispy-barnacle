# GO Field Notes — Product Transformation Plan

Prepared 5 November 2026. This plan separates product delivery from repository and automation health.

## Product outcome
Build a premium, mobile-first Pokémon GO companion that quickly answers:
- What matters today, what is live, starting next or ending soon?
- Which events matter to this player's collection?
- What are the exact research tasks, rewards, shiny boosts, debuts, costume variants, bonuses and raid/Max rotations?
- What is happening at real-world events worldwide, in the correct local time, and where?
- What should the player track and prepare for?

The experience should be calm, polished, visually rich only where useful, compact to scan, accessible, fast and reliable on phone, tablet and desktop.

## Existing foundations observed on main
- Static mobile-first PWA shell and persistent section navigation.
- Today view with daily overview, live shiny panel, next/ending/raid focus, agenda, personal relevance and future-event groupings.
- Event timeline, search and filters; separate research and in-person/world views.
- Dedicated raids, collection/Dex, season/GO Pass, infographic and event-detail modules.
- Established dark-first CSS token system, local artwork pipeline, service worker, local state and PIN-gated sync.
- Source diagnostics and importer/test workflows.

These are source-code observations, not proof that every path has been verified on a physical device.

## Risks to validate before redesign
1. Dashboard bootstrap still reads /data.json and /art/index.json. Do not assume the D1/source pipeline is the live source of truth.
2. Event time-zone semantics, structured event signals, special-form artwork, account/persistence and offline behaviour need current-state verification. An earlier October audit raised these issues.
3. A four-claim shiny scorecard is not a whole-app completeness score. ScrapedDuck parity does not prove research, bonuses, shiny odds, costume variants or rewards are complete.
4. Twilight Wishes was officially announced, but the last reviewed main data still described it as having no details; its four costume variants were absent from the costume mapping.
5. GO Pass parser PR #324 is draft/unmerged. It is not a shipped GO Pass experience until integrated into the UI and tested.

## Non-negotiable product rules
- Truth before decoration: every claim has provenance and confidence (official, trusted community, datamined, unverified).
- Distinguish shiny available, newly released shiny, boosted odds and shiny-eligible costume/form.
- Show “local time wherever you play” for worldwide-local events. Show venue-local time only when its IANA zone is known; preserve UTC references for UTC-defined events.
- Show the actual special form/costume artwork. Never imply normal artwork represents a special form.
- Scan first, expand second. Prioritise concise facts and expandable detail.
- One-handed mobile use, stable bottom navigation, safe areas, 44px-class touch targets and no nested-scroll traps.
- Published raid rotations are not live gym sightings; community hotspot pins are not proof of active players.
- Preserve player data. No destructive migration or sync/security change without a reviewed backup and recovery plan.
- Show cached/live status and data freshness honestly.
- Every release has acceptance criteria, tests, preview verification and production smoke-test evidence.

## Delivery phases

### 1 — Current-state product audit
Inventory every primary tab, subview, interaction, data source and persistence path. Compare production with main; capture mobile/tablet/desktop states; identify broken, duplicate, empty, stale, misleading and overly long UI. Produce an experience map and prioritised defects with evidence and acceptance criteria.
**Exit:** no view is called complete merely because code exists; high-priority findings are reproducible.

### 2 — Today and Schedule
Make Today a concise decision surface: live now, next up, ending soon, today's published raid/Max rotation, live shiny boosts and personal priorities. Add “new since your last visit”. Make Schedule coherent and scannable, with useful filters and international in-person events visible. Standardise event-card hierarchy.
**Exit:** representative fixtures pass at 320/375/390/430px, tablet and desktop without critical overflow or misleading statuses.

### 3 — Event intelligence
Build structured event detail for featured Pokémon, debuts, shiny availability/boosts, costumes, bonuses, research, eggs, raids, Max Battles, moves, tickets and rewards. Show GO Pass progression visually. Provide event research and a separate active-research view. Map costume artwork to exact variants. Show sources and last verification.
**Exit:** completeness is field-based; parser failures preserve last-known-good data and never invent rewards.

### 4 — Collection and personalisation
Preserve Dex and generation completion. Improve shiny, Mega, Dynamax and Gigantamax tracking without introducing costume collection tracking as a default. Use collection state to prioritise relevant events, research and raid preparation. Keep account/sync redesign separate until privacy, export, delete and recovery are specified.
**Exit:** marks persist; special-form labels and artwork are accurate; no marks are lost.

### 5 — Quality and release
Test iOS Safari/PWA, Android Chrome, tablet and desktop; install/update/back navigation/safe areas; offline shell and stale-data messaging; accessibility; critical end-to-end flows; preview API failures; performance and data freshness. Ship reversible releases with rollback notes.
**Exit:** automated and device-level QA evidence exists.

## Priority order
| Priority | Work | Completion evidence |
|---|---|---|
| P0 | Current-state audit | View inventory, screenshots, defects and acceptance criteria |
| P0 | Event truth/completeness model | Field coverage and provenance rules |
| P1 | Today hierarchy | Before/after mobile QA and task-based checks |
| P1 | Schedule and event cards | Responsive regression fixtures |
| P1 | GO Pass, research, shiny and costume detail | Source-to-UI examples |
| P2 | Collection personalisation | Collection-aware recommendations and persistence tests |
| P2 | Offline, accessibility and performance | QA report |

## Reporting standard
Every update must separate shipped (merged/deployed user-visible change), verified (tests/environments actually checked), in progress (specific artifact/code), blocked (exact dependency), and next deliverable. Workflow health is not product progress. Draft PRs are not shipped. Never claim device QA without performing it.

## First implementation target
Complete the current-state audit, then deliver a focused Today/Schedule improvement with visual regression fixtures. Do not start another monitoring workflow as the next product task.

## Scope boundaries
No full rewrite/framework migration; no enabling production D1, migrations, secrets, cron or sync-security changes as part of visual work; no deleting regional/partner/GO Pass events just because a third-party feed omits them; no unsupported claims about odds, event details, active raids, player density or coordinates; no production deploy before preview and smoke-test evidence.
