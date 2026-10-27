# GO Field Notes — UX redesign blueprint

**Status:** Proposed direction  
**Branch:** `redesign/ux-blueprint`  
**Scope:** Product structure and experience design only. No production UI or data behaviour changed.

## Product intent

GO Field Notes should feel like a premium, editorial Pokémon GO field companion: useful at a glance, trustworthy about data freshness, and enjoyable to explore. It should not resemble a generic admin dashboard or a stack of interchangeable AI-generated cards.

The primary user questions are:

1. What is happening now?
2. What should I prepare for next?
3. What can I do with my collection?
4. How do I prepare for battles?

## Proposed primary navigation

Four primary destinations:

- **Today** — live briefing, active event, next important events, personalised opportunities.
- **Schedule** — chronological event timeline, calendar alternative, in-person events, discoveries.
- **Battle** — raids, Max Battles, counters, PvP.
- **Collection** — Pokédex, forms, Mega/Max progress, attackers, collection import.

Saved items should be a global utility accessible from the header, not a primary destination. Settings should be a separate utility destination and must not be mixed with content navigation.

## Proposed information architecture

### Today
- Briefing / overview
- Happening now
- Coming up
- Opportunities for you
- Relevant collection reminders

The Today screen should prioritise active and personally relevant information. Long-range event browsing belongs in Schedule.

### Schedule
- Timeline (default)
- Calendar (alternate view of the same event data)
- In Person (filter or dedicated view)
- Discoveries (announced, datamined and unannounced content, explicitly distinguished from confirmed events)

Filters should live behind one clearly labelled filter control. Event cards should prioritise name, status, local timing, key bonuses and featured Pokémon. Details should open from the card; save should be a compact independent action.

### Battle
- Raids
- Max Battles
- Counters / attacker recommendations
- PvP

Keep battle preparation together. Avoid duplicating collection ownership state between attacker guides and the Pokédex.

### Collection
- Collection overview and progress
- Pokédex
- Forms and regional collection
- Mega / Dynamax / Gigantamax tracking
- Best attackers
- Import collection (screenshot-assisted workflow)

Pokémon status editing should happen in one consistent detail surface rather than requiring many small controls in every list row. Preserve the current tracked attributes unless a data audit shows duplication or ambiguity.

### Global utilities
- Saved items: saved Pokémon and events
- Settings: account/sync, notifications, event display preferences, calendar subscription, data sources/freshness, appearance

Places should be discoverable from Schedule/Explore rather than buried in Settings.

## Feature disposition (initial)

| Existing feature | Proposed treatment |
|---|---|
| Purchase planner on Today | Move into relevant event details or a planning utility |
| Watchlist / Saved tab | Remove as primary tab; retain saved-items capability globally |
| Menu sub-tab | Replace with a clear Settings utility |
| Shiny hunting on Today | Move into Collection; surface relevant opportunities on Today |
| Weekly infographic strip | Integrate infographics into relevant event details |
| Chances | Rename to a plain-language concept such as “Opportunities for you” |
| Hundo guide | Consolidate with Best Attackers where the content overlaps |
| Regional finder | Move into a dedicated Regions/forms experience |
| Screenshot import | Retain; present as a guided review-and-confirm flow |
| Forms tracking | Retain and clarify its relationship to species ownership |
| Places | Retain; improve discoverability and context |
| Datamined listings | Retain in Discoveries with explicit confidence/status labels |
| Sources and freshness | Retain and make trustworthy, visible context |
| Event preferences | Simplify and move into Settings |

No feature should be deleted until usage, dependencies and data ownership have been checked.

## Visual direction: editorial field guide

- Dark, restrained foundation with purposeful accent colours.
- Strong typographic hierarchy and readable body sizes.
- Pokémon and event artwork should provide visual character.
- Fewer generic rounded panels; use varied layouts where content importance warrants it.
- Use status colours semantically and always pair them with text labels.
- Reduce decorative gradients, excessive pills, unnecessary borders and repeated uppercase labels.
- Use consistent iconography, spacing, controls and interaction states.
- Prefer clear editorial composition over a uniform grid of dashboard cards.

## Interaction principles

- One obvious primary action per screen or card.
- Search and filters must be predictable and independently clearable.
- Preserve scroll position when returning from details.
- Browser back, iOS swipe-back and overlay dismissal must behave consistently.
- Important touch targets should be at least 44px.
- Every view needs intentional loading, empty, stale-data and error states.
- Do not present stale or unavailable data as live.
- Distinguish confirmed, announced, datamined and speculative information in both text and visuals.
- Use local event times where appropriate and clearly identify the timezone.

## Data and trust workstream

Before visual implementation, map:
- the authoritative source for each event and Pokémon field;
- data update cadence and last successful verification;
- static snapshots versus live feeds;
- timezone conversion rules;
- status/confidence semantics;
- duplicate tracking fields shared across Dex, forms and attacker guides.

The UI should communicate freshness honestly and explain uncertainty without overwhelming users.

## Implementation approach

1. Complete repository and rendered-screen audit, including screenshots at phone, tablet and desktop sizes.
2. Approve the sitemap and user flows.
3. Establish design tokens and reusable components.
4. Prototype Today, Schedule, Battle and Collection before implementation.
5. Implement behind this redesign branch, preserving existing data contracts where practical.
6. Add interaction, accessibility, responsive and data-freshness tests.
7. Review a preview deployment before any production merge.

## Acceptance criteria

- A first-time user can explain the four primary destinations without guidance.
- Common tasks are reachable without navigating through unrelated sections.
- The same Pokémon ownership state is consistent wherever it appears.
- Event status and freshness are unambiguous.
- Primary flows work on narrow iPhones, larger phones, tablets and desktop.
- No existing feature is silently lost; moved or retired features are documented.
- All controls have meaningful accessible names, visible states and usable touch targets.
- No production changes are made until preview review and explicit approval.

## Open decisions for the next design pass

- Whether “Battle” or “Battles” is the strongest navigation label.
- Whether Places deserves a dedicated Explore destination or remains a Schedule subview.
- Whether saved items should combine events and Pokémon in one list with filters, or use two clearly separated views.
- Which collection attributes are genuinely needed in the default list versus the Pokémon detail view.
- Which Today modules are most valuable based on real usage.



## Rendered iPhone review — 28 October 2026

Screenshots reviewed: Today from the header through the end of the feed, plus Saved > Menu. This is a rendered-screen review at one phone size; tablet, desktop, accessibility and interaction behaviour still need separate validation.

### What the screenshots confirm

The current visual identity is worth preserving: condensed display headings, dark neutral surfaces, restrained event-category accents, Pokémon artwork and clear local-time labels. The interface has a recognisable game-companion character and should be refined rather than replaced with a generic dashboard aesthetic.

The primary weakness is information architecture and feed density, not a lack of visual polish.

### Today: proposed redesign

Replace the long sequence of overlapping sections with a short, ranked briefing:

1. **Header / context** — app name, date, trainer/team context, freshness indicator and saved/settings utilities.
2. **Season progress** — compact inline progress for season and GO Pass; avoid two large promotional tiles consuming the first screen.
3. **Happening now** — one or two active items that genuinely need attention.
4. **Next up** — the next few time-sensitive events, ordered chronologically.
5. **For your collection** — relevant shiny, costume, debut, Mega/Max or other collection opportunities, personalised only where the underlying data supports it.
6. **Infographics** — a compact, date-labelled preview or a single entry point, not two large equal-weight cards.
7. **See full schedule** — a clear transition to Schedule for the longer horizon.

Do not render the same event as separate full-size cards in Today, Week Ahead and This Week. If an event has a distinct sub-event (for example, a raid rotation and a scheduled Raid Hour), show the relationship clearly and avoid repeating the parent information unnecessarily. A compact day strip may remain as a navigation aid, but it should not duplicate the full event cards immediately below it.

Move the purchase planner into the relevant event detail or a planning area. Long-range items belong in Schedule, not an indefinitely long Today feed. The current “Later this month” empty state and footer are useful in Schedule but add little to a daily briefing.

### Event card refinements

The existing cards contain useful information but several controls compete for attention: Details, Check infographic, Save and dismiss. Establish a consistent hierarchy:

- Event title and category/status first.
- Local date/time and relative timing second.
- Featured Pokémon and only the most decision-useful bonuses.
- One primary action: open details.
- Infographic as a quiet secondary action when one exists.
- Save as a compact icon action with a clear accessible label.
- Dismiss only if it has a well-defined, reversible meaning; otherwise remove it from the default card.

Avoid showing a dismiss cross on every item unless dismissing is a core personalisation workflow. Explain whether dismissal hides the event temporarily, hides that event permanently, or teaches the feed a preference.

For cards with Pokémon CP values, ensure the two values have a visible explanation (for example, normal / weather-boosted) rather than relying on colour alone. Ensure shiny, debut, costume, Mega, Shadow and Dynamax labels have consistent wording and meaning.

### Infographics

The “This week” and “This month” tiles currently use a lot of space for relatively little information. Replace them with one compact module showing the latest available infographic, its date/source, and a clear way to browse the archive. Where an infographic belongs to a specific event, surface it on that event and avoid creating an additional competing copy on Today.

### Saved > Menu review

The current Menu view mixes operational/admin workflows with destinations and content:
- Infographic Review and Linked Infographics are ingestion/curation tools.
- Leaks and Places are content destinations.
- “Check Discord now” is a source-refresh action.
- Watchlist and Menu are presented as peer subtabs under Saved.

These are different jobs and should not share one undifferentiated menu. Move user-facing content to Schedule/Discoveries and contextual Places access. Put account, sync, notification, calendar and display preferences in Settings. If infographic review and manual Discord refresh are owner/admin tools, keep them behind an explicit maintenance/admin area rather than exposing them as ordinary player navigation. Keep the review queue and linked archive as distinct workflows, but label them in plain language and show queue counts only when non-zero or actionable.

The saved-items experience should open directly to saved content. Settings should be reachable from a conventional gear/menu utility in the header, not as a second subtab inside Saved.

### Visual and responsive refinements

- Preserve the condensed display type for section titles, but use it selectively; too many all-caps headings make every section feel equally loud.
- Reduce large vertical gaps between sections where they do not signal a meaningful change of task.
- Keep the bottom navigation, but test safe-area spacing, scroll-to-bottom reachability and whether it obscures the last card.
- Give the header a more compact scroll behaviour so the first useful content appears sooner.
- Use a consistent card layout grid: align category/status, title, time, metadata and actions across cards while allowing artwork placement to vary by content type.
- Keep colour accents semantic and pair them with readable text; do not rely on red/purple/blue alone.
- Test contrast of muted timestamps, secondary text and dark disabled controls.
- Test the layout at narrow iPhone widths and larger devices, including long Pokémon/event names and translated or enlarged text.

### Confirmed priorities from this visual pass

1. Redesign Today as a concise briefing and remove duplicated long-range event content.
2. Separate Saved, Settings, content discovery and admin/curation workflows.
3. Standardise event card hierarchy and actions.
4. Consolidate infographic discovery around event context and a compact archive.
5. Preserve the existing visual identity while tightening hierarchy, spacing and accessibility.

