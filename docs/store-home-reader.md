# Home store reader (Home Assistant add-on)

The hourly GitHub reader runs from a US address and sees the US store (US$ prices), so the committed snapshot goes stale. A Home Assistant add-on in Melbourne reads the Australian store instead and uploads it to the Worker.

## What the add-on runs

Every 60 minutes, with random jitter (for example 0 to 10 minutes), and failing closed (any error: stop, upload nothing):

```sh
set -eu
python store_snapshot.py /tmp/s.json
curl -fsS -H "x-ingest-key: $KEY" -H "content-type: application/json" \
  --data-binary @/tmp/s.json https://pogo.michaelpuff.com/api/store-ingest
```

`$KEY` is the `STORE_INGEST_KEY` value, held as an add-on option or secret (never committed, never put in the URL). The script is `scripts/store_snapshot.py` (needs Python, Playwright and Chromium, as in `docs/store-au-home-test.md`).

## What the Worker accepts

`POST /api/store-ingest` is inert (404) until the owner creates the `STORE_INGEST_KEY` secret (at least 32 characters). It only stores a snapshot that is complete (producer evidence checks out), has at least 3 items, at least half of them with an explicit `A$` price, no other currency symbol, https-only images, and a `fetched` time within the last 15 minutes (not more than 5 minutes ahead) and newer than the stored one. At most one accepted upload per 5 minutes; wrong keys are throttled per address (10 per 10 minutes) and globally (25 per 10 minutes). Limits: 256 KB, 400 items. A rejected upload leaves the stored snapshot unchanged and the reply never echoes the input.

`GET /api/store-ingest` returns the latest stored snapshot (`cache-control: no-store`, no auth: it is public store data, like `store-current-snapshot.json`), or 404 if there is none.
