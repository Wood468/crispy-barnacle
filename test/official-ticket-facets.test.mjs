import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOfficialTicketBonusFacets as extract} from '../scripts/importer/official-ticket-facets.mjs';

const official='https://pokemongo.com/en/gowildarea/global';
const fixture=[
 '<main><h2>Even more bonuses for ticket-holding Trainers!</h2>',
 '<p>Ticket-holding Trainers will receive the following bonuses and rewards between 10:00 a.m. and 6:00 p.m. local time on event days!</p>',
 '<ul><li>Increased chance of encountering Shiny Pokémon.*</li>',
 '<li>Daily Max Particle collection limit increased to 3,200.</li>',
 '<li>Increased Max Particles from Power Spots and exploration.**</li>',
 '<li>Up to six free Raid Passes per day by spinning Photo Discs at Gyms.</li>',
 '<li>2× Candy for catching Pokémon.</li>',
 '<li>2× Incense duration.</li>',
 '<li>Increased chance of 10 km Eggs from spinning PokéStops.</li>',
 '<li>Six GO Snapshot surprise event encounters per day.</li>',
 '<li>Lure Modules activated will last for two hours.</li></ul>',
 '<p>Ticket holding Trainers will also receive the following bonuses and rewards between 12:00 a.m. and 11:59 p.m. local time on event days!</p>',
 '<ul><li>Up to six Special Trades per day.</li>',
 '<li>1/2 Stardust cost for trades.</li></ul>',
 '<p>*Shiny Pokémon are not guaranteed by purchasing a ticket.</p>',
 '<h2>Keep an eye out for GO Wild Area Supply Balloons!</h2>',
 '<p>A Supply Balloon giving GO Safari Balls will appear hourly during event hours for ticket-holding Trainers!</p>',
 '<h2>Special Research</h2><p>Choose a Steel-type or Dragon-type path.</p></main>'
].join('\n');

test('official event-hour ticket perks stay distinct from all-day trading benefits',()=>{
 const data=extract(fixture,{sourceUrl:official});
 assert.equal(data.schemaVersion,1);
 assert.equal(data.benefits.length,11);
 assert.deepEqual(data.benefits.filter(x=>x.dayScope==='all-day').map(x=>x.kind),
  ['trading','trading']);
 const gameplay=data.benefits.filter(x=>x.dayScope===null);
 assert.equal(gameplay.length,9);
 assert.ok(gameplay.every(x=>x.access==='ticket'));
 assert.ok(gameplay.every(x=>/10:00 a.m. and 6:00 p.m./.test(x.windowText)));
 assert.ok(data.benefits.filter(x=>x.dayScope==='all-day').every(x=>
  /12:00 a.m. and 11:59 p.m./.test(x.windowText)));
 assert.ok(data.benefits.every(x=>x.source.url===official));
 assert.deepEqual(data.featuredMoves,[]);
 assert.deepEqual(data.researchPrograms,[]);
});

test('gameplay benefit kinds include passes, max particles, shiny odds and Incense',()=>{
 const data=extract(fixture,{sourceUrl:official});
 assert.equal(data.benefits.find(x=>x.kind==='raid-passes').label,
  'Up to six free Raid Passes per day by spinning Photo Discs at Gyms.');
 assert.ok(data.benefits.find(x=>x.kind==='max-particles'));
 assert.ok(data.benefits.find(x=>x.kind==='shiny'));
 assert.ok(data.benefits.find(x=>x.kind==='incense'));
 assert.ok(data.benefits.find(x=>x.kind==='snapshot'));
 assert.ok(data.benefits.find(x=>x.kind==='lures'));
 assert.ok(data.benefits.find(x=>x.kind==='candy'));
 assert.ok(data.benefits.find(x=>x.kind==='eggs'));
 assert.equal(data.benefits.find(x=>x.kind==='raid-passes').replacesFreeLimit,null);
 assert.equal(data.benefits.find(x=>x.kind==='raid-passes').replacementEvidence,null);
});

test('source disclaimer, price, follow-on Special Research and balloons never inherit a bonus window',()=>{
 const data=extract(fixture,{sourceUrl:official});
 const labels=data.benefits.map(x=>x.label).join(' | ');
 assert.doesNotMatch(labels,/not guaranteed/);
 assert.doesNotMatch(labels,/Supply Balloon/);
 assert.doesNotMatch(labels,/Steel-type or Dragon-type/);
 assert.doesNotMatch(labels,/purchase a ticket/);
 assert.equal(data.benefits.length,11);
});

test('repeated official ticket-card text does not duplicate bonus entitlements',()=>{
 const html='<main><h2>Ticket Holder Bonuses</h2>'+
  '<p>Ticket-holding Trainers will receive bonuses from 10:00 a.m. to 6:00 p.m. local time on event days.</p>'+
  '<p>Up to six free Raid Passes per day from Gyms.</p>'+
  '<li>Up to six free Raid Passes per day from Gyms.</li>'+
  '<h2>More details</h2><p>Up to six free Raid Passes per day from Gyms.</p></main>';
 const d=extract(html,{sourceUrl:'https://pokemongo.com/news/official-ticket-bonuses-2026'});
 assert.equal(d.benefits.length,1);
 assert.equal(d.benefits[0].access,'ticket');
 assert.ok(d.benefits[0].id);
});

test('without an explicit scoped ticket-holder introduction nothing can be granted',()=>{
 const html='<main><h2>Bonuses for all Trainers</h2>'+
  '<p>Up to three free Raid Passes per day by spinning at Gyms.</p>'+
  '<h2>Event ticket</h2><p>Purchase a ticket for US$11.99.</p>'+
  '<p>2× Candy for catching Pokémon.</p></main>';
 const d=extract(html,{sourceUrl:official});
 assert.deepEqual(d.benefits,[]);
});

test('ticket-holder benefits are not confirmed by speculation or unscoped previews',()=>{
 const html='<main><h2>Ticket Holder Bonus Previews</h2>'+
  '<p>Ticket-holding Trainers will receive bonuses between 10:00 a.m. and 6:00 p.m. local time.</p>'+
  '<p>Increased chance to encounter Shiny Pokémon (not yet confirmed).</p>'+
  '<p>Additional Max Particles are speculative.</p>'+
  '<p>Check back for details about extra Raid Passes.</p></main>';
 const d=extract(html,{sourceUrl:official});
 assert.equal(d.benefits.length,0);
});

test('official source URL must be HTTPS and hosted on the actual official domain',()=>{
 const invalid=[
  'http://pokemongo.com/en/gowildarea/global',
  'https://pokemongo.com.attacker.example/en/gowildarea/global',
  'https://someone:password@pokemongo.com/en/gowildarea/global',
  'https://leekduck.com/events/pokemon-go-wild-area-2026-global/',
  'https://pokemongo.com/',
  'https://pokemongo.com/news/',
  'https://pokemongo.com/news/s'
 ];
 for(const url of invalid)assert.throws(()=>extract(fixture,{sourceUrl:url}),/Official HTTPS/);
 assert.throws(()=>extract('',{sourceUrl:official}),/HTML source/);
});

test('same perk on a new official section has a distinct source-backed scoped identity',()=>{
 const html='<main><h2>Event hours</h2>'+
  '<p>Ticket-holding Trainers receive bonuses between 10:00 a.m. and 6:00 p.m. local time.</p>'+
  '<p>2× Candy for catching Pokémon.</p>'+
  '<h2>Evening window</h2>'+
  '<p>Ticket-holding Trainers receive bonuses between 6:00 p.m. and 10:00 p.m. local time.</p>'+
  '<p>2× Candy for catching Pokémon.</p></main>';
 const d=extract(html,{sourceUrl:official});
 assert.equal(d.benefits.length,2);
 assert.notEqual(d.benefits[0].id,d.benefits[1].id);
 assert.notEqual(d.benefits[0].windowText,d.benefits[1].windowText);
});
