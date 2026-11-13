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
  assert.equal(byEvent.size,0);
});

test('overlapping explicit alias ownership is ambiguous and must not publish either event',()=>{
  const both=[
    {id:'wag',detailIds:['leekduck:pokemon-go-wild-area-2026-global']},
    {id:'wag-venue-ticket',detailIds:['leekduck:pokemon-go-wild-area-2026-global']}
  ];
  const {byEvent,report}=linkStagedFacetsToCanonicalEvents(both,new Map([[wild,page(wild)]]));
  assert.equal(report.ambiguousPages,1);
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
  assert.equal(byEvent.size,0);
});

test('invalid input fails closed without guessing missing event identities',()=>{
  assert.throws(()=>linkStagedFacetsToCanonicalEvents(null,new Map()),/events array/);
  assert.throws(()=>linkStagedFacetsToCanonicalEvents(records,[]),/facet map/);
  assert.deepEqual(linkStagedFacetsToCanonicalEvents([],new Map()).report,
    {publication:'staging-only',eligiblePages:0,linkedPages:0,unlinkedPages:0,ambiguousPages:0,duplicatePages:0,rejectedPages:0});
});
