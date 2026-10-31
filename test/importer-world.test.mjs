import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

test("unchanged world events retain last-good source attribution when a refresh finds only a subset", async () => {
  const { preserveWorldSources } = await import("../scripts/importer/world.mjs");
  const prior = [{
    id: "w-go-wild-area-2026-mexico-city",
    name: "GO Wild Area 2026 Mexico City",
    place: "Mexico City, Mexico",
    area: "Americas",
    scope: "regional",
    start: "2026-11-06",
    end: "2026-11-08",
    status: "official",
    sources: [
      { id: "official", name: "Pokémon GO (official)", url: "https://pokemongo.com/en/gowildarea/mexico-city" },
      { id: "leekduck", name: "Leek Duck", url: "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/" },
      { id: "serebii", name: "Serebii", url: "https://www.serebii.net/pokemongo/reallifeevents.shtml" }
    ]
  }];
  const current = [{
    id: prior[0].id,
    name: prior[0].name,
    place: prior[0].place,
    area: prior[0].area,
    scope: prior[0].scope,
    start: prior[0].start,
    end: prior[0].end,
    status: "single",
    sources: [{ id: "serebii", name: "Serebii", url: "https://www.serebii.net/pokemongo/reallifeevents.shtml" }]
  }];

  const retained = preserveWorldSources(current, prior)[0];
  assert.equal(retained.status, "official");
  assert.deepEqual(retained.sources.map(source => source.id).sort(), ["leekduck", "official", "serebii"]);
  assert.equal(retained.start, "2026-11-06");
  assert.equal(retained.place, "Mexico City, Mexico");

  const changed = preserveWorldSources([{ ...current[0], start: "2026-11-07" }], prior)[0];
  assert.equal(changed.start, "2026-11-07", "current event facts are never overwritten from the old snapshot");
  assert.deepEqual(changed.sources.map(source => source.id), ["serebii"], "source coverage is not carried across a changed event identity");
  assert.equal(changed.status, "single");
});

test("Wild Area city pages retain official source coverage without merging destinations", async () => {
  const { entriesFromPage, mergeWorld, keepOldWorld, normUrl } = await import("../scripts/importer/world.mjs");
  const mexicoUrl = "https://pokemongo.com/en/gowildarea/mexico-city";
  const sendaiUrl = "https://pokemongo.com/en/gowildarea/sendai";
  const officialPages = [
    {
      title: "Mexico City – GO Wild Area 2026", url: mexicoUrl, source: "official",
      lines: [{ text: "Pokémon GO Wild Area Visits Mexico City, Mexico, November 6–8, 2026" }, { text: "Real-world event experiences in Mexico City, with gameplay available throughout the metropolitan area." }]
    },
    {
      title: "Sendai • Tohoku – GO Wild Area 2026", url: sendaiUrl, source: "official",
      lines: [{ text: "Pokémon GO Wild Area Visits Sendai, Miyagi, November 6–8, 2026" }, { text: "Real-world event experiences in Sendai, with gameplay available throughout Miyagi Prefecture." }]
    }
  ];
  const officialEntries = officialPages.map(page => entriesFromPage(page, "2026-10-31")[0]);
  assert.deepEqual(officialEntries.map(e => [e.place, e.start, e.end]), [
    ["Mexico City, Mexico", "2026-11-06", "2026-11-08"],
    ["Sendai and Tohoku, Japan", "2026-11-06", "2026-11-08"]
  ]);
  const seeds = [
    { name: "GO Wild Area 2026 Mexico City", place: "Mexico City, Mexico", area: "Americas", scope: "regional", start: "2026-11-06", end: "2026-11-08", datesKnown: true, url: "https://www.serebii.net/pokemongo/reallifeevents.shtml", source: "serebii" },
    { name: "GO Wild Area 2026 Sendai Tohoku", place: "Sendai and Tohoku, Japan", area: "Asia", scope: "regional", start: "2026-11-06", end: "2026-11-08", datesKnown: true, url: "https://www.serebii.net/pokemongo/reallifeevents.shtml", source: "serebii" }
  ];
  const communityEntries = officialEntries.map((entry, i) => ({
    ...entry,
    url: i === 0 ? "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/" : "https://leekduck.com/events/pokemon-go-wild-area-2026-sendai-japan/",
    source: "leekduck"
  }));
  const merged = mergeWorld([...seeds, ...officialEntries, ...communityEntries], {
    official: "Pokémon GO (official)", leekduck: "Leek Duck", serebii: "Serebii"
  });
  assert.equal(merged.length, 2);
  for (const event of merged) {
    assert.equal(event.status, "official");
    assert.deepEqual(event.sources.map(s => s.id).sort(), ["leekduck", "official", "serebii"]);
    assert.equal(event.start, "2026-11-06");
    assert.equal(event.end, "2026-11-08");
  }
  const oldMexico = {
    ...merged.find(e => e.place === "Mexico City, Mexico"),
    seen: "2026-10-31"
  };
  assert.equal(keepOldWorld(oldMexico, {
    cutoff: "2026-10-17", today: "2026-10-31", now: Date.parse("2026-10-31T00:00:00Z"),
    watchUrls: new Set([normUrl(mexicoUrl)])
  }), true);

  const snapshot = JSON.parse(readFileSync(new URL("../public/world-events.json", import.meta.url), "utf8")).events;
  const watch = JSON.parse(readFileSync(new URL("../data/watch-pages.json", import.meta.url), "utf8")).pages.map(p => p.url);
  for (const [id, officialUrl, leekduckUrl] of [
    ["w-go-wild-area-2026-mexico-city", mexicoUrl, "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/"],
    ["w-go-wild-area-2026-sendai-tohoku", sendaiUrl, "https://leekduck.com/events/pokemon-go-wild-area-2026-sendai-japan/"]
  ]) {
    const event = snapshot.find(e => e.id === id);
    assert.equal(event.status, "official");
    assert.ok(event.sources.some(s => s.url === officialUrl));
    assert.ok(event.sources.some(s => s.url === leekduckUrl));
    assert.ok(watch.includes(officialUrl), "the official city page remains watched by the importer");
  }
});
