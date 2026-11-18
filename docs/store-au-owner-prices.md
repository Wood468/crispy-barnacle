# Australian Store prices (owner-supplied)

The hourly store watch runs on a US runner and sees US$ prices, so it can never fill Australian prices. Read them yourself in the Australian Web Store (store.pokemongo.com, signed in from Australia) and record them here. Nothing is scraped, converted or inferred from Indonesia, India or FX.

1. Create `data/au-store-input.json` (use the day you read the prices as `observed`):

```json
{
  "observed": "2026-11-15",
  "items": [
    {"label": "GO Pass Deluxe: November", "price": "A$12.99"},
    {"label": "GO Pass Deluxe: November Ultra Box", "price": "A$22.99"},
    {"label": "Lucky Egg x8", "price": "A$29.99", "confirm": true}
  ]
}
```

2. Run `node scripts/store-au-owner.mjs` (not available on CI) and commit `public/prices.json` in a PR. Or paste the prices to Claude, who runs it for you.

How it is checked (all-or-nothing; any problem rejects everything and prints why):
- `price` must be an explicit `A$x.xx` between A$0.50 and A$500. `$`, `AU$`, `Rp`, `₹` are rejected.
- `label` must exactly match an offer in `public/store-current-snapshot.json` or an existing Australian catalogue entry (case-insensitive). No duplicates.
- Exception, opt-in per item: for something you saw in the Australian store that the snapshot has not seen yet, add `"unlisted": true` and a `"note"` (1-200 characters, stored on the entry), e.g. `{"label": "GO Pass Deluxe: Dynamax Trails", "price": "A$7.99", "unlisted": true, "note": "owner-observed in AU store; not yet in snapshot"}`. Without the flag the rule above applies unchanged; a label that is already in the snapshot is rejected (drop the flag); every other check below still applies. The label is your best guess at the store wording, and the id is derived from it. If a later snapshot item uses different wording it will not attach to this entry automatically.
- `observed` must be a real date, not in the future, at most 14 days old, and not older than the price already recorded.
- Opt-in per item: `"supersedes": "<label of an earlier Australian entry>"` retires an entry you recorded under a wrong or guessed label when you add the correct one. The old entry must exist (exact label, case-insensitive, one product), must not be the item itself or another input item, and must have the same amount; if the amount differs, add `"supersedesNote"` (1-200 characters) saying why. Only that product's AU/AUD entries are removed, nothing else. Without the field nothing is removed. Once applied the old entry is gone, so delete the `supersedes` field from the input file before committing (a re-run would reject it).
- A price more than 3x higher or lower than the last verified one needs `"confirm": true` on that item.
- Re-entering the same price on a later date is fine: it refreshes the date. The same price on the same date is a no-op; a different price on the same date is rejected.

Result: a `verified:true` AUD entry stamped with your date in `public/prices.json` (public data, as the existing Australian prices already are). A fresh entry shows in Regional Store prices as the A$ price for that card. The store watch cannot overwrite it: its importer only accepts a complete all-`A$` snapshot, and never replaces a price newer than its own snapshot.
