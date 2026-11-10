import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const Rot = require('../public/event-encounter-rotations.js');
const source = JSON.parse(readFileSync(new URL('../public/event-encounter-rotations.json', import.meta.url), 'utf8'));
const fixture = source.entries[0];
const copy = x => JSON.parse(JSON.stringify(x));

test('each sourced event rotation is valid, indexed by canonical aliases and future-event compatible', () => {
  assert.equal(source.schemaVersion, 1);
  for (const e of source.entries) assert.deepEqual(Rot.validate(e), [], e.id);
  for (const id of ['wag','cur:wag','leekduck:pokemon-go-wild-area-2026-global']) {
    assert.equal(Rot.find(source, id), fixture);
    assert.equal(Rot.find(source, {eventId:id}), fixture);
  }
  assert.equal(Rot.find(source, 'sendai'), null, 'global roster must never leak to in-person events');
  const future = copy(fixture);
  future.id = 'future-rotating-festival';
  future.eventIds = ['future-2030'];
  future.dates = ['2030-01-01','2030-01-02'];
  future.mightyShared.forEach(g=>{g.dates=future.dates.slice();});
  future.mightyDays = [
    {date:'2030-01-01',label:'Day 1',method:'wild',pokemon:['Pikachu']},
    {date:'2030-01-02',label:'Day 2',method:'wild',pokemon:['Eevee']},
  ];
  assert.deepEqual(Rot.validate(future), []);
  assert.equal(Rot.find({entries:[future]},'future-2030'), future);
  const html = Rot.render(future, {art:({n})=>'<img class="art" alt="'+n+'">'});
  assert.match(html, /future-rotating-festival/);
  assert.match(html, /Pikachu/);
  assert.match(html, /Eevee/);
  assert.match(html, /Solid as Steel Hour/);
});

test('GO Wild Area has exactly 44 wild habitat species and 18 day-specific Mighty encounters', () => {
  assert.deepEqual(fixture.dates,['2026-11-14','2026-11-15']);
  assert.deepEqual(fixture.habitats.map(x=>x.label),['Solid as Steel Hour','Daring as Dragons Hour']);
  assert.deepEqual(fixture.habitats.map(x=>x.pokemon.length),[22,22]);
  assert.deepEqual(fixture.mightyDays.map(x=>x.pokemon.length),[9,9]);
  assert.equal(new Set(fixture.habitats.flatMap(x=>x.pokemon)).size,44);
  assert.equal(new Set(fixture.mightyDays.flatMap(x=>x.pokemon)).size,18);
  for (const mon of ['Alolan Sandshrew','Galarian Stunfisk','Tinkatink']) assert.ok(fixture.habitats[0].pokemon.includes(mon));
  for (const mon of ['Dratini','Axew','Frigibax']) assert.ok(fixture.habitats[1].pokemon.includes(mon));
  for (const mon of ['Metagross','Flygon','Haxorus']) assert.ok(fixture.mightyDays[0].pokemon.includes(mon));
  for (const mon of ['Hydreigon','Tinkaton','Clodsire']) assert.ok(fixture.mightyDays[1].pokemon.includes(mon));
  assert.equal(fixture.mightyDays[0].pokemon.includes('Hydreigon'),false);
  assert.equal(fixture.mightyDays[1].pokemon.includes('Metagross'),false);
  assert.ok(fixture.sources.some(s=>s.trust==='official'));
});

test('local-clock hourly habitat changes on both days, not once per event', () => {
  const zone='Australia/Melbourne';
  // AEDT UTC+11 on event weekend.
  const at = (date,time) => Rot.active(fixture,{now:new Date(date+'T'+time+'Z'),viewerZone:zone}).habitat;
  assert.equal(at('2026-11-13','22:59:00'),null);
  assert.equal(at('2026-11-13','23:00:00'),'steel'); // Saturday 10am AEDT
  assert.equal(at('2026-11-13','23:59:00'),'steel');
  assert.equal(at('2026-11-14','00:00:00'),'dragon'); // Saturday 11am
  assert.equal(at('2026-11-14','01:00:00'),'steel'); // Saturday noon
  assert.equal(at('2026-11-14','06:59:00'),'dragon'); // Saturday 5:59pm
  assert.equal(at('2026-11-14','07:00:00'),null); // 6pm
  assert.equal(at('2026-11-14','23:00:00'),'steel'); // Sunday 10am
  assert.equal(at('2026-11-15','06:00:00'),'dragon'); // Sunday 5pm
  assert.equal(at('2026-11-15','07:00:00'),null);
  assert.equal(Rot.active(fixture,{now:new Date('2026-11-14T00:15:00Z'),viewerZone:'UTC'}).habitat,null,'device override must be respected');
  assert.equal(Rot.active(fixture,{now:new Date('invalid'),viewerZone:zone}).habitat,null);
});

test('presentation separates 2 habitats from dated mighty galleries, with artwork and source links', () => {
  const html=Rot.render(fixture,{now:new Date('2026-11-13T23:10:00Z'),viewerZone:'Australia/Melbourne',art:({n})=>'<img class="art" alt="'+n+'">'});
  assert.match(html, /Wild Pokémon by hour/);
  assert.match(html, /Mighty Pokémon by day/);
  assert.match(html, /data-habitat="steel" data-active="true"/);
  assert.match(html, /data-habitat="dragon"/);
  assert.match(html, /data-mighty-date="2026-11-14" data-current-day="true"/);
  assert.match(html, /Saturday,? 14 Nov/);
  assert.match(html, /Sunday,? 15 Nov/);
  assert.match(html, /10:00am–11:00am/);
  assert.match(html, /5:00pm–6:00pm/);
  assert.equal((html.match(/class="uer-pokemon-tile"/g)||[]).length,64);
  assert.match(html,/Both days · Ticket-only Incense/);
  assert.match(html,/Latias/);
  assert.match(html,/Latios/);
  const sources=[...html.matchAll(/<a href="([^"]+)"/g)].map(m=>new URL(m[1]));
  assert.ok(sources.some(u=>u.origin==='https://leekduck.com'&&u.pathname==='/pokemon-go-wild-area/mighty/'));
  assert.ok(!/data-track|data-follow|track-pokemon|follow-pokemon/.test(html),'read-only event gallery');
});

test('future events may publish only habitat hours or only day-specific mighty encounters', () => {
  const habitatOnly=copy(fixture);
  habitatOnly.mightyDays=[];
  habitatOnly.mightyShared=[];
  assert.deepEqual(Rot.validate(habitatOnly), []);
  const habitatHtml=Rot.render(habitatOnly,{});
  assert.match(habitatHtml,/Wild Pokémon by hour/);
  assert.ok(!habitatHtml.includes('<h3>Mighty Pokémon by day</h3>'));
  const mightyOnly=copy(fixture);
  mightyOnly.habitats=[];
  mightyOnly.activeWindow=null;
  assert.deepEqual(Rot.validate(mightyOnly), []);
  const mightyHtml=Rot.render(mightyOnly,{});
  assert.match(mightyHtml,/Mighty Pokémon by day/);
  assert.ok(!mightyHtml.includes('<h3>Wild Pokémon by hour</h3>'));
});

test('both-day ticket-only mighty Pokémon remain separate from the rotating wild spawns', () => {
  assert.deepEqual(fixture.mightyShared.map(g=>g.pokemon),[['Latias','Latios']]);
  assert.deepEqual(fixture.mightyShared[0].dates,fixture.dates);
  assert.equal(fixture.mightyShared[0].method,'incense');
  assert.equal(fixture.mightyShared[0].access,'ticket');
  const future=copy(fixture);
  future.habitats=[];future.mightyDays=[];
  assert.deepEqual(Rot.validate(future),[]);
  const html=Rot.render(future,{});
  assert.match(html,/Both days · Ticket-only Incense/);
  assert.ok(!html.includes('Wild Pokémon by hour'));
});

test('unknown or conflicting schedule cannot produce a seemingly verified display', () => {
  const bad=copy(fixture);
  bad.habitats[1].startHours.push(10);
  assert.ok(Rot.validate(bad).some(s=>/Conflicting habitat/.test(s)));
  assert.equal(Rot.render(bad,{}),'');
  const fake=copy(fixture);
  fake.mightyDays[0].date='2026-11-16';
  assert.ok(Rot.validate(fake).some(s=>/Mighty date/.test(s)));
  const noSource=copy(fixture);
  noSource.sources=[];
  assert.ok(Rot.validate(noSource).some(s=>/Source URLs/.test(s)));
});

test('legacy flat wild and misclassified Incense display items are hidden, not mutated', () => {
  const model={
    pokemon:[
      {key:'steel',name:'Magnemite'},
      {key:'dragon',name:'Dratini'},
      {key:'mighty',name:'Metagross'},
      {key:'ticket',name:'Latias'},
      {key:'raid',name:'Zekrom'},
    ],
    encounters:[
      {identityKey:'steel',method:'wild',access:'unknown'},
      {identityKey:'dragon',method:'wild',access:'unknown'},
      {identityKey:'mighty',method:'incense',access:'unknown'},
      {identityKey:'mighty',method:'incense',access:'Ticket only'}, // verified access retained
      {identityKey:'ticket',method:'incense',access:'Ticket only'},
      {identityKey:'raid',method:'raid'},
    ],
  };
  model.groups={wild:[model.encounters[0],model.encounters[1]],incense:model.encounters.slice(2,5),raid:[model.encounters[5]]};
  const out=Rot.withoutDuplicateFlatEncounters(model,fixture);
  assert.equal(out.encounters.length,2);
  assert.equal(out.groups.wild.length,0);
  assert.equal(out.groups.incense.length,1);
  assert.equal(out.groups.raid.length,1);
  assert.equal(model.encounters.length,6,'canonical source data untouched');
  assert.equal(model.groups.incense.length,3,'Collection/source identity untouched');
  assert.equal(Rot.withoutDuplicateFlatEncounters(model,null),model);
});

test('rendered source text is escaped to prevent injected HTML in future announced events', () => {
  const future=copy(fixture);
  future.habitats[0].pokemon=['<script>'];
  const html=Rot.render(future,{});
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<script>'));
});
