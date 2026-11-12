import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEventSourceFacets} from '../scripts/importer/source-facets-contract.mjs';

const mk=(sourceId,url,fields={})=>({
  sourceId,sourceUrl:url,
  facets:{
    sourceUrl:url,benefits:[],featuredMoves:[],researchPrograms:[],...fields
  }
});
const source=(url,section)=>({url,section});
const duck='https://leekduck.com/events/synthetic/';
const official='https://pokemongo.com/news/synthetic/';
const benefit=(access,label,url,opts={})=>({
  label,kind:'raid-passes',access,windowText:'10 am to 6 pm',dayScope:'both-event-days',
  replacesFreeLimit:access==='ticket',source:source(url,'Ticket Holder Bonuses'),...opts
});
test('audiences and replace-versus-stack cannot be coalesced',()=>{
 const data=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[
     benefit('free','Up to three free Raid Passes',duck,{replacesFreeLimit:false}),
     benefit('ticket','Up to six free Raid Passes',duck),
     benefit('addon','Up to twelve free Raid Passes',duck,{addonLabel:'Raid Lover',replacesFreeLimit:false}),
     benefit('ticket','Up to six free Raid Passes',duck,{windowText:'midnight to 11:59 pm',dayScope:'all-day'})
   ]})
 ]);
 assert.equal(data.benefits.length,4);
 assert.deepEqual(new Set(data.benefits.map(x=>x.access)),new Set(['free','ticket','addon']));
 assert.ok(data.benefits.find(x=>x.access==='ticket'&&x.dayScope==='both-event-days').replacesFreeLimit);
 assert.ok(data.benefits.find(x=>x.access==='ticket'&&x.dayScope==='all-day'));
 assert.equal(data.publication,'staging-only');
});

test('two independent sources corroborate the same sourced benefit but contradictory access remains separate',()=>{
 const label='Up to six free Raid Passes';
 const make=(url)=>benefit('ticket',label,url);
 const data=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[make(duck)]}),
   mk('official',official,{benefits:[make(official),benefit('free',label,official)]})
 ]);
 assert.equal(data.benefits.length,2);
 const paid=data.benefits.find(x=>x.access==='ticket');
 assert.equal(paid.status,'corroborated');
 assert.equal(paid.sourceRefs.length,2);
 assert.equal(data.benefits.find(x=>x.access==='free').status,'source-claimed');
});

test('source caveat vetoes corroboration and unknown is not free',()=>{
 const unconfirmed=benefit('ticket','Safari Balls instead of Premier Balls',duck,{status:'unconfirmed'});
 const confirmed=benefit('ticket','Safari Balls instead of Premier Balls',official,{status:'source-claimed'});
 const unknown=benefit('unknown','Unannounced ticket extras',duck,{replacesFreeLimit:false});
 const d=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[unconfirmed,unknown]}),
   mk('official',official,{benefits:[confirmed]})
 ]);
 assert.equal(d.benefits.find(x=>x.label.startsWith('Safari')).status,'unconfirmed');
 assert.equal(d.benefits.find(x=>x.access==='unknown').access,'unknown');
});

test('featured moves keep Fast/Charged and exact source acquisition evidence',()=>{
 const a={pokemonLabel:'Crowned Zacian',move:'Behemoth Blade',moveKind:'charged',
   access:'ticket',acquisitionMethods:['raid'],source:source(duck,'Featured Attacks')};
 const b={...a,source:source(official,'Featured Attacks')};
 const c={...a,acquisitionMethods:['evolve'],source:source(duck,'Featured Attacks')};
 const out=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{featuredMoves:[a,c]}),
   mk('official',official,{featuredMoves:[b]})
 ]);
 assert.equal(out.featuredMoves.length,2);
 const raids=out.featuredMoves.find(m=>m.acquisitionMethods[0]==='raid');
 assert.equal(raids.status,'corroborated');
 assert.deepEqual(raids.sourceRefs.map(s=>s.sourceId),['leekduck','official']);
 assert.equal(out.featuredMoves.find(m=>m.acquisitionMethods[0]==='evolve').status,'source-claimed');
});

test('research branches remain exact, steps get merged without assuming task rewards',()=>{
 const prog=(url,steps)=>({
   kind:'special',title:'Special Research — Ticket Holders',access:'ticket',
   paths:['Steel-type','Dragon-type'],steps,onceOnly:true,source:source(url,'Special Research')
 });
 const result=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{researchPrograms:[prog(duck,[{step:1,outOf:6,title:'First',task:'not validated'}])]}),
   mk('official',official,{researchPrograms:[prog(official,[{step:2,outOf:6,title:'Second'}])]})
 ]);
 assert.equal(result.researchPrograms.length,1);
 const [v]=result.researchPrograms;
 assert.equal(v.status,'corroborated');
 assert.deepEqual(v.paths,['Dragon-type','Steel-type']);
 assert.deepEqual(v.steps.map(s=>s.step),[1,2]);
 assert.ok(v.steps.every(s=>s.taskRewardEvidence==='not-extracted'));
 assert.equal(v.onceOnly,true);
});

test('invalid provenance and untrusted hosts are omitted rather than attributed',()=>{
 const result=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[benefit('free','Increased catch XP','https://evil.example/events/other/',{kind:'xp'})]}),
   mk('not-authorized','https://evil.example/events/other/',{benefits:[benefit('free','Increased catch XP','https://evil.example/events/other/',{kind:'xp'})]}),
   mk('official','http://pokemongo.com/news/synthetic/',{benefits:[benefit('free','Increased catch XP','http://pokemongo.com/news/synthetic/',{kind:'xp'})]})
 ]);
 assert.equal(result.benefits.length,0);
 assert.ok(result.warnings.length>=2);
});

test('source order, duplicate records and omitted optional fields do not affect stable output',()=>{
 const b=benefit('free','Increased catch XP',duck,{kind:'xp',replacesFreeLimit:false});
 const d=mk('leekduck',duck,{benefits:[b,b]});
 const o=mk('official',official,{benefits:[benefit('free','Increased catch XP',official,{kind:'xp',replacesFreeLimit:false})]});
 const forward=normalizeEventSourceFacets('wild-2026',[d,o]);
 const reverse=normalizeEventSourceFacets('wild-2026',[o,d]);
 assert.deepEqual(forward,reverse);
 assert.equal(forward.benefits.length,1);
 assert.equal(forward.benefits[0].sourceRefs.length,2);
 assert.deepEqual(normalizeEventSourceFacets('empty-event',[]).benefits,[]);
 assert.throws(()=>normalizeEventSourceFacets('',[]),/eventId/);
 assert.throws(()=>normalizeEventSourceFacets('event',{}),/array/);
});
