# GO Field Notes — Screen and navigation specifications

**Status:** Proposed design specification  
**Branch:** `redesign/ux-blueprint`  
**Companion document:** `docs/UX-REDESIGN-BLUEPRINT.md`  
**Scope:** Product experience and UI specification. No production interface or data behaviour changed.

## Non-negotiable Today requirement: countdowns and progress

Season and GO Pass cards must show **days remaining and progress**. Progress is supplementary; it must never replace the countdown.

Recommended compact treatment:

- **Season** — `35 days left` as the primary value; `59% complete` and a progress bar as supporting context.
- **GO Pass: October** — `7 days left` as the primary value; `Week 4 of 4` and a progress bar as supporting context.

The exact figures above are examples from the reviewed screenshot, not hard-coded values.

### Countdown behaviour

- Calculate remaining time from the authoritative start/end timestamps and the user's selected/local play timezone, using one consistent boundary rule.
- Use pluralisation correctly: `1 day left`, `2 days left`.
- At less than 24 hours, switch to a useful hours/minutes label if reliable; do not misleadingly show `0 days left` while the item is still active.
- At the end timestamp, change state to `Ended` or remove the active progress module according to product rules. Never show negative days.
- If dates are unavailable or unverified, omit the countdown and show a clear unavailable/estimated state rather than inventing a value.
- Keep the percentage and countdown in sync with the same timestamps. Avoid a progress bar that reaches 100% while the label still says several days remain.
- Respect daylight-saving changes and local timezone conversion; do not calculate by assuming every day is exactly 24 hours across timezone transitions.
- If the source gives a pass week (e.g. Week 4 of 4), display it as source-derived metadata, not a calculation from percentage.
- Near expiry, use a restrained urgency treatment (e.g. stronger text emphasis); don't turn every countdown into a warning.

On narrow phones, stack the title and countdown on the first line and place percentage/progress below. On wider screens, season and pass can sit side by side. Both modules must remain visible near the top of Today without displacing the active briefing.

## Product principles

1. Today answers what matters now; Schedule answers what is happening across the full horizon.
2. One event should not become several full-size duplicates simply because it appears in multiple time groupings.
3. Every screen has a clear primary task and one obvious primary action.
4. Preserve the distinctive condensed display typography, dark palette and expressive Pokémon artwork.
5. Make status, timing, data freshness and uncertainty understandable without relying on colour alone.
6. Keep useful existing capabilities; move or consolidate before considering retirement.
7. Design for one-handed iPhone use first, then tablet and desktop.

## Global shell and navigation

### Primary destinations

Use four primary destinations:

1. **Today** — daily briefing and immediate opportunities.
2. **Schedule** — full event timeline, calendar, in-person events and discoveries.
3. **Battle** — raid and Max Battle preparation, counters and PvP.
4. **Collection** — Pokédex, forms, Mega/Max progress, attacker collection context and import.

### Global utilities

- **Saved**: a header utility, opening a unified saved-items area with clear Events and Pokémon filters or segments. It is not a fifth primary destination.
- **Settings**: a separate header utility. It contains sync/account, notifications, event preferences, calendar integration, appearance, timezone and source/freshness information.
- **Admin / maintenance**: a distinct, access-controlled area if infographic review, linked infographic curation and manual Discord refresh are maintainer workflows. Do not expose these as ordinary player navigation unless they are intentionally public features.

### Navigation behaviour

- Keep the bottom bar stable on mobile with four destinations and a clear active state.
- Ensure the final content can scroll above the bottom bar and device safe area.
- Use a consistent back model: browser back and iOS swipe-back should return to the previous view and preserve scroll/filter state.
- Detail sheets and dialogs must close predictably with a close control, backdrop where appropriate, and Escape on keyboard devices.
- On tablet/desktop, adapt to a rail or top navigation without changing the information architecture.
- Avoid nesting a second navigation system inside Saved or Settings.

## Screen 1 — Today

### Job

A fast, personalised daily briefing. A player should understand the current event, the next time-sensitive activity and relevant collection opportunities in roughly 10–20 seconds.

### Information hierarchy

1. **Compact header** — brand, date, trainer/team context, data refresh/freshness, Saved and Settings.
2. **Season and GO Pass** — two compact progress modules, both showing days remaining and progress. GO Pass also shows its current week when available.
3. **Happening now** — the most important active event(s), not every active long-running event.
4. **Coming up** — next time-sensitive events in chronological order, with a small number of items.
5. **For your collection** — relevant shiny, costume, debut, Mega, Dynamax/Gigantamax or other opportunities. Personalise only where player data and event data support the claim.
6. **Infographics** — one compact latest/featured preview with date and archive link. Event-specific infographics should primarily live in event detail.
7. **See full schedule** — explicit transition to Schedule.

### Inclusion and ranking rules

- Prioritise events happening today or within the next 24–48 hours.
- Prefer unique event entities. If a raid rotation and Raid Hour are distinct event records, show both only when their separate timing/action is useful; visually relate them and avoid repeating the same parent event details.
- Do not repeat the same full-size event card in Happening now, Week Ahead, This Week and Next Week.
- Do not show a long-range event catalogue on Today. Schedule owns that horizon.
- Empty sections should disappear or use a short useful empty state; avoid large empty panels.
- Dismissal must have a defined meaning, a reversible route and a clear accessible label. If dismissal is not a meaningful player feature, remove the cross from cards.

### Event card anatomy

- Category and status (e.g. Event · Live, Raids · Upcoming).
- Event title.
- Local start/end time and concise relative timing.
- Featured Pokémon artwork where relevant.
- A small set of decision-useful labels/bonuses.
- One primary action: **Details**.
- Secondary infographic action only if an infographic is actually linked.
- Save action with accessible name and saved state.

Avoid giving Details, Check infographic and Save equal visual weight. For CP values, label normal and weather-boosted values explicitly. Pair all semantic colours with text labels.

### Remove/move from Today

- Move the purchase planner to relevant event details or a dedicated planning utility.
- Move long-range week/month event browsing to Schedule.
- Move the full shiny-hunting catalogue into Collection; show only relevant opportunities on Today.
- Keep weekly/monthly infographic archive browsing out of the top-level Today flow; show a compact preview and event-context links.

## Screen 2 — Schedule

### Job

A complete, trustworthy view of announced activity over time, with quick access to event details and discovery status.

### Default view

- Timeline/list is the default because it supports scanning and chronological planning.
- Calendar is an alternate view of the same underlying event dataset, not a separate content system.
- Provide one clearly labelled filter control with active-filter count and a one-tap clear-all action.

### Filters

Potential filters (only include those supported by current data): event category, date range, live/upcoming/ended, raids, Max Battles, spotlight hours, Community Days, in-person, Pokémon debut, shiny availability and other meaningful event attributes.

### Event grouping

- Group by date or useful time horizon (Today, Tomorrow, This week, Later).
- Avoid repeating the same event in multiple groups.
- Show timezone context clearly, especially when travelling or viewing global events.
- Distinguish all-day/multi-day events from one-hour windows.
- Keep event cards consistent with Today but allow more metadata in Schedule.

### Event detail

A detail view should provide:
- Title, category, confidence/status and local time range.
- Event description and important bonuses.
- Featured Pokémon and debut/shiny/costume/form information.
- Linked infographic(s), with source/credit where available.
- Relevant raid/Max Battle or collection preparation links.
- Purchase/ticket/pass information only when relevant.
- Save action.
- Source and last-verified/freshness information.

### Discoveries

Rename Leaks to **Discoveries** or another neutral plain-language label. Keep separate status groups:
- Officially announced.
- Datamined / game-file evidence.
- Unannounced / speculative.

Never merge speculative discoveries into the confirmed schedule. Show provenance, date observed and confidence/verification status where the source data supports it. Do not imply that datamined content is confirmed.

### In-person events and Places

Keep In Person as a schedule filter or subview. Places should be discoverable in context from relevant in-person event information, not buried in Settings. A dedicated Places destination is only justified if the existing place dataset and user tasks support it.

## Screen 3 — Battle

### Job

Help players decide what to use and prepare for upcoming battles, without becoming a second full battle-simulation product.

### Proposed structure

- **Overview** — current and upcoming raid/Max rotations and the most relevant preparation.
- **Raids** — boss, tier, dates, shiny status, counters and useful CP reference.
- **Max Battles** — Dynamax/Gigantamax boss, availability, recommended counters and owned Max-capable Pokémon context.
- **Counters / Attackers** — ranked recommendations with rationale, not just a list of names.
- **PvP** — rankings/links and supported league context.

### Behaviour and content rules

- Clearly distinguish raid bosses, Mega raids, Shadow raids, Max Battles and other battle formats.
- Show date/time and data freshness for rotations and rankings.
- Counter recommendations should explain whether they are based on current game data, movesets, rankings or a curated guide.
- Avoid duplicating collection status. If the player marks a Pokémon as owned or powered up in Collection, Battle should read that same state.
- Make CP ranges self-explanatory (normal/weather boosted) and do not rely on colour alone.
- Use compact comparison rows for counters; reserve large artwork for featured bosses and detail views.

## Screen 4 — Collection

### Job

Help a player understand what they own, what they are missing and what is worth collecting next.

### Collection home

- Overall Pokédex progress and useful sub-progress.
- Continue/recent collection activity if supported.
- Clear entry points to Pokédex, Forms/Regions, Mega/Max, Best Attackers and Import.
- Surface relevant event opportunities without duplicating the entire Today feed.

### Pokédex

- Species list first; advanced filters should not overwhelm the initial view.
- Search is prominent and fast.
- Filters are grouped into understandable categories and can be cleared independently.
- Use clear ownership/status indicators and concise list rows.
- Show unreleased species/forms only with explicit status labels (e.g. Announced, Datamined, Not announced) and do not mix them with obtainable collection targets without distinction.

### Pokémon detail

Use one consistent detail surface as the source of truth for ownership and tracked attributes. Candidate attributes to audit before finalising: caught/owned, shiny, lucky, purified, shadow, costume, form, Dynamax, Gigantamax, Mega availability/level and any user-defined notes. Do not assume every attribute applies to every species.

The same status must appear consistently in Pokédex, attacker recommendations, battle preparation and saved lists. Avoid tiny independent controls scattered across cards.

### Forms and Regions

Make form completion and regional collection understandable separately from species ownership. Avoid counting multiple forms as separate species unless the product's Pokédex rules explicitly require it.

### Mega / Dynamax / Gigantamax

Provide dedicated progress where the underlying game mechanics make those collections distinct. Explain what is being counted and link back to the canonical Pokémon record.

### Best Attackers

Integrate with Battle recommendations rather than maintain duplicate Pokémon records. Clearly distinguish owned attackers from recommended targets.

### Screenshot import

Retain as a guided workflow:
1. Select or upload screenshots.
2. Show detected Pokémon and confidence/recognition.
3. Let the user correct ambiguous detections.
4. Confirm changes before writing to collection.
5. Summarise what was added/updated and what was skipped.

Never silently overwrite existing collection data based on uncertain recognition.

## Settings and admin workflows

### Player settings

- Account/profile and sync status.
- Notifications and reminders.
- Event display preferences.
- Timezone/local-time behaviour.
- Calendar subscription.
- Appearance and accessibility preferences.
- Data sources, last refresh and freshness explanation.

### Maintainer/admin

- Infographic review queue.
- Linked infographic archive management.
- Manual source refresh / Discord check.
- Pipeline status and error visibility if appropriate.

Admin tools should be permission-gated and visually distinct from normal player tasks. If the app has no authentication/role model, do not expose sensitive maintenance actions until an appropriate protection model is confirmed.

## Visual design system direction

### Preserve

- Condensed display type for strong section and event titles.
- Dark neutral foundation.
- Distinctive Pokémon/event artwork.
- Semantic category accents.
- Editorial, game-companion character.

### Refine

- Use a small type scale with clear roles: display, section, card title, body, metadata.
- Reduce all-caps headings to meaningful section titles and key event labels.
- Use fewer large bordered panels and fewer decorative gradients.
- Standardise spacing, radii, icon sizes, button heights and card anatomy.
- Use colour as a supporting cue; always pair with readable text/icons.
- Keep secondary text and disabled states comfortably legible.
- Use 44px minimum touch targets for key controls.
- Support dynamic text, reduced motion and keyboard navigation.

## Responsive rules

- **Narrow phone:** one-column content, compact header, two compact progress modules stacked or side-by-side only when legible, bottom navigation with safe-area padding.
- **Large phone:** preserve one-handed scan order; do not widen cards into dense dashboards.
- **Tablet:** use two-column editorial layouts where they improve scanning; keep navigation stable and avoid oversized empty space.
- **Desktop:** use a constrained content width, optional side rail and multi-column layouts for schedule/collection; do not simply stretch phone cards across the viewport.

Test long titles, missing artwork, large text, low-contrast displays, loading states, empty states, stale data, offline errors and narrow viewport widths.

## Feature audit and migration checklist

Before removing or merging any feature:
- Find its route, UI entry point and related data model.
- Search all code references and tests.
- Identify whether it is used by another screen or pipeline.
- Identify whether state is stored locally, in D1 or in static data.
- Decide: keep, move, combine, rename or retire.
- Document the decision and migration path.
- Preserve existing data and deep links where practical.

No feature should disappear solely because it is not visible in the screenshots.

## Validation and acceptance criteria

- Season and GO Pass both show days remaining and progress, sourced from the same authoritative timestamps.
- Today is meaningfully shorter and contains no repeated full-size event cards across multiple time buckets.
- Saved, Settings, Discoveries and Admin are distinct concepts with clear entry points.
- Schedule remains the comprehensive event catalogue.
- Battle and Collection share canonical Pokémon state.
- Screenshot import requires user review before changes are committed.
- Event confidence, timezone and data freshness are explicit.
- All primary flows work on iPhone, tablet and desktop.
- No production deployment or merge occurs before preview review and explicit approval.

## Open implementation questions

Resolve by inspecting existing source/data contracts rather than guessing:
- Which season/pass fields and timestamps are currently available, and which are authoritative?
- Is the pass's week number directly supplied or derived?
- Which events are duplicated by grouping logic versus genuinely separate event records?
- Which infographic functions are player-facing versus maintainer-only?
- What is the current role/access-control model for admin operations?
- Which collection attributes currently have a canonical stored value?
- Which existing deep links and local preferences must survive the navigation change?
