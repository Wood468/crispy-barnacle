// Historical source-ownership regression uses an immutable real-data fixture.
// Live catalogues are also checked, without requiring expired events to remain
// published forever. The importer remains the only writer of public event data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldSourceFacetCandidates } from '../scripts/importer/source-facets-canonical-audit.mjs';
import { linkStagedFacetsToCanonicalEvents } from '../scripts/importer/source-facet-event-links.mjs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const fixture = read('test/fixtures/world-source-ownership-2026.json');
const liveKnown = read('public/data.json').events;
const liveWorld = read('public/world-events.json').events;
const source = slug => 'https://leekduck.com/events/' + slug + '/';
const pages = [
  source('pokemon-go-wild-area-2026-global'),
  source('pokemon-go-wild-area-2026-sendai-japan'),
  source('pokemon-go-wild-area-2026-mexico-city')
];
const staged = url => ({sourceUrl:url,benefits:[],featuredMoves:[],researchPrograms:[]});
const owner = (records,id) => records.find(event => event.id === id);

test('historical published Global, Sendai and Mexico sources have exact, distinct canonical owners', () => {
  const candidates = worldSourceFacetCandidates(fixture.world, fixture.curated);
  const mexico = owner(candidates, 'w-mexico-city-go-wild-area-2026');
  assert.ok(mexico, 'source-backed Mexico City must not be lost');
  assert.equal(mexico.sourceUrl, pages[2]);
  assert.ok(!owner(candidates, 'w-go-wild-area-2026-sendai-tohoku'),
    'generated Sendai must not duplicate the curated exact source owner');
  assert.ok(!owner(candidates, 'w-pokemon-go-x-esa-london'),
    'official ESA article is not a LeekDuck ticket event page');
  assert.ok(!owner(candidates, 'w-celebrate-the-pok-mon-night-out-events-in-pok-mon--2026-11-10'),
    'official London article must not be guessed into a ticket event page');
  const links = linkStagedFacetsToCanonicalEvents(
    [...fixture.curated,...candidates], new Map(pages.map(url => [url,staged(url)])));
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

test('historical in-person venues, sessions and official-only evidence remain distinct', () => {
  const mexico = owner(fixture.world,'w-mexico-city-go-wild-area-2026');
  const sendai = owner(fixture.world,'w-go-wild-area-2026-sendai-tohoku');
  assert.equal(mexico.place,'Mexico City, Mexico');
  assert.equal(sendai.place,'Sendai and Tohoku, Japan');
  assert.deepEqual([mexico.start,mexico.end],['2026-11-06','2026-11-08']);
  assert.deepEqual([sendai.start,sendai.end],['2026-11-06','2026-11-08']);
  assert.ok(mexico.sources.some(s=>s.id==='official'&&s.url==='https://pokemongo.com/en/gowildarea/mexico-city/'));
  assert.ok(sendai.sources.some(s=>s.id==='official'&&s.url==='https://pokemongo.com/en/gowildarea/sendai'));
  assert.equal(worldSourceFacetCandidates([{
    ...mexico,id:'w-untrusted-lookalike',
    sources:[{id:'official',url:'https://pokemongo.com/en/gowildarea/mexico-city/'}]
  }],fixture.curated).length,0,'a matching location/article cannot confer ticket source identity');
});

test('each currently published overseas LeekDuck candidate has exact evidence and one owner', () => {
  assert.ok(Array.isArray(liveKnown) && Array.isArray(liveWorld));
  const candidates = worldSourceFacetCandidates(liveWorld,liveKnown);
  for(const candidate of candidates){
    const published = liveWorld.find(event=>event.id===candidate.id);
    assert.ok(published?.sources?.some(s=>s.id==='leekduck'&&s.url===candidate.sourceUrl),
      candidate.id+': candidate must carry exact publisher evidence in live world catalogue');
  }
  // Current data rotates. Test all present source owners without pinning old
  // cities or dates in the live generated output; the historical fixture above
  // permanently guards the original curated-vs-world regression.
  const urls=[...new Set(candidates.map(c=>c.sourceUrl))];
  const links=linkStagedFacetsToCanonicalEvents(
    [...liveKnown,...candidates],new Map(urls.map(url=>[url,staged(url)])));
  assert.equal(links.report.eligiblePages,urls.length);
  assert.equal(links.report.linkedPages,urls.length,
    'new overseas sources must resolve to exactly one verified canonical owner');
  assert.equal(links.report.ambiguousPages,0);
  assert.equal(links.report.unlinkedPages,0);
  assert.equal(links.report.rejectedPages,0);
  assert.equal(links.report.publication,'staging-only');
  for(const candidate of candidates){
    assert.equal(links.byEvent.get(candidate.id)?.[0]?.sourceUrl,candidate.sourceUrl,
      candidate.id+': no fuzzy or alternative event source owner');
  }
});
