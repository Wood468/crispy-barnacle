import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const picker=require('../public/infographic-raid-schedule.js');
const lib=require('../public/lib.js');
const clock=require('../public/event-clock.js');
const fixture={
  data:JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8')),
  dex:JSON.parse(readFileSync(new URL('../public/dex.json',import.meta.url),'utf8')),
  forms:JSON.parse(readFileSync(new URL('../public/forms.json',import.meta.url),'utf8')).f,
  details:JSON.parse(readFileSync(new URL('../public/event-details.json',import.meta.url),'utf8'))
};
const at=iso=>+clock.parseDate(iso,'Australia/Melbourne');
const parse=iso=>clock.parseDate(iso,'Australia/Melbourne');
function choices(data=fixture.data,date='2026-11-13T17:20',details=fixture.details,forms=fixture.forms){
  return picker.targetChoices(data,fixture.dex,forms,details,at(date),lib.raidBossNames,parse);
}
function target(name,items=choices()){
  const found=items.filter(x=>x.name===name);
  assert.equal(found.length,1,'expected exactly one choice for '+name);
  return found[0].target;
}
test('Crowned raids use explicitly published forms rather than base Pokémon',()=>{
  assert.deepEqual(target('Crowned Sword Zacian'),{
    type:'raid-boss',pokemonId:'888',formId:'crowned-sword',battleMode:'normal'
  });
  assert.deepEqual(target('Crowned Shield Zamazenta'),{
    type:'raid-boss',pokemonId:'889',formId:'crowned-shield',battleMode:'normal'
  });
  assert.ok(!choices().some(x=>x.name==='Zacian' || x.name==='Zamazenta'));
});
test('White/Black Kyurem and four Deoxys Formes remain distinct',()=>{
  assert.equal(target('White Kyurem').formId,'white');
  assert.equal(target('Black Kyurem').formId,'black');
  for(const id of ['normal','attack','defense','speed'])
    assert.equal(target('Deoxys ('+id[0].toUpperCase()+id.slice(1)+' Forme)').formId,id);
  assert.notEqual(target('White Kyurem').formId,target('Black Kyurem').formId);
});
test('Gigantamax, Dynamax and Shadow identity match their published battle modes',()=>{
  assert.equal(target('Gigantamax Duraludon').battleMode,'gigantamax');
  assert.equal(target('Gigantamax Duraludon').formId,'gmax');
  assert.equal(target('Dynamax Dialga').battleMode,'dynamax');
  assert.equal(target('Dynamax Dialga').formId,null);
  assert.equal(target('Shadow Tornadus (Incarnate)').battleMode,'shadow');
  assert.equal(target('Shadow Tornadus (Incarnate)').formId,'incarnate');
});
test('Mega X/Y are never conflated, and a missing exact variant never falls back to base',()=>{
  const data={rotation:[{s:'2026-11-14T08:00',e:'2026-11-20T20:00',
    mega:'Mega Charizard X and Y',five:'White Kyurem'}]};
  const all=choices(data,'2026-11-14T10:00');
  const x=target('Mega Charizard X',all),y=target('Mega Charizard Y',all);
  assert.equal(x.formId,'mega-x');
  assert.equal(y.formId,'mega-y');
  assert.notDeepEqual(x,y);
  assert.equal(target('White Kyurem',all).formId,'white');
  assert.ok(!choices(data,'2026-11-14T10:00',null,[]).some(x=>x.name==='White Kyurem'));
});
test('live/upcoming deduplicated, expired not listed and unknown names fail closed',()=>{
  const rows=choices();
  assert.ok(rows.some(x=>x.phase==='live'));
  assert.ok(rows.some(x=>x.phase==='upcoming'));
  assert.equal(rows.filter(x=>x.value==='646|white|normal').length,1);
  assert.ok(!choices(fixture.data,'2026-12-08T10:00').some(x=>x.name==='White Kyurem'));
  const bogus={rotation:[{s:'2026-11-14T10:00',e:'2026-11-15T10:00',
    five:'White SomethingUnknown'}]};
  assert.deepEqual(choices(bogus,'2026-11-14T12:00'),[]);
});
test('review approval uses one exact roster selector and revalidates option at save',()=>{
  const s=readFileSync(new URL('../public/review.js',import.meta.url),'utf8');
  assert.match(s,/data-ig-boss-choice/);
  assert.match(s,/exactScheduledChoices\(\)\.filter\(function \(row\)/);
  assert.match(s,/row\.value === field\.value && !!field\.value/);
  assert.match(s,/var target = matches\[0\]\.target/);
  assert.doesNotMatch(s,/data-ig-boss-name|data-ig-boss-form|data-ig-boss-mode/);
  assert.match(s,/timedFetch\('\/event-details\.json'\)/);
});
