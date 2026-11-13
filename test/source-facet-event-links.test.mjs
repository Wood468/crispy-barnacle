import test from 'node:test';
import assert from 'node:assert/strict';
import {linkStagedFacetsToCanonicalEvents} from '../scripts/importer/source-facet-event-links.mjs';

const wild='https://leekduck.com/events/pokemon-go-wild-area-2026-global/';
const mexico='https://www.leekduck.com/events/pokemon-go-wild-area-2026-mexico-city/';
const into='https://leekduck.com/events/into-the-wild-2026/';
const page=url=>({sourceUrl:url,benefits:[{label:'Synthetic bonus'}],featuredMoves:[],researchPrograms:[]});
const records=[
  {id:'wag',t:'GO Wild Area: Global',detailIds:['leekduck:pokemon-go-wild-area-2026-global'],sourceUrl:'https://pokemongo.com/gowildarea/global'},
  {id:'leekduck:pokemon-go-wild-area-2026-mexico-city',t:'GO Wild Area: Mexico City'},
  {id:'into',t:'Into the Wild',sourceUrl:'https://pokemongo.com/news/into-the-wild-2026'}
];

test('exact LeekDuck detail aliases join correct global and in-person canonical IDs',()=>{
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(records,new Map([[wild,page(wild)],[mexico,page(mexico)]]));
  assert.equal(report.linkedPages,2);
  assert.equal(byEvent.get('wag')[0].sourceUrl,wild);
  assert.equal(byEvent.get('leekduck:pokemon-go-wild-area-2026-mexico-city')[0].sourceUrl,mexico);
  assert.ok(!byEvent.has('into'));
  assert.equal(report.publication,'staging-only');
});

test('an exact direct LeekDuck source URL can join a curated record without alias',()=>{
  const custom='https://leekduck.com/events/minior-showers-leonids-2026/';
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents([
    {id:'minior2',t:'Minior Showers: Leonids',sourceUrl:custom}
  ],new Map([[custom,page(custom)]]));
  assert.equal(report.linkedPages,1);
  assert.equal(byEvent.get('minior2').length,1);
});

test('same title or dates do not grant ticket-only perks without an explicit source link',()=>{
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents([
    {id:'mexico-lookalike',t:'GO Wild Area: Mexico City',start:'2026-11-07T10:00'},
    {id:'unrelated',t:'GO Wild Area: Global',sourceUrl:'https://pokemongo.com/gowildarea/global'}
  ],new Map([[mexico,page(mexico)]]));
  assert.equal(report.unlinkedPages,1);
  assert.deepEqual(report.unlinkedExamples,[{
    sourceUrl:'https://leekduck.com/events/pokemon-go-wild-area-2026-mexico-city',
    expectedAlias:'leekduck:pokemon-go-wild-area-2026-mexico-city'
  }]);
  assert.equal(byEvent.size,0);
});

test('overlapping explicit alias ownership is ambiguous and must not publish either event',()=>{
  const both=[
    {id:'wag',detailIds:['leekduck:pokemon-go-wild-area-2026-global']},
    {id:'wag-venue-ticket',detailIds:['leekduck:pokemon-go-wild-area-2026-global']}
  ];
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(both,new Map([[wild,page(wild)]]));
  assert.equal(report.ambiguousPages,1);
  assert.deepEqual(report.ambiguousExamples,[{
    sourceUrl:'https://leekduck.com/events/pokemon-go-wild-area-2026-global',
    candidateIds:['wag','wag-venue-ticket']
  }]);
  assert.equal(byEvent.size,0);
});

test('www and apex duplicate pages cannot count a claimed bonus twice',()=>{
  const another='https://www.leekduck.com/events/pokemon-go-wild-area-2026-global/';
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(records,new Map([[wild,page(wild)],[another,page(another)]]));
  assert.equal(report.duplicatePages,1);
  assert.equal(report.linkedPages,1);
  assert.equal(byEvent.get('wag').length,1);
});

test('spoof hosts, insecure URLs, wrong claimed URL and roundups are rejected',()=>{
  const fake='https://leekduck.com.attacker.example/events/pokemon-go-wild-area-2026-global/';
  const insecure='http://leekduck.com/events/pokemon-go-wild-area-2026-global/';
  const roundup='https://leekduck.com/blog/weekly-events/';
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(records,new Map([
    [fake,page(fake)],[insecure,page(insecure)],[roundup,page(roundup)],
    [wild,page('https://leekduck.com/events/unrelated/')]
  ]));
  assert.equal(report.rejectedPages,4);
  assert.deepEqual(report.unlinkedExamples,[]);
  assert.deepEqual(report.ambiguousExamples,[]);
  assert.equal(byEvent.size,0);
});

test('invalid input fails closed without guessing missing event identities',()=>{
  assert.throws(()=>linkStagedFacetsToCanonicalEvents(null,new Map()),/events array/);
  assert.throws(()=>linkStagedFacetsToCanonicalEvents(records,[]),/facet map/);
  assert.deepEqual(linkStagedFacetsToCanonicalEvents([],new Map()).report,
    {publication:'staging-only',eligiblePages:0,linkedPages:0,unlinkedPages:0,ambiguousPages:0,duplicatePages:0,rejectedPages:0,
     unlinkedExamples:[],ambiguousExamples:[]});
});

test('unresolved diagnostics are source-order independent and capped without source prose',()=>{
  const urls=Array.from({length:18},(_,i)=>
    'https://leekduck.com/events/synthetic-unmatched-'+String(i).padStart(2,'0')+'/');
  const a=linkStagedFacetsToCanonicalEvents([],new Map(urls.map(url=>[url,page(url)]))).report;
  const b=linkStagedFacetsToCanonicalEvents([],new Map(urls.slice().reverse().map(url=>[url,page(url)]))).report;
  assert.deepEqual(a,b);
  assert.equal(a.unlinkedPages,18);
  assert.equal(a.unlinkedExamples.length,12);
  assert.equal(a.unlinkedExamples[0].sourceUrl,'https://leekduck.com/events/synthetic-unmatched-00');
  assert.equal(a.unlinkedExamples[11].sourceUrl,'https://leekduck.com/events/synthetic-unmatched-11');
  assert.ok(!JSON.stringify(a).includes('Synthetic bonus'));
});

test('ambiguous diagnostics remain deterministic under reversed event order',()=>{
  const items=[
    {id:'wag-west',detailIds:['leekduck:pokemon-go-wild-area-2026-global']},
    {id:'wag',detailIds:['leekduck:pokemon-go-wild-area-2026-global']}
  ];
  const a=linkStagedFacetsToCanonicalEvents(items,new Map([[wild,page(wild)]]));
  const b=linkStagedFacetsToCanonicalEvents(items.slice().reverse(),new Map([[wild,page(wild)]]));
  assert.deepEqual(a.report,b.report);
  assert.deepEqual(a.report.ambiguousExamples[0].candidateIds,['wag','wag-west']);
  assert.equal(a.byEvent.size,0);
});

test('a uniquely verified curated event owns an exact alias over a generated source copy',()=>{
  const alias='leekduck:pokemon-go-wild-area-2026-global';
  const items=[
    {id:alias,t:'GO Wild Area: Global',sourceUrl:wild},
    {id:'wag',t:'GO Wild Area: Global',curated:true,detailIds:[alias]}
  ];
  for(const order of [items,items.slice().reverse()]){
    const {byEvent,report}=linkStagedFacetsToCanonicalEvents(order,new Map([[wild,page(wild)]]));
    assert.equal(report.linkedPages,1);
    assert.equal(report.ambiguousPages,0);
    assert.equal(byEvent.get('wag')?.[0].sourceUrl,wild);
    assert.ok(!byEvent.has(alias));
  }
});

test('curated direct source URL wins over generated alias without fuzzy names',()=>{
  const source='https://leekduck.com/events/minior-showers-geminids-2026/';
  const alias='leekduck:minior-showers-geminids-2026';
  const events=[
    {id:alias,t:'Source entry',sourceUrl:source},
    {id:'minior3',t:'Different harmless label',curated:true,sourceUrl:source}
  ];
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(events,new Map([[source,page(source)]]));
  assert.equal(report.linkedPages,1);
  assert.equal(report.ambiguousPages,0);
  assert.equal(byEvent.get('minior3')?.length,1);
  assert.ok(!byEvent.has(alias));
});

test('competing curated owners remain blocked even with a generated alias present',()=>{
  const alias='leekduck:pokemon-go-wild-area-2026-global';
  const items=[
    {id:alias,sourceUrl:wild},
    {id:'wag',curated:true,detailIds:[alias]},
    {id:'venue-edition',curated:true,detailIds:[alias]}
  ];
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(items,new Map([[wild,page(wild)]]));
  assert.equal(report.ambiguousPages,1);
  assert.deepEqual(report.ambiguousExamples[0].candidateIds,[alias,'venue-edition','wag'].sort());
  assert.equal(byEvent.size,0);
});

test('curated status alone never grants ownership without an exact URL or alias',()=>{
  const alias='leekduck:pokemon-go-wild-area-2026-global';
  const items=[
    {id:alias,sourceUrl:wild},
    {id:'similar-event',curated:true,t:'GO Wild Area: Global',start:'2026-11-14'}
  ];
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(items,new Map([[wild,page(wild)]]));
  assert.equal(report.linkedPages,1);
  assert.equal(report.ambiguousPages,0);
  assert.ok(byEvent.has(alias));
  assert.ok(!byEvent.has('similar-event'));
});
