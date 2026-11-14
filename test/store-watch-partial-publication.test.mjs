import test from "node:test";
import assert from "node:assert/strict";
import { diffStore, storeCurrentSnapshot } from "../scripts/store-watch.mjs";

const at = "2026-11-14T06:00:00.000Z";
const item = n => ({
  href: "/purchase/item/sku-" + n,
  name: "Product " + n,
  price: "A$1.00",
  section: n < 10 ? "POKECOINS" : n < 20 ? "ITEMS" : "LIMITED_TIME",
  imgs: []
});
const previous = {
  currency: "A$",
  watchStart: "2026-11-10T00:00:00.000Z",
  updated: "2026-11-14T05:00:00.000Z",
  items: Object.fromEntries(Array.from({length:35},(_,n)=>{
    const i=item(n);
    return [i.href, {name:i.name,price:i.price,section:i.section,firstSeen:"2026-11-10T00:00:00.000Z",lastSeen:previousTime(),images:[]}];
  })),
  gone: {}
};
function previousTime(){return "2026-11-14T05:00:00.000Z";}

test("partial same-currency 35-to-3 snapshot must not retire 32 confirmed items", () => {
  const d = diffStore(previous, {items:[item(0),item(1),item(2)]}, at);
  assert.equal(d.gone.length,0,"untrusted partial snapshot must not generate removals");
  assert.equal(Object.keys(d.state.items).length,35,"previous current listings must be retained");
  assert.equal(storeCurrentSnapshot(d.state).gone.length,0,"public snapshot must not falsely archive SKUs");
});

test("currency-held observation must not count as a published refresh", () => {
  const d = diffStore(previous,{items:Array.from({length:35},(_,n)=>({...item(n),price:"US$1.00"}))},at);
  assert.ok(d.held);
  assert.equal(d.state.lastPublishedAt,previous.lastPublishedAt);
});
