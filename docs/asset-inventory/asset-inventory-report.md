# Asset inventory — Wood468/crispy-barnacle

Inventory date: 2026-11-08T10:22:35.756403+00:00. Scope: default branch `main`, immutable tree/commit `390e9105fb47774ac9ad20de0c963a1708db5582`. Issue: https://github.com/Wood468/crispy-barnacle/issues/354.

## Scope and method

Read-only inventory of every tracked image identified by extension in the complete GitHub recursive tree (`truncated=false`); 337 tracked source/configuration/catalogue files inspected at the same revision. No repository checkout existed in this environment. No application code, branch, release, merge or deployment was changed. No image or animation binaries or external assets were downloaded or replaced. Source text and Git tree metadata only were retrieved. Outputs are separate local artifacts.

This snapshot does not include other branches, uncommitted Release 1.2 changes, R2 objects or remotely generated images. Release 1.2 implementation context is not present in this thread/environment; this inventory makes no claim that implementation advanced.

## Verified totals and inferred categories

**1,376 tracked image files**, **5,762,660 bytes**. File paths, sizes and Git blob identities are verified metadata. Formats below are extensions, not binary signature validation. Category counts are mutually exclusive path/manifest-based assignments, not visual verification.

| Format | Files |
|---|---:|
| PNG | 3 |
| SVG | 2 |
| WEBP | 1371 |

No tracked GIF, APNG or AVIF files were found (also no JPEG, ICO, BMP or TIFF). This does not prove WebP/PNG/SVG files are static.

| Category | Files |
|---|---:|
| GO Pass artwork | 3 |
| Gigantamax Pokémon artwork | 14 |
| Mega/Primal Pokémon artwork | 57 |
| Pokémon artwork | 132 |
| Pokémon base sprite | 1025 |
| alternate Pokémon form artwork | 3 |
| application icon | 5 |
| event/community infographic thumbnail | 64 |
| item/gameplay icon | 70 |
| season/event banner | 1 |
| shiny Pokémon artwork | 2 |

Dimensions and animation status cannot be verified without reading the asset bytes. CSV explicitly marks these unknown. Three app icon dimensions are declared by the web manifest (180×180, 192×192, 512×512), not measured. HTML rendering sizes such as 208×256 or 58×58 are not intrinsic dimensions. Thumbnail generation targets 640×960 maximum in `scripts/season-thumbnails.mjs:89`; source aspect ratio and generator history prevent assigning actual dimensions from that alone.

## Pokémon variants and surface coverage

- Base sprites: all 1,025 numeric `public/dex` entries map to names in `public/dex.json`; dynamic paths are assembled in `public/app.js:851`, `:869`, `:904`.
- `public/art/index.json` maps API query names to local artwork IDs, including Mega/Primal, Gigantamax, named/regional forms and two shiny images (`s215`, `s302`). CSV retains every query mapping per file. Shadow queries intentionally share base artwork; this is verified alias reuse, not evidence of an incorrect sprite.
- Costumes, shiny costumes and Gigantamax game art are mapped in `public/costumes.json` (`pictures`, `shiny`, `gmax`, `gmaxShiny`). Their `/img/ext/` files are outside the tracked tree; do not count them as tracked costumes or assert they are missing from deployment.
- Dynamax uses runtime parameters and sprite resolution in `src/worker.js:389–413`; no separately named tracked Dynamax sprite set was identified. Dynamax and Gigantamax are distinct and should not be inferred from one another.
- Item/research reward imagery is shared from `public/ico`; `public/detail.js:337` maps Stardust, XP, berries, potions, revives and Mega energy. Pokémon research rewards reuse the general Pokémon renderer rather than a dedicated tracked reward sprite directory.
- Raid/Max/Mega icons are tagged in CSV. Event/community infographics have 64 tracked thumbnails; their original posters reside outside Git. Four season thumbnails include three GO Pass posters and one season/event poster.
- Store imagery: no dedicated tracked store image directory identified. Inspect `public/store.js`, `public/buy.js`, `public/prices.json`, `public/store-log.json`, `data/store-state.json` and `scripts/store-watch.mjs` for product/catalogue references; remote product images are outside tracked totals.
- Remote animation template exists at `https://play.pokemonshowdown.com/sprites/ani[-shiny]/<id>.gif`. **Verified:** `public/app.js:68` sets `sd=''`, with a comment that animated sprites were switched off; the template is not proof animations are currently used.

## References, duplicates and suspected problems

CSV records literal application references (`public/`, `src/`), all source-text matches, and separate dynamic/manifest evidence. Literal matches include comments; static analysis does not prove runtime reachability. Filename-only matches are intentionally avoided to reduce false matches between numeric sprite IDs. Dynamic references are candidates, not proof every file is exercised.

**Verified byte-identical duplicate groups:** 8 (Git blob SHA equality). Same image in different sizes/encodings cannot be detected without binary/pixel inspection.

- `public/art/10216.webp`; `public/art/10217.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1558797419636985940.webp.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1561441160554094703.webp.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1558797600608747571.png.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1560178079878479925.png.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1558805792956620800.webp.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1559125971003777094.webp.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1559666456134815897.webp.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1565266679955726382.webp.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1559980489480077383.webp.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1561441119789650044.webp.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1566916181749932032.png.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1567456104860885044.png.webp`
- `public/infographic-thumbs/infographics/g47ix/discord-1567217227550433310.webp.webp`; `public/infographic-thumbs/infographics/g47ix/discord-1567818617846894664.webp.webp`

**Suspected unused assets:** 19 files have neither a literal application reference nor a recognized dynamic/manifest family. This is a review list, not deletion advice. Broader family attribution may still overestimate usage; no runtime tracing was performed.

- `public/art/157.webp`
- `public/ico/g/elite-charged-tm.webp`
- `public/ico/g/elite-fast-tm.webp`
- `public/ico/g/exraid.webp`
- `public/ico/g/hatched.webp`
- `public/ico/g/megaraid.webp`
- `public/ico/g/primalraid.webp`
- `public/ico/g/purified.webp`
- `public/ico/g/rg-alola.webp`
- `public/ico/g/rg-galar.webp`
- `public/ico/g/rg-hisui.webp`
- `public/ico/g/rg-hoenn.webp`
- `public/ico/g/rg-johto.webp`
- `public/ico/g/rg-kalos.webp`
- `public/ico/g/rg-paldea.webp`
- `public/ico/g/rg-sinnoh.webp`
- `public/ico/g/rg-unova.webp`
- `public/ico/g/shadowraid.webp`
- `public/ico/g/shiny.webp`

**Local image references absent from tracked files:** 154 distinct literal paths. Of these, 154 are under documented R2 prefixes and 0 are other candidates. No remote existence requests were made. URL parsing is lexical: third-party URL path fragments, examples and generated paths can be false positives.

### Other absent-path candidates (suspected, not confirmed broken links)


### R2-backed references absent from Git (expected architecture; existence unverified)

- `/img/ext/003-gi-1ddc27e6.png` — public/costumes.json:53
- `/img/ext/003-gi-c60030cd.png` — public/costumes.json:74
- `/img/ext/006-gi-250f4f37.png` — public/costumes.json:54
- `/img/ext/006-gi-5b9d1ec3.png` — public/costumes.json:75
- `/img/ext/009-gi-0bac5d58.png` — public/costumes.json:76
- `/img/ext/009-gi-cdcaac4b.png` — public/costumes.json:55
- `/img/ext/012-gi-08acfc71.png` — public/costumes.json:64
- `/img/ext/012-gi-224f7b5c.png` — public/costumes.json:85
- `/img/ext/025-gi-21e3da3b.png` — public/costumes.json:56
- `/img/ext/025-gi-90e7de17.png` — public/costumes.json:77
- `/img/ext/025-halloween2026-0a455e9f.png` — public/costumes.json:14
- `/img/ext/025-halloween2026-31e70243.png` — public/costumes.json:31
- `/img/ext/025-marathon-8cf5be7d.png` — public/costumes.json:5
- `/img/ext/025-marathon-a1644171.png` — public/costumes.json:22
- `/img/ext/041-tophat-763a8377.png` — public/costumes.json:36
- `/img/ext/041-tophat-ca5244bb.png` — public/costumes.json:19
- `/img/ext/052-gi-9480e9de.png` — public/costumes.json:57
- `/img/ext/052-gi-cf3efce3.png` — public/costumes.json:78
- `/img/ext/068-gi-2a092da8.png` — public/costumes.json:58
- `/img/ext/068-gi-77fe271a.png` — public/costumes.json:79
- `/img/ext/068-jacket-10b90aea.png` — public/costumes.json:13
- `/img/ext/068-jacket-30bb5b55.png` — public/costumes.json:30
- `/img/ext/094-gi-2ab72c36.png` — public/costumes.json:80
- `/img/ext/094-gi-e3b3eba2.png` — public/costumes.json:59
- `/img/ext/094-spooky-0bc8ee88.png` — public/costumes.json:18
- `/img/ext/094-spooky-ed20e663.png` — public/costumes.json:35
- `/img/ext/099-gi-6b0be5b5.png` — public/costumes.json:81
- `/img/ext/099-gi-9a284633.png` — public/costumes.json:60
- `/img/ext/131-gi-619fdb19.png` — public/costumes.json:82
- `/img/ext/131-gi-e8bc7eef.png` — public/costumes.json:61
- `/img/ext/133-gi-877db145.png` — public/costumes.json:51
- `/img/ext/143-gi-98329338.png` — public/costumes.json:62
- `/img/ext/143-gi-ff342ef4.png` — public/costumes.json:83
- `/img/ext/2026-10-06-Yveltal-Raid-Guide-2f8d08b9.jpg` — public/event-info.json:124
- `/img/ext/25-pikachu-astronaut-00a1fb21.png` — public/costumes.json:4
- `/img/ext/393-halloween2021-3861095b.png` — public/costumes.json:15
- `/img/ext/393-halloween2021-a96dab90.png` — public/costumes.json:32
- `/img/ext/426-halloween2021-2b24aedc.png` — public/costumes.json:16
- `/img/ext/426-halloween2021-83b9dd58.png` — public/costumes.json:33
- `/img/ext/4aa21432-0cfc-4c93-b3eb-0c15f322389d-0119b088.webp` — public/event-info.json:94
- `/img/ext/569-gi-2804be4e.png` — public/costumes.json:63
- `/img/ext/569-gi-8edef473.png` — public/costumes.json:84
- `/img/ext/722-halloween-293d67e9.png` — public/costumes.json:17
- `/img/ext/722-halloween-31fd907e.png` — public/costumes.json:34
- `/img/ext/774-b-02c124bb.png` — public/costumes.json:10
- `/img/ext/774-b-34600456.png` — public/costumes.json:27
- `/img/ext/774-g-3cb8a598.png` — public/costumes.json:9
- `/img/ext/774-g-6f912714.png` — public/costumes.json:26
- `/img/ext/774-i-4a440459.png` — public/costumes.json:28
- `/img/ext/774-i-f9670fc5.png` — public/costumes.json:11
- `/img/ext/774-o-799f4ae7.png` — public/costumes.json:7
- `/img/ext/774-o-c6223ca1.png` — public/costumes.json:24
- `/img/ext/774-r-3874c558.png` — public/costumes.json:6
- `/img/ext/774-r-dd7b7c2f.png` — public/costumes.json:23
- `/img/ext/774-v-d73eccda.png` — public/costumes.json:12
- `/img/ext/774-v-de3e8efe.png` — public/costumes.json:29
- `/img/ext/774-y-479ff710.png` — public/costumes.json:25
- `/img/ext/774-y-cdb33b7c.png` — public/costumes.json:8
- `/img/ext/809-gi-f1897f89.png` — public/costumes.json:52
- `/img/ext/812-gi-a8f48418.png` — public/costumes.json:86
- `/img/ext/812-gi-ce52b5fa.png` — public/costumes.json:65
- `/img/ext/815-gi-1dbcc545.png` — public/costumes.json:87
- `/img/ext/815-gi-f1a7c893.png` — public/costumes.json:66
- `/img/ext/818-gi-350e8472.png` — public/costumes.json:67
- `/img/ext/818-gi-3e5606f2.png` — public/costumes.json:88
- `/img/ext/823-gi-26dbbdc9.png` — public/costumes.json:40
- `/img/ext/826-gi-01ef8b9d.png` — public/costumes.json:42
- `/img/ext/834-gi-51743516.png` — public/costumes.json:48
- `/img/ext/839-gi-c1cf14a7.png` — public/costumes.json:43
- `/img/ext/841-gi-07da2817.png` — public/costumes.json:44
- `/img/ext/842-gi-064cfe4b.png` — public/costumes.json:45
- `/img/ext/844-gi-373e05b1.png` — public/costumes.json:46
- `/img/ext/849-gi-79889614.png` — public/costumes.json:89
- `/img/ext/849-gi-fa38016c.png` — public/costumes.json:68
- `/img/ext/851-gi-6806465b.png` — public/costumes.json:47
- `/img/ext/858-gi-6ccc95ec.png` — public/costumes.json:41
- `/img/ext/861-gi-0ea1d729.png` — public/costumes.json:69
- `/img/ext/869-gi-35ddab4e.png` — public/costumes.json:49
- `/img/ext/879-gi-0691687c.png` — public/costumes.json:50
- `/img/ext/884-gi-a9ba5c6d.png` — public/costumes.json:73
- `/img/ext/884-gi-fc4c7ccd.png` — public/costumes.json:39
- `/img/ext/892-gi-347f06d8.png` — public/costumes.json:90
- `/img/ext/892-gi-e7d83034.png` — public/costumes.json:70
- `/img/ext/BreadRaidEmblem-71f25669.png` — public/dash.js:488
- `/img/ext/Max-Particle-Sprite-9818b5dc.png` — public/dash.js:470
- `/img/ext/Mega-Blastoise-Raid-Guide4-d0e94d17.jpg` — public/event-info.json:159
- `/img/ext/go-pass-november-2026-1fb455c3.jpg` — public/events-v1.json:6200, public/season.json:214
- `/img/ext/go-pass-october-2026-01ad36e2.jpg` — public/events-v1.json:33031, public/season.json:87
- `/img/ext/powerspots-overworld-5a586254.webp` — public/dash.js:471
- `/img/ext/season-24-twilight-trails-99c978ed.jpg` — public/events-v1.json:30454, public/season.json:9
- `/infographics/g47ix/discord-1558796039035682828.webp` — public/event-info.json:101, public/infographic-queue.json:1726
- `/infographics/g47ix/discord-1558797282634236005.webp` — public/event-info.json:286, public/infographic-queue.json:1693
- `/infographics/g47ix/discord-1558797419636985940.webp` — public/event-info.json:293, public/infographic-queue.json:1660
- `/infographics/g47ix/discord-1558797600608747571.png` — public/event-info.json:222, public/infographic-queue.json:1624
- `/infographics/g47ix/discord-1558805792956620800.webp` — public/event-info.json:603, public/infographic-queue.json:1591
- `/infographics/g47ix/discord-1558805865321201783.png` — public/event-info.json:190, public/infographic-queue.json:1557
- `/infographics/g47ix/discord-1559124879431835669.webp` — public/event-info.json:639, public/infographic-queue.json:1524
- `/infographics/g47ix/discord-1559125018619805807.webp` — public/event-info.json:581, public/infographic-queue.json:1491
- `/infographics/g47ix/discord-1559125714090065931.jpg` — public/event-info.json:369, public/infographic-queue.json:1476
- `/infographics/g47ix/discord-1559125750257549383.jpg` — public/event-info.json:131, public/infographic-queue.json:1461
- `/infographics/g47ix/discord-1559125836571877451.jpg` — public/event-info.json:254, public/event-info.json:279, public/event-info.json:325, public/event-info.json:347, public/infographic-queue.json:1428
- `/infographics/g47ix/discord-1559125906088398879.jpg` — public/event-info.json:398, public/infographic-queue.json:1413
- `/infographics/g47ix/discord-1559125971003777094.webp` — public/event-info.json:610, public/infographic-queue.json:1380
- `/infographics/g47ix/discord-1559619613635907710.png` — public/event-info.json:474, public/infographic-queue.json:1320
- `/infographics/g47ix/discord-1559619652097679394.png` — public/event-info.json:503, public/infographic-queue.json:1305
- `/infographics/g47ix/discord-1559666456134815897.webp` — public/event-info.json:535, public/infographic-queue.json:1272
- `/infographics/g47ix/discord-1559738893530832969.jpg` — public/event-info.json:528, public/infographic-queue.json:1239
- `/infographics/g47ix/discord-1559738893870571582.jpg` — public/event-info.json:481, public/infographic-queue.json:1224
- `/infographics/g47ix/discord-1559878109744996384.jpg` — public/event-info.json:661, public/infographic-queue.json:1202
- `/infographics/g47ix/discord-1559980489480077383.webp` — public/event-info.json:708, public/infographic-queue.json:1162
- `/infographics/g47ix/discord-1560091967126507540.jpg` — public/event-info.json:686, public/infographic-queue.json:1141
- `/infographics/g47ix/discord-1560178079878479925.png` — public/event-info.json:229, public/infographic-queue.json:1106
- `/infographics/g47ix/discord-1560468502077374585.jpg` — public/event-info.json:740, public/event-info.json:762, public/event-info.json:787, public/event-info.json:812, public/event-info.json:834, public/event-info.json:856, public/event-info.json:881, public/event-info.json:903, public/infographic-queue.json:1050
- `/infographics/g47ix/discord-1561413791298752732.jpg` — public/event-info.json:197, public/infographic-queue.json:1012
- `/infographics/g47ix/discord-1561441119789650044.webp` — public/event-info.json:715, public/infographic-queue.json:977
- `/infographics/g47ix/discord-1561441160554094703.webp` — public/event-info.json:300, public/infographic-queue.json:938
- `/infographics/g47ix/discord-1561441170037411973.webp` — public/event-info.json:928, public/infographic-queue.json:907
- `/infographics/g47ix/discord-1562196923555913858.png` — public/event-info.json:953, public/infographic-queue.json:885
- `/infographics/g47ix/discord-1562196937434726410.png` — public/event-info.json:985, public/infographic-queue.json:870
- `/infographics/g47ix/discord-1562287413798375506.jpg` — public/event-info.json:960, public/infographic-queue.json:848
- `/infographics/g47ix/discord-1562540565692809337.jpg` — public/event-info.json:1177, public/infographic-queue.json:814
- `/infographics/g47ix/discord-1562635282564522044.jpg` — public/event-info.json:1199, public/infographic-queue.json:799
- `/infographics/g47ix/discord-1562714788373602437.png` — public/event-info.json:1046, public/infographic-queue.json:784
- `/infographics/g47ix/discord-1562877846815252562.jpg` — public/event-info.json:1221, public/infographic-queue.json:753
- `/infographics/g47ix/discord-1563199215121858616.jpg` — public/event-info.json:617, public/infographic-queue.json:738
- `/infographics/g47ix/discord-1563817072260026492.png` — public/event-info.json:376, public/infographic-queue.json:704
- `/infographics/g47ix/discord-1564171478423834735.jpg` — public/event-info.json:1246, public/infographic-queue.json:683
- `/infographics/g47ix/discord-1564819557892366358.webp` — public/event-info.json:1303, public/infographic-queue.json:668
- `/infographics/g47ix/discord-1564819648346726504.png` — public/event-info.json:1278, public/infographic-queue.json:646
- `/infographics/g47ix/discord-1565053518329684099.webp` — public/event-info.json:1328, public/infographic-queue.json:612
- `/infographics/g47ix/discord-1565176569872252949.png` — public/event-info.json:1374, public/infographic-queue.json:579
- `/infographics/g47ix/discord-1565266679955726382.webp` — public/event-info.json:542, public/infographic-queue.json:545
- `/infographics/g47ix/discord-1565629031896846377.png` — public/event-info.json:405, public/infographic-queue.json:512
- `/infographics/g47ix/discord-1565629054319591515.webp` — public/weekly.json:16
- `/infographics/g47ix/discord-1565674951699071116.jpg` — public/event-info.json:549, public/infographic-queue.json:478
- `/infographics/g47ix/discord-1565738053157392384.png` — public/event-info.json:1253, public/infographic-queue.json:444
- `/infographics/g47ix/discord-1566749490084319334.webp` — public/weekly.json:8
- `/infographics/g47ix/discord-1566880019089723575.webp` — public/event-info.json:1396, public/infographic-queue.json:410
- `/infographics/g47ix/discord-1566916181749932032.png` — public/event-info.json:1421, public/infographic-queue.json:375
- `/infographics/g47ix/discord-1567217227550433310.webp` — public/event-info.json:1453, public/infographic-queue.json:360
- `/infographics/g47ix/discord-1567330302207074475.webp` — public/event-info.json:1485, public/infographic-queue.json:326
- `/infographics/g47ix/discord-1567330361497620490.png` — public/event-info.json:1532, public/infographic-queue.json:292
- `/infographics/g47ix/discord-1567338528482926603.png` — public/event-info.json:1510, public/infographic-queue.json:258
- `/infographics/g47ix/discord-1567456104860885044.png` — public/event-info.json:1428, public/infographic-queue.json:223
- `/infographics/g47ix/discord-1567818617846894664.webp` — public/event-info.json:1460, public/infographic-queue.json:208
- `/infographics/g47ix/discord-1568019536228257994.webp` — public/event-info.json:1335, public/infographic-queue.json:177
- `/infographics/g47ix/discord-1568019536358412349.webp` — public/event-info.json:1342, public/infographic-queue.json:146
- `/infographics/g47ix/discord-1568019537834676367.png` — public/event-info.json:1557, public/infographic-queue.json:111
- `/infographics/g47ix/discord-1568019569581494334.webp` — public/event-info.json:1349, public/infographic-queue.json:77
- `/infographics/g47ix/discord-1568023752749613163.webp` — public/event-info.json:556, public/infographic-queue.json:44
- `/infographics/g47ix/discord-1568890467293069435.webp` — public/infographic-queue.json:8
- `/infographics/g47ix/tg-aqad6xfrgx4-afz.jpg` — public/event-info.json:427, public/infographic-queue.json:1350
- `/infographics/g47ix/tg-aqad7bfrgx4-afz.jpg` — public/event-info.json:449, public/infographic-queue.json:1335
- `/infographics/g47ix/tg-aqadbbjrgx4-afz.jpg` — public/event-info.json:166, public/infographic-queue.json:1365

### Potential Pokémon/form mapping issues (suspected)

- **Verified shared blob; mapping implication unverified:** `public/art/10216.webp` and `public/art/10217.webp` are identical, while the artwork manifest labels them Gigantamax Flapple and Gigantamax Appletun respectively. These forms have similar shared visual designs; the duplicate alone does not establish an incorrect mapping. Check source provenance before changing either.
- **Verified catalogue unresolved list:** `public/costumes.json` records six `missing` entries: `sinistea|bow`, `pikachu (sun crown)|sun crown (no dex number)`, `pikachu (moon crown)|moon crown (no dex number)`, `espeon (sun scarf)|sun scarf (no dex number)`, `umbreon (moon scarf)|moon scarf (no dex number)` and `tee|purple (no dex number)`. The last entry is a suspected non-Pokémon extraction/mapping artifact; this has not been confirmed. These are manifest findings, not verified missing deployed files. Costume dictionaries contain 16 normal costume mappings, 15 shiny mappings, 32 Gigantamax and 18 shiny Gigantamax mappings; they are outside tracked-file counts.

- `public/app.js:47–54` strips parenthetical text while making Showdown IDs. Thus named forms such as Landorus (Therian) can collapse to base IDs if this animation path is re-enabled. Currently the main renderer disables `sd`; this is a dormant mapping risk, not a verified live wrong image.
- `tools/build_forms.py:24` classifies keys using the first segment; `alola-cap` is therefore grouped as regional in `public/forms.json`, although a cap is a costume descriptor. The catalogue documents series forms rather than GO availability; review taxonomy before treating every regional group as a regional body form.
- `public/art/index.json` contains many newer Mega labels and numeric IDs. Their existence in a series catalogue does not establish availability in Pokémon GO (`tools/build_forms.py:4`). No external authoritative comparison or visual sprite check was performed; no specific ID is declared incorrect on that basis.
- Exact form runtime handling and labelled base fallbacks exist in `src/worker.js:253` and `public/app.js:100–110`. Inspect these before concluding that a missing local form file necessarily renders the wrong Pokémon.

## Manifests, provenance and licensing

- `public/art/index.json`: local artwork query-to-ID manifest; no dimensions/licence fields.
- `public/dex.json`: numeric species catalogue. `public/forms.json`: PokeAPI CSV series form catalogue; not GO availability.
- `public/costumes.json`, `scripts/costumes.mjs`: costume/Gigantamax mappings and Serebii/Dittobase source logic.
- `public/season.json`, root `infographics.json`: poster/catalogue records; thumbnail generators derive tracked paths from original references. `public/manifest.webmanifest`: app icon declarations.
- `scripts/mirror-images.mjs`: external mirror naming/provenance process. `scripts/r2-sync.sh`: explicitly documents R2 prefixes `infographics`, `img/ext`, `tg-inbox`, `archive`; no bucket access performed.
- `src/worker.js:28`: official-artwork source base `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/`.
- `src/worker.js:31`: costume source base `https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable%20Assets/`.
- `src/image-policy.js`: source allowlist includes Pokémon Showdown, Bulbagarden, Pokebattler, Leek Duck/CDN, Googleusercontent and Google Cloud Storage. An allowed host is not proof an individual file came from it.
- `public/sources.html`, `public/sources.js`, `docs/phase1-sources.md`: source/attribution context; source attribution does not itself grant an image licence.
- The tree contains `public/data/cp/PVPoke-LICENSE.txt` and a related README. That licence applies to the CP/PvPoke dataset context; no evidence establishes that it licences Pokémon artwork. No root LICENSE or per-image licence manifest was found. All CSV image rows therefore mark per-asset licence as unestablished; this is missing provenance evidence, not a legal conclusion.

## Limitations and next review

Asset dimensions, true format, frame counts, SVG animation, visual duplicates, visual identity and remote/R2 availability remain unverified under the no-download constraint. A later authorized binary inspection can fill those fields; no replacements or downloads have been initiated. No tests/build were run because no application changes were made. Deliverables are CSV (one row per tracked image) and this Markdown report; no GitHub issue mutation is required when downloadable artifacts are provided.
