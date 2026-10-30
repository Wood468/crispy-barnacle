import test from "node:test";
import { readPrivate } from "./_private.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const D = JSON.parse(readFileSync(new URL("../public/places.json", import.meta.url), "utf8"));
D.places = D.places.concat(readPrivate("places.json","places-private.json").places); // owner-only hotspots are held to the same rules
const TAGS = ["Raids", "Gyms", "PokéStops", "Community Day", "Event venue"];
const https = (u) => typeof u === "string" && /^https:\/\/[^\s/]+\.[^\s/]+/.test(u);
const day = (s) => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(new Date(s + "T12:00:00Z"));
const coordinateProvenance = (p) => {
  if (p.coordinateStatus === "community-reported" || /community-reported/i.test(p.type || "")) return "community-reported";
  if (p.coordinateStatus === "community-reference") return "community-reference";
  const url = p.coords?.url || "";
  if (/reddit\.com/i.test(url)) return "community-reported";
  if (/(?:wikipedia\.org|wikimedia\.org)/i.test(url)) return "community-reference";
  return "";
};

test("places.json: every place has the fields the rules require", () => {
  const ids = new Set();
  for (const p of D.places) {
    assert.ok(p.id && !ids.has(p.id), "unique id " + p.id); ids.add(p.id);
    assert.ok(p.name && p.city && p.country && p.type, p.id + " name/city/country/type");
    assert.ok(Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180, p.id + " coordinates");
    if (coordinateProvenance(p)) {
      assert.equal(p.verified, undefined, p.id + " community coordinates must not carry a verified date");
      assert.ok(p.reportedAt === undefined || day(p.reportedAt), p.id + " report date must be a real source publication day");
    } else {
      assert.ok(day(p.verified) && p.verified <= new Date().toISOString().slice(0, 10), p.id + " source-check date is real and not in the future");
    }
    assert.ok(Array.isArray(p.sources) && p.sources.length > 0 && p.sources.every((s) => s.label && https(s.url) && s.vouches), p.id + " sources need label, https link, and what they vouch for");
    assert.ok(p.coords && https(p.coords.url) && p.coords.label, p.id + " names where the coordinates came from");
    assert.ok(Array.isArray(p.tags) && p.tags.every((t) => TAGS.includes(t)), p.id + " tags");
  }
});

test("public community coordinate records retain their source-specific provenance and are never verified", () => {
  const by = Object.fromEntries(D.places.map((p) => [p.id, p]));
  for (const [id, status] of [
    ["queen-street-mall-brisbane", "community-reference"],
    ["king-george-square-brisbane", "community-reference"],
    ["alameda-central-mexico-city", "community-reported"]
  ]) {
    const p = by[id];
    assert.ok(p, "preserved community location " + id);
    assert.equal(p.coordinateStatus, status);
    assert.equal(p.verified, undefined, id + " has no independent coordinate-verification date");
    assert.match(p.coords.note, /not an official (?:Niantic )?event pin/i);
    if (status === "community-reported") assert.ok(p.reportedAt === undefined || day(p.reportedAt), id + " report date is source-backed when present");
    else assert.equal(p.reportedAt, undefined, id + " has no invented report date");
  }
});

test("Wikipedia and Reddit coordinate references never receive verified dates based on event-source trust", () => {
  const sourced = D.places.filter((p) => /(?:reddit\.com|wikipedia\.org|wikimedia\.org)/i.test(p.coords?.url || ""));
  assert.ok(sourced.length > 0);
  for (const p of sourced) {
    assert.equal(p.verified, undefined, p.id + " community-maintained coordinates are not independently verified");
    if (/reddit\.com/i.test(p.coords.url)) assert.equal(p.coordinateStatus, "community-reported", p.id);
    else assert.equal(p.coordinateStatus, "community-reference", p.id);
  }
});

test("places.json: the Brisbane landmarks match the checked sources and stay labelled as landmarks", () => {
  const by = Object.fromEntries(D.places.map((p) => [p.id, p]));
  const q = by["queen-street-mall-brisbane"], k = by["king-george-square-brisbane"];
  assert.equal(q.lat, -27.4696); assert.equal(q.lng, 153.0252);          // Wikipedia: 27.4696000°S 153.0252000°E
  assert.equal(k.lat, -27.4683); assert.equal(k.lng, 153.0243);          // Wikipedia map link: -27.468333, 153.024313
  assert.ok(Math.abs(k.lat - -27.468333) < 0.0001 && Math.abs(k.lng - 153.024313) < 0.0001);
  for (const p of [q, k]) { assert.match(p.coords.note, /not an official event pin/i); assert.ok(p.lat > -27.6 && p.lat < -27.3 && p.lng > 152.9 && p.lng < 153.2, "inside Brisbane"); }
  assert.match(k.role, /Sunday 27 Sep/);   // the Hub post puts the photo and trade hour on the Sunday only
});

test("places.json: no raid, gym or PokéStop claim without a named source and date, and no route without its file and check date", () => {
  for (const p of D.places) {
    if (p.tags.some((t) => ["Raids", "Gyms", "PokéStops"].includes(t))) {
      assert.ok(p.sources.length, p.id + " activity tags need a named source");
      if (coordinateProvenance(p)) assert.equal(p.verified, undefined, p.id + " community tags do not imply coordinate verification");
      else assert.ok(day(p.verified), p.id + " sourced venue needs a source-check date");
    }
    if (/community-reported (raid|play) hotspot/i.test(p.type)) {
      assert.ok(p.sources.some((s) => /community/i.test(s.trust || "") || /reddit|coordinates/i.test(s.label)), p.id + " hotspot has a community source");
      assert.match(p.role, /not live-verified|not live verified|activity is not live/i, p.id + " hotspot caveat");
    } else {
      assert.ok(!/raid hotspot|busy|popular|active/i.test(JSON.stringify([p.role, p.type])), p.id + " makes no unsupported activity claim");
    }
    if (p.route) assert.ok(p.route.file && https(p.route.url) && day(p.route.verified) && p.route.author, p.id + " route needs file, author, https link and check date");
  }
});

test("places.json: event links carry exact names and date ranges", () => {
  for (const p of D.places) for (const e of p.events || []) { assert.ok(e.name && day(e.from) && day(e.to) && e.from <= e.to, p.id + " event entry"); }
});
