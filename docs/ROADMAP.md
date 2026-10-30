# GO Field Notes — Completion Roadmap

_Maintained by the lead coordinator. Last consolidated: 31 Oct 2026, including #123 timezone support, #124 source-trust protection, #125 startup recovery, #127 preview media isolation, #128 community coordinate provenance, #129 source-freshness and raid-consistency monitoring, #130 public-data pre-push validation, #131 the full 44px touch-target audit, #132 Store Watch currency stability, #134 WCAG contrast for live countdowns and event-kind pills, and the next reliability follow-ups (finding IDs QA-\*, RES-\*, UX-\*, ENG-\* refer to the audits)._

## Status legend

✅ merged & verified in production · 🔧 PR open/in progress · ⏳ queued · 🔒 needs owner decision/permission

## Recently completed — 31 Oct 2026

- ✅ **#102 — roadmap and specialist agents:** added the UX, QA, research and engineering workstream definitions and consolidated roadmap.
- ✅ **#113 — Today mobile actions:** reflowed the compact event-card actions for 390px and 320px phones, preserving readable labels and 44px touch targets; browser regressions and the Cloudflare Workers production build passed.
- ✅ **#117 — Today activity summary:** separated in-game and in-person live counts while keeping overseas in-person event cards visible in the Happening now agenda; activity-count, narrow-screen and browser regressions passed, with production verification included in #118.
- ✅ **#118 — collection safety and offline shell:** account-scoped local partitions preserve device-only marks through first sign-in and keep account caches isolated; revision-checked `/api/dex` writes and saved-baseline three-way reconciliation prevent stale whole-snapshot overwrites. Exact entry-page assets are precached, and static responses are covered by the security-header contract. JavaScript, Python, all browser shards, CodeQL and the post-merge Cloudflare Workers production build passed. No D1 migration or R2/infrastructure change was applied.
- ✅ **#120 — offline navigation fallback:** Playwright verifies the offline page is precached, uncached routes fall back to the app shell, and the human-readable offline page is served if the shell is unavailable. All browser shards and the post-merge Workers production build passed.
- ✅ **#121 — timezone-stable deduplication:** Date objects and epoch timestamps are compared by the viewer's calendar day; date-only strings remain timezone-independent. LA/Tokyo regression coverage passed. This removes UTC-midnight day shifts from dedupe comparisons without inventing event timezone data.
- ✅ **#123 — venue-local and viewer-local times:** IANA timezone conversion, daylight-saving validation and dual venue/viewer calendar dates are merged. JavaScript, Python, all browser shards, CodeQL and the post-merge Cloudflare Workers production build passed on main `a65ac30` (build `99f13e92-fa44-4594-a1c1-d363fb29b314`).
- 🔧 **#124 — official-source date protection:** the scheduled audit no longer auto-overwrites a world-event date when an official Pokémon GO source is attached; discrepancies are retained as review alerts. PR and post-merge JavaScript, Python, browser and CodeQL checks passed; the next scheduled audit run remains to be confirmed.
- ✅ **#125 — resilient startup:** bounded initial data loading and temporary primary navigation are merged; post-merge JavaScript, Python and browser checks pass, with the retry panel retained for recovery.
- ✅ **#128 — community coordinate provenance:** 19 Wikipedia/Wikimedia references and one Reddit report are explicitly community-sourced, with no invented `verified` dates; only source-backed Reddit publication dates populate `reportedAt`. Ambiguous/country-only discovery locations are skipped. GPX coordinate links target `coords.url`, with event-source attribution kept separate. All PR and post-merge checks, the Cloudflare preview build and production Workers build passed.
- ✅ **#129 — source freshness and raid schedule consistency:** the health monitor now covers source-watch, community location discovery and 1–3★ raids; fatal importer/audit errors and total source-feed outages fail non-zero; the weekly report compares raidNow, Mega, Max and rotation windows without changing event data. The production snapshot audit found 0 mismatches across 6 comparisons. PR checks and the post-merge production Workers build passed.
- ✅ **#130 — public-data pre-push validation:** all 10 generated-public-data commit stages and 9 direct-main push stages across eight workflows validate before publishing, including a second validation after rebasing. Workflow-contract regression tests and post-merge JavaScript, Python, browser and production Workers checks passed.
- ✅ **#132 — Store Watch currency stability:** whole-store currency flips are held for 72 hours without changing saved prices or generating false price alerts; a changed currency restarts the hold, and a sustained new currency becomes the baseline without price-change alerts. Single-item mismatches are ignored while genuine same-currency changes and new items still alert. Regression, post-merge JavaScript/Python/browser/CodeQL and production Workers checks passed.
- ✅ **#131 — full 44px touch-target audit:** visible controls across Today, Schedule, Battle, Collection and Saved now meet the 44×44px target, including compact card actions, calendar day buttons, guide toggles and form controls. The offline shell cache was advanced to v134 with the exact dashboard stylesheet URL precached. The Playwright audit passed across all 12 view states; post-merge JavaScript, Python, browser A/B/C, CodeQL and production Workers checks passed.
- ✅ **#134 — live-countdown and event-kind contrast:** all nine event-kind pills meet WCAG AA 4.5:1, including the in-person and Twitch foreground corrections. Live/urgent countdowns use high-contrast text on a restrained kind-tinted surface. Browser regression checks cover all nine kinds and a live countdown; the offline shell cache was advanced to v135 with the updated dashboard CSS/JS URLs precached. Post-merge JavaScript, Python, browser A/B/C, CodeQL and production Workers checks passed.
- ✅ **#112 — visible data-load recovery:** added an accessible event-data error panel with a retry action; browser regressions and the Cloudflare Workers production build passed.
- ✅ **#100 — Today attention:** review actions navigate reliably; review counts refresh immediately; empty recent-updates panels disappear; acknowledged updates stay dismissed; meaningful event changes are tracked between visits.
- ✅ **#101 — curated data refresh:** snapshot moved to 30 Oct 2026; rotations, Raid/Spotlight Hours and Max Monday schedules were extended into early December; event/source URLs and the 1★ boss parsing correction were included. Ongoing freshness monitoring remains a separate task.
- ✅ **#105 — This Week and event details:** compact week-card treatment; 44px details/save/hide targets; honest unknown-source trust labels; no fabricated source-check date when only the dataset snapshot date is known; PWA asset URLs and service-worker cache version refreshed.
- ✅ **#108 — event-detail polish:** duplicate claims are shown once while retaining all contributing source attribution; category icons use one consistent line-icon system.
- ✅ **#109 — raid navigation:** compact mobile raid-week selector; boss rows link to Best attackers using only published weakness metadata; multi-type filters survive data refreshes.
- ✅ **#110 — importer date guard:** source-page matches are rejected when known article and event date windows do not overlap; unknown dates remain unknown rather than being guessed.
- ✅ **Community location discovery:** corrected the Reddit permalink regex, added an explicit Node syntax-check regression test, and confirmed the scheduled discovery workflow ran successfully. Candidate locations remain community-reported, not official event pins.

All merged milestones above passed their post-merge checks. Latest verified application commit: `f68b0ae4f341c5819771677dce8157a5b99e643f`; post-merge JavaScript, Python, all three browser shards and CodeQL passed. Cloudflare Workers production build `da814323-71be-4881-a7fd-d7ec4d94555a` completed successfully. The following roadmap-only commit does not change application code.

## P0 — Critical security / data integrity

- ✅ **ENG-1** PIN gate accepted the literal "undefined" when `SYNC_PIN` unset (preview deploys) — fixed in #99, verified in deployed Worker.
- ✅ **ENG-1b** PR #127 removes the preview-only `MEDIA` binding to production R2. Production `MEDIA` remains unchanged and previews retain staging D1; no secrets, Access settings, buckets or historical preview deployments were changed. The PR preview build and post-merge production build both passed.
- ✅ **QA-1** Sign-in/register no longer wipes device-only collection marks — #118 partitions local state by identity and merges guest marks into the first account before syncing; account-transition regressions and post-merge production verification passed.
- ✅ **QA-2/ENG-4** #118 adds atomic revision-checked writes plus saved-baseline three-way merge to the legacy Dex snapshot API. Independent additions/deletions reconcile across devices; same-mark concurrent edits use the newer snapshot timestamp. Stale writes are rejected and return the current server snapshot. PR #114 remains separate, unmerged additive schema preparation; its migration has not been applied.

## P1 — Major defects / reliability

- ✅ **RES-1/2/3/4/12** Snapshot refreshed on 30 Oct; rotation/Max/Spotlight/Raid Hour now extend into early Dec and the 1★ boss parsing issue was corrected in #101. #129 adds health coverage for source-watch, location discovery and 1–3★ raids, plus a read-only `raidNow`/`Upcoming` consistency report. It never auto-corrects event data.
- ✅ **QA-3/QA-4** #118 audits and precaches every local script/stylesheet URL referenced by the entry page; #120 adds end-to-end browser checks for cached app-shell fallback and the final offline-page fallback. All post-merge browser checks and Workers production builds passed.
- ✅ **ENG-2** Security headers/CSP are applied by the Worker wrapper to every response, including static assets; the header contract is covered by `test/security.test.mjs`.
- ✅ **QA-5/RES-5/QA-7** #121 fixes viewer-local calendar-day comparisons for Date/epoch dedupe inputs while keeping `YYYY-MM-DD` date-only values timezone-independent. #123 adds validated IANA venue timezone metadata and venue-local/viewer-local time display; PR, preview and post-merge production checks passed. Official [Sendai](https://pokemongo.com/en/gowildarea/sendai) lists 10:00–18:00 JST; official [Mexico City](https://pokemongo.com/es/gowildarea/mexico-city) lists 10:00–18:00 GMT−6, while an [es-MX variant](https://pokemongo.com/es-MX/gowildarea/mexico-city) also displays conflicting 23:00–07:00 CST text. Do not add Mexico gameplay hours until that source conflict is resolved.
- ✅ **RES-8** Reject importer source-page matches when known article and event dates do not overlap; retain existing link/title matching when either date is unknown. Covered by focused regression tests and the post-merge production build.
- ✅ **RES-9** #124 protects official world-event dates from Leek Duck auto-corrections and emits review alerts. #128 separates community coordinate reports from verification, preserves source-backed `reportedAt`, skips ambiguous/country-only locations, and fixes GPX coordinate-source links. The next scheduled audit execution remains to be confirmed.
- ✅ **UX-1** #112 provides the accessible recovery panel and retry action; #125 adds a bounded timeout and usable primary navigation when the initial data request stalls. Post-merge GitHub checks pass.
- ✅ **UX-2** Today event-card actions stay within 390px and 320px phone layouts; browser regression and production build verified in #113.
- ✅ **UX-3** Today live summary separates in-game and in-person activity counts while keeping overseas in-person event cards visible by default; regression, mobile browser and post-merge production checks passed.
- ⏳ **ENG-3** PIN brute-force: no global failure ceiling.

## P2 — Important UX / functionality / performance

- ✅ **ENG-7** #130 adds `scripts/validate-public-data.mjs` before every generated-public-data commit and again after rebasing before each direct `main` push, with workflow-contract regression tests; post-merge checks and production build passed. **RES-14** The terminology change from "confirmed" to "corroborated" remains open.
- ✅ **RES-13** Add `pokemongo.com` and `www.pokemongo.com` to `OFFICIAL_HOSTS`, with exact-host regression coverage; **RES-7** source label by host.
- **RES-6** Add Mexico City Wild Area; **RES-10** split Pokémon Night Out LA/London; **RES-11** duplicate world events.
- **UX-5** header badge counts empty-state rows; ✅ **UX-6** live countdowns and all event-kind pills meet 4.5:1 contrast, including the in-person pill; **UX-7** This Week actions and all visible primary controls across Today, Schedule, Battle, Collection and Saved now meet 44×44px, verified by a multi-view Playwright audit.
- **UX-8/QA-9** Owner moderation UI shown to visitors; **UX-9** Sync consolidated into one place.
- **UX-10** Desktop layout (2-column Today, calendar names, nav rail); **UX-11** mobile chrome cost; **UX-12** Today strip: Now → Next → Raids & Max today → Ending soon.
- **ENG-5** `user_state` per-key reads; **ENG-6** DDL on public GETs (🔒 schema); **ENG-8** rate limits on `/api/art`, `/api/guide`; **ENG-9** SW cache caps; **ENG-10** payload & immutable caching; **ENG-11** backups in own bucket (🔒).
- **QA-6** ui_checks shard a lazy-image check hangs; **QA-10** image weight (~4 MB first load).

## P3 — Premium polish

- Design-token system (type scale, 4px spacing, colour roles, radii, card anatomy) — **UX-15/17/18**.
- ✅ **UX-13** Source trust/freshness labels in #105; event-detail duplicate claims now merge source attribution before rendering, and every detail category uses a consistent line-icon treatment. ✅ **UX-14** Raid week selector as a compact mobile segmented control; boss rows link directly to Best attackers filtered to every published weakness; **UX-16** duplicate navigation.
- **ENG-12** single shared `esc()`; **ENG-13** narrow CSP img-src; **ENG-14** migration consolidation (🔒); **ENG-15** SHA-pinned actions; **ENG-16** robustness; **QA-8** tab keyboard semantics; **QA-11** costume art lookup.

## P4 — Opportunities

- "Tonight" planner (Spotlight/Raid Hour/Max Monday with weaknesses and your owned counters).
- Need-list alerts for Pokémon/shinies you still need.
- Ending-soon tray (tickets, GO Pass, research, exclusive moves).
- Raid share card; Travel mode (regional and in-person events at a destination).
- Owner PIN → session cookie.

## Owner decisions / permissions needed

1. Historical preview versions remain untouched; no cleanup, preview URL enabling or Access changes were approved as part of #127.
2. Raid rotation boundary time: Leek Duck says 6 am local; data uses 10:00 (RES-2).
3. Today scope: owner preference confirmed — keep overseas in-person events visible; distinguish their counts rather than hiding or folding them away.
4. Approval for D1 schema consolidation (ENG-6/14) and separate backup bucket (ENG-11).
