import test from "node:test";
import assert from "node:assert/strict";
import { diffStore, validateStoreObservation, stampPublication, storeCurrentSnapshot } from "../scripts/store-watch.mjs";
import { withEvidence } from "./store-evidence-fixture.mjs";
import { updatePrices } from "../scripts/store-au-prices.mjs";

const T0 = "2026-11-15T01:00:00.000Z", T1 = "2026-11-15T02:00:00.000Z";
const IMG = "https://assets.pgo.webstore.nianticlabs.com/pgo/image_variants/v1/sku_assets/box/w256.webp";
const mk = (n, price) => ({ href: "/purchase/item/sku-" + n, name: "Product " + n, price, section: n < 3 ? "ITEMS" : "BUNDLE", imgs: [IMG], left: "2 days left" });
const usd = n => Array.from({ length: n }, (_, k) => mk(k, "$" + (k + 1) + ".99"));
const prev = () => diffStore(null, withEvidence(usd(6)), T0).state;

test("real-page shape: a PokeCoin card whose price text has no currency symbol does not hold the observation", () => {
  const items = usd(6);
  items[5] = mk(5, "6,095"); // coin-priced card, as on the live page (data/store-state.json carries one)
  assert.equal(validateStoreObservation({ items }), null);
  const d = diffStore(prev(), withEvidence(items), T1);
  assert.equal(d.held, undefined);
  assert.equal(d.state.lastObservation.status, "complete");
  assert.equal(d.state.items["/purchase/item/sku-5"].name, "Product 5");
  assert.equal(d.state.items["/purchase/item/sku-5"].price, "$6.99", "a symbol-less reading never overwrites a saved currency price");
  assert.deepEqual(d.changed, []);
  assert.equal(d.state.currency, "$");
});

test("a snapshot with no currency anywhere is accepted for listings; saved prices are untouched", () => {
  const items = usd(6).map(i => { const { price, ...rest } = i; return { ...rest, left: "1 day left" }; });
  for (const variant of [items, items.map(i => ({ ...i, price: "" })), items.map(i => ({ ...i, price: "Free" }))]) {
    assert.equal(validateStoreObservation({ items: variant }), null);
    const d = diffStore(prev(), withEvidence(variant), T1);
    assert.equal(d.held, undefined);
    assert.equal(d.state.lastObservation.status, "complete");
    assert.deepEqual(d.changed, []);
    assert.deepEqual(Object.values(d.state.items).map(o => o.price).sort(), usd(6).map(i => i.price).sort());
    assert.equal(d.state.currency, "$");
    assert.ok(d.state.items["/purchase/item/sku-0"].endsAt, "end time kept");
    assert.equal(d.state.items["/purchase/item/sku-0"].lastSeen, T1);
    assert.equal(storeCurrentSnapshot(d.state).items.length, 6);
    assert.equal(storeCurrentSnapshot(d.state).items[0].image, IMG);
  }
});

test("first-ever observation without currency is accepted and records no price currency", () => {
  const items = usd(4).map(i => ({ ...i, price: "" }));
  const d = diffStore(null, withEvidence(items), T0);
  assert.equal(d.held, undefined);
  assert.equal(Object.keys(d.state.items).length, 4);
  assert.equal(d.state.currency, "");
});

test("heartbeat stamps a currency-less observation only when completeness evidence is complete", () => {
  const items = usd(6).map(i => ({ ...i, price: "" }));
  const complete = diffStore(prev(), withEvidence(items), T1).state;
  assert.equal(stampPublication(complete, T1).lastPublishedAt, T1);
  const partial = diffStore(prev(), { items }, T1).state;
  assert.notEqual(partial.lastObservation.status, "complete");
  assert.notEqual(stampPublication(partial, T1).lastPublishedAt, T1);
});

test("currency-less snapshot still obeys partial-scrape hold, forged verified and corroborated removal", () => {
  const items = usd(5).map(i => ({ ...i, price: "" }));
  assert.equal(diffStore(prev(), { items, verified: true }, T1).held?.reason, "incomplete-snapshot");
  assert.equal(diffStore(prev(), withEvidence(items), T1).held?.reason, "awaiting-corroboration");
});

test("mixed symbol currencies are still held and never change prices", () => {
  const items = usd(6);
  items[1].price = "CA$20.99";
  assert.equal(diffStore(prev(), withEvidence(items), T1).held?.reason, "mixed-currency");
});

test("a whole-store currency flip is still held with saved prices kept", () => {
  const items = usd(6).map(i => ({ ...i, price: "A" + i.price }));
  const d = diffStore(prev(), withEvidence(items), T1);
  assert.equal(d.held.base, "$");
  assert.equal(d.held.cur, "A$");
  assert.equal(d.state.items["/purchase/item/sku-0"].price, "$1.99");
});

test("structurally invalid items are still rejected", () => {
  const bad = [{ name: "" }, { name: "x", section: "" , price: "$1"}, { name: "x", section: "S", price: 5 }, { name: "x", section: "S", price: "$1", href: 7 }];
  for (const b of bad) assert.equal(validateStoreObservation({ items: [...usd(3), b] }), "invalid-sku");
});

test("invalid/held observations report reason and counts in a held payload", () => {
  const d = diffStore(prev(), withEvidence(usd(2)), T1);
  assert.equal(d.held.reason, "empty-or-short-snapshot");
  assert.equal(d.held.incomingCount, 2);
  assert.equal(d.held.previousCount, 6);
});

test("AU price import still requires a complete explicit AUD snapshot", () => {
  const data = { prices: [] };
  const noCurrency = usd(6).map(i => ({ ...i, price: "" }));
  assert.equal(updatePrices(data, { fetched: T1, items: noCurrency }).reason, "not a complete explicit AUD snapshot");
  assert.equal(updatePrices(data, { fetched: T1, items: usd(6) }).changed, 0);
});

test("CLI dry run prints a non-secret hold reason with counts, and accepts a currency-less snapshot", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "sw-"));
  const run = snap => {
    const f = join(dir, "snap.json"); writeFileSync(f, JSON.stringify(snap));
    return spawnSync(process.execPath, ["scripts/store-watch.mjs", f], { encoding: "utf8", env: { ...process.env, DRY_RUN: "true", STORE_STATE: join(dir, "absent-state.json"), TELEGRAM_BOT_TOKEN: "", TELEGRAM_CHAT_ID: "" } });
  };
  const ok = run({ ...withEvidence(usd(4).map(i => ({ ...i, price: "" }))) });
  assert.doesNotMatch(ok.stdout, /invalid|held/);
  const held = run({ items: [...usd(2), { ...mk(9, "$1.99"), name: "" }, mk(8, "$1.99")] });
  assert.match(held.stdout, /Store observation invalid \(invalid-sku\) \[items=4, previous=\d+\]/);
});
