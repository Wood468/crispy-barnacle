import test from 'node:test';
import assert from 'node:assert/strict';
import {extractEventSourceFacets} from '../scripts/importer/source-facets.mjs';
import {normalizeEventSourceFacets} from '../scripts/importer/source-facets-contract.mjs';
import {assessSourceFacetPublicationReadiness} from '../scripts/importer/source-facet-publication-policy.mjs';

const duck='https://leekduck.com/events/synthetic-session/';
const official='https://pokemongo.com/news/synthetic-session/';

// Synthetic source text, not a real announcement. Every assertion verifies a
// generic boundary across independent stages of the event engine.
const html='<main>'+
  '<h2>Additional Ticket Holder Bonuses</h2>'+
  '<p>These benefits apply from 10:00 a.m. to 6:00 p.m. local time on your ticketed event day.</p>'+
  '<img alt="Increased Candy for catching Pokémon">'+
  '<h2>Featured Attacks — Ticket Holders</h2>'+
  '<h3>Dragonite</h3>'+
  '<p>During your ticketed event day from 10:00 a.m. to 6:00 p.m., Dragonite caught in raids can learn this featured move.</p>'+
  '<img alt="Dragon Claw Charged Attack">'+
  '<h3>Flygon</h3>'+
  '<p>Flygon may learn an as-yet unannounced featured move.</p>'+
  '</main>';

const staged=(sourceId,url)=>({
  sourceId,sourceUrl:url,facets:extractEventSourceFacets(html,{sourceUrl:url})
});

test('ticketed source claims remain held without an official source and do not invent missing moves',()=>{
  const normalized=normalizeEventSourceFacets('synthetic-session',[staged('leekduck',duck)]);
  assert.equal(normalized.publication,'staging-only');
  assert.equal(normalized.benefits.length,1);
  assert.equal(normalized.benefits[0].access,'ticket');
  assert.equal(normalized.benefits[0].dayScope,'ticketed-day');
  assert.equal(normalized.featuredMoves.length,1);
  const [move]=normalized.featuredMoves;
  assert.equal(move.pokemonLabel,'Dragonite');
  assert.equal(move.move,'Dragon Claw');
  assert.equal(move.moveKind,'charged');
  assert.equal(move.access,'ticket');
  assert.deepEqual(move.acquisitionMethods,['catch','raid']);
  assert.equal(move.dayScope,'ticketed-day');
  assert.match(move.windowText,/ticketed event day/);
  assert.equal(move.sessionLabel,null);
  assert.ok(!JSON.stringify(normalized).includes('as-yet unannounced featured move'));
  const audit=assessSourceFacetPublicationReadiness(normalized);
  assert.equal(audit.publication,'audit-only');
  assert.equal(audit.eligible.benefits.length,0);
  assert.equal(audit.eligible.featuredMoves.length,0);
  assert.ok(audit.held.benefits[0].reasons.includes('paid-needs-official-source'));
  assert.ok(audit.held.featuredMoves[0].reasons.includes('paid-needs-official-source'));
});

test('independent official corroboration does not drop distinct source evidence or promote unknown rewards',()=>{
  const records=[staged('leekduck',duck),staged('official',official)];
  const normalized=normalizeEventSourceFacets('synthetic-session',records);
  assert.equal(normalized.benefits.length,1);
  assert.equal(normalized.featuredMoves.length,1);
  assert.equal(normalized.benefits[0].sourceRefs.length,2);
  assert.equal(normalized.featuredMoves[0].sourceRefs.length,2);
  assert.equal(normalized.benefits[0].status,'corroborated');
  assert.equal(normalized.featuredMoves[0].status,'corroborated');
  assert.equal(normalized.researchPrograms.length,0);
  const audit=assessSourceFacetPublicationReadiness(normalized);
  assert.equal(audit.eligible.benefits.length,1);
  assert.equal(audit.eligible.featuredMoves.length,1);
  assert.equal(audit.eligible.researchPrograms.length,0);
  assert.equal(audit.publication,'audit-only');
  assert.deepEqual(normalizeEventSourceFacets('synthetic-session',records.slice().reverse()),normalized);
});

test('source URL spoofing cannot launder a paid entitlement through official attribution',()=>{
  const forged=staged('official','https://pokemongo.com.attacker.example/news/synthetic-session/');
  const normalized=normalizeEventSourceFacets('synthetic-session',[staged('leekduck',duck),forged]);
  assert.equal(normalized.benefits.length,1);
  assert.equal(normalized.benefits[0].sourceRefs.length,1);
  const audit=assessSourceFacetPublicationReadiness(normalized);
  assert.equal(audit.eligible.benefits.length,0);
  assert.ok(audit.held.benefits[0].reasons.includes('paid-needs-official-source'));
});
