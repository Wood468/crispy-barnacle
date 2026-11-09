import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
const event=data.events.find(e=>e.id==='into');

test('Into the Wild has a five-day local Raid/Max Hour schedule',()=>{
 assert.equal(event.scope,undefined,'activity time basis must not silently change event scope');
 assert.equal(event.activities.length,5);
 const expected=[
  ['2026-11-09','Crowned Sword Zacian','raid-hour'],
  ['2026-11-10','Crowned Shield Zamazenta','raid-hour'],
  ['2026-11-11','Dynamax Registeel','max-battle-hour'],
  ['2026-11-12','Dynamax Regidrago','max-battle-hour'],
  ['2026-11-13','Dynamax Latias & Latios','max-battle-hour']
 ];
 event.activities.forEach((activity,i)=>{
  const [date,boss,kind]=expected[i];
  assert.equal(activity.kind,kind);
  assert.match(activity.title,new RegExp(boss.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(activity.presentation,'schedule');
  assert.deepEqual(activity.schedule,{start:date+'T18:00',end:date+'T19:00',timeBasis:'player-local'});
  assert.ok(activity.sourceUrl.startsWith('https://'));
 });
});
