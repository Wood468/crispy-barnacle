import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessSourceFacetPublicationReadiness as assess,
  retainVerifiedFacetSnapshotOnOutage as retain
} from '../scripts/importer/source-facet-publication-policy.mjs';

const duck='https://leekduck.com/events/wild-area-global/';
const official='https://pokemongo.com/news/go-wild-area-global/';
const hub='https://pokemongohub.net/post/event/go-wild-area-global/';
const proof=(sourceId,url)=>({sourceId,url,section:'Ticket Holder Bonuses'});
const record=(id,access='free',refs=[proof('leekduck',duck)],extras={})=>({
  id,label:'2× catch Candy',kind:'candy',status:'source-claimed',access,sourceRefs:refs,
  windowText:'10:00 a.m. to 6:00 p.m.',dayScope:'both-event-days',...extras
});
const staged=(fields={})=>({
  schemaVersion:1,publication:'staging-only',eventId:'wag',
  benefits:[],featuredMoves:[],researchPrograms:[],...fields
});

test('a single LeekDuck paid benefit stays held; official primary proof allows it',()=>{
  const single=assess(staged({benefits:[record('ticket-candy','ticket')]}));
  assert.equal(single.eligible.benefits.length,0);
  assert.deepEqual(single.held.benefits[0].reasons,[
    'insufficient-independent-sources','paid-needs-official-source'
  ]);
  const officialPaid=assess(staged({benefits:[
    record('ticket-candy','ticket',[proof('official',official)])
  ]}));
  assert.equal(officialPaid.eligible.benefits.length,1);
  assert.equal(officialPaid.report.held.benefits,0);
});

test('free benefits from independent community sources can qualify without pretending official confirmation',()=>{
  const sources=[proof('leekduck',duck),proof('hub',hub)];
  const result=assess(staged({benefits:[record('free-candy','free',sources,{status:'corroborated'})]}));
  assert.equal(result.eligible.benefits.length,1);
  assert.equal(result.eligible.benefits[0].status,'corroborated');
  assert.equal(result.publication,'audit-only');
  assert.deepEqual(result.report.eligible,{benefits:1,featuredMoves:0,researchPrograms:0});
});

test('two source URLs from one publisher do not count as independent',()=>{
  const result=assess(staged({benefits:[record('ticket-candy','ticket',[
    proof('leekduck',duck),proof('leekduck','https://leekduck.com/events/wild-area-global-part-2/')
  ],{status:'corroborated'})]}));
  assert.equal(result.eligible.benefits.length,0);
  assert.ok(result.held.benefits[0].reasons.includes('uncorroborated-status'));
});

test('unconfirmed, disputed and spoofed official source claims never qualify',()=>{
  const result=assess(staged({benefits:[
    record('uncertain','ticket',[proof('official',official)],{status:'unconfirmed'}),
    record('disputed','free',[proof('official',official)],{status:'disputed'}),
    record('spoofed','ticket',[proof('official','https://pokemongo.com.attacker.example/news/fake')])
  ]}));
  assert.equal(result.eligible.benefits.length,0);
  assert.ok(result.held.benefits.find(r=>r.id==='uncertain').reasons.includes('unconfirmed'));
  assert.ok(result.held.benefits.find(r=>r.id==='disputed').reasons.includes('disputed'));
  assert.ok(result.held.benefits.find(r=>r.id==='spoofed').reasons.includes('invalid-source-evidence'));
});

test('conflicting free and paid audience statements are both held for review',()=>{
  const result=assess(staged({benefits:[
    record('free','free',[proof('official',official)]),
    record('ticket','ticket',[proof('official',official)])
  ]}));
  assert.equal(result.eligible.benefits.length,0);
  assert.equal(result.report.reasons['conflicting-audience-claims'],2);
});

test('paid cap requires literal source proof of replacement or stacking, not a number',()=>{
  const cap=record('passes','ticket',[proof('official',official)],{
    kind:'raid-passes',label:'Up to 6 daily free Raid Passes',replacesFreeLimit:null,
    replacementEvidence:null
  });
  const held=assess(staged({benefits:[cap]}));
  assert.ok(held.held.benefits[0].reasons.includes('replacement-rule-unverified'));
  const verified=assess(staged({benefits:[{
    ...cap,replacesFreeLimit:true,
    replacementEvidence:'Ticketed Raid Pass limits replace the free limits.'
  }]}));
  assert.equal(verified.eligible.benefits.length,1);
});

test('a paid perk with no verified day or time window stays held',()=>{
  const result=assess(staged({benefits:[record('unscheduled','ticket',[
    proof('official',official)
  ],{windowText:null,dayScope:null})]}));
  assert.equal(result.eligible.benefits.length,0);
  assert.ok(result.held.benefits[0].reasons.includes('paid-window-unverified'));
});

test('a featured attack requires a named move, known acquisition and valid source proof',()=>{
  const move={
    id:'hydreigon--brutal-swing',pokemonLabel:'Hydreigon',move:'Brutal Swing',
    moveKind:'charged',access:'free',status:'source-claimed',
    acquisitionMethods:['unknown'],sourceRefs:[proof('official',official)]
  };
  const missing=assess(staged({featuredMoves:[move]}));
  assert.equal(missing.eligible.featuredMoves.length,0);
  assert.ok(missing.held.featuredMoves[0].reasons.includes('acquisition-unverified'));
  const verified=assess(staged({featuredMoves:[{...move,acquisitionMethods:['evolve']}]}));
  assert.equal(verified.eligible.featuredMoves.length,1);
});

test('ticket Special Research preserves sourced stage placeholders, never guesses rewards',()=>{
  const research={
    id:'special-steel-or-dragon',kind:'special',title:'GO Wild Area ticket Special Research',
    status:'source-claimed',access:'ticket',
    sourceRefs:[proof('official',official)],
    storyTitle:'The Suspense Is Building',
    steps:[{step:1,outOf:6,title:'Stage 1/6',taskRewardEvidence:'not-extracted'}],
    sourceResearchEvidence:[{
      sourceId:'official',url:official,section:'Special Research',
      claimInstructionsText:'Claim during the ticketed session',
      medalEffects:[{medalLabel:'Steel Scholar medal',effectText:'Bonus starts on medal claim'}]
    }]
  };
  const result=assess(staged({researchPrograms:[research]}));
  assert.equal(result.eligible.researchPrograms.length,1);
  assert.equal(result.eligible.researchPrograms[0].steps[0].taskRewardEvidence,'not-extracted');
  const unreviewed=assess(staged({researchPrograms:[{
    ...research,steps:[{step:1,outOf:6,title:'Stage 1/6',taskRewardEvidence:'unverified-reward'}]
  }]}));
  assert.equal(unreviewed.eligible.researchPrograms.length,0);
  assert.ok(unreviewed.held.researchPrograms[0].reasons.includes('unreviewed-research-stage-content'));
});

test('research evidence cannot impersonate a different publisher or source record',()=>{
  const research={
    id:'special',kind:'special',title:'Ticket research',access:'ticket',status:'source-claimed',
    sourceRefs:[proof('official',official)],
    sourceResearchEvidence:[{sourceId:'leekduck',url:duck,section:'Special Research'}],
    steps:[]
  };
  const result=assess(staged({researchPrograms:[research]}));
  assert.equal(result.eligible.researchPrograms.length,0);
  assert.ok(result.held.researchPrograms[0].reasons.includes('research-evidence-mismatch'));
});

test('reported counts are deterministic and none of the held source claims leak into report',()=>{
  const claims=[record('z','ticket'),record('a','free',[proof('official',official)],{label:'3× catch Candy'})];
  const a=assess(staged({benefits:claims}));
  const b=assess(staged({benefits:claims.slice().reverse()}));
  assert.deepEqual(a,b);
  assert.equal(a.report.eligible.benefits,1);
  assert.equal(a.report.held.benefits,1);
  assert.ok(!JSON.stringify(a.report).includes('2× catch Candy'));
  assert.throws(()=>assess({}),/Normalized staging/);
});

test('last verified snapshot survives a short outage only for its original event',()=>{
  const previous={schemaVersion:1,publication:'verified',eventId:'wag',
    verifiedAt:'2026-11-13T00:00:00.000Z',benefits:[{id:'good'}]};
  const decision=retain('wag',previous,{now:'2026-11-13T12:00:00.000Z'});
  assert.equal(decision.decision,'retain-last-known-good');
  decision.snapshot.benefits.push({id:'changed'});
  assert.equal(previous.benefits.length,1);
  assert.equal(retain('other',previous,{now:'2026-11-13T12:00:00.000Z'}),null);
  assert.equal(retain('wag',{...previous,publication:'audit-only'},{now:'2026-11-13T12:00:00.000Z'}),null);
  assert.equal(retain('wag',previous,{now:'2026-11-21T00:00:00.000Z'}),null);
  assert.equal(retain('wag',previous,{now:'2026-11-12T00:00:00.000Z'}),null);
  assert.equal(retain('wag',previous,{now:'invalid'}),null);
  assert.equal(retain('wag',previous,{now:'2026-11-13T12:00:00.000Z',maxAgeHours:0}),null);
});
