import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/raid-share.js", import.meta.url), "utf8");

function load() {
  const window = { location: { origin: "https://pogo.example", pathname: "/" } };
  const document = { getElementById: () => null, addEventListener: () => {} };
  runInNewContext(source, { window, document, Intl, Date, Array, Object, String, Number, Promise });
  return window.GORAIDSHARE;
}

test("raid share payload uses published weaknesses and clearly scoped local counters", () => {
  let receivedTypes = null;
  const api = load();
  const types = { facts: boss => boss === "Yveltal" ? { weak: ["Electric", "Fairy", "Ice", "Electric", null] } : null };
  const best = { ownedSummary: (weaknesses, limit) => {
    receivedTypes = { weaknesses, limit };
    return { count: 4, names: ["Mega Diancie", "Shadow Raikou", "Mega Tyranitar"] };
  } };
  const payload = api.buildPayload({
    boss: "Yveltal", kind: "5★", start: "2026-11-04T10:00", end: "2026-11-09T10:00"
  }, types, best, "https://pogo.example/");
  assert.equal(payload.title, "Pokémon GO raid · Yveltal");
  assert.deepEqual(Array.from(payload.weak), ["Electric", "Fairy", "Ice"]);
  assert.deepEqual(Array.from(receivedTypes.weaknesses), ["Electric", "Fairy", "Ice"]);
  assert.equal(receivedTypes.limit, 3);
  assert.match(payload.windowLabel, /local$/);
  assert.match(payload.text, /Weak to: Electric, Fairy, Ice/);
  assert.match(payload.text, /Marked counters in the current top-ten type lists: Mega Diancie, Shadow Raikou, Mega Tyranitar \(\+1 more\)/);
  assert.match(payload.text, /Counter coverage is limited to the current top-ten type lists and your local marks/);
  assert.match(payload.text, /GO Field Notes: https:\/\/pogo\.example\//);
});

test("raid share payload does not invent weaknesses, counters or dates when source data is absent", () => {
  const payload = load().buildPayload({ boss: "Unlisted Boss", kind: "Mega", start: "not-a-date", end: "" }, null, null, "");
  assert.equal(payload.windowLabel, "");
  assert.deepEqual(Array.from(payload.weak), []);
  assert.equal(payload.counters, null);
  assert.doesNotMatch(payload.text, /Weak to:|Marked counters|Rotation:/);
});

test("raid share payload rejects an empty boss name", () => {
  assert.equal(load().buildPayload({ boss: "   " }, null, null, ""), null);
});
