import test from "node:test";
import assert from "node:assert/strict";

test("multiple community write-ups are corroborated, while official evidence keeps precedence", async () => {
  const { mergeWorld, collapseWorld } = await import("../scripts/importer/world.mjs");
  const base = { name: "Pokémon RUN 30: Taichung", place: "Taichung, Taiwan", area: "Asia", scope: "regional", start: "2026-11-07", end: "2026-11-08", datesKnown: true };
  const entries = [
    { ...base, url: "https://leekduck.com/events/pokemon-run-30/", source: "leekduck" },
    { ...base, url: "https://www.serebii.net/pokemongo/reallifeevents.shtml", source: "serebii" }
  ];
  const names = { leekduck: "Leek Duck", serebii: "Serebii", official: "Pokémon GO (official)" };
  const merged = mergeWorld(entries, names);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "corroborated");
  assert.equal(collapseWorld(merged).events[0].status, "corroborated");
  assert.equal(mergeWorld([...entries, { ...base, url: "https://pokemongo.com/news/pokemon-run-30/", source: "official" }], names)[0].status, "official");
});

test("tidyName keeps the event part of a long official headline", async () => {
  const { tidyName } = await import("../scripts/importer/world.mjs");
  assert.equal(tidyName("Pokémon RUN 30: Taichung"), "Pokémon RUN 30: Taichung");
  assert.equal(tidyName("Celebrate the Festival of Lights with the return of Pikachu wearing a saree and Pikachu wearing a kurta!"), "Festival of Lights");
  assert.equal(tidyName("PokéXciting! lands at Changi Airport and Jewel — get ready, Singapore!"), "PokéXciting! lands at Changi Airport and Jewel");
  assert.equal(tidyName("Explore by starlight during meteor showers for a chance to encounter Minior!"), "Explore by starlight during meteor showers");
});

test("splits multiple city/date stops from one official announcement paragraph", async () => {
  const {
    entriesFromPage, mergeWorld, sameWriteupRulings, collapseWorld, keepOldWorld, normUrl
  } = await import("../scripts/importer/world.mjs");
  const page = {
    title: "Celebrate the Pokémon Night Out events in Pokémon GO!",
    url: "https://pokemongo.com/news/pokemon-night-out-irl-details2026/",
    source: "official",
    lines: [{
      t: "p",
      text: "Pokémon Night Out is taking place at Intuit Dome in Los Angeles, USA, on October 24, 2026, and at the O2 Arena in London, England, on November 10, 2026, and attending Trainers will have the opportunity to enjoy additional event bonuses in Pokémon GO!"
    }]
  };

  const stops = entriesFromPage(page, "2026-10-30");
  assert.deepEqual(stops.map(s => [s.place, s.start, s.end]), [
    ["Los Angeles, USA", "2026-10-24", "2026-10-24"],
    ["London, UK", "2026-11-10", "2026-11-10"]
  ]);

  // Stops from one official page must remain separate through the world-event deduper.
  const entries = mergeWorld(stops, { official: "Pokémon GO (official)" });
  const different = sameWriteupRulings(entries);
  assert.deepEqual(different, [[entries[0].id, entries[1].id]]);
  assert.equal(collapseWorld(entries, { different }).events.length, 2);

  // Do not restore the previous combined record from the old generated file.
  const oldCombined = {
    name: "Pokémon Night Out events in Pokémon GO",
    start: "2026-10-24",
    end: "2026-11-10",
    seen: "2026-10-30",
    sources: [{ name: "Pokémon GO (official)", url: page.url }]
  };
  assert.equal(keepOldWorld(oldCombined, {
    cutoff: "2026-10-16",
    today: "2026-10-30",
    now: Date.parse("2026-10-30T12:00:00Z"),
    splitUrls: new Set([normUrl(page.url)])
  }), false);
});
