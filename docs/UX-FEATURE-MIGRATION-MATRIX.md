# GO Field Notes — feature migration matrix

**Branch:** `redesign/ux-blueprint`  
**Baseline:** current `main` source inspected 28 October 2026  
**Status:** planning artifact; no production code changed.

This matrix translates the existing interface into the proposed navigation. "Move" means relocate the entry point while preserving the capability and its underlying data/API. "Combine" means present related capabilities together without merging their data contracts.

## Proposed primary navigation

| Primary destination | Existing source surface | Proposed contents | Treatment |
|---|---|---|---|
| Today | `#tab-now`, `dash.js`, `season.js`, `weekly.js` | Current activity, next up, personal opportunities, season/pass countdowns, weekly/monthly infographic glance | Recompose; keep countdowns |
| Schedule | `#tab-events` and subviews | Timeline, calendar, in-person, announced debuts, discoveries | Consolidate navigation; retain all views |
| Battle | `#tab-raids`, `dash.js`, PvPoke data | Raid rotations, raid bosses/counters, Max Battles, PvP rankings | Recompose; preserve calculations/data |
| Collection | `#tab-collect` and nested views | Pokédex, forms, regional finder, shiny opportunities, Mega preparation, best attackers, screenshot import | Reorganise; preserve personal state |
| Saved | header star / `#tab-saved` | Saved events and followed Pokémon | Keep as a global utility, not a primary tab |

## Existing surface → proposed destination

| Existing route / feature | Current location | Proposed location | Action | Constraints |
|---|---|---|---|---|
| Priority / Now events | Today | Today | Keep, simplify | Continue using canonical event model and priority ranking |
| Season card | Today | Today | Keep, refine | Show **days remaining and progress percentage** |
| GO Pass card | Today | Today | Keep, refine | Show **days remaining, week label and progress** |
| Weekly infographic | Today | Today glance + archive | Keep, refine | Continue loading `weekly.json`; owner curation stays separate |
| Monthly infographic | Today | Today glance + archive | Keep, refine | Preserve month classification |
| Today agenda | Today | Today | Keep, simplify | Live and starts-today only; avoid duplicating Schedule |
| For You / collection opportunities | Today / Collect | Today summary + Collection opportunities | Combine presentation | Keep personal marks/follows and reasons logic |
| Purchase planner | Today accordion | Event detail / planning utility | Move | Preserve local/synced plan and pricing safeguards |
| This week / Next week / Later this month | Today | Schedule | Move detail | Today may show a short preview; Schedule owns the full horizon |
| Event timeline | Events → Timeline | Schedule → Timeline | Keep | Search, type filters, date strip, source trust labels |
| Event calendar | Events → Calendar | Schedule → Calendar | Keep | Preserve region/range filters and selected-day details |
| In-person events | Events → In Person | Schedule → In person | Keep | Preserve ticketed/venue context |
| Announced debuts | Events → Timeline / Debuts | Schedule → Announced | Keep | Keep separate from datamined/unannounced material |
| Leaks / datamine news | Events submenu + Saved → Menu shortcut | Schedule → Discoveries | Rename/reclassify | Clearly label announced, datamined, unannounced; never mix with confirmed events |
| Raid rotations | Raids | Battle → Raids | Keep | Preserve current rotation data and countdowns |
| Raid boss CP / shiny / hundo info | Event cards / raid rows | Battle → Raid details | Combine presentation | Preserve known CP reference and uncertainty labels |
| Max Battles / Dynamax | Raids and event cards | Battle → Max Battles | Keep | Keep Dynamax/Gigantamax distinction |
| PvP rankings | Raids accordion | Battle → PvP | Keep | Preserve league selector and PvPoke data attribution |
| Dex overview / ownership | Collect → Dex | Collection → Pokédex | Keep, simplify | Private account state remains private |
| Dex filters / unreleased species | Collect → Dex | Collection → Pokédex filters | Keep, progressive disclosure | Do not overwhelm initial view |
| Regional finder | Dex accordion | Collection → Regions | Move | Preserve Melbourne-specific catchability logic as a selectable location context, not a universal assumption |
| Forms | Collect → Forms | Collection → Forms | Keep | Preserve form groups and per-form marks |
| Screenshot import | Collect → Import | Collection → Import | Keep, improve guided review | Recognition remains on-device; user approves; screenshots may add Have only, never mark missing |
| Mega preparation | Collect → Megas | Collection → Mega & Max | Keep / extend carefully | Preserve release/eligibility separation from ownership marks |
| Best attackers | Collect → Guides → Best | Battle → Counters and Collection → My attackers | Split entry points, shared data | Do not duplicate ownership source of truth |
| Hundo guide | Collect → Guides → Hundo | Collection → Milestones / My Pokémon | Combine carefully | Retain IV reference content; avoid competing ownership editors |
| Watchlist / followed Pokémon | Saved → Watchlist + header star | Saved utility + quick-add | Keep | Preserve personal follows and saved events |
| Saved events | Saved / saved card state | Saved utility | Keep | Preserve event IDs and user state |
| Infographic review | Owner review inserted into Saved → Menu | Owner tools → Infographic Review | **Move, protect** | Preserve PIN-protected decisions, counts, review queue, actions and linked archive |
| Linked infographics | Inside infographic review | Owner tools → Infographic Review → Linked | Keep | Multi-event links and unlink semantics remain |
| Discord manual check | Inside review module | Owner tools → Intake status / Check now | Move | Keep existing Worker endpoint and Telegram forwarding behaviour |
| Places | Saved → Menu | Schedule context + utility entry | Move | Keep sourced-place verification, GPX export, copy coordinates; no map |
| Sync PIN | Saved → Menu and Dex prompts | Settings → Account & sync | Move | Preserve current auth model and PIN header behaviour |
| Account / invites | Saved → Menu via account.js | Settings → Account & people | Move | Preserve invite-only model and owner/member roles |
| Event type preferences | Saved → Menu | Settings → Schedule preferences | Move | Keep current per-kind hidden preferences |
| Alerts | Saved → Menu | Settings → Notifications | Move | Preserve alert controls and delivery contract |
| Calendar subscription | Saved → Menu | Settings → Calendar integration | Move | Preserve subscription URL and instructions |
| Sources and freshness | Saved → Menu + footer | Settings → Data & sources; inline freshness on Schedule | Move + surface contextually | Keep trust labels and freshness timestamps |
| What's new / release notes | Footer / linked module | Settings → About / What's new | Move | Preserve deep links if any |
| Owner-only private places | Places detail / API | Owner tools → Places maintenance | Keep protected | Public venue list remains distinct from private hotspots |

## Navigation and access model

### Player navigation
- Today
- Schedule
- Battle
- Collection

Saved is a global header utility. Settings is a separate utility destination. The exact visual treatment (sheet, full-screen settings route or menu) is a design prototype decision, but content destinations must not be hidden among account settings.

### Owner navigation
Owner tools are not a fifth player tab and must not appear to ordinary members. They are reached through a clearly labelled owner-only area in the utility menu. Proposed entries:
- Infographic Review (pending count badge)
- Linked Infographics
- Intake / Discord status and manual check
- Private Places maintenance (if current owner access is confirmed)
- Operational/data health (only where backed by existing APIs)

Role/authorization must be verified server-side; hiding a link is not security. Keep the sync PIN and signed-in member distinctions intact.

## Critical infographic workflow contract

The review module currently supports:
- Candidate image preview and original post / creator attribution.
- Up to three suggested live-event matches.
- Explicit approve against a suggestion or manually selected event.
- Discard/reject.
- Additional event links and per-event unlinking.
- Weekly and monthly infographic decisions.
- Linked infographic list.
- Pending review banner and count.
- "Check Discord now" manual Worker action.
- PIN-protected writes to `/api/ig-decisions`.

The redesigned owner screen should improve review efficiency but preserve every action. The queue must never auto-publish uncertain candidates. Approved-but-not-yet-published images must continue to be available to event cards through the existing immediate-pending path. Failed refreshes must not erase already loaded published data.

## Season and GO Pass presentation contract

Keep two independent countdown modules. Each shows:
- Name and relevant artwork.
- Exact remaining time in days (e.g. "35 days left"; for less than a day, use hours or "Ends today").
- Progress percentage and a progress bar.
- Season/pass date range in the detail view.
- GO Pass current week / total weeks when available.

Countdowns must derive from the current start/end timestamps, not hardcoded day counts. At expiry, show an explicit ended state and do not display a negative countdown. Timezone and daylight-saving boundaries need tests.

## Implementation guardrails

1. Reuse canonical event IDs and aliases. Do not create a second event model for the new Schedule.
2. Keep personal Dex marks, follows, saved events and purchase plan separate from shared public data.
3. Keep approval decisions and account permissions server-validated.
4. Preserve all deep links or provide compatibility redirects for existing hashes (`#planner`, `#review`, `#tab=...`).
5. Retain keyboard, VoiceOver and browser back/forward behaviour while replacing nested tabs.
6. Keep the no-build/plain-JavaScript and Cloudflare Worker architecture unless separately approved.
7. Use a feature-by-feature migration and regression checklist; don't delete legacy code until the new route passes tests and preview review.

## Work sequence

1. Prototype new navigation and Today, Schedule, Battle, Collection, Saved, Settings and Owner tools.
2. Implement shell and route compatibility.
3. Move Today content while preserving season/pass and infographic data paths.
4. Rebuild Schedule around the existing event model.
5. Recompose Battle and Collection without changing their data contracts.
6. Relocate owner infographic review; add owner-route and workflow regression tests.
7. Run the full suite and preview on phone/tablet/desktop before requesting approval to merge.
