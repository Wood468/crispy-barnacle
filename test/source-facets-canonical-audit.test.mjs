import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCanonicalSourceFacetAudit, worldSourceFacetCandidates } from '../scripts/importer/source-facets-canonical-audit.mjs';

const global='https://leekduck.com/events/pokemon-go-wild-area-2026-global/';
const mexico='https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/';
const unknown='https://leekduck.com/events/similar-sounding-event/';
const html='<main><h2>Additional Ticket Holder Bonuses</h2>'+
  '<p>These benefits apply from 10:00 a.m. to 6:00 p.m.</p>'+
  '<img alt="Up to six free Raid Passes each day">'+
  '<h2>Research</h2><h3>Special Research — Ticket Holders</h3>'+
  '<p>Choose a Steel-type or Dragon-type path.</p></main>';
const page=url=>({source:'leekduck',url,html,title:'Shared similar name'});
const events=[
  {id:'wag',t:'GO Wild Area Global',detailIds:['leekduck:pokemon-go-wild-area-2026-global']},
  {id:'leekduck:pokemon-go-wild-area-2026-mexico-city',t:'GO Wild Area Mexico City'}
];

test('canonical audit links global and venue editions by exact URL aliases only',()=>{
  const result=collectCanonicalSourceFacetAudit([page(global),page(mexico),page(unknown)],events);
  assert.equal(result.report.publication,'audit-only');
  assert.equal(result.report.eligiblePages,3);
  assert.equal(result.report.canonicalLinks.linkedPages,2);
  assert.equal(result.report.canonicalLinks.unlinkedPages,1);
  assert.deepEqual(result.report.canonicalLinks.linkedExamples.map(x=>x.eventId),
    ['leekduck:pokemon-go-wild-area-2026-mexico-city','wag']);
  assert.equal(result.byEvent.get('wag')[0].facets.researchPrograms[0].access,'ticket');
  assert.equal(result.normalizedByEvent.get('wag').publication,'staging-only');
  assert.equal(result.normalizedByEvent.get('wag').benefits[0].access,'ticket');
  assert.equal(result.normalizedByEvent.get('wag').benefits[0].status,'source-claimed');
  assert.equal(result.report.canonicalLinks.normalizedCounts.events,2);
  assert.equal(result.report.canonicalLinks.normalizedCounts.benefits,2);
  assert.equal(result.report.canonicalLinks.normalizedCounts.researchPrograms,2);
  assert.equal(result.byEvent.get('leekduck:pokemon-go-wild-area-2026-mexico-city')[0].sourceUrl,mexico);
});

test('report contains only counts, canonical IDs and source URLs, not raw ticket text',()=>{
  const result=collectCanonicalSourceFacetAudit([page(global)],events);
  const report=JSON.stringify(result.report);
  assert.ok(!report.includes('Steel-type'));
  assert.ok(!report.includes('Up to six free Raid Passes each day'));
  assert.ok(!report.includes('<main>'));
  assert.equal(result.report.canonicalLinks.linkedExamples[0].benefits,1);
  assert.equal(result.report.canonicalLinks.linkedExamples[0].researchPrograms,1);
});

test('similar titles cannot contaminate another event and duplicate source hosts are counted once',()=>{
  const same='https://www.leekduck.com/events/pokemon-go-wild-area-2026-global/';
  const result=collectCanonicalSourceFacetAudit([page(global),page(same),page(unknown)],
    [{id:'another-global',t:'Shared similar name'}]);
  assert.equal(result.report.canonicalLinks.linkedPages,0);
  assert.equal(result.report.canonicalLinks.unlinkedPages,2);
  assert.equal(result.report.duplicates,1);
  assert.equal(result.byEvent.size,0);
});

test('ambiguous aliases remain unresolved and cannot publish paid benefits',()=>{
  const result=collectCanonicalSourceFacetAudit([page(global)],[
    {id:'one',detailIds:['leekduck:pokemon-go-wild-area-2026-global']},
    {id:'two',detailIds:['leekduck:pokemon-go-wild-area-2026-global']}
  ]);
  assert.equal(result.report.canonicalLinks.ambiguousPages,1);
  assert.equal(result.byEvent.size,0);
});

test('missing HTML, unsafe source URLs and invalid caller inputs fail closed',()=>{
  const result=collectCanonicalSourceFacetAudit([
    {source:'leekduck',url:global,html:''},
    {source:'leekduck',url:'https://leekduck.com.bad.example/events/global/',html},
    {source:'official',url:'https://pokemongo.com/news/valid-six',html}
  ],events);
  assert.equal(result.report.pagesWithFacets,0);
  assert.equal(result.report.canonicalLinks.linkedPages,0);
  assert.equal(result.byEvent.size,0);
  assert.throws(()=>collectCanonicalSourceFacetAudit([],null),/events array/);
  assert.throws(()=>collectCanonicalSourceFacetAudit(null,events),/pages must be an array/);
});

test('normalized audit keeps free and paid benefits separate without publication',()=>{
  const both='<main><h2>Bonuses for All Trainers</h2>'+
    '<img alt="Up to three free Raid Passes per day">'+
    '<h2>Additional Ticket Holder Bonuses</h2>'+
    '<img alt="Up to six free Raid Passes per day">'+
    '<h2>Research</h2></main>';
  const result=collectCanonicalSourceFacetAudit([{source:'leekduck',url:global,html:both}],events);
  const staged=result.normalizedByEvent.get('wag');
  assert.deepEqual(new Set(staged.benefits.map(b=>b.access)),new Set(['free','ticket']));
  assert.equal(staged.benefits.length,2);
  assert.equal(staged.benefits.find(b=>b.access==='ticket').replacesFreeLimit,null);
  assert.equal(result.report.publication,'audit-only');
  assert.equal(result.report.canonicalLinks.normalizedCounts.disputed,0);
  assert.equal(result.report.canonicalLinks.normalizedCounts.unconfirmed,0);
});

test('unlinked sources are never normalized or promoted to source-backed benefits',()=>{
  const result=collectCanonicalSourceFacetAudit([page(unknown)],events);
  assert.equal(result.report.canonicalLinks.unlinkedPages,1);
  assert.equal(result.normalizedByEvent.size,0);
  assert.equal(result.report.canonicalLinks.normalizedCounts.events,0);
  assert.equal(result.report.canonicalLinks.normalizedCounts.benefits,0);
});

test('exact LeekDuck world-event sources join in-person events absent from curated feed',()=>{
  const london='https://leekduck.com/events/pokemon-night-out-london-2026/';
  const world=[
    {id:'w-mexico-city-go-wild-area-2026',sources:[
      {id:'official',url:'https://pokemongo.com/en/gowildarea/mexico-city/'},
      {id:'leekduck',url:mexico}
    ]},
    {id:'w-pokemon-night-out-london-2026',sources:[{id:'leekduck',url:london}]}
  ];
  const candidates=worldSourceFacetCandidates(world);
  assert.equal(candidates.length,2);
  const audit=collectCanonicalSourceFacetAudit([page(mexico),page(london)],[events[0],...candidates]);
  assert.equal(audit.report.canonicalLinks.linkedPages,2);
  assert.equal(audit.report.canonicalLinks.unlinkedPages,0);
  assert.equal(audit.byEvent.get('w-mexico-city-go-wild-area-2026')?.[0].sourceUrl,mexico);
  assert.equal(audit.byEvent.get('w-pokemon-night-out-london-2026')?.[0].sourceUrl,london);
  assert.equal(audit.normalizedByEvent.get('w-mexico-city-go-wild-area-2026').publication,'staging-only');
  assert.equal(audit.report.publication,'audit-only');
  assert.ok(!JSON.stringify(audit.report).includes('Up to six free Raid Passes'));
});

test('world-source candidates require exact trusted event links and valid canonical IDs',()=>{
  const records=[{id:'w-verified',sources:[
    {id:'official',url:mexico},
    {id:'leekduck',url:'https://leekduck.com.attacker.example/events/fake/'},
    {id:'leekduck',url:'http://leekduck.com/events/fake/'},
    {id:'leekduck',url:'https://user@leekduck.com/events/fake/'},
    {id:'leekduck',url:'https://leekduck.com/blog/weekly-roundup/'},
    {id:'leekduck',url:'https://leekduck.com/events/fake/?token=secret'},
    {id:'leekduck',url:mexico},
    {id:'leekduck',url:mexico}
  ]},{id:'unsafe id',sources:[{id:'leekduck',url:mexico}]},{id:'no-source',sources:null}];
  assert.deepEqual(worldSourceFacetCandidates(records),[{id:'w-verified',sourceUrl:mexico}]);
  assert.throws(()=>worldSourceFacetCandidates({}),/World event records array required/);
});

test('two generated world events claiming the same source stay ambiguous',()=>{
  const candidates=worldSourceFacetCandidates([
    {id:'world-a',sources:[{id:'leekduck',url:mexico}]},
    {id:'world-b',sources:[{id:'leekduck',url:mexico}]}
  ]);
  const audit=collectCanonicalSourceFacetAudit([page(mexico)],candidates);
  assert.equal(audit.report.canonicalLinks.ambiguousPages,1);
  assert.equal(audit.normalizedByEvent.size,0);
});

test('known canonical LeekDuck owners replace duplicate generated world owner without losing overseas events',()=>{
  const dynamax='https://leekduck.com/events/dynamax-trails-2026/';
  const london='https://leekduck.com/events/pokemon-night-out-london-2026/';
  const world=[
    {id:'w-dynamax-trails',sources:[{id:'leekduck',url:dynamax}]},
    {id:'w-global',sources:[{id:'leekduck',url:global}]},
    {id:'w-mexico',sources:[{id:'leekduck',url:mexico}]},
    {id:'w-london',sources:[{id:'leekduck',url:london}]}
  ];
  const known=[
    {id:'leekduck:dynamax-trails-2026'},
    {id:'wag',curated:true,detailIds:['leekduck:pokemon-go-wild-area-2026-global']}
  ];
  assert.deepEqual(worldSourceFacetCandidates(world,known),[
    {id:'w-mexico',sourceUrl:mexico},
    {id:'w-london',sourceUrl:london}
  ]);
  const bySource=[{id:'known',sources:[{id:'leekduck',
    url:'https://www.leekduck.com/events/dynamax-trails-2026/'}]}];
  assert.deepEqual(worldSourceFacetCandidates(world,bySource).map(x=>x.id),
    ['w-global','w-mexico','w-london']);
  assert.throws(()=>worldSourceFacetCandidates(world,{}),/Known canonical events array/);
});
test('query, fragment, nonstandard port and credentialed known URLs cannot suppress a clean world page',()=>{
  const clean='https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/';
  const untrusted=[
    clean+'?access=unknown',
    clean+'#other',
    'https://leekduck.com:8443/events/pokemon-go-wild-area-2026-mexico-city/',
    'https://unknown@leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/'
  ];
  const world=[{id:'w-mexico',sources:[{id:'leekduck',url:clean}]}];
  const known=untrusted.map((link,i)=>({id:'source-'+i,link}));
  assert.deepEqual(worldSourceFacetCandidates(world,known),[
    {id:'w-mexico',sourceUrl:clean}
  ]);
  for(const link of untrusted){
    const asCandidate=[{id:'w-invalid',sources:[{id:'leekduck',url:link}]}];
    assert.deepEqual(worldSourceFacetCandidates(asCandidate),[]);
  }
});
test('world-source suppression never infers identity from title, dates or unrelated official links',()=>{
  const world=[{id:'w-mexico',sources:[{id:'leekduck',url:mexico}]}];
  const known=[
    {id:'similar',t:'GO Wild Area Mexico City',start:'2026-11-07'},
    {id:'official-only',link:'https://pokemongo.com/en/gowildarea/mexico-city/'},
    {id:'same-title',t:'GO Wild Area Mexico City',sources:[{id:'official',url:mexico}]}
  ];
  assert.deepEqual(worldSourceFacetCandidates(world,known),[
    {id:'w-mexico',sourceUrl:mexico}
  ]);
});
