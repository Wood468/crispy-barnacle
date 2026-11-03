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

test("same-series events at distinct cities remain separate while country/city aliases still merge", async () => {
  const { mergeWorld, collapseWorld } = await import("../scripts/importer/world.mjs");
  const names = { official: "Pokémon GO (official)", leekduck: "Leek Duck" };
  const cities = mergeWorld([
    {
      name: "Pokémon RUN 30", place: "Taichung, Taiwan", area: "Asia", scope: "regional",
      start: "2026-11-07", end: "2026-11-08", datesKnown: true,
      url: "https://pokemongo.com/news/run-30-taichung/", source: "official"
    },
    {
      name: "Pokémon RUN 30", place: "Singapore", area: "Asia", scope: "regional",
      start: "2026-11-07", end: "2026-11-08", datesKnown: true,
      url: "https://pokemongo.com/news/run-30-singapore/", source: "official"
    }
  ], names);
  assert.equal(cities.length, 2, "same series and dates at different cities are separate real-world stops");
  assert.deepEqual(cities.map(event => event.place), ["Taichung, Taiwan", "Singapore"]);
  assert.equal(collapseWorld(cities).events.length, 2, "the later collapse pass must also retain both destinations");

  const nested = mergeWorld([
    {
      name: "Pokémon RUN 30", place: "Malaysia", area: "Asia", scope: "regional",
      start: "2026-11-21", end: "2026-11-22", datesKnown: true,
      url: "https://pokemongo.com/news/run-30-malaysia/", source: "official"
    },
    {
      name: "Pokémon RUN 30: Kuala Lumpur", place: "Kuala Lumpur, Malaysia (KLCC)", area: "Asia", scope: "regional",
      start: "2026-11-21", end: "2026-11-22", datesKnown: true,
      url: "https://leekduck.com/events/pokemon-run-30-kuala-lumpur/", source: "leekduck"
    }
  ], names);
  assert.equal(nested.length, 1, "a country-level record and its city-level version remain one event");
  assert.equal(nested[0].name, "Pokémon RUN 30: Kuala Lumpur", "the more specific city title replaces the country-level label");
  assert.equal(nested[0].place, "Kuala Lumpur, Malaysia (KLCC)", "the more specific city/venue replaces the country-only place");
});

test("same-writeup country aliases retain the more specific city and venue", async () => {
  const { mergeWorld, sameWriteupRulings, collapseWorld } = await import("../scripts/importer/world.mjs");
  const officialUrl = "https://pokemongo.com/news/pokemon-run-30-2026/";
  const source = { id: "official", name: "Pokémon GO (official)", url: officialUrl };
  const broad = {
    id: "w-pok-mon-run-30-malaysia",
    name: "Pokémon RUN 30: Malaysia",
    place: "Malaysia",
    area: "Asia",
    scope: "regional",
    start: "2026-11-21",
    end: "2026-11-22",
    sources: [source],
    status: "official"
  };
  const specific = {
    id: "w-pok-mon-run-30-kuala-lumpur",
    name: "Pokémon RUN 30: Kuala Lumpur",
    place: "Kuala Lumpur, Malaysia (KLCC Plaza Petronas)",
    area: "Asia",
    scope: "regional",
    start: "2026-11-21",
    end: "2026-11-22",
    sources: [source],
    status: "official"
  };

  // The same official page can yield both a country-level parse and a curated venue record.
  // They describe one stop, so the same-write-up guard must not preserve the weaker alias as a separate event.
  const merged = mergeWorld([broad, specific], { official: "Pokémon GO (official)" });
  const rulings = sameWriteupRulings(merged);
  assert.deepEqual(rulings, []);
  const collapsed = collapseWorld(merged, { different: rulings });
  assert.equal(collapsed.events.length, 1);
  assert.equal(collapsed.events[0].name, specific.name);
  assert.equal(collapsed.events[0].place, specific.place);
  assert.equal(collapsed.events[0].area, "Asia");

  // Two genuinely different destinations in the same announcement must remain separate.
  const singapore = {
    ...specific,
    id: "w-pok-mon-run-30-singapore",
    name: "Pokémon RUN 30: Singapore",
    place: "Singapore (The Kallang)"
  };
  const separate = mergeWorld([broad, singapore], { official: "Pokémon GO (official)" });
  const separateRulings = sameWriteupRulings(separate);
  assert.deepEqual(separateRulings, [[separate[0].id, separate[1].id]]);
  assert.equal(collapseWorld(separate, { different: separateRulings }).events.length, 2);
});

test("curated world IDs survive a city-name refinement in the source feed", async () => {
  const { regionalSeedEntries, mergeWorld } = await import("../scripts/importer/world.mjs");
  const url = "https://pokemongo.com/news/pokemon-run-30-2026/";
  const seed = regionalSeedEntries({
    events: [{
      name: "Pokémon RUN 30: Bangkok",
      worldId: "w-pok-mon-run-30-thailand",
      place: "Bangkok, Thailand (outdoor plaza in front of Central World)",
      area: "Asia",
      scope: "regional",
      start: "2027-01-09",
      end: "2027-01-10",
      source: { label: "Pokémon GO (official)", url }
    }]
  });
  const merged = mergeWorld([{
    name: "Pokémon RUN 30: Bangkok",
    place: "Bangkok, Thailand",
    area: "Asia",
    scope: "regional",
    start: "2027-01-09",
    end: "2027-01-10",
    datesKnown: true,
    url,
    source: "official"
  }, ...seed], { official: "Pokémon GO (official)" });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "w-pok-mon-run-30-thailand");
  assert.equal(merged[0].place, "Bangkok, Thailand (outdoor plaza in front of Central World)");
});

test("global Twitch research stays distinct from the in-person Night Out venue event", async () => {
  const { fromPage, mergeWorld, collapseWorld } = await import("../scripts/importer/world.mjs");
  const physical = fromPage({
    title: "Celebrate the Pokémon Night Out events in Pokémon GO! — Pokémon GO",
    url: "https://pokemongo.com/news/pokemon-night-out-irl-details2026/",
    source: "official",
    lines: [{ text: "Pokémon Night Out is taking place at Intuit Dome in Los Angeles, USA, on October 24, 2026, and attending Trainers will have the opportunity to enjoy additional event bonuses in Pokémon GO!" }]
  }, "2026-10-01");
  const stream = fromPage({
    title: "Get codes for exclusive Timed Research during the Pokémon Night Out Twitch broadcast! — Pokémon GO",
    url: "https://pokemongo.com/news/pokemon-night-out-twitch-drops2026",
    source: "official",
    lines: [{ text: "To celebrate the Pokémon Night Out event taking place at Intuit Dome in Los Angeles, USA, on October 24, 2026, Trainers globally can receive codes for exclusive Timed Research by watching 30 minutes of the Pokémon Twitch livestream!" }]
  }, "2026-10-01");

  assert.equal(physical.scope, "regional");
  assert.equal(physical.place, "Los Angeles, USA");
  assert.equal(stream.scope, "global", "a Twitch broadcast is available globally even when it mentions the venue");
  assert.equal(stream.place, "");
  assert.equal(stream.area, "Worldwide");
  assert.equal(stream.start, "2026-10-24");
  assert.equal(stream.end, "2026-10-24");

  const rules = JSON.parse(readFileSync(new URL("../data/event-aliases.json", import.meta.url), "utf8"));
  const pair = ["w-celebrate-the-pok-mon-night-out-events-in-pok-mon-", "w-get-codes-for-exclusive-timed-research-during-the-"];
  assert.ok(rules.different.some(ids => pair.every(id => ids.includes(id))), "the venue event and global Twitch activity are explicitly distinct");
  const collapsed = collapseWorld(mergeWorld([physical, stream], { official: "Pokémon GO (official)" }), rules);
  assert.equal(collapsed.events.length, 2, "the global Twitch activity must not be merged into the in-person venue event");

  const saved = JSON.parse(readFileSync(new URL("../public/world-events.json", import.meta.url), "utf8"));
  const savedStream = saved.events.find(event => event.id === pair[1]);
  assert.equal(savedStream.scope, "global");
  assert.equal(savedStream.place, "");
  assert.equal(savedStream.area, "Worldwide");
});

test("curated watch pages are prioritised ahead of the importer page cap", async () => {
  const { prioritizeWatchedPages, normUrl } = await import("../scripts/importer/world.mjs");
  const feeds = Array.from({ length: 90 }, (_, index) => ({
    source: "hub", url: `https://pokemongohub.net/post/event/feed-${index}/`
  }));
  const watched = [
    { source: "official", url: "https://pokemongo.com/en/gowildarea/mexico-city" },
    { source: "official", url: "https://pokemongo.com/en/gowildarea/sendai" },
    { source: "leekduck", url: "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/" }
  ];
  const ordered = prioritizeWatchedPages([...feeds, ...watched], watched.map(page => page.url));
  assert.deepEqual(ordered.slice(0, watched.length).map(page => page.url), watched.map(page => page.url));
  const watchedUrls = new Set(watched.map(page => normUrl(page.url)));
  assert.equal(ordered.slice(0, 80).filter(page => watchedUrls.has(normUrl(page.url))).length, watched.length);
  assert.deepEqual(ordered.slice(watched.length).map(page => page.url), feeds.map(page => page.url));
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

  const watched = new Set([
    "https://pokemongo.com/en/gowildarea/mexico-city/",
    "https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/"
  ]);
  const retained = preserveWorldSources(current, prior, { watchUrls: watched })[0];
  assert.equal(retained.status, "official");
  assert.deepEqual(retained.sources.map(source => source.id).sort(), ["leekduck", "official", "serebii"]);
  assert.deepEqual(retained.sources.map(source => source.id), ["official", "leekduck", "serebii"], "last-good source order is retained");
  assert.equal(retained.start, "2026-11-06");
  assert.equal(retained.place, "Mexico City, Mexico");

  const changed = preserveWorldSources([{ ...current[0], start: "2026-11-07" }], prior, { watchUrls: watched })[0];
  assert.equal(changed.start, "2026-11-07", "current event facts are never overwritten from the old snapshot");
  assert.deepEqual(changed.sources.map(source => source.id), ["serebii"], "source coverage is not carried across a changed event identity");
  assert.equal(changed.status, "single");

  const unmonitored = preserveWorldSources(current, prior, {
    watchUrls: new Set(["https://pokemongo.com/en/gowildarea/mexico-city/"])
  })[0];
  assert.deepEqual(unmonitored.sources.map(source => source.id).sort(), ["official", "serebii"], "unwatched prior sources are not carried forward");
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


test("Pokémon RUN 30 city stops keep official venues and date-only event windows", () => {
  const officialUrl = "https://pokemongo.com/news/pokemon-run-30-2026/";
  const world = JSON.parse(readFileSync(new URL("../public/world-events.json", import.meta.url), "utf8")).events;
  const fallback = JSON.parse(readFileSync(new URL("../public/regional-events.json", import.meta.url), "utf8")).events;
  const watch = JSON.parse(readFileSync(new URL("../data/watch-pages.json", import.meta.url), "utf8")).pages;
  const expected = [
    ["w-pok-mon-run-30-singapore", "rg-run30-singapore", "Pokémon RUN 30: Singapore", "Singapore (The Kallang)", "2026-11-07", "2026-11-08"],
    ["w-pok-mon-run-30-new-taipei", "rg-run30-new-taipei", "Pokémon RUN 30: New Taipei", "New Taipei, Taiwan (New Taipei Metropolitan Park)", "2026-11-14", "2026-11-15"],
    ["w-pok-mon-run-30-malaysia", "rg-run30-kuala-lumpur", "Pokémon RUN 30: Kuala Lumpur", "Kuala Lumpur, Malaysia (KLCC Plaza Petronas)", "2026-11-21", "2026-11-22"],
    ["w-pok-mon-run-30-jakarta", "rg-run30-jakarta", "Pokémon RUN 30: Jakarta", "Jakarta, Indonesia (GBK / Gelora Bung Karno)", "2026-12-12", "2026-12-13"],
    ["w-pok-mon-run-30-thailand", "rg-run30-bangkok", "Pokémon RUN 30: Bangkok", "Bangkok, Thailand (outdoor plaza in front of Central World)", "2027-01-09", "2027-01-10"],
    ["w-pok-mon-run-30-hong-kong", "rg-run30-hong-kong", "Pokémon RUN 30: Hong Kong", "Hong Kong (Science Park)", "2027-01-23", "2027-01-24"]
  ];
  assert.ok(watch.some(item => String(item.url || "").replace(/\/$/, "") === officialUrl.replace(/\/$/, "")), "the official series page remains on the importer watch list");
  for (const [id, fallbackId, name, place, start, end] of expected) {
    const event = world.find(item => item.id === id);
    assert.ok(event, name + " exists in the primary world-event feed");
    assert.equal(event.name, name);
    assert.equal(event.place, place);
    assert.equal(event.start, start);
    assert.equal(event.end, end);
    assert.equal(event.scope, "regional", "each city stop remains an in-person regional event");
    assert.equal(event.area, "Asia");
    assert.equal(event.datesKnown, true);
    assert.match(event.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(event.end, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(event.sources.some(source => source.id === "official" && source.url === officialUrl));
    assert.ok(event.sources.every(source => typeof source.id === "string" && typeof source.name === "string" && typeof source.url === "string"), "every public source record has string id, name and URL fields");
    assert.ok(!event.sources.some(source => source.id === "official" && /serebii\\.net/i.test(source.url)), "an official source object never inherits the shared Serebii fallback URL");
    const backup = fallback.find(item => item.id === fallbackId);
    assert.ok(backup, name + " remains available in the regional fallback");
    assert.equal(backup.source.url, officialUrl);
    assert.equal(backup.source.label, "Pokémon GO (official)");
    assert.equal(backup.scope, "regional");
    assert.equal(backup.start, start);
    assert.equal(backup.end, end);
  }
});


test("per-event regional seed source objects override the shared Serebii fallback", async () => {
  const { regionalSeedEntries, mergeWorld } = await import("../scripts/importer/world.mjs");
  const officialUrl = "https://pokemongo.com/news/pokemon-run-30-2026/";
  const serebiiUrl = "https://www.serebii.net/pokemongo/reallifeevents.shtml";
  const seed = {
    source: { label: "Serebii.net, Pokémon GO real-life events", url: serebiiUrl },
    events: [
      {
        name: "Pokémon RUN 30: New Taipei", place: "New Taipei, Taiwan (New Taipei Metropolitan Park)",
        area: "Asia", start: "2026-11-14", end: "2026-11-15", url: serebiiUrl,
        source: { label: "Pokémon GO (official)", url: officialUrl }
      },
      {
        name: "Legacy regional event", place: "Tokyo, Japan", area: "Asia",
        start: "2026-11-20", end: "2026-11-20"
      }
    ]
  };
  const entries = regionalSeedEntries(seed);
  assert.equal(entries[0].url, officialUrl, "the per-event official URL takes precedence over both event and shared fallback URLs");
  assert.deepEqual(mergeWorld([entries[0]], { official: "Pokémon GO (official)" })[0].sources, [
    { id: "official", name: "Pokémon GO (official)", url: officialUrl }
  ]);
  assert.equal(entries[1].url, serebiiUrl, "entries without a per-event source retain the shared fallback URL");
  assert.deepEqual(mergeWorld([entries[1]], { serebii: "Serebii" })[0].sources, [
    { id: "serebii", name: "Serebii", url: serebiiUrl }
  ]);
});


test("regional in-game classification survives the curated fallback seed and world merge", async () => {
  const { regionalSeedEntries, mergeWorld, collapseWorld } = await import("../scripts/importer/world.mjs");
  const url = "https://pokemongo.com/news/festival-of-lights-2026/";
  const seed = regionalSeedEntries({
    events: [{
      name: "Festival of Lights",
      worldId: "w-celebrate-the-festival-of-lights-with-the-return-o",
      place: "India",
      area: "Asia",
      scope: "regional",
      mode: "in-game",
      start: "2026-11-06",
      end: "2026-11-08",
      source: { id: "official", label: "Pokémon GO (official)", url }
    }]
  });
  assert.equal(seed[0].mode, "in-game");
  const merged = mergeWorld([{
    name: "Festival of Lights",
    place: "India",
    area: "Asia",
    scope: "regional",
    start: "2026-11-06",
    end: "2026-11-08",
    datesKnown: true,
    url,
    source: "official"
  }, ...seed], { official: "Pokémon GO (official)" });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "w-celebrate-the-festival-of-lights-with-the-return-o");
  assert.equal(merged[0].mode, "in-game");
  assert.equal(collapseWorld(merged).events[0].mode, "in-game");
});

test("conflicting world-event modes fail closed instead of silently merging unlike activities", async () => {
  const { mergeWorld, collapseWorld } = await import("../scripts/importer/world.mjs");
  const url = "https://pokemongo.com/news/festival-of-lights-2026/";
  const base = {
    name: "Festival of Lights",
    place: "India",
    area: "Asia",
    scope: "regional",
    start: "2026-11-06",
    end: "2026-11-08",
    datesKnown: true,
    url,
    source: "official"
  };
  assert.throws(() => mergeWorld([
    { ...base, mode: "in-game" },
    { ...base, mode: "in-person" }
  ], { official: "Pokémon GO (official)" }), /Conflicting world-event modes/);
  assert.throws(() => collapseWorld([
    { ...base, id: "festival-a", mode: "in-game", sources: [{ id: "official", name: "Pokémon GO (official)", url }] },
    { ...base, id: "festival-b", mode: "in-person", sources: [{ id: "official", name: "Pokémon GO (official)", url }] }
  ]), /Conflicting world-event modes/);
});
