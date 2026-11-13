import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(verifiedFacetPanelsForEvent(f,'wild area global 2026'),null);
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
