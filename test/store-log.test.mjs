import test from "node:test";
import assert from "node:assert/strict";
import { diffStore, storeLog } from "../scripts/store-watch.mjs";
test("store log: keeps when items appeared and left, and when watching began", () => {
  const a = { name: "Sandile Hatch Day Ultra Ticket Box", price: "$1.99", section: "LIMITED_TIME", href: "/en/x/sandile" }, b = { name: "Remote Raid Pass", price: "$2.99", section: "ITEMS", href: "/en/x/rrp" };
  const d1 = diffStore(null, { items: [a, b] }, "2026-10-01T00:00:00Z");
  assert.equal(d1.state.watchStart, "2026-10-01T00:00:00Z");
  const d2 = diffStore(d1.state, { items: [b] }, "2026-10-05T00:00:00Z");
  assert.equal(d2.state.watchStart, "2026-10-01T00:00:00Z");
  assert.equal(d2.state.gone["/en/x/sandile"].goneAt, "2026-10-05T00:00:00Z");
  const log = storeLog(d2.state);
  assert.deepEqual(log.items.map(i => [i.name, i.goneAt]), [["Sandile Hatch Day Ultra Ticket Box", "2026-10-05T00:00:00Z"]]);
  const d3 = diffStore(d2.state, { items: [a, b] }, "2026-10-06T00:00:00Z");
  assert.equal(d3.state.gone["/en/x/sandile"], undefined);
  assert.equal(d3.state.items["/en/x/sandile"].firstSeen, "2026-10-06T00:00:00Z");
});

import { endsAtFrom } from "../scripts/store-watch.mjs";
test("countdown: turns the store's rounded 'N hours left' into an end time that stays put while readings agree", () => {
  const t0 = "2026-10-20T06:00:00.000Z";
  assert.equal(endsAtFrom("4 hours left", t0, null), "2026-10-20T10:00:00.000Z");
  assert.equal(endsAtFrom("6 days left", t0, null), "2026-10-26T06:00:00.000Z");
  assert.equal(endsAtFrom("1 minute left", t0, null), "2026-10-20T06:01:00.000Z");
  // an hour later the store says 3 hours: same end, keep the earlier estimate
  assert.equal(endsAtFrom("3 hours left", "2026-10-20T07:00:00.000Z", "2026-10-20T10:00:00.000Z"), "2026-10-20T10:00:00.000Z");
  // the day count rounds, so 5 days later "1 day left" is within a day of the old estimate; once it drops to hours, the estimate is refined
  assert.equal(endsAtFrom("1 day left", "2026-10-25T06:00:00.000Z", "2026-10-26T06:00:00.000Z"), "2026-10-26T06:00:00.000Z");
  assert.equal(endsAtFrom("5 hours left", "2026-10-26T01:00:00.000Z", "2026-10-26T06:00:00.000Z"), "2026-10-26T06:00:00.000Z");
  assert.equal(endsAtFrom("3 hours left", "2026-10-26T01:00:00.000Z", "2026-10-26T06:00:00.000Z"), "2026-10-26T04:00:00.000Z");
  // no countdown shown: nothing invented, the earlier value is kept
  assert.equal(endsAtFrom("", t0, null), null);
  assert.equal(endsAtFrom("", t0, "2026-10-21T00:00:00.000Z"), "2026-10-21T00:00:00.000Z");
});
test("store log: carries the item's store link and estimated end", () => {
  const a = { name: "Sandile Hatch Day Ultra Ticket Box", price: "$1.99", section: "LIMITED_TIME", href: "/purchase/item/web-sandile-hatch-day-ultra", left: "2 days left" };
  const d = diffStore(null, { items: [a] }, "2026-10-01T00:00:00.000Z");
  const row = storeLog(d.state).items[0];
  assert.equal(row.href, "/purchase/item/web-sandile-hatch-day-ultra");
  assert.equal(row.endsAt, "2026-10-03T00:00:00.000Z");
  const d2 = diffStore(d.state, { items: [{ ...a, left: "1 day left" }] }, "2026-10-02T00:00:00.000Z");
  assert.equal(storeLog(d2.state).items[0].endsAt, "2026-10-03T00:00:00.000Z", "stable while readings agree");
});
