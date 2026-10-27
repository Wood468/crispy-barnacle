# GO Field Notes — visual design system direction

**Status:** proposed direction for the redesign prototype; not yet applied to production styles.

## Design intent

Keep the recognisable dark, editorial Pokémon GO field-guide identity. Improve the composition and hierarchy rather than applying a generic dashboard reskin. The current design already has useful foundations: condensed display typography, monospace metadata, strong event-kind colours, Pokémon artwork and a dark-first palette. Reuse those foundations selectively.

The target should feel like a carefully art-directed field guide: confident typography, intentional image placement, quieter surfaces, clear time/status signals and fewer competing outlines.

## Keep from the current visual language

- Dark-first charcoal palette and explicit light theme support.
- Condensed display face for section and event titles.
- Sans-serif body face for legibility.
- Monospace for dates, countdowns, CP and source metadata.
- Event-kind semantic colours (raid red, Max purple, shiny gold, debut teal, etc.).
- Pokémon artwork and creator-attributed infographics.
- Persistent bottom navigation on phone with safe-area support.

## Refine

### Colour and surfaces

Keep the base palette near the current tokens:
- Background: `#0C0F14`
- Primary surface: `#141922`
- Raised surface: `#1B212C`
- Hairline: `#232B38`
- Main text: `#F3F5F9`
- Muted text: `#9AA4B5`
- Body text: `#D5DBE6`

Use fewer nested gradients and borders. Reserve the full semantic colour for event category accents, status indicators and small labels. Use neutral surfaces for most content. A card should not have a bright glow simply because it is active; reserve emphasis for urgent/live states.

### Typography

- Display: Big Shoulders Display (existing).
- Body: Hanken Grotesk (existing).
- Metadata: DM Mono (existing).
- Display titles are uppercase by design, but body copy and controls use normal sentence case.
- Keep long event names readable; avoid shrinking them until they become dense all-caps blocks.
- Use tabular numerals for countdowns and CP.

### Spacing and shape

- Establish a 4px base spacing scale (4, 8, 12, 16, 24, 32, 40).
- Use 12–16px radii for standard cards and 20px only for featured/hero content.
- Use hairlines sparingly; prefer whitespace and alignment to repeated boxes.
- Minimum touch target: 44px.
- On iPhone, keep primary content gutters consistent and avoid horizontal scrolling except for compact date strips and explicitly swipeable collections.

## Screen composition

### Today

1. Compact header: app identity/date; trainer identity can become a quieter profile control.
2. Season and GO Pass: two distinct compact modules, each showing **days remaining and percentage progress**. A narrow progress line can sit below. They must not become a single ambiguous combined countdown.
3. Daily briefing: one prominent "Happening now" item and a short "Coming up" list. Don't repeat the same event again in a long This Week list.
4. Personal opportunity: only show if the user's Dex/follow state gives a meaningful reason.
5. Week/month infographic glance: two restrained preview tiles with publication date and creator/source accessible in the viewer.
6. A clear route to the full Schedule for everything beyond the daily briefing.

### Schedule

- Timeline is the default view.
- Calendar is a mode switch, not a separate mental model.
- Date and category filters live in a compact filter panel; active filters remain visible.
- In-person and announced debuts are discoverable secondary views.
- Discoveries is visually and semantically separated from confirmed events. Status must be written out, not colour-only.

### Battle

- Lead with current raid and Max rotations.
- Boss details show CP, shiny availability, counters and useful event windows in a consistent hierarchy.
- PvP is a clear secondary mode with league selection.
- Do not try to replicate a full battle simulator.

### Collection

- Start with owned/shiny progress and a search-first Dex.
- Progressive disclosure for generation, status, form and release filters.
- Forms, regions and Mega/Max preparation are secondary destinations.
- Best attackers should be accessible from Battle and Collection without creating two competing ownership editors.
- Screenshot import has a short explicit sequence: select → recognise → review → apply.

### Saved and utilities

- Saved is a simple collection of saved events and followed Pokémon.
- Settings is separate from content.
- Owner tools is a distinct owner-only section, not a normal player setting.
- Pending infographic count should be visible in the owner utility entry and Today owner shortcut, but never reveal queue details to a member.

## Infographic review visual requirements

This is an operational review interface, so clarity and throughput matter more than decorative cards.

- Desktop/tablet: two-column or three-column review grid with a large preview and decision panel.
- Phone: one candidate per card, image first, event match choices directly below.
- Show creator, original post link, discovery/post date and matcher signals.
- Make suggested event match and manual event selection clearly distinct.
- Primary actions: Approve match; secondary: Choose another event; destructive: Reject.
- Linked events shown as removable chips; adding another event remains easy.
- Weekly and monthly overview actions are separate from event approval.
- Show explicit pending/published/rejected state and last refresh result.
- Do not silently replace a published infographic when a new candidate appears.
- Preserve sync PIN protection and server validation.

## Motion and interaction

- Keep transitions short and functional (120–200ms).
- Avoid parallax, auto-advancing carousels and decorative motion.
- Respect reduced-motion preference.
- Preserve scroll position when switching views.
- Back button closes a modal/sheet before navigating away.
- On phone, bottom navigation must account for iOS safe-area insets and never cover the final interactive control.

## Responsive behaviour

- Phone: single-column editorial feed; bottom nav; compact date strip.
- Tablet: wider cards and two-column sections where they improve scanning; navigation can remain bottom or become a rail depending on width.
- Desktop: max-width content area, left navigation rail or top-level nav, multi-column schedule/review views; do not simply stretch phone cards across the screen.

## Acceptance checks

- Both season and pass show explicit time remaining and progress at all widths.
- Main navigation has no nested "tab inside tab inside tab" experience.
- Confirmed schedule and discoveries are visibly distinct.
- Every event has one canonical detail view.
- Owner-only review is discoverable and inaccessible to members.
- Review actions work on phone and desktop with clear confirmation/error feedback.
- No content is lost when filters are empty, data is stale, or the network fails.
- Colour is never the only carrier of event type, trust or approval state.
