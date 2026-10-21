import test from "node:test";
import assert from "node:assert/strict";

test("tidyName keeps the event part of a long official headline", async () => {
  const { tidyName } = await import("../scripts/importer/world.mjs");
  assert.equal(tidyName("Pokémon RUN 30: Taichung"), "Pokémon RUN 30: Taichung");
  assert.equal(tidyName("Celebrate the Festival of Lights with the return of Pikachu wearing a saree and Pikachu wearing a kurta!"), "Festival of Lights");
  assert.equal(tidyName("PokéXciting! lands at Changi Airport and Jewel — get ready, Singapore!"), "PokéXciting! lands at Changi Airport and Jewel");
  assert.equal(tidyName("Explore by starlight during meteor showers for a chance to encounter Minior!"), "Explore by starlight during meteor showers");
});


test("splits multi-stop dates and places found in one official paragraph", async () => {
  const { stopsFromPage } = await import("../scripts/importer/world.mjs");
  const page = {
    title: "Celebrate the Pokémon Night Out events in Pokémon GO!",
    url: "https://pokemongo.com/news/pokemon-night-out-irl-details2026/",
    source: "official",
    lines: [{
      t: "p",
      text: "Pokémon Night Out is taking place at Intuit Dome in Los Angeles, USA, on October 24, 2026, and at the O2 Arena in London, England, on November 10, 2026, and attending Trainers will have the opportunity to enjoy additional event bonuses in Pokémon GO!"
    }, {
      t: "p",
      text: "Additional bonuses are available at the event venue."
    }]
  };
  const stops = stopsFromPage(page, "2026-10-22");
  assert.deepEqual(stops.map(s => [s.where.place, s.range.start, s.range.end]), [
    ["Los Angeles, USA", "2026-10-24", "2026-10-24"],
    ["London, UK", "2026-11-10", "2026-11-10"]
  ]);
});

test("a previously combined event is not retained when its source now splits into stops", async () => {
  const { supersededBySplitPage } = await import("../scripts/importer/world.mjs");
  const urls = new Set(["https://pokemongo.com/news/pokemon-night-out-irl-details2026/"]);
  assert.equal(supersededBySplitPage({
    sources: [{ url: "https://pokemongo.com/news/pokemon-night-out-irl-details2026" }]
  }, urls), true);
  assert.equal(supersededBySplitPage({
    sources: [{ url: "https://leekduck.com/events/another-event/" }]
  }, urls), false);
});
