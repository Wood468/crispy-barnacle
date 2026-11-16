import test from "node:test";
import assert from "node:assert/strict";
import { diffStore } from "../scripts/store-watch.mjs";

// A caller-supplied boolean is not independent evidence of complete storefront
// loading. A partial scrape must not retire previously seen SKUs.
test("untrusted completeness flag cannot retire missing Store SKUs", () => {
  const now = "2026-11-15T00:00:00.000Z";
  const items = Object.fromEntries(Array.from({ length: 35 }, (_, n) => {
    const href = "/purchase/item/sku-" + n;
    return [href, {
      name: "Product " + n, price: "A$1.00", section: "ITEMS",
      firstSeen: "2026-11-09T00:00:00.000Z",
      lastSeen: "2026-11-14T00:00:00.000Z"
    }];
  }));
  const prev = { items, gone: {}, currency: "A$", updated: "2026-11-14T00:00:00.000Z",
    lastPublishedAt: "2026-11-14T01:00:00.000Z" };
  const snap = {
    items: Array.from({ length: 20 }, (_, n) => ({
      href: "/purchase/item/sku-" + n,
      name: "Product " + n, price: "A$1.00", section: "ITEMS"
    })),
    completeness: { verified: true }
  };
  const result = diffStore(prev, snap, now);
  assert.equal(result.held?.reason, "incomplete-snapshot");
  assert.equal(Object.keys(result.state.items).length, 35);
  assert.equal(result.gone.length, 0);
  assert.equal(result.state.lastPublishedAt, prev.lastPublishedAt);
});
