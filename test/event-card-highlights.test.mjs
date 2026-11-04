import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const dash = fs.readFileSync(new URL("../public/dash.js", import.meta.url), "utf8");
const data = JSON.parse(fs.readFileSync(new URL("../public/data.json", import.meta.url), "utf8"));

function between(startMarker, endMarker) {
  const start = dash.indexOf(startMarker);
  assert.notEqual(start, -1, "missing source section: " + startMarker);
  const end = dash.indexOf(endMarker, start);
  assert.notEqual(end, -1, "missing end marker: " + endMarker);
  return dash.slice(start, end);
}

function evaluate(source, name) {
  const titleKey = value => String(value || "").toLowerCase();
  const context = {
    window: {
      GODEDUPE: { titleKey },
      GOLIB: { isPlaceholder: () => false }
    },
    GODEDUPE: { titleKey },
    GOLIB: { isPlaceholder: () => false }
  };
  vm.runInNewContext(source + "\nthis.result = " + name + ";", context);
  return context.result;
}

const helperSource = between("function mergeHighlights(", "\n  function signalChips");
const dedupeSource = between("function dedupeLive(", "\n  var EV =");
const curatedMergeSource = between("function mergeLiveAndCurated(", "\n  function announced(ev)");

test("highlight merge keeps typed records, normalises duplicate keys and ignores malformed entries", () => {
  const merge = evaluate(helperSource, "mergeHighlights");
  const existing = [{ type: "debut", label: "DEBUT · Bramblin", extra: { source: "official" } }];
  const incoming = [
    { type: "DEBUT", label: " debut · bramblin " },
    { type: "boosted-shiny", label: "BOOSTED SHINY · Electrike", window: { start: "2026-11-05" } },
    null,
    { type: "debut", label: " " },
    "not a record"
  ];
  const result = JSON.parse(JSON.stringify(merge(existing, incoming)));
  assert.deepEqual(result, [existing[0], incoming[1]]);
});

test("duplicate live reports pool their typed highlights instead of dropping either source signal", () => {
  const merge = evaluate(helperSource + "\n" + dedupeSource, "dedupeLive");
  const start = Date.parse("2026-11-05T10:00:00Z");
  const result = merge([
    {
      id: "leekduck:test-event", name: "Test Event", start, end: start + 86400000,
      featured: [], bonuses: [], highlights: [{ type: "debut", label: "DEBUT · A" }],
      status: "community_reported", source: "Leek Duck"
    },
    {
      id: "hub:test-event", name: "Test Event", start: start + 1000, end: start + 86401000,
      featured: [], bonuses: [], highlights: [{ type: "boosted-shiny", label: "BOOSTED SHINY · B" }],
      status: "community_reported", source: "Pokémon GO Hub"
    }
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result[0].highlights)), [
    { type: "debut", label: "DEBUT · A" },
    { type: "boosted-shiny", label: "BOOSTED SHINY · B" }
  ]);
});

test("matching live events retain the real curated typed highlights used by cards and Today shiny activity", () => {
  const merge = evaluate(helperSource + "\n" + curatedMergeSource, "mergeLiveAndCurated");
  const curatedEvents = data.events.filter(event => Array.isArray(event.highlights) && event.highlights.length);
  assert.ok(curatedEvents.length > 0, "fixture data includes source-backed typed highlights");
  for (const event of curatedEvents) {
    const live = {
      id: "leekduck:" + event.id, name: event.t, start: new Date(event.s), end: new Date(event.e),
      featured: [], bonuses: [], notes: [], tags: [], highlights: [],
      status: "community_reported", source: "Leek Duck", link: ""
    };
    const curated = {
      id: "cur:" + event.id, name: event.t, start: new Date(event.s), end: new Date(event.e),
      featured: [], bonuses: event.bonuses || [], notes: [], tags: event.tags || [],
      highlights: event.highlights, status: "official_confirmed", source: event.source, link: event.sourceUrl
    };
    const result = merge([live], [curated]);
    assert.equal(result.length, 1, event.t + " should merge into its live card");
    assert.deepEqual(JSON.parse(JSON.stringify(result[0].highlights)), event.highlights, event.t + " keeps every typed highlight");
  }
});

test("live API adapter passes through structured highlights when supplied", () => {
  assert.match(dash, /highlights: Array\.isArray\(x\.highlights\) \? x\.highlights : \[\]/);
});
