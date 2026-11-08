# Artwork approval shortlist — baseline
Source: public/store-log.json and public/costumes.json on main, inspected 2026-11-08. Tracking issue #358.

## Decisions
- **No owner approval yet:** no actual replacement image with verified provenance is available.
- All 16 store items lack captured official imagery in the stored snapshot. PR #357 provides capture plumbing but does not verify image identity.
- Six unresolved registry entries need source and identity confirmation; do not substitute generic sprites.
- The purple tee may be avatar apparel rather than a Pokémon costume; classification unverified.
- R2 paths are remote assets, not necessarily broken because absent from Git.

## Six identity investigations
| Registry key | Status | Required evidence |
|---|---|---|
| `sinistea|bow` | **Identity confirmed; exact artwork unresolved** | Official Pokémon GO Halloween Part I 2026 confirms bow costume and Shiny availability; event data distinguishes Phony and Antique forms. Find source-backed image for each form; do not substitute plain Sinistea. |
| `pikachu (sun crown)|sun crown (no dex number)` | **Identity confirmed; exact artwork unresolved** | Official Twilight Wishes 2026 announcement confirms this exact costumed Pokémon; find matching image and normalize registry key. |
| `pikachu (moon crown)|moon crown (no dex number)` | **Identity confirmed; exact artwork unresolved** | Official Twilight Wishes 2026 announcement confirms this exact costumed Pokémon; find matching image and normalize registry key. |
| `espeon (sun scarf)|sun scarf (no dex number)` | **Identity confirmed; exact artwork unresolved** | Official Twilight Wishes 2026 announcement confirms this exact costumed Pokémon; find matching image and normalize registry key. |
| `umbreon (moon scarf)|moon scarf (no dex number)` | **Identity confirmed; exact artwork unresolved** | Official Twilight Wishes 2026 announcement confirms this exact costumed Pokémon; find matching image and normalize registry key. |
| `tee|purple (no dex number)` | **Confirmed avatar item, not Pokémon** | Official GO Wild Area 2026 announcement names GO Wild Area 2026 Tee (Purple), unlocked via free GO Pass: Into the Wild. Reclassify as avatar reward; obtain exact item artwork before displaying. |

## Store listings — official image capture pending
| Product | Image status |
|---|---|
| GO Pass Deluxe: Halloween + 10 Ranks | Not captured; no owner review requested |
| GO Pass Deluxe: November Ultra Box | Not captured; no owner review requested |
| GO Pass Deluxe: Halloween Ultra Box | Not captured; no owner review requested |
| GO Pass Deluxe: November + 10 Ranks | Not captured; no owner review requested |
| GO Pass Deluxe: Halloween | Not captured; no owner review requested |
| GO Pass Deluxe: November | Not captured; no owner review requested |
| Pokémon GO Wild Area 2026: Global Ultra Ticket Box | Not captured; no owner review requested |
| GO Pass Deluxe: October | Not captured; no owner review requested |
| GO Pass Deluxe: October + 10 Ranks | Not captured; no owner review requested |
| GO Pass Deluxe: October Ultra Box | Not captured; no owner review requested |
| Chandelure Super Mega Raid Day Ultra Ticket Box | Not captured; no owner review requested |
| Dynamax Uxie, Mesprit, and Azelf Max Battle Day Ultra Ticket Box | Not captured; no owner review requested |
| GO Pass Deluxe: Fall Marathon Ultra Box | Not captured; no owner review requested |
| GO Pass Deluxe: Fall Marathon | Not captured; no owner review requested |
| GO Pass Deluxe: Fall Marathon + 6 Ranks | Not captured; no owner review requested |
| Sandile Hatch Day Ultra Ticket Box | Not captured; no owner review requested |

## Review protocol
1. Capture an official HTTPS image URL and the exact listing it came from; record date and source.
2. Check that the actual image visibly matches the product or costume; a working URL alone is insufficient.
3. Check remote availability separately and mark broken only after a real failed request.
4. Only surface ambiguous candidates to the owner with a side-by-side image, exact name, source URL and approve/reject choice.
5. No substitutions, removals, merge or deployment from this report.
## Source-backed identity findings (2026-11-08)
- Sinistea wearing a bow is officially announced as a Halloween 2026 Part I costume and Shiny-capable: https://pokemongo.com/news/halloween-part-1-2026
- Leek Duck lists Sinistea bow as a research/raid encounter, including Phony Form: https://leekduck.com/events/halloween-2026-part-1/
- Snack Nap reports both Phony and Antique bow costumes in game data; treat this as secondary evidence pending exact art verification: https://snacknap.com/events/1523/halloween-2026-part-i
- No actual image URL has yet been independently verified as an exact, permitted replacement. Owner approval is not requested.

## Twilight Wishes confirmation (2026-11-08)
- Official event announcement explicitly lists sun-crown Pikachu, moon-crown Pikachu, sun-scarf Espeon and moon-scarf Umbreon in raids: https://pokemongo.com/news/twilight-wishes-2026
- Leek Duck independently lists the same four variants: https://leekduck.com/events/twilight-wishes-2026/
- **Five of six identities confirmed** (including Sinistea). The sixth, purple tee, remains unclassified; no image has been verified for replacement.

## Purple Tee classification (2026-11-08)
- Official announcement: https://pokemongo.com/en/news/get-ready-for-gowildarea-2026 — GO Wild Area 2026 Tee (Purple) is a free GO Pass: Into the Wild avatar reward, not a Pokémon costume.
- Supporting reference: https://leekduck.com/pokemon-go-wild-area/avatar-items/
- **All six identities now classified:** five Pokémon costumes, one avatar clothing reward. Exact image provenance/asset matching remains pending for all six. No replacements authorized.

## Implementation-ready identity routing (2026-11-08)
| Exact identity | Entity type | Target surface | Safe fallback until exact artwork verified |
|---|---|---|---|
| Sinistea wearing bow | costumed Pokémon (check Phony/Antique separately) | Event Pokémon gallery / encounters | Species artwork with explicit costume-unverified label; never claim costume art |
| Pikachu wearing sun crown | costumed Pokémon | Twilight Wishes 1-star raids | Base Pikachu art, clearly labelled sun crown |
| Pikachu wearing moon crown | costumed Pokémon | Twilight Wishes 1-star raids | Base Pikachu art, clearly labelled moon crown |
| Espeon wearing sun scarf | costumed Pokémon | Twilight Wishes 3-star raids | Base Espeon art, clearly labelled sun scarf |
| Umbreon wearing moon scarf | costumed Pokémon | Twilight Wishes 3-star raids | Base Umbreon art, clearly labelled moon scarf |
| GO Wild Area 2026 Tee (Purple) | avatar clothing reward | GO Pass: Into the Wild free reward | Text-only reward tile with clothing icon; never a Pokémon tile |

**Source of truth:** official Twilight Wishes announcement https://pokemongo.com/news/twilight-wishes-2026 explicitly lists raid tiers, costumes and shiny eligibility. Official Wild Area announcement https://pokemongo.com/en/news/get-ready-for-gowildarea-2026 confirms Purple Tee free GO Pass reward. These sources verify identities, not downloadable artwork URLs or licensing.

**Important:** A base Pokémon fallback must be labelled as an illustration of species, not an exact costume depiction. Do not mark any of the six as asset-approved. No external URLs have been accepted as image files.
