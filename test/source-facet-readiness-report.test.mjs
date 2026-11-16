import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSourceFacetReadiness as summarize} from '../scripts/importer/source-facet-readiness-report.mjs';

const official='https://pokemongo.com/news/synthetic-event/';
const duck='https://leekduck.com/events/synthetic-event/';
const ref=(sourceId,url)=>({sourceId,url,section:'Ticket Holder Bonuses'});
const claim=(id,access,refs)=>({
  id,label:'Private reward wording must not appear in audit',kind:'candy',
  status:'source-claimed',access,sourceRefs:refs,
  dayScope:'both-event-days',windowText:'10am to 6pm'
});
const staged=(eventId,benefits=[])=>({
  schemaVersion:1,publication:'staging-only',eventId,benefits,
  featuredMoves:[],researchPrograms:[]
});

test('cross-event audit aggregates source readiness without publishing claim details',()=>{
  const a=staged('event-a',[claim('free','free',[ref('official',official)])]);
  const b=staged('event-b',[claim('ticket','ticket',[ref('leekduck',duck)])]);
  const first=summarize(new Map([['event-b',b],['event-a',a]]));
  const reverse=summarize(new Map([['event-a',a],['event-b',b]]));
  assert.deepEqual(first,reverse);
  assert.equal(first.publication,'audit-only');
  assert.equal(first.eventsInspected,2);
  assert.equal(first.eligible.benefits,1);
  assert.equal(first.held.benefits,1);
  assert.equal(first.blockers['paid-needs-official-source'],1);
  assert.equal(first.blockers['insufficient-independent-sources'],1);
  assert.deepEqual(first.eventSamples.map(x=>x.eventId),['event-a','event-b']);
  assert.ok(!JSON.stringify(first).includes('Private reward wording'));
  assert.ok(!JSON.stringify(first).includes('https://'));
});

test('bounded sample still counts every event and validates IDs outside cap',()=>{
  const entries=Array.from({length:25},(_,i)=>{
    const id='event-'+String(i).padStart(3,'0');
    return [id,staged(id,[claim('free','free',[ref('official',official)])])];
  });
  const report=summarize(new Map(entries),{sampleLimit:3});
  assert.equal(report.eventsInspected,25);
  assert.equal(report.eligible.benefits,25);
  assert.equal(report.eventSamples.length,3);
  assert.deepEqual(summarize(new Map(),{sampleLimit:0}).eligible,{
    benefits:0,featuredMoves:0,researchPrograms:0
  });
  const broken=new Map(entries);
  broken.set('event-999',staged('wrong-event'));
  assert.throws(()=>summarize(broken,{sampleLimit:1}),/Canonical event ID mismatch/);
});

test('reject malformed input instead of silently claiming audit completeness',()=>{
  assert.throws(()=>summarize([]),/Map required/);
  assert.throws(()=>summarize(new Map([['event-a',{}]])),/Canonical event ID mismatch/);
  assert.throws(()=>summarize(new Map(),{sampleLimit:51}),/Sample limit/);
  assert.throws(()=>summarize(new Map(),{sampleLimit:-1}),/Sample limit/);
});
