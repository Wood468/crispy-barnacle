import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCanonicalSourceFacetAudit } from '../scripts/importer/source-facets-canonical-audit.mjs';

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
