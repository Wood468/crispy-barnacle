import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEventSourceFacets} from '../scripts/importer/source-facets-contract.mjs';
import {assessSourceFacetPublicationReadiness} from '../scripts/importer/source-facet-publication-policy.mjs';

// This is a source-authority regression, not a new Pokémon/event claim.
// HTTPS on a non-default port is a different origin even with a trusted hostname.
const examples=[
  ['official','https://pokemongo.com/news/synthetic-event'],
  ['leekduck','https://leekduck.com/events/synthetic-event/']
];
const claim=url=>({
  label:'Synthetic ticket benefit',kind:'candy',access:'ticket',
  windowText:'10:00 a.m. to 6:00 p.m.',dayScope:'both-event-days',
  source:{url,section:'Ticket Holder Bonuses'}
});
const sourceRecord=(sourceId,url)=>({
  sourceId,sourceUrl:url,
  facets:{sourceUrl:url,benefits:[claim(url)],featuredMoves:[],researchPrograms:[]}
});
const staged=sourceRefs=>({
  schemaVersion:1,publication:'staging-only',eventId:'synthetic-event',
  benefits:[{
    id:'synthetic-ticket-benefit',label:'Synthetic ticket benefit',kind:'candy',
    status:'source-claimed',access:'ticket',sourceRefs,
    dayScope:'both-event-days',windowText:'10:00 a.m. to 6:00 p.m.'
  }],
  featuredMoves:[],researchPrograms:[]
});

test('normalization rejects different-origin HTTPS ports from both trusted publishers',()=>{
  for(const [sourceId,base] of examples){
    const poisoned=base.replace('://','://').replace('.com/','.com:8443/');
    const output=normalizeEventSourceFacets('synthetic-event',[sourceRecord(sourceId,poisoned)]);
    assert.equal(output.benefits.length,0,sourceId+' port-based source impersonation');
    assert.ok(output.warnings.some(w=>w.reason==='source-mismatch'),sourceId+' rejected evidence');
  }
});

test('independent publication policy rejects different-origin official and LeekDuck provenance',()=>{
  for(const [sourceId,base] of examples){
    const poisoned=base.replace('.com/','.com:8443/');
    const gate=assessSourceFacetPublicationReadiness(staged([
      {sourceId,url:poisoned,section:'Ticket Holder Bonuses'}
    ]));
    assert.equal(gate.eligible.benefits.length,0,sourceId+' cannot qualify');
    assert.ok(gate.held.benefits[0].reasons.includes('invalid-source-evidence'),
      sourceId+' authority must be invalid, not only insufficient corroboration');
  }
});

test('ordinary official HTTPS claims still qualify and default 443 stays equivalent',()=>{
  const valid='https://pokemongo.com/news/synthetic-event';
  const standard=normalizeEventSourceFacets('synthetic-event',[
    sourceRecord('official',valid),
    sourceRecord('official',valid.replace('.com/','.com:443/'))
  ]);
  assert.equal(standard.benefits.length,1);
  assert.equal(standard.benefits[0].sourceRefs.length,1);
  const approved=assessSourceFacetPublicationReadiness(staged([
    {sourceId:'official',url:valid,section:'Ticket Holder Bonuses'}
  ]));
  assert.equal(approved.eligible.benefits.length,1);
});
