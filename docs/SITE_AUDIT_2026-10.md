# GO Field Notes — Product and Data Audit
**Audit date:** 11 October 2026  
**Scope:** repository review of the mobile web app, data flow, source quality, visual UX, artwork, PWA/account model, and previously requested features. This is a source-code/repository audit; live production behaviour and real raid activity were not independently verified.

## Executive summary

GO Field Notes has a strong foundation: a plain-JavaScript Cloudflare Worker/static app, a mobile bottom tab bar, event and raid views, collection tracking, a PWA manifest, cached artwork, source methodology, and browser regression tests. It is not yet at the level of a dependable, fully data-connected companion app.

The biggest gap is **freshness and correctness of event data**, not the visual theme. The current dashboard bootstrap in `public/app.js` fetches `/data.json` and `/art/index.json`; it does not fetch `/api/events`. The source pipeline exists in the Worker but is deliberately disabled until explicitly run and configured. The UI therefore relies on a hand-maintained snapshot, even though source-pipeline endpoints exist. The JSON snapshot says it was current as of 9 Oct 2026, so changes can go stale between edits.

## Findings by priority

### P0 — Data freshness / source pipeline
- **Confirmed:** `public/app.js` starts with `fetch('/data.json')` and `fetch('/art/index.json')`; it does not consume the Worker event API.
- **Confirmed:** `src/worker.js` returns `enabled:false` from `/api/events` when pipeline tables are not initialized, with the note that the app uses `data.json`. The pipeline is documented as off unless `PIPELINE=1`.
- **Impact:** new events, corrections, raids, Max rotations and Twitch Drops can be missing until the static JSON is updated. Source freshness indicators do not fix the main dashboard's static dependency.
- **Safe next step:** use the read-only `/api/pipeline/preview` and source-health endpoints to evaluate the feed without writing to D1. Keep the production pipeline off until its source coverage, transformations, duplicate handling, previews and failure behavior have been audited. Do not create tables, run migrations, alter secrets, cron or production flags as part of this audit.
- **Data model gap:** `data.json` has start/end strings but no explicit IANA time-zone field or source-time convention per event. The UI parses timestamps in the device time zone. That is fine for events explicitly defined in the player's local time, but not sufficient for venue-local events or events published in UTC.

### P0 — Time-zone clarity
- The dashboard formats parsed JavaScript Dates in the device's local zone. API events can carry `tzMode === 'utc'`, but the current event display does not consistently show both the converted device time and the original UTC time.
- There is no general IANA `timeZone` field for regional/in-person events. Do not silently label a time as local to a venue unless that zone is actually known.
- **Recommendation:** standardise event time data as an ISO timestamp with an explicit offset/UTC plus an optional IANA zone (e.g. `America/New_York`). Show “Your time” as the primary time and “New York local” as secondary when venue zone is known. For worldwide-local events, state “local time wherever you play.” For UTC-defined events, show device-local conversion plus UTC reference. Test DST boundaries.

### P1 — Event card signals / bonus icons
- The card renderer can display `ev.bonuses`, and `public/app.js` contains a bonus icon system with artwork files for XP, candy, Stardust, eggs, incense, passes, trades and shiny. Coverage is incomplete: some bonus types fall back to generic SVGs; tags are not a full structured signal model.
- Debut and Shiny are currently mostly text tags, rather than a reliable per-feature signal. A Shiny tag may mean a new shiny, boosted shiny odds, or just shiny eligibility; those are materially different.
- **Recommendation:** model signals explicitly (e.g. `debut`, `new_shiny`, `shiny_available`, `boosted_shiny`, `costume`, `background`, `exclusive_move`, `catch_xp_multiplier`, `catch_candy_multiplier`, `stardust_multiplier`, `egg_distance_multiplier`, `trade_bonus`). Render a specific icon + concise label; never infer “new shiny” from a generic Shiny tag alone. Add icon coverage tests and a fallback audit.

### P1 — Pokémon artwork / forms
- Existing artwork paths use local `/art/` WebP assets where indexed, otherwise the Worker fetches PokeAPI official artwork. Costume assets can be requested from PokeMiners' game-asset mirror.
- The previous implementation treated a form label as a normal species in several places. PR #25 adds requests for Shadow and Dynamax-specific assets and keeps fallback artwork, but asset availability is not guaranteed and the app needs a visible audit of missing/special-form matches.
- **Recommendation:** add a form-aware asset resolver and a sprite gallery test set covering normal, shiny, Shadow, Dynamax, Gigantamax, Mega X/Y, Primal, regional forms and costume/background variants. Do not show a special-form badge if the sprite actually rendered is only the normal form. Track image failures rather than silently removing every image.
- **Asset sources:** PokeMiners publishes mined game assets; PokeAPI provides standard official-artwork sprites. These sources have different coverage and licensing/attribution considerations. Prefer actual game assets for special forms and bonus icons when available, with a clear attribution/source note.

### P1 — Raid rotation semantics
- The “This week” selector represents a calendar week, but the card previously displayed a rotation that ended Wednesday beside the current rotation without making historical/current status clear. PR #25 now labels the current rotation and marks earlier rotations.
- The rotation schedule is still a curated data source. It is not evidence that a specific gym has an active raid or a full lobby.

### P1 — Account and persistence
- The app has local state and a PIN-gated user-state sync API, but there is no conventional account/login experience visible in the shell. A shared PIN is not equivalent to an individual account with recovery and per-user access controls.
- **Recommendation:** decide whether a real account system is required before building on synced state. A secure account system needs an identity provider, per-user ownership checks, abuse/rate limits, export/delete flows and a clear privacy policy. Do not implement a superficial password form or migrate the database without a reviewed design.
- Current manifest enables standalone display and there is an Apple touch icon, but offline support appears limited: the service worker focuses on push notifications and does not implement an application-shell/data cache strategy. PWA installability and offline resilience should be tested on iOS Safari and Android Chrome.

### P1 — Mobile UX and accessibility
- Strengths: five persistent bottom tabs, dark visual system, large tap targets in many controls, safe-area-aware shell, event cards, filters and a mobile-first layout.
- Issues observed in user screenshots: grade panel layout spills its background, empty sections render as blank bars, ticket copy appears without ticket data, and long card content is cramped. PR #24 fixed these code paths and passed CI before merge.
- Keep the bottom navigation stable, ensure content scrolls above it, support iOS safe areas, prevent nested scrolling traps, add focus-visible styles, verify contrast and 44px touch targets, label icon-only controls, and test at 320/375/390/430px widths.
- Browser CI currently uses a static HTTP server, so it does not test Worker endpoints, Cloudflare bindings, preview environment differences, real API failures, or a deployed iOS install. Add mock Worker/API tests and a small end-to-end smoke test against a preview.

### P2 — Raid hotspot directory
- The existing Places view has a good source/coordinate verification model and a copy-coordinates button, but the current data contains only two Brisbane event venues. It is not a worldwide raid-location directory.
- A new branch adds six **community-reported general-area pins**: Shinjuku/Kabukicho (Tokyo), Bryant Park (New York), Taipei Main Station/Ximending, Plaza del Pilar (Zaragoza), Circular Quay (Sydney), and Pier 39 (San Francisco).
- These are not live raid feeds, not confirmed gym pins, and not a guarantee of active players. Their descriptions must keep that caveat. A future version should support copy coordinates, open Apple/Google Maps, show current local time in the place, and optionally sort by time zone. Do not invent real-time raid density without a data provider.
- Use public places respectfully; coordinates are a convenience for travel/planning, not evidence of permission to access private property.

### P2 — Event coverage and companion features
- Twitch Drops filter and Max cloud cues were merged in PR #22.
- Raid hundo CP labels (level 20 / weather-boosted level 25) were merged in PR #23. The calculation is independent of Trainer Level 80. Labels should only render where species/form and catch-level assumptions are valid.
- Personalised event grading and per-event breakdown were merged in PR #20. Grades are editorial, not official.
- Mega / Super Max preparation tracker was merged in PR #21.
- Event detail mobile fixes were merged in PR #24.
- Current curated data includes bonus strings and featured art, but there is no guarantee every event is complete for research tasks, eggs, field research encounters, raids, Max battles, Twitch Drops, exclusive moves, backgrounds, costumes, tickets and time-limited sub-bonuses. This needs a field-by-field completeness report, not just a total event count.

## Similar products and what to learn from them

- **Leek Duck / ScrapedDuck:** broad event calendar, raid rotations, Raid Hour, Max Monday, research tasks, egg pools, and bonus/encounter detail. ScrapedDuck is a community-maintained JSON mirror of Leek Duck's calendar data. It is a strong candidate for event discovery, with attribution and terms respected.
- **Pokémon GO Hub:** editorial explainers, counters, guides and event announcements; useful as a second source for cross-checking and explanatory context.
- **PoGO Calendar:** compact calendar-first presentation, future event timeline, category filtering, Twitch Drops, Max/Dynamax visual cues, and sprite-led cards. The screenshots supplied by the user are a design reference, not a source of truth.
- **PokéMiners:** game assets and datamined information. Useful for exact form sprites, bonus icons, moves and game-master changes, but datamined data must be labelled as such and must not be presented as official confirmation.
- **Pokebattler / My Pokebattler:** raid counters, battle simulation and collection-aware planning. This is a possible future data integration, but avoid duplicating a full battle simulator before core event data is trustworthy.
- **Community hotspot lists / Reddit:** useful for candidate public areas and player experience, but anecdotal, time-sensitive and not suitable to claim live raid activity. Prefer a source/date and a “community reported; not live verified” label.

## Feature checklist from prior requests

| Request | Status in repository / audit |
|---|---|
| Premium dark mobile-first companion | Partially implemented; visual polish still needed |
| Persistent bottom tab bar / app-like navigation | Implemented; needs real-device QA and scroll/back testing |
| Own login/account and cross-device state | Not complete; PIN-gated sync is not a normal user account |
| PWA install | Manifest and icons exist; offline shell/cache needs work and install testing |
| Twitch Drops as a category | Implemented in PR #22 |
| Weekly raid + Max rotation in one place | Implemented; historical/current semantics improved in PR #25 |
| Dynamax/Gigantamax cloud cue | Implemented; artwork form correctness still needs verification |
| Shadow/Dynamax/Gigantamax-specific sprites | Partial; PR #25 requests specific assets with fallback, but needs asset QA |
| Hundo CP labels | Implemented in PR #23 for supported raid/Max encounter forms |
| Personalised event grades | Implemented in PR #20 |
| Mega / Super Max prep tracking | Implemented in PR #21 |
| Bonus-specific icons (XP, Candy, Stardust etc.) | Partial: several local icons exist; complete structured coverage not done |
| Debut / shiny / costume / background signals on cards | Partial; PR #25 adds signal chips, but semantic precision needs data model |
| Map overlay | Not implemented; previously ranked lower priority |
| World raid hotspots with copy coordinates | New branch adds sourced community-area pins; PR not yet opened/merged at time of writing |
| User-local time plus venue-local time | Not complete; schema needs explicit source timezone and conversion |
| Robust automatic event feed | Not complete; main dashboard currently uses static `data.json`, pipeline is intentionally off |
| Reliable event completeness across research, eggs, raids, bonuses, moves, tickets | Not yet audited exhaustively |
| Infographic viewer | Implemented in PR #17; only some events have real external infographics |
| Event/source methodology | Implemented in PR #18 |
| Map-based event/raid overlay | Not implemented |
| Price accuracy / regional pricing | Detail copy was corrected in PR #24; price data remains curated and needs freshness/source QA |

## Recommended roadmap

1. **Data audit first:** run read-only feed previews, compare `data.json` against official announcements and Leek Duck/ScrapedDuck, identify missing/contradictory fields, and generate a source freshness/completeness report. Keep the production pipeline off until explicitly approved.
2. **Time-zone model:** define timestamps, source zone, device-local conversion and UI labels; add DST tests.
3. **Artwork QA:** automated sprite matrix for Shadow/Dynamax/Gigantamax/Mega/Primal/shiny/costume forms; make missing assets visible in development rather than silently removing them.
4. **Event signals and bonus icons:** structured signal schema, icon coverage tests, and precise labels for shiny availability vs boosted odds vs new shiny.
5. **Raid hotspot directory:** verify source links, keep pins area-level and caveated, add map openers/current local time and copy confirmation.
6. **PWA/account plan:** offline app shell and safe cache strategy; then design actual identity/account sync before building it.
7. **Preview end-to-end checks:** test real Worker routes and API failures on a Cloudflare preview, plus iOS/Android viewport and install checks.
8. **Only then** consider a map overlay and other large visual additions.

## Safety and scope preserved

This audit did not enable `PIPELINE`, run migrations, change secrets, change cron schedules, or change production bindings. It did not deploy to production. Source and community claims remain distinct; no live raid activity is claimed by the hotspot list.
