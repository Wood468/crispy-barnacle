# GO Field Notes

Pokémon GO events, raids, Megas / Dynamax / Gigantamax watch list, and a best-attackers checklist (Own and Hundo marks).
Cloudflare Worker + static assets + D1, deployed by Workers Builds on every push to `main`.

- `public/` the site (`index.html`, `app.js`, `styles.css`, `data.json`).
- `public/data.json` all events, raid rotations, Max Battles, rankings and the Upcoming lists. To refresh, edit this file
  (or ask Claude to) and push; nothing else changes.
- `src/worker.js` `/api/art` (Pokémon artwork from PokeAPI, cached at the edge) and `/api/dex` (your marks, behind `SYNC_PIN`).

## Setup (once)
1. Cloudflare dashboard > Workers & Pages > Create > Import a repository > pick this repo. Build command none, deploy command `npx wrangler deploy`.
2. First deploy creates the D1 database (no id needed) and the `pogo.michaelpuff.com` address.
3. Worker > Settings > Variables and Secrets > add a **Secret** named `SYNC_PIN` (a long PIN or passphrase). Without it the app still works,
   with marks kept only on that device.
4. Open the site, go to Best Pokémon, enter the PIN once per device.

Unofficial fan tool. Not affiliated with Niantic, Scopely, Nintendo or The Pokémon Company. Artwork is loaded from the PokeAPI sprites project.

## Datamine watch

Cloudflare declares one hourly trigger, `30 * * * *` (at :30 UTC). The Worker runs the starting-soon check each hour; the nightly datamine, event pipeline and notification tasks are selected at **20:30 UTC** (7:30 am Melbourne during AEDT, 6:30 am during AEST). This single-trigger arrangement avoids exceeding the account's cron limit. The datamine check compares the PokeMiners game master with the last copy it saw and reads Pokémon GO Hub's datamine feed. Results show on the Upcoming tab. The first run only records a baseline. To run it now: `curl -X POST -H "x-pin: YOUR_PIN" https://pogo.michaelpuff.com/api/datamine/run`.

The same nightly run also works out the status of every Pokémon on the Upcoming tab lists: it checks Leek Duck's events (mirrored by ScrapedDuck), the datamine watch, and PoGoAPI's released list, and only ever moves an item up (Not announced, Datamined, Announced) or marks it as now released.
