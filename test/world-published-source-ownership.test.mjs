// Published-catalogue acceptance, not an authorization to publish source claims.
// Source owner identities must survive importer refreshes across curated and
// overseas in-person records without fuzzy matching or loss of regional events.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldSourceFacetCandidates } from '../scripts/importer/source-facets-canonical-audit.mjs';
import { linkStagedFacetsToCanonicalEvents } from '../scripts/importer/source-facet-event-links.mjs';

const load = name => JSON.parse(readFileSync(new URL('../public/'+name, import.meta.url), 'utf8'));
const known = load('data.json').events;
const world = load('world-events.json').events;
const source = slug => 'https://leekduck.com/events/'+slug+'/';
const pages = [
  source('pokemon-go-wild-area-2026-global'),
  source('pokemon-go-wild-area-2026-sendai-japan'),
  source('pokemon-go-wild-area-2026-mexico-city')
];
const staged = url => ({
  sourceUrl:url,benefits:[],featuredMoves:[],researchPrograms:[]
});
const owner = (records,id) => records.find(event => event.id === id);

test('published Global and Sendai have curated exact source owners; Mexico City stays overseas', () => {
  const candidates = worldSourceFacetCandidates(world, known);
  const mexico = owner(candidates,'w-mexico-city-go-wild-area-2026');
  assert.ok(mexico, 'real Mexico City in-person event must not be lost from source audit');
  assert.equal(mexico.sourceUrl,pages[2]);
  assert.ok(!owner(candidates,'w-go-wild-area-2026-sendai-tohoku'),
    'generated Sendai world record must not duplicate curated source owner');
  assert.ok(!owner(candidates,'w-pokemon-go-x-esa-london'),
    'official ESA article is not a LeekDuck event-page ticket entitlement');
  assert.ok(!owner(candidates,'w-celebrate-the-pok-mon-night-out-events-in-pok-mon--2026-11-10'),
    'official London Night Out article must not be guessed into a LeekDuck ticket source');

  const links = linkStagedFacetsToCanonicalEvents(
    [...known,...candidates], new Map(pages.map(url=>[url,staged(url)])));
  assert.deepEqual(
    [links.report.eligiblePages,links.report.linkedPages,
      links.report.ambiguousPages,links.report.unlinkedPages,
      links.report.rejectedPages,links.report.duplicatePages],
    [3,3,0,0,0,0]);
  assert.deepEqual([...links.byEvent.keys()].sort(),
    ['wag','sendai','w-mexico-city-go-wild-area-2026'].sort());
  for(const [id,url] of [['wag',pages[0]],['sendai',pages[1]],
    ['w-mexico-city-go-wild-area-2026',pages[2]]]){
    assert.equal(links.byEvent.get(id)?.[0]?.sourceUrl,url,id+' exact publisher page');
    assert.equal(links.byEvent.get(id)?.[0]?.sourceId,'leekduck');
  }
  assert.equal(links.report.publication,'staging-only');
  assert.ok(!Object.hasOwn(links.report,'publicationAuthorized'));
});

test('venue metadata is preserved separately from exact facet ownership', () => {
  const mexico = owner(world,'w-mexico-city-go-wild-area-2026');
  const sendai = owner(world,'w-go-wild-area-2026-sendai-tohoku');
  assert.equal(mexico.place,'Mexico City, Mexico');
  assert.equal(sendai.place,'Sendai and Tohoku, Japan');
  assert.equal(mexico.start,'2026-11-06');
  assert.equal(mexico.end,'2026-11-08');
  assert.equal(sendai.start,'2026-11-06');
  assert.equal(sendai.end,'2026-11-08');
  assert.ok(mexico.sources.some(s=>s.id==='official'&&s.url==='https://pokemongo.com/en/gowildarea/mexico-city/'));
  assert.ok(sendai.sources.some(s=>s.id==='official'&&s.url==='https://pokemongo.com/en/gowildarea/sendai'));
  assert.ok(!worldSourceFacetCandidates([{
    ...mexico,id:'w-lookalike',sources:[{id:'official',url:'https://pokemongo.com/en/gowildarea/mexico-city/'}]
  }],known).length,'matching date, place and official article alone cannot link a facet');
});
