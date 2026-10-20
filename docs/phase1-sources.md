# Phase 1: what the sources actually provide (checked 2026-10-09)

| Source | Reachable here | Provides | Used in Phase 1 |
|---|---|---|---|
| ScrapedDuck `events.json` (Leek Duck) | yes, 55 events, 56 KB | Events with `eventID`, `name`, `eventType` (15 types seen), `link`, `image`, `start`/`end`, structured `extraData` (raid bosses, shinies, Community Day spawns and bonuses, Spotlight Pokémon and bonus) | **Integrated** |
| ScrapedDuck `raids.json` | yes, 14 bosses | Current raid bosses by tier with CP and weather. No dates, so no rotation | Investigated only |
| ScrapedDuck `eggs`, `research`, `rocketLineups` | yes | Egg pools, research tasks, Rocket lineups | Investigated only |
| `data.json` (hand-entered) | local | Events, Spotlight and Raid Hours | **Integrated** as the fallback and cross-check |
| PokeMiners game master + `timestamp.txt` | yes | Datamine ids (already used by the datamine watch) | Existing job, unchanged |
| Pokémon GO Hub feed, PoGoAPI released list | **not reachable from the sandbox** | Datamine posts, released species | Existing code, unverified from here |
| pokemongolive.com (official), Reddit, Fandom | **not reachable from the sandbox** | Official announcements | Not integrated, so nothing can be marked Official yet |

Rotations and Max Battles: raid rotation = `raid-battles` events (boss, dates, shiny forms). Max Battles = `max-battles` and `max-mondays` events; Pokémon come from the title only (labelled `title`). No source seen gives a Max Battle boss table with tiers.

Time zones: `start`/`end` ending in `Z` = one instant worldwide (GO Battle League, Twitch drops, Wild Area, Tour). No `Z` = each player's local time ("floating"). 13 of 55 were `Z`. There is no region field; regions appear only in the title (`Wild Area 2026: Sendai • Tohoku`), so they are parsed and labelled as parsed.

Change rate and failure detection: the `data` branch is rewritten (one commit, "Data updated", at 07:26 UTC today). The sandbox could not read GitHub's API, so the Worker reads the commit date best-effort as `source_updated`. Failure signals: HTTP error, invalid JSON, too few entries, entry count halving, more than 20% malformed, more than 30% undated, nothing upcoming, no good check for 36 hours.

Terms (ScrapedDuck README): free to use if the app is not paywalled, shows no ads, and credits ScrapedDuck and LeekDuck.com. Personal use fits. GitHub caches the raw files for 5 minutes, so the nightly check respects that. Credit appears on the review page.

Known data quirks found in the live feed: `Yveltal Raid Hour` has null dates (kept, flagged, never shown as upcoming); Wild Area/Tour times are `Z` while most events are floating.
