# GO Field Notes — source and data audit for UX redesign

**Reviewed:** 28 October 2026  
**Repository:** `Wood468/crispy-barnacle`  
**Baseline inspected:** current `main` source tree  
**Redesign branch:** `redesign/ux-blueprint`  
**Purpose:** Identify existing capabilities and dependencies before UI changes. This is a source-level audit, not a live database inspection or production deployment.

## Executive summary

The app already contains substantial product logic and a meaningful data pipeline. The redesign should be a careful restructuring of the interface, not a rewrite of the event, collection or infographic systems.

Most importantly, the infographic approval workflow is real, multi-stage and tested. It must be preserved as an owner/maintainer workflow. The current season/pass component already displays both days remaining and progress; the redesign must retain both.

## Confirmed source map

| Capability | Current source / data | Audit finding |
|---|---|---|
| Main shell and tabs | `public/index.html`, `public/styles.css` | Header, five-tab navigation and large Today section are statically defined. |
| Main event model and rendering | `public/dash.js` | Shared event model feeds priority, timeline, opportunities and saved views. |
| Legacy/static event rendering and app boot | `public/app.js` | Loads data and artwork; contains other app sections and interaction wiring. |
| Season / GO Pass cards | `public/season.js`, `public/season.json` | Already shows remaining days, progress percentage and GO Pass week label. |
| Infographic viewer | `public/infographic.js` | Loads published event info and approved-but-not-yet-published images; refresh/check interaction. |
| Infographic queue | `public/infographic-queue.json` | Generated queue consumed by the viewer/review workflow. |
| Infographic decision API | `src/worker.js` | D1-backed decisions; public read of IDs/status/event names; PIN-protected writes. |
| Infographic discovery | `scripts/g47ix-infographics.mjs` | Discovery workflow for candidate images. |
| Infographic matching and publishing | `scripts/g47ix-publish.mjs`, `scripts/g47ix-apply.mjs` | Match scoring, human verification, approval application, event linking and archive updates. |
| Infographic registry | `data/g47ix-infographics-review.json` | Persistent candidate/review state in the repository workflow. |
| Infographic schedule | `.github/workflows/g47ix-infographics.yml` | Automated discovery/publishing workflow. |
| User accounts | `public/account.js`, `src/auth.js` | Invite-only accounts and owner/member distinction; personal marks remain separate from shared events/infographics. |
| Personal state | `src/userstate.js`, `migrations/0002_user_state.sql` | Personal Dex and related marks are stored separately from shared event data. |
| Screenshot import | `public/index.html` plus importer scripts | On-device recognition and explicit approval before applying changes. |
| Event source pipeline | `src/pipeline.js`, `src/worker.js`, `migrations/0001_source_pipeline.sql` | Source aggregation, validation, conflicts and freshness state. |
| Telegram / Discord intake | `src/jobs.js`, `src/worker.js`, `src/telegram.js` and related workflows | Discord images can be forwarded to Telegram; intake and publishing are separate stages. |
| Tests | `test/infographic-ui.test.mjs`, `test/g47ix-infographics.test.mjs`, `test/g47ix-publish.test.mjs`, plus broader suite | Existing regression tests cover important infographic and UI behaviour. |

## High-priority findings

### 1. Season and GO Pass countdowns are already implemented

`public/season.js` reads `public/season.json`, selects active season/pass entries and computes:
- days remaining using the end timestamp;
- elapsed progress percentage;
- GO Pass week number / total weeks.

The screenshot's countdown and progress are therefore supported by the current implementation. This is not a new feature request or a data-model gap. Preserve the existing behaviour while redesigning its layout. Add tests for boundary cases (less than 24 hours, expiry, DST/timezone boundaries, invalid timestamps) before changing date calculations.

### 2. Infographic review is a protected publishing workflow

The current backend documents the intended contract directly: the owner approves or rejects pictures; the nightly publishing job reads those decisions; reads expose IDs and event names; writes require the sync PIN.

The decision API validates identifiers and a fixed set of statuses. Approval stores event IDs and titles and supports one infographic being linked to multiple events. The review system therefore cannot be reduced to a simple "show linked pictures" page.

The publishing tests explicitly cover:
- uncertain matches requiring human verification;
- proposed updates remaining pending rather than replacing an approved image;
- applying an approved image to an event;
- rejected candidates being dropped from event links;
- one infographic being linked to multiple events;
- unlinking one or all event links;
- weekly/monthly infographic classification;
- Discord candidates and image history.

**Design decision:** Keep a dedicated owner-only Infographic Review workflow in an Owner tools / Maintenance area. Keep the public infographic archive and event-linked infographic viewing in normal player experiences. These are related but different tasks.

### 3. Approved images can be visible before the next publish run

`public/infographic.js` loads the generated queue and the decision API. Approved decisions whose images have not yet been attached by the scheduled publishing job can be shown on the event immediately. This avoids a gap between a manual approval and the next publish cycle.

Do not remove this fast path during redesign. Preserve fallback behaviour when a refresh fails; existing UI tests verify that a failed refresh does not wipe already loaded infographic data.

### 4. Discord/Telegram are part of the intake chain

The Worker jobs include a Discord image forwarder that sends new images to Telegram. The publishing pipeline tracks which Discord message became which Telegram message so later suggestion steps can edit the existing message rather than send duplicates. The infographic intake/review flow therefore has dependencies beyond the visible "Check Discord now" control.

Before moving or replacing that control, trace the relevant scheduled workflows and Telegram bot handshake. A manual refresh action may be useful for the owner, but it is not the whole intake system.

### 5. Today is structurally long by design

The current `public/index.html` Today section includes:
- shiny hunting;
- season bar;
- weekly/monthly infographic area;
- Today;
- For you;
- purchase planner;
- This week;
- Next week;
- Later this month.

`public/season.js` separately creates a seven-day Week Ahead strip. This explains why the rendered Today experience is long and why the same event can be encountered through multiple time-horizon modules.

The redesign should consolidate the Today briefing, not delete the underlying data or Schedule views. Keep Schedule comprehensive and make Today selective.

### 6. Event model already includes deduplication and source trust

`public/dash.js` maps curated data and pipeline data into a common event model, normalises event status/source, and includes live-event deduplication when two source reports describe the same event. Priority ranking excludes unannounced/disputed rumours from urgent items.

Preserve this trust model. Do not collapse confirmed schedule, community-reported items, conflicts and datamined discoveries into one undifferentiated list. Also distinguish true separate events (such as a Raid Hour) from duplicate reports for one event.

### 7. Collection data is personal and account-aware

`public/account.js` and `src/userstate.js` support invite-only accounts and an owner/member distinction. The account UI describes Dex and related marks as private per account, while events and infographics are shared. Any Collection redesign must preserve this separation and must not migrate personal marks into shared event data.

The screenshot import copy also establishes a safety contract: recognition occurs on the phone; images are not uploaded; changes are not applied until approval; screenshots can only add Have and cannot mark Pokémon as missing. Preserve that behaviour.

## Risks and implementation constraints

1. **Do not replace the event model** just to change navigation. First make a screen-to-model map and reuse existing event IDs, aliases and canonical data.
2. **Do not change the infographic decision schema casually.** Status strings, multi-event IDs, titles and D1 persistence are used by the publishing scripts.
3. **Do not expose owner tools to ordinary members.** Retain the existing PIN/role protections; verify the current owner/member UI and server enforcement before any access-control changes.
4. **Do not make infographic review purely client-side.** Approval decisions must continue to be validated and persisted server-side.
5. **Do not remove scheduled automation** while relocating manual controls. Inspect workflow schedules, secrets references and Worker jobs before edits.
6. **Do not break the static/Worker split.** The project uses static files and a Cloudflare Worker API; the redesign should preserve the no-build/plain-JS architecture unless there is a separately approved technical reason to change it.
7. **Do not infer that all repository JSON is live.** Static snapshots, D1 state, scheduled workflow outputs and runtime API responses have different freshness and authority.

## Recommended feature disposition

| Feature | Decision | Placement |
|---|---|---|
| Season / GO Pass countdown + progress | Keep, refine | Compact top-of-Today progress modules |
| Public event infographics | Keep | Event details and infographic archive |
| Owner infographic approval queue | Keep, protect | Owner tools → Infographic Review |
| Linked infographic archive | Keep | Player-facing archive |
| Weekly/monthly infographic curation | Keep | Owner review tools; compact player-facing previews |
| Discord/Telegram intake | Keep | Background pipeline; owner maintenance status/action |
| Event source freshness/conflict status | Keep, improve clarity | Schedule/event detail and source status |
| Screenshot import approval | Keep | Collection → Import |
| Purchase planner | Move, don't delete | Relevant event details/planning |
| Full long-range Today sections | Consolidate | Schedule |
| Saved event/Pokémon state | Keep | Global Saved utility |
| Account/private marks | Keep | Settings/account and Collection |

## Audit limitations / next verification

- This audit inspected repository source and tests on `main`; it did not query the production D1 database or secrets.
- It did not run the GitHub Actions workflows or the Cloudflare Worker.
- It did not inspect the live owner session or the actual contents of the current production review queue.
- The full UI route and menu wiring for the owner review controls still needs a focused pass through `public/infographic.js`, the review UI module and associated tests before implementation.
- Season/pass timestamps are visible in the checked-in JSON snapshot; verify the production refresh path and freshness before treating the snapshot as current.

## Next engineering sequence

1. Map every current route, tab, submenu and owner-only view to its source file and data/API contract.
2. Write a feature migration matrix with explicit keep/move/combine/retire decisions.
3. Build the new shell and Today/Schedule layouts on the redesign branch, preserving IDs and API contracts.
4. Relocate—not remove—the owner infographic review and its queue counts/actions.
5. Add countdown boundary tests and infographic approval regression tests before changing those modules.
6. Run the full test suite and inspect the preview build on iPhone, tablet and desktop.
7. Only propose a production merge after user review.
