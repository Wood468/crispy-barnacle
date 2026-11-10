import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const data=JSON.parse(readFileSync('public/data.json','utf8'));
const details=JSON.parse(readFileSync('public/event-details.json','utf8'));

test('GO Wild Area Global weekend is represented as an event, not a fabricated continuous rotation',()=>{
 const event=data.events.find(e=>e.id==='wag');
 assert.ok(event,'curated global event is missing');
 assert.equal(event.s,'2026-11-14T10:00');
 assert.equal(event.e,'2026-11-15T18:00');
 assert.match(event.sourceUrl,/pokemongo\.com\/en\/gowildarea\/global/);
 const prose=(event.p||[]).join(' ');
 for(const name of ['Zekrom','White Kyurem','Reshiram','Black Kyurem','Gigantamax Duraludon','Dynamax Dialga','Dynamax Palkia']) {
  assert.ok(prose.includes(name),'missing event-specific boss '+name);
 }
 assert.match(prose,/Saturday/);
 assert.match(prose,/Sunday/);
 const overlapping=(data.rotation||[]).filter(r=>r.s<event.e&&r.e>event.s);
 assert.equal(overlapping.length,0,'a continuous rotation must not silently replace weekend-specific bosses');
 assert.ok(details.events.wag,'source-backed event details missing');
});

test('raid and Max Battle species are kept distinct in global event copy',()=>{
 const event=data.events.find(e=>e.id==='wag');
 const prose=(event.p||[]).join(' ');
 assert.match(prose,/Five-star raids: Zekrom and White Kyurem on Saturday, Reshiram and Black Kyurem on Sunday/);
 assert.match(prose,/Gigantamax Duraludon debuts in six-star Max Battles/);
});
