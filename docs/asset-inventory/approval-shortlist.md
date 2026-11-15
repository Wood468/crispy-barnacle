# Artwork approval shortlist — baseline

> **Current reconciliation — 14 Nov 2026 (supersedes the original 8 Nov baseline below).** See [artwork-inventory.md](artwork-inventory.md), [candidate-queue.json](candidate-queue.json), and [the runtime manifest](../../public/artwork-manifest.json). This document preserves the dated investigation; statements below that say all costume images are unverified describe the *older* baseline, not the deployed manifest.
>
> - **Four costume identities are already visually verified and internally marked `approved` in the runtime manifest:** Pikachu sun crown / moon crown, Espeon sun scarf, and Umbreon moon scarf. Each has distinct regular and Shiny entries (eight in all), pinned upstream file identities, blob/SHA-256 hashes, dimensions and a visual review record. They resolve through the existing same-origin `/api/art` PokeMiners proxy, **not** the legacy `/img/ext` R2 mapping. No new R2 object is needed for those four. A runtime check of exact asset responses is distinct from manifest metadata and has not been established in this reconciliation.
> - **Sinistea with bow remains an unapproved candidate.** `sinistea-bow` is `candidate`; `sinistea-bow-antique` is `not-found`. Neither is in the runtime manifest. Do not infer Antique form art from Phony or invent a bucket key. The Purple Tee is classified as avatar clothing, not a Pokémon costume.
> - **The five names in `public/costumes.json.missing[]` are a legacy importer inventory**, not the union of active artwork resolvers. Do not conclude all five are currently missing from the app, or clear those entries just to silence the legacy report.
> - **Rights are not cleared by a technical approval.** The manifest's `approved` means visually verified under the existing project workflow, not a documented third-party licence or explicit rights-holder authorization. PokeMiners states game assets belong to Pokémon/Niantic and are published for educational use; a same-origin proxy and its edge cache still serve copyrighted content and do not themselves confer redistribution rights. Pokémon Support says it is not in a position to review permission requests and asks projects not to use its IP: https://support.pokemon.com/hc/en-us/articles/360000634094-Can-I-use-Pok%C3%A9mon-images-or-materials . The Pokémon press site's limited editorial, non-commercial licence is specific to material made available under its terms and should not be treated as permission to republish PokeMiners sprites: https://press.pokemon.com/en/Assets-Use-Terms . Do not widen runtime use or claim rights clearance based only on image URLs or internal review; refer rights decisions to the owner / appropriate legal advice.
> - **Read-only R2 verification is a separate task.** `scripts/validate-artwork-manifest.mjs --fetch` can compare known manifest assets against pinned upstream files and public production `/img/ext` responses from a network-enabled trusted environment; it does **not** list bucket keys and is not proof of direct R2 bucket access. `scripts/r2-sync.sh` is an importer restore/**save** workflow with credentials and must not be run as an audit. Draft PR #356's `scripts/check-remote-assets.mjs --live` probes only existing mapped URLs and is not merged into main; PR #355 is a separate stale-base historical inventory. Without a known key, read-only R2 listing permission, or a verified public response, no object-existence claim can be made for Sinistea.
> - **Ownership:** keep #355/#356 historical inventory and #797/#798/#799 Store artwork work distinct; preserve Sprint 3 Event Details/GO Pass #518/#517. This reconciliation is documentation-only and authorizes no artwork uploads, mapping updates, runtime rights changes, or new credentials.

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

## Image-candidate screening — 2026-11-08
- **Rejected as costume artwork:** https://db.pokemongohub.net/pokemon/854 shows plain Sinistea render, not the Halloween 2026 bow. Do not register it as `sinistea|bow`.
- **Candidate reference only, not accepted as deployable asset:** https://media.esports.gg/uploads/2024/07/scarf-espeon-umbreon-1-1024x576.webp is GO Fest 2024 promotional imagery featuring scarf Espeon and Umbreon; the source predates Twilight Wishes. It is a composite scene, not a clean per-Pokémon transparent sprite. Check costume visual match, reuse rights and exact asset provenance before considering it for event hero artwork.
- Official Twilight Wishes 2026 source confirms the exact four costumes and raid tiers: https://pokemongo.com/news/twilight-wishes-2026
- Leek Duck Twilight Wishes includes named illustrations of the four costumes, but no direct image URL has been independently extracted and checked: https://leekduck.com/events/twilight-wishes-2026/
- Leek Duck Halloween Part I likewise labels Sinistea wearing a bow: https://leekduck.com/events/halloween-2026-part-1/

**Outcome:** One demonstrably wrong generic image excluded; one historical composite illustration retained only as a research reference. Zero exact, deployable image files approved. Next step is extracting and validating direct artwork URLs from trusted event pages or an authorized asset source, then inspecting their pixels and attribution.

## Artwork acquisition handoff (2026-11-08)
**Confirmed source pages:** https://pokemongo.com/news/twilight-wishes-2026 and https://leekduck.com/events/twilight-wishes-2026/ (four costume variants, each shiny-eligible); https://pokemongo.com/news/halloween-part-1-2026 (bow Sinistea shiny-eligible). These are *identity* sources, not yet verified direct image URLs.

### Capture and verification pipeline
1. Extract actual `img[src]`, `img[data-src]`, `srcset`, and relevant embedded JSON image URLs from source pages, preserving the source-page URL, alt text and extraction timestamp.
2. Match image to **specific identity** and form (Pikachu sun crown vs moon crown; Espeon sun scarf vs Umbreon moon scarf; Sinistea bow Phony vs Antique if separate). Do not match by species alone.
3. Download candidate bytes using a controlled fetch; verify HTTPS, successful status, content-type, file signature, dimensions, image decoding, and a SHA-256 digest. Inspect rendered pixels, not filenames alone.
4. Determine usage rights/attribution before copying to the app or R2. Reference images may not be freely reusable.
5. Confirm separate Shiny artwork only when a visually verified corresponding variant exists; otherwise leave artwork unverified rather than recoloring a normal sprite.
6. For Purple Tee, classify as avatar clothing, not Pokémon; use GO Pass reward tile and an exact clothing image only after source match.
7. Generate owner gallery only for unresolved choices: side-by-side image preview, exact identity, original source, SHA-256, normal/shiny/form, and approve/reject. Verified straightforward matches can be documented without owner intervention.
8. Do not overwrite `public/costumes.json` or R2 objects before review and tests. Do not alter active Release 1.2 files without coordination.

### Current evidence and limitations
- Five costumed Pokémon identities and one avatar item are classified; **zero image binaries verified**, zero approved replacements.
- A direct image retrieval attempt from this environment failed because external DNS/network access was unavailable. This is an execution limitation, **not evidence that source assets are missing**.
- PR #357 has merged, providing snapshot image provenance handling. It does not itself scrape images or prove image identity. Re-run the store snapshot with real image URLs before expecting the 16 existing products to have artwork.

### Acceptance gates for next implementation
- Each of the six identities has a correct type and documented source; each image status is verified, rejected or missing with evidence.
- No wrong-form, wrong-costume or invented Shiny artwork; no unapproved redistribution.
- Web Store images are matched to exact product listing slug and image status, never inferred from title.
- Test costume fallback, GO Pass reward routing and missing-image handling on mobile; retain overseas event visibility.

## Datamined source evaluation — 2026-11-08
- **Primary source:** https://github.com/PokeMiners/pogo_assets — `Images` for 2D sprite/item assets, `3D Assets` for models and clothing. Its README confirms both APK and remotely downloaded assets, and points to https://pokeminers.com/scratch for newer unorganised files. Public repository latest indexed update was 2026-10-08, so a November asset may be present only in scratch or absent.
- **Code-to-name mapping:** https://github-wiki-see.page/m/Hailey-Ross/hailsDotGO/wiki/Data-Sources describes a working costume pipeline that discovers PokeMiners `pm{dex}.{code}.s.icon.png` shiny artwork and cross-checks costume code/labels against WatWowMap Game Master. Adapt the method, not unverified file paths or assumed codes.
- **Search limitation:** repository code searches for `pm0854`, `pm0025`, `sun crown`, `moon scarf`, `purple tee` returned no results; GitHub code search is not a reliable inventory of binary file paths. **This does not prove images are absent.** A recursive repository tree listing or cloned filename inventory is required.
- **Critical legal limitation:** PokeMiners explicitly says its assets are provided for educational use, with rights belonging to Niantic / The Pokémon Company. A publicly hosted copy is not a redistribution license; do not automatically ingest into public production assets.

### Proposed automated candidate manifest
For each candidate, capture `sourceRepository`, `sourceCommit`, `relativePath`, `sourcePage`, `dexNumber`, `costumeCode`, `form`, `shiny`, `assetType`, `sha256`, `dimensions`, `visualReviewStatus`, `rightsStatus`, `matchedIdentity`, `reviewerDecision`. Allow statuses `unverified`, `visually-confirmed`, `rejected`, `approved-for-use` only after provenance and rights checks.

### Immediate next execution gate
Enumerate `Images` and `3D Assets` filenames using GitHub recursive tree API or a shallow clone; cross-check codes against Game Master, inspect candidate bytes and screenshots; then create the approval gallery with actual direct images. Do not claim gallery is ready from search-result thumbnails alone.

## Verified upstream directory reconnaissance (2026-11-08)
- PokeMiners 2D Pokémon icons: https://github.com/PokeMiners/pogo_assets/tree/master/Images/Pokemon ; nested addressable assets: https://github.com/PokeMiners/pogo_assets/tree/master/Images/Pokemon/Addressable%20Assets . The GitHub browser **truncates this directory to 1,000 entries**, omitting 1,212 others, so browser filename scans cannot establish absence.
- Avatar apparel 2D assets: https://github.com/PokeMiners/pogo_assets/tree/master/Images/Clothing ; check shirts/tops and icon categories for Purple Tee, as well as 3D Assets/Clothing.
- The upstream repo already contains multiple Pikachu variants in numbered icon filenames (e.g. `pokemon_icon_025_00_01.png`, `pokemon_icon_025_00_02.png` and corresponding shiny versions), but **these numeric suffixes are not verified as sun/moon crown**. Never assign them by number alone.
- Upstream issue https://github.com/PokeMiners/pogo_assets/issues/116 documents real mismatches between Game Master `assetBundleSuffix` and filename `pm25.fFLYING_01.icon.png`; mapping must handle canonical and addressable naming schemes, not just a single guessed convention.
- Container's outbound DNS lookup for GitHub API failed; connected GitHub code search returned no binary matches. Full recursive tree inventory, binary download, checksum and pixel inspection remain **not executed**. Source-page browsing is possible but does not replace that verification.

**Next executable step:** a network-capable GitHub runner or Codex session should request `GET /repos/PokeMiners/pogo_assets/git/trees/master?recursive=1`, check `truncated`, filter paths for `Images/Pokemon/Addressable Assets/`, `Images/Clothing/`, and `3D Assets/Clothing/`; crosswalk candidates with the PokeMiners Game Master; inspect exact image bytes; produce a static, source-linked candidate gallery. Never mark any candidate approved from filenames alone.

## hailsDotGO source architecture assessment (2026-11-08)
Reference: https://github-wiki-see.page/m/Hailey-Ross/hailsDotGO/wiki/Data-Sources

| Source | Proposed GO Field Notes role | Verification caveat |
|---|---|---|
| ScrapedDuck (`events.min.json`) | Event discovery/change detection, original LeekDuck URL, timing and artwork candidates | Compare against existing source-watch before adding a duplicate fetcher; feed is not a full research/bonus catalog |
| LeekDuck event HTML | Supplement individual event details and research/bonus entries | Sanitize content, preserve citations and source timestamp; no automatic claim of completeness |
| PokeMiners | Costume/Shadow/Max asset candidates and exact form art | Asset-code matching, visual verification and rights gate required |
| WatWowMap Game Master | Costume pretty names, `isCostume`, form identity crosswalk | `isCostume` has known false negatives; don't discard unflagged visual-only costumes |
| Dittobase | Secondary costume display names | Suggestions only; never overwrite confirmed identity |
| pokemon-go-api | Raid/Max Battle/Mega data cross-check | Snapshot has no rotation dates; reconcile with event schedule |
| PoGoAPI | Shadow list, stats, types and moves | Shiny feed may lag; absence never proves unreleased |
| PokéAPI | Base/form sprites and localization fallback | Not authoritative for GO costumes, Dynamax or Gigantamax art |

**Architecture rule:** retain existing GO Field Notes sources and UI behavior, especially overseas in-person events visible by default. Introduce source health, timestamps, cross-checks and bounded caching rather than replacing established pipelines. Do not ingest third-party art into production without rights review.

## PoGoAPI release-status validation (pending live freshness check)

- Candidate feed: `https://pogoapi.net/api/v1/released_pokemon.json`; monitor `https://pogoapi.net/api/v1/api_hashes.json` to detect upstream changes.
- Treat released species as a **positive supporting signal** only. Missing entries must not be interpreted as proof of unreleased status; reconcile against official announcements and current event records.
- Keep species, form, Shiny, costume and Gigantamax release states separate; a species-level flag must never imply all its variants are available.
- Record fetch timestamp, response/hash and comparison counts before any automatic UI exposure. No release-status production change is authorized by this inventory note.
