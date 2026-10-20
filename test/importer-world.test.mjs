import test from "node:test";
import assert from "node:assert/strict";

test("tidyName keeps the event part of a long official headline", async () => {
  const { tidyName } = await import("../scripts/importer/world.mjs");
  assert.equal(tidyName("Pokémon RUN 30: Taichung"), "Pokémon RUN 30: Taichung");
  assert.equal(tidyName("Celebrate the Festival of Lights with the return of Pikachu wearing a saree and Pikachu wearing a kurta!"), "Festival of Lights");
  assert.equal(tidyName("PokéXciting! lands at Changi Airport and Jewel — get ready, Singapore!"), "PokéXciting! lands at Changi Airport and Jewel");
  assert.equal(tidyName("Explore by starlight during meteor showers for a chance to encounter Minior!"), "Explore by starlight during meteor showers");
});
