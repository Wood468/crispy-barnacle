import test from "node:test";
import { readPrivate } from "./_private.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";

// places.js is a browser script, so run it against a tiny stand-in window.
function load() {
  const win = { GO: { esc: s => String(s), MON: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] } };
  const doc = { addEventListener() {}, dispatchEvent() {}, getElementById() { return null; } };
  new Function("window", "document", fs.readFileSync(new URL("../public/places.js", import.meta.url), "utf8"))(win, doc);
  return win.GOPLACES;
}
const place = (over = {}) => ({ id: "p1", name: "Queen Street Mall", city: "Brisbane", country: "Australia", lat: -27.4696, lng: 153.0252, type: "City Safari hub", verified: "2026-10-10", sources: [{ label: "Pokémon GO Hub", url: "https://example.com/a?x=1&y=2" }], coords: { label: "Coordinate reference", url: "https://coords.example.com/queen-street-mall" }, ...over });

test("venue points GPX: one waypoint per sourced place, escaped, with who vouches and when", () => {
  const out = load().gpx([place(), place({ id: "p2", name: "King George Square & Co", lat: -27.4701, lng: 153.0245 })], { name: "City Safari: Brisbane" });
  assert.match(out, /^<\?xml/); assert.equal((out.match(/<wpt /g) || []).length, 2);
  assert.match(out, /lat="-27\.469600" lon="153\.025200"/); assert.match(out, /King George Square &amp; Co/);
  assert.match(out, /Event source: Pokémon GO Hub\. Coordinates: Coordinate reference\. Coordinates independently checked 10 Oct 2026/);
  assert.match(out, /<link href="https:\/\/coords\.example\.com\/queen-street-mall"><text>Coordinates: Coordinate reference<\/text><\/link>/);
  assert.match(out, /<link href="https:\/\/example\.com\/a\?x=1&amp;y=2"><text>Event source: Pokémon GO Hub<\/text><\/link>/);
  assert.ok(!/<rte>/.test(out), "no route unless asked");
});
test("community coordinate GPX labels report provenance and never emits a legacy verified date", () => {
  const p = place({
    type: "Community-reported play area",
    coordinateStatus: "community-reported",
    reportedAt: "2026-10-28",
    verified: "2026-10-10", // legacy private records may still carry this; it must be ignored for community coordinates
    sources: [{ label: "Reddit community report", url: "https://www.reddit.com/r/example/comments/abc/report", trust: "community" }],
    coords: { label: "Reddit community report", url: "https://www.reddit.com/r/example/comments/abc/report" }
  });
  const api = load(), out = api.gpx([p]);
  assert.equal((out.match(/<wpt /g) || []).length, 1, "a community location remains usable without coordinate verification");
  assert.match(out, /Community-reported coordinates · reported 28 Oct 2026 · not independently verified · not an official event pin/);
  assert.doesNotMatch(out, /2026-10-10|Source record checked|Checked/);
  assert.match(api.coordinateLabel(p), /reported 28 Oct 2026/);
});
test("community coordinate without a source publication date stays undated and unverified", () => {
  const p = place({
    type: "Community-maintained coordinate reference",
    coordinateStatus: "community-reference",
    verified: "2026-10-10", // legacy field is ignored
    sources: [{ label: "Wikipedia reference", url: "https://en.wikipedia.org/wiki/Example", trust: "community" }],
    coords: { label: "Wikipedia reference", url: "https://en.wikipedia.org/wiki/Example" }
  });
  const label = load().coordinateLabel(p);
  assert.match(label, /publication date unavailable/);
  assert.match(label, /not independently verified/);
  assert.match(label, /not an official event pin/);
  assert.doesNotMatch(label, /2026-10-10/);
});
test("Wikipedia coordinate references ignore legacy verified dates even when the event source is official", () => {
  const p = place({
    coordinateStatus: "community-reference",
    verified: "2026-10-10", // legacy source-check dates are not independent coordinate verification
    sources: [{ label: "Official event source", url: "https://pokemongo.com/en/news/example", trust: "official" }],
    coords: { label: "Wikipedia reference", url: "https://en.wikipedia.org/wiki/Example" }
  });
  const api = load(), out = api.gpx([p]);
  assert.match(out, /Community-maintained coordinate reference · publication date unavailable · not independently verified · not an official event pin/);
  assert.doesNotMatch(out, /2026-10-10|Source record checked|Coordinates independently checked/);
  assert.match(api.coordinateLabel(p), /Community-maintained coordinate reference/);
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
    if (p.coordinateStatus === "community-reported" || p.coordinateStatus === "community-reference" || /community-reported/i.test(p.type || "") || /(?:reddit\.com|wikipedia\.org|wikimedia\.org)/i.test(p.coords?.url || "")) assert.equal(p.verified, undefined, p.id + " community-sourced coordinates are not independently verified");
    else assert.match(p.verified, /^\d{4}-\d\d-\d\d$/, p.id);
    assert.ok(p.sources.some(s => s.label && /^https:\/\//.test(s.url)), p.id + " needs a source");
    for (const e of p.events || []) assert.match(e.from + e.to, /^\d{4}-\d\d-\d\d\d{4}-\d\d-\d\d$/, p.id);
    if (/^Event (venue|area)/.test(p.type || "")) assert.ok(p.coords && /^https:\/\//.test(p.coords.url) && p.coords.note, p.id + " needs a coordinates source and note");
  }
  const names = new Set(["jewel-changi-airport-singapore", "field-museum-chicago", "sendai-wild-area", "mexico-city-wild-area", "kaohsiung-go-tour-2027", "haneda-airport-tokyo"]);
  for (const id of names) assert.ok(ids.has(id), "missing " + id);
});
