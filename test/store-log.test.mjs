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
