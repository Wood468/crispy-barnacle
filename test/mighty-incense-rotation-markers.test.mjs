import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require=createRequire(import.meta.url);
const rotations=require("../public/event-encounter-rotations.js");
const doc=JSON.parse(readFileSync(new URL("../public/event-encounter-rotations.json",import.meta.url),"utf8"));
const entry=doc.entries.find(e=>e.id==="gowa-2026-global");
const css=readFileSync(new URL("../public/event-encounter-rotations.css",import.meta.url),"utf8");
const render=e=>rotations.render(e,{art:()=>'<img class="art" alt="">',
 now:new Date("2026-11-13T23:10:00Z"),viewerZone:"Australia/Melbourne"});

test("sourced Mighty wild day galleries never inherit Incense for same-name source encounters",()=>{
 assert.ok(entry);
 assert.deepEqual(rotations.validate(entry),[]);
 const html=render(entry);
 assert.equal((html.match(/class="uer-pokemon-tile"/g)||[]).length,64);
 assert.equal((html.match(/class="uer-mighty-mark"/g)||[]).length,20);
 assert.equal((html.match(/class="uer-incense-corner"/g)||[]).length,2,
  "only the shared ticket Mighty group is sourced as Incense");
 const sat=html.match(/<article class="uer-mighty-day" data-mighty-date="2026-11-14"[\s\S]*?<\/article>/)?.[0]||"";
 assert.match(sat,/data-pokemon="Metagross"/);
 assert.match(sat,/uer-mighty-mark/);
 assert.doesNotMatch(sat,/uer-incense-corner/);
 const sun=html.match(/<article class="uer-mighty-day" data-mighty-date="2026-11-15"[\s\S]*?<\/article>/)?.[0]||"";
 assert.match(sun,/data-pokemon="Hydreigon"/);
 assert.doesNotMatch(sun,/uer-incense-corner/);
 const shared=html.match(/<article class="uer-mighty-shared" data-shared-id="ticket-incense"[\s\S]*?<\/article>/)?.[0]||"";
 for(const mon of ["Latias","Latios"]){
  assert.match(shared,new RegExp('aria-label="'+mon+', Mighty Pokémon, Incense encounter, ticket-only'));
 }
 assert.equal((shared.match(/class="uer-mighty-mark"/g)||[]).length,2);
 assert.equal((shared.match(/class="uer-incense-corner"/g)||[]).length,2);
 assert.doesNotMatch(html,/data-track|data-follow|Follow Pokémon/);
});

test("future different-method encounter of the same species does not leak markers",()=>{
 const future=structuredClone(entry);
 future.eventIds=["future-event"];
 future.habitats[0].pokemon[0]="Latias";
 const html=render(future);
 const habitat=html.match(/<article class="uer-habitat uer-habitat-steel"[\s\S]*?<\/article>/)?.[0]||"";
 assert.match(habitat,/data-pokemon="Latias"/);
 assert.doesNotMatch(habitat,/uer-mighty-mark|uer-incense-corner/);
 assert.match(html,/aria-label="Latias, Mighty Pokémon, Incense encounter, ticket-only/);
 const route=structuredClone(entry);route.mightyShared[0].method="route";
 assert.deepEqual(rotations.validate(route),[]);
 const routeHtml=render(route);
 const shared=routeHtml.match(/<article class="uer-mighty-shared"[\s\S]*?<\/article>/)?.[0]||"";
 assert.equal((shared.match(/class="uer-mighty-mark"/g)||[]).length,2);
 assert.doesNotMatch(shared,/uer-incense-corner/);
});

test("small opposite-corner Mighty and Incense overlays are noninteractive and source-driven",()=>{
 assert.match(css,/\.uer-pokemon-tile\{position:relative;/);
 assert.match(css,/\.uer-mighty-mark\{position:absolute;/);
 assert.match(css,/\.uer-incense-corner\{position:absolute;/);
 assert.match(css,/\.uer-incense-corner img\{display:block;width:19px;height:19px;/);
 assert.match(css,/\.ue-mon \.ue-mighty-corner\{position:absolute;/);
 assert.match(css,/\.uer-mighty-mark\{[^}]*pointer-events:none/);
 assert.match(css,/\.ue-mon \.ue-mighty-corner\{[^}]*pointer-events:none/);
});
