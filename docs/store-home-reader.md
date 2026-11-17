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

`POST /api/store-ingest` is inert (404) until the owner creates the `STORE_INGEST_KEY` secret (at least 32 characters). It only stores a snapshot that is complete (producer evidence checks out), has at least 3 items, at least half of them with an explicit `A$` price, no other currency symbol, https-only images, and a `fetched` time within the last 15 minutes (not more than 5 minutes ahead) and newer than the stored one. At most one accepted upload per 5 minutes; wrong keys are throttled per address (10 per 10 minutes) and globally (25 per 10 minutes). Limits: 256 KB, 400 items. A rejected upload leaves the stored snapshot unchanged and the reply never echoes the input.

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

`GET /api/store-ingest` returns the latest stored raw snapshot (`cache-control: public, max-age=60`, plus an `x-store-received` header with the time of the last accepted upload), or 404 if there is none. It needs no key: it is public storefront data, but being the raw snapshot it includes standalone SKUs that the filtered `store-current-snapshot.json` leaves out.

## Add-on rules

- Treat HTTP 409 and 429 as success ("already have a newer or very recent snapshot"). Do not retry in a loop; just wait for the next hourly run.
- A wrong key counts against the shared per-address failure bucket (the same one the sync PIN uses). Repeated wrong-key uploads from home can make a mistyped PIN from the same address return 429 for 10 minutes. Test the key once by hand before enabling the schedule.
