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

