# Home store reader (Home Assistant add-on)

The hourly GitHub reader runs from a US address and sees the US store (US$ prices), so the committed snapshot goes stale. A Home Assistant add-on in Melbourne reads the Australian store instead and uploads it to the Worker.

## What the add-on runs

Every 60 minutes, with random jitter (for example 0 to 10 minutes), and failing closed (any error: stop, upload nothing):

```sh
set -eu
python store_snapshot.py /tmp/s.json
code=$(curl -sS -o /tmp/r.json -w '%{http_code}' -H "x-ingest-key: $KEY" -H "content-type: application/json" \
  --data-binary @/tmp/s.json https://pogo.michaelpuff.com/api/store-ingest)
cat /tmp/r.json; echo " (HTTP $code)"
case "$code" in 200|409|429) ;; *) exit 1;; esac
```

Do not use `curl -f` here: it throws away the reply body, which is where the rejection reason is.

`$KEY` is the `STORE_INGEST_KEY` value, held as an add-on option or secret (never committed, never put in the URL). The script is `scripts/store_snapshot.py` (needs Python, Playwright and Chromium, as in `docs/store-au-home-test.md`).

## What the Worker accepts

`/api/store-ingest` is inert (404) until the owner creates the `STORE_INGEST_KEY` secret (at least 32 characters). Both `POST` and `GET` need that key in the `x-ingest-key` header (never the URL); the key is checked first, with a constant-time comparison, and a wrong or missing key gets 401 (or 429 from the throttle) and no data. Other methods get 405. `POST` only stores a snapshot that is complete (producer evidence checks out), has at least 3 items, at least half of them with an explicit `A$` price, no other currency symbol, https-only images, and a `fetched` time within the last 15 minutes (not more than 5 minutes ahead) and newer than the stored one. At most one accepted upload per 5 minutes; wrong keys are throttled per address (10 per 10 minutes) and globally (25 per 10 minutes). Limits: 256 KB, 400 items. A rejected upload leaves the stored snapshot unchanged and the reply never echoes the input.

### Why a 400

A 400 reply is `{"error":"Bad request.","reason":"<code>"}`. The code comes from a fixed list chosen by the Worker (never from the submitted text), so it says which rule failed but never which value.

| reason | meaning |
| --- | --- |
| `json` | body is not valid UTF-8 JSON |
| `shape` | not an object with an `items` array, an item is not an object, a field has the wrong type, or `imgs` is not an array of at most 6 |
| `too_many_items` | more than 400 items |
| `string_len` | `name`/`section`/`price` over 200 characters, or `tag`/`limit`/`left`/`href` over 300 |
| `href` | an `href` is not a relative `/purchase/...` path (allowed characters: letters, digits, `_ - / ? = & % .`) |
| `img_host` | an image is not `https://assets.pgo.webstore.nianticlabs.com/...`, or is over 600 characters (a `data:` placeholder also lands here) |
| `sku` | an item has no name, or no section |
| `duplicate_sku` | two items share the same `href` (or the same name when there is no `href`) |
| `items_min` | fewer than 3 items |
| `priced_min` | fewer than half the items have an exact `A$` price (`A$12.99` or `A$1,299`) |
| `currency` | a non-`A$` currency symbol, or two different symbols |
| `evidence` | `completeness` is missing, or is not schema 1 from producer `store_snapshot.py` |
| `load_unstable` | evidence says the scroll did not settle (`loadComplete` false or fewer than 2 stable passes) |
| `cards_mismatch` | evidence `cards` differs from the number of items (for example nameless cards were dropped) |
| `section_mismatch` | per-section counts in the evidence differ from the items, or an item's section is missing from the evidence (an evidence section with 0 cards and no items is fine) |
| `completeness` | the evidence block is malformed (no sections, bad section names or counts) |
| `fetched_format` | `fetched` is not `YYYY-MM-DDTHH:MM:SSZ` |
| `fetched_window` | `fetched` is more than 15 minutes old or more than 5 minutes ahead of the Worker clock |

409 (older or equal `fetched`) and 429 are separate and unchanged.

`GET /api/store-ingest` (with the correct `x-ingest-key`) returns the latest stored raw snapshot with `cache-control: private, no-store`, plus an `x-store-received` header with the time of the last accepted upload, or 404 if there is none. It is **not public**: being the raw snapshot it includes standalone SKUs that the filtered `store-current-snapshot.json` leaves out, so an unauthenticated or wrong-key GET gets only the 401 reply. Its only consumer is the "Read the store" step of `.github/workflows/store-watch.yml`.

### Schema (the Worker never creates tables)

No request creates or alters any table. The table comes from `migrations/0004_store_ingest.sql` (`CREATE TABLE IF NOT EXISTS store_ingest ...`, idempotent; the live table already exists, so nothing needs applying there). On a fresh database apply it once by hand: `npx wrangler d1 execute go-field-notes --remote --file migrations/0004_store_ingest.sql`. If the table is missing, an authenticated GET or POST answers `503 {"error":"Unavailable.","reason":"schema"}` and creates nothing. A failed-key request runs no DDL and writes nothing except one row in the shared failure throttle (`pin_fails_ip`, which already exists); if even that table is missing it is simply a 401.

### GitHub secret and key rotation

The watcher reads the snapshot with the key held in the GitHub Actions secret `STORE_INGEST_KEY` (same value as the Cloudflare secret). The workflow passes it to curl on stdin, so it is never on a command line or in a log. If the secret is empty or refused, the step takes the usual soft path (`fresh=false` and a warning; the job does not fail), and the stale alert will then say the reader has not uploaded.

To rotate the key, in this order: (1) the Cloudflare secret `STORE_INGEST_KEY` (then redeploy), (2) the Home Assistant add-on `ingest_key` option, (3) the GitHub secret `STORE_INGEST_KEY`, (4) restart the add-on. Until step 3 the watcher skips store processing (soft), and until step 4 uploads from the add-on get 401; neither damages stored data. Never write the key into the repo, an issue or a log.

## Add-on rules

- Treat HTTP 409 and 429 as success ("already have a newer or very recent snapshot"). Do not retry in a loop; just wait for the next hourly run.
- A wrong key counts against the shared per-address failure bucket (the same one the sync PIN uses). Repeated wrong-key uploads from home can make a mistyped PIN from the same address return 429 for 10 minutes. Test the key once by hand before enabling the schedule.

## Switching the watcher over (order matters)

1. The ingest endpoint is deployed, `STORE_INGEST_KEY` is set (Cloudflare and GitHub), the add-on is uploading, and a keyed `GET /api/store-ingest` returns a recent snapshot.
2. Merge the `store-watch.yml` change.
3. Only when the owner says so, run "Web store watch" once manually with `rebaseline=true` **and `dry_run=false`**. Manual runs default to `dry_run=true`, which saves nothing, so a rebaseline with the default would change nothing. The run saves the A$ snapshot as the new baseline and sends no Telegram messages.
4. After that, scheduled runs are normal. If the reader goes quiet (no accepted upload for 6 hours, or no complete observation for 3 days) one system-topic message is sent, at most once per 24 hours.
