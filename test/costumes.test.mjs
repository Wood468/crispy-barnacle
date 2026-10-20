import test from "node:test";
import assert from "node:assert/strict";
import { collect } from "../scripts/costumes.mjs";
test("costume names come from event data and write-up lines", () => {
  const got = collect({ x: [{ n: "Pikachu", costume: 1, label: "Astronaut" }] }, { events: { a: { fields: { costumes: [{ text: "Machamp (Modern Jacket) is wearing a jacket." }] } } } }).map(([k]) => k);
  assert.ok(got.includes("pikachu|astronaut") && got.includes("machamp|modern jacket"), got.join());
});

import { serebiiForms } from "../scripts/costumes.mjs";
test("Serebii costume pictures are read from the Alternate Forms table", () => {
  const html = '<td><a href="#"><img src="/pokemongo/pokemon/068.png" title="Normal" class="formpic"></a></td><td><a href="#"><img src="/pokemongo/pokemon/068-jacket.png" loading="lazy" title="Modern Jacket" class="formpic"></a></td>';
  const f = serebiiForms(html, 68);
  assert.equal(f["modern jacket"].url, "https://www.serebii.net/pokemongo/pokemon/068-jacket.png");
  assert.equal(f["modern jacket"].shiny, "https://www.serebii.net/pokemongo/pokemon/shiny/068-jacket.png");
});

import { findUrls, localName } from "../scripts/mirror-images.mjs";
import { ALIAS } from "../scripts/costumes.mjs";
test("hotlinked pictures are found and given a stable local name", () => {
  const t = 'a "https://www.serebii.net/pokemongo/pokemon/068-jacket.png" b https://cdn.leekduck.com/x/y.jpg?v=1 c /img/ext/a.png https://leekduck.com/events/x/';
  assert.deepEqual(findUrls(t), ["https://www.serebii.net/pokemongo/pokemon/068-jacket.png", "https://cdn.leekduck.com/x/y.jpg?v=1"]);
  const n = localName("https://www.serebii.net/pokemongo/pokemon/068-jacket.png");
  assert.match(n, /^068-jacket-[0-9a-f]{8}\.png$/); assert.equal(n, localName("https://www.serebii.net/pokemongo/pokemon/068-jacket.png"));
});
test("Pikachu's Halloween 2026 outfit is matched to Serebii's name for it", () => { assert.equal(ALIAS["pikachu|hat and capelet"], "halloween 2026"); });

import { gmaxNames } from "../scripts/costumes.mjs";
test("Gigantamax names come from the data and a list of every Gigantamax Pokémon", () => {
  const g = gmaxNames({ a: [{ n: "Gigantamax Duraludon" }], b: "Six-star Max Battles for Gigantamax Kingler" }, { events: {} });
  assert.ok(g.includes("Duraludon") && g.includes("Kingler") && g.includes("Charizard"), g.join());
});
