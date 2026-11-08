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
| `sinistea|bow` | Unresolved | Find exact official or credible image and verify costume/form identity |
| `pikachu (sun crown)|sun crown (no dex number)` | Unresolved | Find exact official or credible image and verify costume/form identity |
| `pikachu (moon crown)|moon crown (no dex number)` | Unresolved | Find exact official or credible image and verify costume/form identity |
| `espeon (sun scarf)|sun scarf (no dex number)` | Unresolved | Find exact official or credible image and verify costume/form identity |
| `umbreon (moon scarf)|moon scarf (no dex number)` | Unresolved | Find exact official or credible image and verify costume/form identity |
| `tee|purple (no dex number)` | Unresolved | Confirm avatar-item classification and original source |

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