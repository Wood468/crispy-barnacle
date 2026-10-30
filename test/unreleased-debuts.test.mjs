import test from "node:test";
import assert from "node:assert/strict";
import { debutedSpecies, computeStatuses, trackedItems, statusChanges, keepReleased } from "../src/worker.js";
import { readFileSync } from "node:fs";

const NOW = Date.parse("2026-10-23T12:00:00Z");
const events = [
  { id: "trek", t: "Fall Marathon: Buddy Trek", s: "2026-10-13T10:00", highlights: [{ type: "debut", label: "DEBUT · Bramblin" }, { type: "debut", label: "DEBUT · Brambleghast (evolve Bramblin: 50 candy)" }, { type: "boosted-shiny", label: "BOOSTED SHINY · Electrike" }] },
  { id: "minior", t: "Orionids Meteor Shower: Minior Debut", s: "2026-10-19T17:00", tags: ["Debut"], art: ["Minior"] },
  { id: "later", t: "Future Debut Day", s: "2026-10-31T10:00", tags: ["Debut"], art: ["Pecharunt"] },
];

test("species whose debut event has started count as debuted; future debuts do not", () => {
  const d = debutedSpecies(events, NOW);
  assert.equal(d.get("bramblin"), "Fall Marathon: Buddy Trek");
  assert.equal(d.get("brambleghast"), "Fall Marathon: Buddy Trek");
  assert.equal(d.get("minior"), "Orionids Meteor Shower: Minior Debut");
  assert.equal(d.has("pecharunt"), false);
  assert.equal(d.has("electrike"), false);
});

test("a debuted Pokémon is Released even when a later event lists it as upcoming", () => {
  const items = [{ s: "unreleased", g: "", n: "Minior", base: "Announced" }, { s: "unreleased", g: "", n: "Bramblin", base: "Announced" }, { s: "unreleased", g: "", n: "Pecharunt", base: "Not announced" }];
  const leek = [{ name: "Minior Showers: Leonids 2026", start: "2026-11-14T17:00:00.000", end: "2026-11-19T23:59:00.000", link: "https://x" }];
  const r = computeStatuses(items, leek, [], [], new Set(), NOW, debutedSpecies(events, NOW));
  assert.equal(r.find((x) => x.n === "Minior").status, "Released");
  assert.equal(r.find((x) => x.n === "Bramblin").status, "Released");
  assert.equal(r.find((x) => x.n === "Pecharunt").status, "Not announced");
});

test("Mega, Dynamax and Gigantamax items are not marked Released by a species debut", () => {
  const items = [{ s: "unreleased", g: "", n: "Mega Minior", base: "Announced" }, { s: "dynamax", g: "", n: "Dynamax Bramblin", base: "Announced" }];
  const r = computeStatuses(items, [], [], [], new Set(), NOW, debutedSpecies(events, NOW));
  assert.ok(r.every((x) => x.status === "Announced"));
});

test("with the real data.json, Minior, Bramblin and Brambleghast come out Released", () => {
  const data = JSON.parse(readFileSync("public/data.json", "utf8"));
  const r = computeStatuses(trackedItems(data), [], [], [], new Set(), NOW, debutedSpecies(data.events, NOW));
  for (const n of ["Minior", "Bramblin", "Brambleghast"]) assert.equal(r.find((x) => x.n === n).status, "Released", n);
  // The announced Mega (formerly the "Spooky Mega" placeholder) debuts Oct 31, after NOW, so it is not Released yet.
  assert.notEqual(r.find((x) => x.n === "Mega Chandelure" && x.s === "unreleased").status, "Released");
});

test("a Pokémon named in an event that has already started is Released, a future event alone is not", () => {
  const items = [{ s: "unreleased", g: "", n: "Wishiwashi", base: "Datamined" }, { s: "unreleased", g: "", n: "Cufant", base: "Not announced" }];
  const feed = [
    { name: "Raid Day", eventType: "raid-day", start: "2026-10-22T10:00:00.000", end: "2026-10-22T13:00:00.000", link: "https://r", extraData: { raidbattles: { bosses: [{ name: "Wishiwashi" }] } } },
    { name: "Future Spotlight", eventType: "pokemon-spotlight-hour", start: "2026-10-28T18:00:00.000", end: "2026-10-28T19:00:00.000", link: "https://f", extraData: { spotlight: { name: "Cufant" } } },
  ];
  const r = computeStatuses(items, feed, [], [], new Set(), NOW);
  const w = r.find((x) => x.n === "Wishiwashi"), c = r.find((x) => x.n === "Cufant");
  assert.equal(w.status, "Released");
  assert.equal(w.srcLabel, "In the game: Raid Day");
  assert.equal(c.status, "Announced");
});
test("the owner settings have a Refresh leaks button wired to the datamine run", () => {
  const js = readFileSync("public/extra.js", "utf8");
  assert.match(js, /id="dmrun"/);
  assert.match(js, /\/api\/datamine\/run/);
});

const tracked = [{ s: "unreleased", n: "Minior", base: "Announced" }, { s: "unreleased", n: "Cufant", base: "Not announced" }];
test("status changes are logged against the last snapshot, and the first run logs nothing", () => {
  const now = [{ s: "unreleased", n: "Minior", status: "Released", srcLabel: "Orionids" }, { s: "unreleased", n: "Cufant", status: "Not announced" }];
  assert.deepEqual(statusChanges(null, tracked, now, NOW), []);
  const c = statusChanges({ snap: { "unreleased|Minior": "Announced", "unreleased|Cufant": "Not announced" } }, tracked, now, NOW);
  assert.deepEqual(c.map((x) => [x.n, x.from, x.to, x.at]), [["Minior", "Announced", "Released", NOW]]);
  // an older stored state without a snapshot falls back to its listed items, then the hand-entered base status
  const c2 = statusChanges({ items: [] }, tracked, now, NOW);
  assert.deepEqual(c2.map((x) => x.n), ["Minior"]);
});
test("a Pokémon seen as Released stays Released when its proof drops out of the feeds", () => {
  const prev = { snap: { "unreleased|Minior": "Released" }, items: [{ s: "unreleased", n: "Minior", status: "Released", srcLabel: "Orionids" }] };
  const items = [{ s: "unreleased", n: "Minior", status: "Announced", srcLabel: "Leonids" }];
  keepReleased(prev, items);
  assert.equal(items[0].status, "Released");
  assert.equal(items[0].srcLabel, "Orionids");
  assert.deepEqual(statusChanges(prev, tracked, items, NOW), []);
});
test("the Leaks tab has a This week card fed by all three sources", () => {
  const js = readFileSync("public/app.js", "utf8");
  for (const needle of ["box.id='up-week'", "W.R=R;weekDraw()", "W.M=M;weekDraw()", "W.N=N;weekDraw()"]) assert.ok(js.includes(needle), needle);
});
test("the first-page 'New since your last visit' box also lists what changed in the leaks", async () => {
  const { runInNewContext } = await import("node:vm");
  const win = { GODASH: { events: () => [] } };
  const ctx = { window: win, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem() {} }, setTimeout() {}, Date, JSON, Math, Array, Promise, Object, String, encodeURIComponent };
  runInNewContext(readFileSync("public/whatsnew.js", "utf8"), ctx);
  const since = NOW - 3 * 86400000;
  const R = { changes: [{ n: "Minior", to: "Released", at: NOW - 1000 }, { n: "Ultra Necrozma", from: "Datamined", to: "Announced", at: NOW - 2000 }, { n: "Old one", to: "Released", at: since - 5000 }] };
  const M = { items: [{ name: "Cufant", seen: NOW - 500 }], posts: [{ title: "Hub post", link: "https://hub.example/p", date: NOW - 100 }] };
  const N = { items: [{ title: "Sandile research", link: "javascript:alert(1)", date: new Date(NOW - 50).toISOString() }] };
  const plain = (x) => JSON.parse(JSON.stringify(x)); // the function ran in another vm realm
  const g = plain(win.GOWN.leakGroups(R, M, N, since));
  assert.deepEqual(g.map((x) => x.label), ["Now in Pokémon GO", "Moved up", "New in the game files", "Datamine posts"]);
  assert.deepEqual(g[0].items.map((i) => i.t), ["Minior"]);
  assert.equal(g[1].items[0].t, "Ultra Necrozma (Announced)");
  assert.equal(g[3].items.find((i) => i.t === "Sandile research").l, "", "unsafe links are dropped");
  assert.equal(g[3].items.find((i) => i.t === "Hub post").l, "https://hub.example/p");
  assert.deepEqual(plain(win.GOWN.leakGroups({}, {}, {}, since)), []);
});
