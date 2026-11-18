import test from "node:test";
import assert from "node:assert/strict";
import { projectPublicStoreSnapshot } from "../src/store-public-projection.js";
import { withEvidence } from "./store-evidence-fixture.mjs";
import { validateStoreObservation, deriveCompleteness } from "../src/store-validate.js";

const items = ["a", "b", "c", "d"].map((x, n) => ({
  name: "Item " + x, section: "box", href: "/purchase/" + x,
  price: "A$" + (n + 1) + ".99",
  imgs: ["https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/" + x + "/w256.webp"]
}));
const make = () => ({
  ...withEvidence(items), fetched: new Date().toISOString(),
  items: items.map(x => ({ ...x, imgs: [...x.imgs], privateRegionPrice: "IDR 1", internalId: "secret" })),
  secret: "private-snapshot-metadata"
});
const allow = new Set(items.map(x => x.href));

test("explicit approved SKU set yields watcher-compatible AU snapshot without private fields", () => {
  const projected = projectPublicStoreSnapshot(make(), allow);
  assert.ok(projected);
  assert.equal(validateStoreObservation(projected), null);
  assert.equal(deriveCompleteness(projected).complete, true);
  assert.equal(projected.items.length, 4);
  assert.ok(!JSON.stringify(projected).includes("secret"));
  assert.ok(!JSON.stringify(projected).includes("IDR"));
  assert.deepEqual(Object.keys(projected.items[0]), ["name", "section", "href", "price", "imgs"]);
});

test("missing or untrusted allowlist fails closed, never silently drops private SKU", () => {
  const snapshot = make();
  assert.equal(projectPublicStoreSnapshot(snapshot, null), null);
  assert.equal(projectPublicStoreSnapshot(snapshot, new Set()), null);
  assert.equal(projectPublicStoreSnapshot(snapshot, new Set(items.slice(0, 3).map(x => x.href))), null);
  snapshot.items[0].href = "/purchase/hidden-private-only";
  assert.equal(projectPublicStoreSnapshot(snapshot, allow), null);
});

test("rejects malformed or incomplete source evidence and invalid public href", () => {
  const s = make();
  s.completeness.loadComplete = false;
  assert.equal(projectPublicStoreSnapshot(s, allow), null);
  const t = make();
  t.items[0].href = "javascript:alert(1)";
  assert.equal(projectPublicStoreSnapshot(t, new Set([...allow, t.items[0].href])), null);
});

test("drops unapproved image metadata without leaking URLs or diagnostics", () => {
  const s = make();
  s.items[0].imgs.push("https://evil.test/private.png");
  const out = projectPublicStoreSnapshot(s, allow);
  assert.ok(out);
  assert.equal(out.items[0].imgs.length, 1);
  assert.ok(!JSON.stringify(out).includes("evil.test"));
});
