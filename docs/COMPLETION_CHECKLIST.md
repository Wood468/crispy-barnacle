# GO Field Notes: completion checklist (9 Nov 2026)

Prioritised, one list. Done items point at evidence; open items carry acceptance criteria. Source: `docs/ROADMAP.md`, issue #364 and its comments, main at `81d59c0`.
Fixed decisions (do not reopen): artwork-led major cards, medium raid cards, compact minor rows; Today = live, confirmed shiny boosts, next 24h; 3-column Pokémon grids; no Track/Follow on Today or Event Details; Done hides per occurrence with undo; official banners by default, themed fallback only without a verified banner; no user-facing "reference" status; shiny boosts are never inferred.

## Done (do not redo)
- [x] Today / Event Details redesign, universal renderer, overseas events visible: Releases 1, 1.1, #372, #373. Evidence: production serves #373 (`sw.js` shell v257, `event-artwork.json`, `index.html` hash-identical to main).
- [x] Official banners by default; Into the Wild and GO Wild Area Global have verified banners in `public/event-artwork.json`; audit in `docs/asset-inventory/event-banner-audit.md`.
- [x] Importer identity fixes (costumes, Crowned forms, Max rosters, alias merge): #366 to #371, #373. Tests `test/importer-*.test.mjs`, `test/pipeline-e2e.test.mjs`.
- [x] Research + GO Pass tables (#317, #320, #321), Collection opportunity planner, Research freshness/recovery (ROADMAP 6 Nov).
- [x] Today slow-feed fallback with production smoke workflow (#258, #303, #304).

## P1 Release blockers
- [ ] **Regional Store pricing** (#374): verified vs estimated prices, owner-only route, monthly review script. Accept: CI green, Indonesian reference prices exact, estimates labelled with range/confidence/basis.
- [ ] **CI webkit job fails on every main merge** when Workers Builds reports only a preview build for 15 min (`scripts/wait-for-workers-build.mjs`; main run 42545309983 on `6da8e65`). Accept: the wait uses the production check on the merge commit or is skipped for non-deploy events; webkit green on main.
- [ ] **Installed iPhone PWA / offline upgrade evidence.** Accept: documented manual run (install, go offline, upgrade `gofn-shell-vNNN`, Collection keys `gofn-dex-v1`, `gofn-us-v1`, `gofn-stamp`, `gofn-today-done-v1` intact). Cannot be proven from CI.
- [ ] **State honesty (P2 in #364):** Done/Undo and Collection writes must not report success when storage throws. Accept: test with a throwing `localStorage`; visible error, no false success.

## P2 Product areas
- [ ] **Raids / Max Battles.** Accept: every rotation entry shows verified dates, exact form/costume art, Shadow/Dynamax/Gigantamax labelled; no base-art substitution; unknown art shows a labelled fallback. Evidence so far: Into the Wild Max roster in Battle tab (#373); Dynamax/Gigantamax/Crowned artwork not in manifest (no authorised source).
- [ ] **Schedule / calendar.** Accept: 320/375/390/430 + desktop, light/dark; week strip, calendar, timeline agree with Today on dates/timezones for one real event traced end to end (done for Into the Wild in #373; repeat for the next announced event).
- [ ] **GO Passes / rewards.** Accept: every current pass shows illustrated stages and rank rewards from source; November rank table materialised by importer (ROADMAP 4 Nov items); missing data says so.
- [ ] **Research.** Accept: dense lists, canonical alias coverage (events with several records appear once), freshness text, recovery state.
- [ ] **Collection / Mega.** Accept: Collection data untouched across releases; Mega progress shown; planner works offline.
- [ ] **Store / regional.** Accept: #374 merged; monthly `node scripts/regional-price-review.mjs` run clean or each flag acted on; new AU items discovered by the hourly watcher get regional rows.
- [ ] **Sources / update visibility.** Accept: each event shows its source and retrieval date; stale feed banner; importer cadence (hourly) confirmed by run records (ROADMAP 4 Nov: cadence not yet established).
- [ ] **Navigation, loading, empty, error states.** Accept: Today, Schedule, Battle, Collection, Research each have a loading, empty, error and offline screenshot; focus and accessible names verified.
- [ ] **PWA / offline.** Accept: `test/pwa.test.mjs` and `release_browser.py` green; precache list matches `index.html` versions (checked by tests).
- [ ] **Data pipeline.** Accept: new announcements appear without duplicates; 68 banner-less events labelled themed (no invented art); Sinistea bow and Wild Area purple tee remain unapproved.

## P3 Final polish (defer)
- [ ] Individual historical banners, one-off icons, spacing/animation tweaks, non-blocking parser exceptions.

## QA gate for every release
- [ ] node tests, python tests, validate, browser a/b/c, webkit, production-image-audit, CodeQL, Workers Builds green on the head SHA; screenshots at 360/390/430/desktop reviewed; production smoke after merge.
