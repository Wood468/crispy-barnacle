import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexVerifiedFacetFeed,verifiedFacetPanelsForEvent,withVerifiedFacetPanels}
  from '../scripts/importer/source-facet-event-view-bridge.mjs';

const source={sourceId:'official',url:'https://pokemongo.com/news/synthetic/',
  section:'Ticket bonus'};
const claim=(id,access='free')=>({id,status:'source-claimed',access,
  label:'Synthetic '+id,sourceRefs:[source]});
const feed=()=>({schemaVersion:1,publication:'verified-feed',
  events:[{eventId:'wild-area:global.2026',
    verifiedAt:'2026-11-13T03:00:00.000Z',
    reviewFingerprint:'a'.repeat(64),
    benefits:[claim('free'),claim('ticket','ticket')],
    featuredMoves:[{id:'move-1',status:'source-claimed',access:'ticket',
      pokemonLabel:'Synthetic Pokémon',move:'Synthetic Move',moveKind:'charged',
      acquisitionMethods:['evolve'],sourceRefs:[source]}],
    researchPrograms:[{id:'story-1',status:'source-claimed',access:'ticket',
      kind:'special',title:'Synthetic Ticket Story',
      steps:[{step:1,outOf:6,title:'Stage 1',taskRewardEvidence:'not-extracted'}],
      sourceRefs:[source]}]
  }]});
test('exact canonical event only: no fuzzy lookups or inferred event links',()=>{
  const f=feed();
  assert.equal(verifiedFacetPanelsForEvent(f,'wild-area:global.2026').eventId,
    'wild-area:global.2026');
  assert.equal(verifiedFacetPanelsForEvent(f,'wild-area-global-2026'),null);
  assert.equal(verifiedFacetPanelsForEvent(f,'wild-area:other.2026'),null);
  assert.throws(()=>verifiedFacetPanelsForEvent(f,'../wild-area'),/Exact canonical/);
});
test('ticketed bonuses and featured moves remain restricted and distinct from core movesets',()=>{
  const result=verifiedFacetPanelsForEvent(feed(),'wild-area:global.2026');
  assert.deepEqual(result.bonuses.map(x=>x.access),['free','ticket']);
  assert.equal(result.bonuses[1].text,'Synthetic ticket');
  assert.equal(result.bonuses[1].status,'verified');
  assert.equal(result.featuredMoves[0].access,'ticket');
  assert.deepEqual(result.featuredMoves[0].acquisitionMethods,['evolve']);
  assert.equal(result.research[0].steps[0].taskRewardEvidence,'not-extracted');
  assert.equal(Object.hasOwn(result.research[0].steps[0],'task'),false);
  assert.equal(Object.hasOwn(result.featuredMoves[0],'moveset'),false);
});
test('additive panels do not modify the existing Event Details read model or its schedule',()=>{
  const original={schemaVersion:1,eventId:'wild-area:global.2026',
    bonuses:['Curated confirmed event bonus'],
    research:[{text:'Curated Research'}],
    schedule:{start:'2026-11-14T10:00',end:'2026-11-14T18:00',
      timeBasis:'player-local'},
    pokemon:[{name:'Synthetic Pokémon'}]};
  const before=structuredClone(original);
  const merged=withVerifiedFacetPanels(original,feed());
  assert.deepEqual(original,before);
  assert.deepEqual(merged.bonuses,before.bonuses);
  assert.deepEqual(merged.research,before.research);
  assert.deepEqual(merged.schedule,before.schedule);
  assert.equal(merged.verifiedFacets.bonuses.length,2);
  merged.verifiedFacets.bonuses[0].text='Mutated elsewhere';
  assert.equal(feed().events[0].benefits[0].label,'Synthetic free');
});
test('unverified, duplicated or unsafe source facets fail closed across the full feed',()=>{
  for(const invalid of [
    {...feed(),publication:'review-candidate'},
    {...feed(),events:[feed().events[0],feed().events[0]]},
    {...feed(),events:[{...feed().events[0],benefits:[
      claim('same'),claim('same')]}]},
    {...feed(),events:[{...feed().events[0],benefits:[{
      ...claim('bad'),sourceRefs:[{...source,
        url:'https://pokemongo.com.attacker.test/secret'}]
    }]}]},
    {...feed(),events:[{...feed().events[0],benefits:[{
      ...claim('bad'),sourceRefs:[{...source,url:source.url+'?token=leak'}]
    }]}]}
  ])assert.throws(()=>indexVerifiedFacetFeed(invalid),/feed|canonical|Duplicate|Unsafe/);
});

test('real curated GO Wild Area event keeps its own identity and details under verified supplement',async()=>{
  const curated=JSON.parse(await readFile(new URL('../public/data.json',import.meta.url),'utf8'));
  const wild=(curated.events||[]).find(x=>x.id==='wag');
  const into=(curated.events||[]).find(x=>x.id==='into');
  assert.ok(wild&&into,'current curated fixtures include separate Wild Area and Into the Wild entries');
  const model={schemaVersion:1,eventId:wild.id,title:wild.t,
    schedule:{start:wild.s,end:wild.e},
    bonuses:(wild.bonuses||[]).slice(),notes:(wild.notes||[]).slice()};
  const original=structuredClone(model);
  const sample=feed();
  sample.events[0].eventId=wild.id;
  const joined=withVerifiedFacetPanels(model,sample);
  assert.deepEqual(model,original);
  assert.deepEqual(joined.schedule,original.schedule);
  assert.deepEqual(joined.bonuses,original.bonuses);
  assert.equal(joined.verifiedFacets.eventId,'wag');
  const other=withVerifiedFacetPanels({...model,eventId:into.id,title:into.t},sample);
  assert.equal(Object.hasOwn(other,'verifiedFacets'),false);
});

test('disputed or unconfirmed source claims cannot be upgraded to verified',()=>{
  for(const status of ['disputed','unconfirmed','not-published','verified','']){
    const f=feed();
    f.events[0].benefits[0].status=status;
    assert.throws(()=>indexVerifiedFacetFeed(f),/Invalid verified facet claim/);
  }
});
test('nonstandard HTTPS source port is not an approved exact origin',()=>{
  const f=feed();
  f.events[0].benefits[0].sourceRefs=[{...source,
    url:'https://pokemongo.com:444/news/synthetic/'}];
  assert.throws(()=>indexVerifiedFacetFeed(f),/Unsafe verified facet citation/);
});
test('absence from the new complete verified feed clears old verified panels',()=>{
  const old=withVerifiedFacetPanels({schemaVersion:1,eventId:'wild-area:global.2026',
    bonuses:['curated bonus']},feed());
  assert.ok(old.verifiedFacets);
  const next=feed();
  next.events[0].eventId='different-event';
  const updated=withVerifiedFacetPanels(old,next);
  assert.equal(Object.hasOwn(updated,'verifiedFacets'),false);
  assert.deepEqual(updated.bonuses,['curated bonus']);
  assert.ok(old.verifiedFacets,'caller original remains unchanged');
});
