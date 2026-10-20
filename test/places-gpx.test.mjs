import test from "node:test";
import { readPrivate } from "./_private.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";

// places.js is a browser script, so run it against a tiny stand-in window.
function load() {
  const win = { GO: { esc: s => String(s), MON: [] } };
  const doc = { addEventListener() {}, dispatchEvent() {}, getElementById() { return null; } };
  new Function("window", "document", fs.readFileSync(new URL("../public/places.js", import.meta.url), "utf8"))(win, doc);
  return win.GOPLACES;
}
const place = (over = {}) => ({ id: "p1", name: "Queen Street Mall", city: "Brisbane", country: "Australia", lat: -27.4696, lng: 153.0252, type: "City Safari hub", verified: "2026-10-10", sources: [{ label: "Pokémon GO Hub", url: "https://example.com/a?x=1&y=2" }], coords: { label: "Wikipedia" }, ...over });

test("venue points GPX: one waypoint per sourced place, escaped, with who vouches and when", () => {
  const out = load().gpx([place(), place({ id: "p2", name: "King George Square & Co", lat: -27.4701, lng: 153.0245 })], { name: "City Safari: Brisbane" });
  assert.match(out, /^<\?xml/); assert.equal((out.match(/<wpt /g) || []).length, 2);
  assert.match(out, /lat="-27\.469600" lon="153\.025200"/); assert.match(out, /King George Square &amp; Co/);
  assert.match(out, /Source: Pokémon GO Hub\. Coordinates: Wikipedia\. Checked 2026-10-10/); assert.match(out, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
  assert.ok(!/<rte>/.test(out), "no route unless asked");
});
test("venue points GPX: a stop list only when asked and with two or more places, and it says it is not a walking route", () => {
  const g = load().gpx, two = [place(), place({ id: "p2", name: "B", lat: -27.47, lng: 153.02 })];
  const r = g(two, { name: "X", order: true }); assert.match(r, /<rte>/); assert.equal((r.match(/<rtept /g) || []).length, 2); assert.match(r, /not a walking route/);
  assert.ok(!/<rte>/.test(g([place()], { order: true })));
});
test("venue points GPX: a place without a source, coordinates or verified date is left out", () => {
  const g = load().gpx, out = g([place({ sources: [] }), place({ lat: NaN }), place({ verified: "" }), place({ id: "ok", name: "Fine" })]);
  assert.equal((out.match(/<wpt /g) || []).length, 1); assert.match(out, /Fine/);
});

test("places.json: every place passes the app's own rules, and every named in-person venue is sourced", async () => {
  const d = JSON.parse(fs.readFileSync(new URL("../public/places.json", import.meta.url), "utf8"));
  d.places = d.places.concat(readPrivate("places.json","places-private.json").places);
  const ids = new Set();
  for (const p of d.places) {
    assert.ok(!ids.has(p.id), "duplicate id " + p.id); ids.add(p.id);
    assert.ok(p.name && p.country && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180, p.id);
    assert.match(p.verified, /^\d{4}-\d\d-\d\d$/, p.id);
    assert.ok(p.sources.some(s => s.label && /^https:\/\//.test(s.url)), p.id + " needs a source");
    for (const e of p.events || []) assert.match(e.from + e.to, /^\d{4}-\d\d-\d\d\d{4}-\d\d-\d\d$/, p.id);
    if (/^Event (venue|area)/.test(p.type || "")) assert.ok(p.coords && /^https:\/\//.test(p.coords.url) && p.coords.note, p.id + " needs a coordinates source and note");
  }
  const names = new Set(["jewel-changi-airport-singapore", "field-museum-chicago", "sendai-wild-area", "mexico-city-wild-area", "kaohsiung-go-tour-2027", "haneda-airport-tokyo"]);
  for (const id of names) assert.ok(ids.has(id), "missing " + id);
});
