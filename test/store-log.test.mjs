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

import { currencyOf } from "../scripts/store-watch.mjs";
import { buildMessages } from "../scripts/store-watch.mjs";
const mk = (price, extra = {}) => [
  { name: "Remote Raid Pass", price, section: "ITEMS", href: "/purchase/item/rrp", ...extra },
  { name: "GO Pass Deluxe", price: price === "$9.99" ? "$14.99" : "CA$20.99", section: "ITEMS", href: "/purchase/item/pass" },
  { name: "Max Battle Ultra Ticket Box", price: price === "$9.99" ? "$4.99" : "CA$6.99", section: "LIMITED_TIME", href: "/purchase/item/max" },
];
test("store watch: reads the currency from the price text", () => {
  assert.equal(currencyOf("$9.99"), "$");
  assert.equal(currencyOf("CA$13.99"), "CA$");
  assert.equal(currencyOf(""), "");
});
test("store watch: a real same-currency price change and a new item still alert", () => {
  const d1 = diffStore(null, { items: mk("$9.99") }, "2026-10-25T00:00:00Z");
  const items = mk("$9.99"); items[0].price = "$8.99"; items.push({ name: "New Box", price: "$1.99", section: "ITEMS", href: "/purchase/item/new" });
  const d2 = diffStore(d1.state, { items }, "2026-10-25T01:00:00Z");
  assert.equal(d2.held, undefined);
  assert.deepEqual(d2.changed.map(i => [i.name, i.was, i.price]), [["Remote Raid Pass", "$9.99", "$8.99"]]);
  assert.deepEqual(d2.added.map(i => i.name), ["New Box"]);
  assert.equal(buildMessages(d2).length, 2);
});
test("store watch: a currency flip (and the flip back) does not alert or touch the saved prices", () => {
  const d1 = diffStore(null, { items: mk("$9.99") }, "2026-10-25T00:00:00Z");
  const d2 = diffStore(d1.state, { items: mk("CA$13.99") }, "2026-10-25T01:00:00Z");
  assert.deepEqual([d2.added, d2.changed, d2.gone], [[], [], []]);
  assert.equal(buildMessages(d2).length, 0);
  assert.equal(d2.held.isNew, true);
  assert.deepEqual(Object.values(d2.state.items).map(o => o.price), ["$9.99", "$14.99", "$4.99"]);
  const d3 = diffStore(d2.state, { items: mk("CA$13.99") }, "2026-10-25T02:00:00Z"); // still flipped: no second note
  assert.equal(d3.held.isNew, false);
  const d4 = diffStore(d3.state, { items: mk("$9.99") }, "2026-10-25T03:00:00Z"); // back to normal
  assert.equal(d4.held, undefined);
  assert.equal(buildMessages(d4).length, 0);
  assert.equal(d4.state.currencyHold, undefined);
  assert.equal(d4.state.currency, "$");
});
test("store watch: state saved before currency was tracked still detects a flip", () => {
  const d1 = diffStore(null, { items: mk("$9.99") }, "2026-10-25T00:00:00Z");
  delete d1.state.currency;
  assert.ok(diffStore(d1.state, { items: mk("CA$13.99") }, "2026-10-25T01:00:00Z").held);
});
