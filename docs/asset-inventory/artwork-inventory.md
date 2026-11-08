# Variant artwork: inventory, pipeline and owner actions

Written 2026-11-08. Supersedes the "next executable step" in `approval-shortlist.md` (#359): the recursive PokeMiners inventory, game-master cross-check, byte checks and visual review described there have now been run.

## What exists upstream (read-only inventory, no binaries committed)

| Source | Finding |
|---|---|
| `PokeMiners/pogo_assets` @ `db10df7` (2026-10-28), 42,785 paths | `Images/Pokemon/Addressable Assets/pm<dex>.<f\|c><CODE>[.g2][.s].icon.png`: 3,404 icons over 927 species; 617 form/costume codes (419 `f`-style, 198 `c`-style, same species can have both); Gigantamax is `fGIGANTAMAX` for 13 species only; Mega `fMEGA`/`fPRIMAL` 48. **No Shadow or Dynamax sprite exists**: those are in-game effects. Shiny is the `.s` twin; 10 normal icons have none. |
| `PokeMiners/game_masters` latest | 18,812 templates. `formSettings` has `isCostume` for the four GO Fest 2024 forms. Nothing yet for the Sinistea bow or the Wild Area tee (clothing templates `AVATAR_*_hat_crownsun/crownmoon` exist but are trainer hats, never Pokémon costumes). |
| `pokeminers.com/scratch` | 302 to a Google Drive folder; cannot be listed from automation. Newer unsorted files may be there. |
| `PokeAPI/sprites` | Base and form official artwork only. Not authoritative for costumes, Shadow, Dynamax or Gigantamax. |
| Existing site sources | `/api/art` (PokeAPI + PokeMiners, edge-cached), costume/Gigantamax pictures mirrored to R2 (`/img/ext/`, from Serebii/Dittobase). 81 legacy manifest entries were checksummed from production. |

`docs/asset-inventory/pokeminers-index.json` is the compact, committed availability index (metadata only). Rebuild it with a blobless clone:
`git clone --depth 1 --filter=blob:none --no-checkout https://github.com/PokeMiners/pogo_assets.git && git -C pogo_assets ls-tree -r HEAD > ls-tree.txt && node scripts/inventory-pokeminers.mjs --tree-file ls-tree.txt docs/asset-inventory/pokeminers-index.json --commit <sha>`.

## How identity is decided

Identity is `{dex, form, kind, costume, shiny}` (`variantKey`). A file name is never trusted alone. A candidate needs the costume label, the `pm<dex>.f<CODE>` name and a game-master `isCostume` form to agree, and then someone has to look at the pixels.

1. `scripts/artwork-match.mjs` reads event pages (Leek Duck names the exact `pm<dex>.f<CODE>` icon next to "Pikachu wearing a sun crown"), checks the PokeMiners index and the game-master form table, and emits **candidates only**.
2. A reviewer views the bytes and records `approvedAsset` (source path, commit, git blob, sha256, dimensions, review notes, rights) in `candidate-queue.json`.
3. `node scripts/artwork-manifest.mjs` regenerates `public/artwork-manifest.json`; the build refuses an approved item without a visual review and a sha256. CI checks the manifest and `approval-gallery.html` are current.
4. `public/variant-art.js` resolves a request against the manifest, then the legacy costume maps, then a verified source rule (Gigantamax), and otherwise falls back to the ordinary species picture with a visible badge.

Future events need no code change: a new costume is a candidate (from the importer's event pages), one reviewed queue entry, and a regenerated manifest. A new Pokémon already works as a species through `/api/art`.

## The six priority assets

| Asset | Verdict | Evidence |
|---|---|---|
| Pikachu wearing a sun crown | **Verified** (normal + shiny) | `pm25.fGOFEST_2024_STIARA`; official post, Leek Duck icon and alt text, PokeMiners file, game-master `PIKACHU_GOFEST_2024_STIARA` isCostume. Viewed: Pikachu with a small crown carrying an orange sun. |
| Pikachu wearing a moon crown | **Verified** (normal + shiny) | `pm25.fGOFEST_2024_MTIARA`, same checks. Viewed: blue crescent-moon crown. |
| Espeon wearing a sun scarf | **Verified** (normal + shiny) | `pm196.fGOFEST_2024_SSCARF`. Viewed: orange sun-motif scarf; shiny is the green Espeon. |
| Umbreon wearing a moon scarf | **Verified** (normal + shiny) | `pm197.fGOFEST_2024_MSCARF`. Viewed: blue moon-motif scarf; shiny has blue rings. |
| Sinistea wearing a bow | **Candidate, not live** | Identity confirmed (official post, Leek Duck `pm854.fP_HALLOWEEN_2026_01`, Phony form). Viewed a clean 533×533 Leek Duck render and a 63×48 icon crop. The game file is not in PokeMiners yet and the only copies are third-party hosted: owner decision needed. Antique-form bow: not found. |
| GO Wild Area 2026 Tee (Purple) | **Avatar clothing, candidate image** | Never a Pokémon costume (removed from `missing`, now `avatar` in `costumes.json`; the resolver treats clothing names as avatar items). Only image is a promotional screenshot of a trainer wearing it (viewed). Not in PokeMiners clothing or the game master yet. |

The four verified costumes were the GO Fest 2024 costumes (the asset names say TIARA for the crowns); Twilight Wishes re-uses them.

## Rights

PokeMiners assets are Niantic / The Pokémon Company / Nintendo / Game Freak property, published for educational use; a public mirror is not a licence. Following the repository's existing policy, they are only reached through the same-origin edge proxy `GET /api/art` (as before), never committed or redistributed. The manifest records the rights note per entry. Third-party hosted candidates (Leek Duck CDN) are shown in `approval-gallery.html` by link only.

## Owner actions

1. Open `docs/asset-inventory/approval-gallery.html` and decide Sinistea bow (use the Leek Duck render? wait for PokeMiners?) and the Wild Area tee screenshot.
2. Confirm you are comfortable with the PokeMiners proxy policy for the four verified costumes (set their `status` to `rejected` in the queue and rebuild to switch them off).
3. The importer record `leekduck:twilight-wishes-2026` lists Pikachu, Espeon and Umbreon without their costumes (the page names costumes only in image alt text), so its gallery shows plain species. The legacy `twilightwishes` record is correct. Teach the importer to read icon alt text (see `extractIconRefs`) when #352 lands.
