# GO Field Notes — Completion Roadmap

_Maintained by the lead coordinator. Last consolidated: 30 Oct 2026 from the QA, Research, UX and Engineering audits (finding IDs QA-\*, RES-\*, UX-\*, ENG-\* refer to those reports)._

## Status legend

✅ merged & verified in production · 🔧 PR open/in progress · ⏳ queued · 🔒 needs owner decision/permission

## Recently completed — 30 Oct 2026

- ✅ **#102 — roadmap and specialist agents:** added the UX, QA, research and engineering workstream definitions and consolidated roadmap.
- ✅ **#100 — Today attention:** review actions navigate reliably; review counts refresh immediately; empty recent-updates panels disappear; acknowledged updates stay dismissed; meaningful event changes are tracked between visits.
- ✅ **#101 — curated data refresh:** snapshot moved to 30 Oct 2026; rotations, Raid/Spotlight Hours and Max Monday schedules were extended into early December; event/source URLs and the 1★ boss parsing correction were included. Ongoing freshness monitoring remains a separate task.
- ✅ **#105 — This Week and event details:** compact week-card treatment; 44px details/save/hide targets; honest unknown-source trust labels; no fabricated source-check date when only the dataset snapshot date is known; PWA asset URLs and service-worker cache version refreshed.
- ✅ **Community location discovery:** corrected the Reddit permalink regex, added an explicit Node syntax-check regression test, and confirmed the scheduled discovery workflow ran successfully. Candidate locations remain community-reported, not official event pins.

All merged milestones above passed their post-merge test checks; the latest main commit also passed the Cloudflare Workers production build.

## P0 — Critical security / data integrity

- ✅ **ENG-1** PIN gate accepted the literal "undefined" when `SYNC_PIN` unset (preview deploys) — fixed in #99, verified in deployed Worker.
- 🔒 **ENG-1b** Preview deployments bind the production R2 bucket (private prices/places, nightly D1 backups). Needs a separate preview bucket and/or Cloudflare Access on previews; old preview versions still run pre-fix code.
- 🔧 **QA-1** Sign-in/register wiped device-only collection marks — fix: merge into account.
- 🔧 **QA-2/ENG-4** Dex sync whole-document last-writer-wins loses marks across devices — fix: per-mark merge.

## P1 — Major defects / reliability

- 🔧 **RES-1/2/3/4/12** Snapshot refreshed on 30 Oct; rotation/Max/Spotlight/Raid Hour now extend into early Dec and the 1★ boss parsing issue was corrected in #101. Remaining: automated freshness monitoring and a separate consistency check for `raidNow`/`Upcoming`.
- 🔧 **QA-3/QA-4** Partially addressed in #105: versioned assets are precached and the shell cache is bumped. The offline redirect/fallback behaviour still needs a separate end-to-end recheck.
- ⏳ **ENG-2** Security headers/CSP not applied to static pages (no `public/_headers`).
- ⏳ **QA-5/RES-5/QA-7** In-person events lack a timezone; Sendai/Mexico City merged under one name in some viewer zones.
- ⏳ **RES-8** Importer merges the wrong source page into an event (no date-overlap check).
- ⏳ **RES-9** Weaker sources can overwrite official data (schedule-audit worldFixes; Reddit coords to public data).
- ⏳ **UX-1** Data load failure shows "Loading…" forever and no navigation.
- ⏳ **UX-2** Horizontal overflow on Today cards at 390px.
- ⏳ **UX-3** Today "Live" count padded with overseas in-person events.
- ⏳ **ENG-3** PIN brute-force: no global failure ceiling.

## P2 — Important UX / functionality / performance

- **ENG-7** Validate public data before bot pushes to main; **RES-14** freshness check, non-zero exit on importer crash, "confirmed" → "corroborated".
- ✅ **RES-13** Add `pokemongo.com` and `www.pokemongo.com` to `OFFICIAL_HOSTS`, with exact-host regression coverage; **RES-7** source label by host.
- **RES-6** Add Mexico City Wild Area; **RES-10** split Pokémon Night Out LA/London; **RES-11** duplicate world events.
- **UX-5** header badge counts empty-state rows; **UX-6** contrast of live countdowns/in-person pill; **UX-7** This Week actions now meet 44px, but a broader touch-target audit remains.
- **UX-8/QA-9** Owner moderation UI shown to visitors; **UX-9** Sync consolidated into one place.
- **UX-10** Desktop layout (2-column Today, calendar names, nav rail); **UX-11** mobile chrome cost; **UX-12** Today strip: Now → Next → Raids & Max today → Ending soon.
- **ENG-5** `user_state` per-key reads; **ENG-6** DDL on public GETs (🔒 schema); **ENG-8** rate limits on `/api/art`, `/api/guide`; **ENG-9** SW cache caps; **ENG-10** payload & immutable caching; **ENG-11** backups in own bucket (🔒).
- **QA-6** ui_checks shard a lazy-image check hangs; **QA-10** image weight (~4 MB first load).

## P3 — Premium polish

- Design-token system (type scale, 4px spacing, colour roles, radii, card anatomy) — **UX-15/17/18**.
- ✅ **UX-13** Source trust/freshness labels in #105; event-detail duplicate claims now merge source attribution before rendering, and every detail category uses a consistent line-icon treatment. 🔧 **UX-14** Raid week selector as a compact mobile segmented control; boss rows link directly to Best attackers filtered to every published weakness; **UX-16** duplicate navigation.
- **ENG-12** single shared `esc()`; **ENG-13** narrow CSP img-src; **ENG-14** migration consolidation (🔒); **ENG-15** SHA-pinned actions; **ENG-16** robustness; **QA-8** tab keyboard semantics; **QA-11** costume art lookup.

## P4 — Opportunities

- "Tonight" planner (Spotlight/Raid Hour/Max Monday with weaknesses and your owned counters).
- Need-list alerts for Pokémon/shinies you still need.
- Ending-soon tray (tickets, GO Pass, research, exclusive moves).
- Raid share card; Travel mode (regional and in-person events at a destination).
- Owner PIN → session cookie.

## Owner decisions / permissions needed

1. Separate preview R2 bucket and/or Cloudflare Access on previews; delete old preview versions (ENG-1b).
2. Raid rotation boundary time: Leek Duck says 6 am local; data uses 10:00 (RES-2).
3. Default Today scope: in-game only, with overseas in-person events folded away? (UX-3)
4. Approval for D1 schema consolidation (ENG-6/14) and separate backup bucket (ENG-11).
