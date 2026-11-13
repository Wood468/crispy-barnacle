import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const picker=require('../public/infographic-raid-schedule.js');
const lib=require('../public/lib.js');
const dex=[
 [888,'Zacian'],[889,'Zamazenta'],[6,'Charizard'],[641,'Tornadus'],
 [488,'Cresselia'],[644,'Zekrom'],[884,'Duraludon'],[379,'Registeel'],
 [380,'Latias'],[895,'Regidrago'],[621,'Druddigon'],[1,'Bulbasaur']
];
const at=(value)=>Date.parse(value);
const fixture={
 rotation:[
  {s:'2026-11-10T10:00',e:'2026-11-12T20:00',five:'Bulbasaur'},
  {s:'2026-11-09T10:00',e:'2026-11-13T20:00',five:'Crowned Sword Zacian and Crowned Shield Zamazenta',
    low:{three:['Druddigon']}},
  {s:'2026-11-16T06:00',e:'2026-11-24T22:00',five:'Cresselia',mega:'Mega Charizard X and Y',
    shadow:'Shadow Tornadus (Incarnate), to Nov 24'}
 ],
 events:[{t:'Global',raidDays:[
  {date:'2026-11-14',five:['Zekrom'],max:['Gigantamax Duraludon']},
  {date:'2026-11-15',five:['Cresselia'],max:['Dynamax Charizard']}
 ]}],
 maxBattles:[['2026-11-12','2026-11-12','Bulbasaur'],['2026-11-23','2026-11-29','Duraludon']],
 maxRosters:[{s:'2026-11-09T10:00',e:'2026-11-13T20:00',tiers:[
  {tier:'5★',day:'2026-11-12',names:['Regidrago']},
  {tier:'5★',day:'2026-11-13',names:['Latias','Registeel']}
 ]}]
};
function rows(data=fixture,when='2026-11-13T12:00'){
 return picker.options(data,dex,at(when),lib.raidBossNames);
}
const row=(entries,name)=>entries.find(x=>x.dex[1]===name);
test('review suggestions include only live and upcoming published Raid and Max bosses',()=>{
 const entries=rows();
 assert.ok(row(entries,'Zacian'));
 assert.ok(row(entries,'Zamazenta'));
 assert.ok(row(entries,'Cresselia'));
 assert.ok(row(entries,'Charizard'));
 assert.ok(row(entries,'Tornadus'));
 assert.ok(row(entries,'Zekrom'));
 assert.ok(row(entries,'Duraludon'));
 assert.ok(row(entries,'Latias'));
 assert.ok(row(entries,'Druddigon'));
 assert.equal(row(entries,'Bulbasaur'),undefined,'expired roster cannot populate the picker');
 assert.equal(row(entries,'Regidrago'),undefined,'ended roster day cannot remain eligible');
 assert.deepEqual(row(entries,'Charizard').modes,['mega','dynamax']);
 assert.deepEqual(row(entries,'Tornadus').modes,['shadow']);
 assert.deepEqual(row(entries,'Zacian').modes,['normal']);
 assert.deepEqual(row(entries,'Duraludon').modes,['gigantamax','dynamax']);
 assert.equal(entries.filter(x=>x.dex[1]==='Cresselia').length,1,'same boss in multiple future windows is unique');
});
test('expiration is exclusive and published future roster appears only when dated',()=>{
 const expired=rows(fixture,'2026-11-13T20:00');
 assert.equal(row(expired,'Zacian'),undefined);
 assert.equal(row(expired,'Latias'),undefined);
 assert.ok(row(expired,'Zekrom'));
 const next=rows(fixture,'2026-11-16T12:00');
 assert.equal(row(next,'Zekrom'),undefined);
 assert.ok(row(next,'Cresselia'));
 assert.equal(row(next,'Duraludon').modes.includes('gigantamax'),false);
});
test('unknown, invalid, undated and arbitrary Dex data always fail closed',()=>{
 assert.deepEqual(rows({}),[]);
 assert.deepEqual(picker.options(null,dex,Date.now(),lib.raidBossNames),[]);
 assert.deepEqual(picker.options(fixture,dex,NaN,lib.raidBossNames),[]);
 assert.deepEqual(picker.options(fixture,[],at('2026-11-13T12:00'),lib.raidBossNames),[]);
 const malformed={rotation:[{s:'not-a-date',e:'2026-11-20T10:00',five:'Bulbasaur'},
 {s:'2026-11-14T00:00',e:'2026-11-13T00:00',five:'Bulbasaur'}],
 events:[{raidDays:[{date:'broken',max:['Dynamax Bulbasaur']}]}],
 maxBattles:[['2026-11-02','bad','Bulbasaur']],maxRosters:[]};
 assert.deepEqual(rows(malformed),[]);
});
test('real published schedule allows exact source-backed selection, not entire Dex',()=>{
 const data=JSON.parse(readFileSync(new URL('../public/data.json',import.meta.url),'utf8'));
 const dexReal=JSON.parse(readFileSync(new URL('../public/dex.json',import.meta.url),'utf8'));
 const upcoming=picker.options(data,dexReal,at('2026-11-13T17:20'),lib.raidBossNames);
 assert.ok(upcoming.length>0,'current and upcoming schedule offers choices');
 assert.ok(upcoming.length<dexReal.length/3,'not an indiscriminate Pokédex');
 assert.ok(upcoming.some(x=>x.dex[1]==='Zacian'));
 assert.ok(upcoming.some(x=>x.dex[1]==='Zamazenta'));
 assert.ok(upcoming.some(x=>x.dex[1]==='Duraludon' && x.modes.includes('gigantamax')));
});
test('picker uses the same timezone-aware clock as the Battle schedule',()=>{
 const clock=require('../public/event-clock.js');
 const data={rotation:[{s:'2026-11-14T10:00',e:'2026-11-14T11:00',five:'Zacian'}]};
 const parse=value=>clock.parseDate(value,'Australia/Melbourne');
 const live=+clock.parseDate('2026-11-14T10:30','Australia/Melbourne');
 const ended=+clock.parseDate('2026-11-14T11:10','Australia/Melbourne');
 assert.ok(picker.options(data,dex,live,lib.raidBossNames,parse).some(x=>x.dex[1]==='Zacian'));
 assert.deepEqual(picker.options(data,dex,ended,lib.raidBossNames,parse),[],
  'schedule ends at the same Melbourne instant used by Battle');
});
test('invalid calendar dates do not fabricate a raid window',()=>{
 const bad={rotation:[{s:'2026-02-30T10:00',e:'2026-03-10T10:00',five:'Bulbasaur'}]};
 assert.deepEqual(picker.options(bad,dex,at('2026-03-01T12:00'),lib.raidBossNames),[]);
});
test('UI always uses schedule allowlist for datalist AND save-time mode validation',()=>{
 const s=readFileSync(new URL('../public/review.js',import.meta.url),'utf8');
 assert.match(s,/function currentBossChoices\(\)/);
 assert.match(s,/exactScheduledChoices\(\)\.filter\(function \(row\)/);
 assert.match(s,/var target = matches\[0\]\.target/);
 assert.match(s,/data-ig-boss-choice/);
 assert.doesNotMatch(s,/data-ig-boss-name|data-ig-boss-form|data-ig-boss-mode/);
});
