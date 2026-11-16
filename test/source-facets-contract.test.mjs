import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEventSourceFacets} from '../scripts/importer/source-facets-contract.mjs';

const mk=(sourceId,url,fields={})=>({
  sourceId,sourceUrl:url,
  facets:{
    sourceUrl:url,benefits:[],featuredMoves:[],researchPrograms:[],...fields
  }
});
const source=(url,section)=>({url,section});
const duck='https://leekduck.com/events/synthetic/';
const official='https://pokemongo.com/news/synthetic/';
const benefit=(access,label,url,opts={})=>({
  label,kind:'raid-passes',access,windowText:'10 am to 6 pm',dayScope:'both-event-days',
  replacesFreeLimit:access==='ticket',
  replacementEvidence:access==='ticket'?'The ticketed Raid Pass limits replace the free limits.':null,
  source:source(url,'Ticket Holder Bonuses'),...opts
});
test('audiences and replace-versus-stack cannot be coalesced',()=>{
 const data=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[
     benefit('free','Up to three free Raid Passes',duck,{replacesFreeLimit:false}),
     benefit('ticket','Up to six free Raid Passes',duck),
     benefit('addon','Up to twelve free Raid Passes',duck,{addonLabel:'Raid Lover',replacesFreeLimit:false}),
     benefit('ticket','Up to six free Raid Passes',duck,{windowText:'midnight to 11:59 pm',dayScope:'all-day'})
   ]})
 ]);
 assert.equal(data.benefits.length,4);
 assert.deepEqual(new Set(data.benefits.map(x=>x.access)),new Set(['free','ticket','addon']));
 assert.ok(data.benefits.find(x=>x.access==='ticket'&&x.dayScope==='both-event-days').replacesFreeLimit);
 assert.ok(data.benefits.find(x=>x.access==='ticket'&&x.dayScope==='all-day'));
 assert.equal(data.publication,'staging-only');
});

test('two independent sources corroborate the same sourced benefit but contradictory access remains separate',()=>{
 const label='Up to six free Raid Passes';
 const make=(url)=>benefit('ticket',label,url);
 const data=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[make(duck)]}),
   mk('official',official,{benefits:[make(official),benefit('free',label,official)]})
 ]);
 assert.equal(data.benefits.length,2);
 const paid=data.benefits.find(x=>x.access==='ticket');
 assert.equal(paid.status,'corroborated');
 assert.equal(paid.sourceRefs.length,2);
 assert.equal(data.benefits.find(x=>x.access==='free').status,'source-claimed');
});

test('source caveat vetoes corroboration and unknown is not free',()=>{
 const unconfirmed=benefit('ticket','Safari Balls instead of Premier Balls',duck,{status:'unconfirmed'});
 const confirmed=benefit('ticket','Safari Balls instead of Premier Balls',official,{status:'source-claimed'});
 const unknown=benefit('unknown','Unannounced ticket extras',duck,{replacesFreeLimit:false});
 const d=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[unconfirmed,unknown]}),
   mk('official',official,{benefits:[confirmed]})
 ]);
 assert.equal(d.benefits.find(x=>x.label.startsWith('Safari')).status,'unconfirmed');
 assert.equal(d.benefits.find(x=>x.access==='unknown').access,'unknown');
});

test('featured moves keep Fast/Charged and exact source acquisition evidence',()=>{
 const a={pokemonLabel:'Crowned Zacian',move:'Behemoth Blade',moveKind:'charged',
   access:'ticket',acquisitionMethods:['raid'],source:source(duck,'Featured Attacks')};
 const b={...a,source:source(official,'Featured Attacks')};
 const c={...a,acquisitionMethods:['evolve'],source:source(duck,'Featured Attacks')};
 const out=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{featuredMoves:[a,c]}),
   mk('official',official,{featuredMoves:[b]})
 ]);
 assert.equal(out.featuredMoves.length,2);
 const raids=out.featuredMoves.find(m=>m.acquisitionMethods[0]==='raid');
 assert.equal(raids.status,'corroborated');
 assert.deepEqual(raids.sourceRefs.map(s=>s.sourceId),['leekduck','official']);
 assert.equal(out.featuredMoves.find(m=>m.acquisitionMethods[0]==='evolve').status,'source-claimed');
});

test('research branches remain exact, steps get merged without assuming task rewards',()=>{
 const prog=(url,steps)=>({
   kind:'special',title:'Special Research — Ticket Holders',access:'ticket',
   paths:['Steel-type','Dragon-type'],steps,onceOnly:true,source:source(url,'Special Research')
 });
 const result=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{researchPrograms:[prog(duck,[{step:1,outOf:6,title:'First',task:'not validated'}])]}),
   mk('official',official,{researchPrograms:[prog(official,[{step:2,outOf:6,title:'Second'}])]})
 ]);
 assert.equal(result.researchPrograms.length,1);
 const [v]=result.researchPrograms;
 assert.equal(v.status,'corroborated');
 assert.deepEqual(v.paths,['Dragon-type','Steel-type']);
 assert.deepEqual(v.steps.map(s=>s.step),[1,2]);
 assert.ok(v.steps.every(s=>s.taskRewardEvidence==='not-extracted'));
 assert.equal(v.onceOnly,true);
});

test('invalid provenance and untrusted hosts are omitted rather than attributed',()=>{
 const result=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[benefit('free','Increased catch XP','https://evil.example/events/other/',{kind:'xp'})]}),
   mk('not-authorized','https://evil.example/events/other/',{benefits:[benefit('free','Increased catch XP','https://evil.example/events/other/',{kind:'xp'})]}),
   mk('official','http://pokemongo.com/news/synthetic/',{benefits:[benefit('free','Increased catch XP','http://pokemongo.com/news/synthetic/',{kind:'xp'})]})
 ]);
 assert.equal(result.benefits.length,0);
 assert.ok(result.warnings.length>=2);
});

test('an attacker-controlled host cannot impersonate official provenance or corroboration',()=>{
 const fake='https://pokemongo.com.attacker.example/news/synthetic/';
 const wrongHost='https://leekduck.com/events/synthetic/';
 const claim=(url)=>benefit('ticket','Up to six free Raid Passes',url);
 const d=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[claim(duck)]}),
   mk('official',fake,{benefits:[claim(fake)]}),
   mk('official',wrongHost,{benefits:[claim(wrongHost)]})
 ]);
 assert.equal(d.benefits.length,1);
 assert.equal(d.benefits[0].status,'source-claimed');
 assert.deepEqual(d.benefits[0].sourceRefs.map(x=>x.sourceId),['leekduck']);
 assert.equal(d.warnings.length,2);
});

test('only explicit Raid Pass and Max Particle claims can supersede free limits',()=>{
 const d=normalizeEventSourceFacets('wag',[
   mk('leekduck',duck,{benefits:[{
     label:'Additional Candy for catching Pokémon',kind:'candy',access:'ticket',
     replacesFreeLimit:true,source:source(duck,'Ticket Extras')
   }]})
 ]);
 assert.equal(d.benefits[0].replacesFreeLimit,false);
});

test('normalized replacement rule deduplicates unsupported stacking flags',()=>{
 const label='Additional Candy for catching Pokémon';
 const a=benefit('ticket',label,duck,{kind:'candy',replacesFreeLimit:true});
 const b=benefit('ticket',label,duck,{kind:'candy',replacesFreeLimit:false});
 const out=normalizeEventSourceFacets('wag',[mk('leekduck',duck,{benefits:[a,b]})]);
 assert.equal(out.benefits.length,1);
 assert.equal(out.benefits[0].replacesFreeLimit,false);
});

test('long benefit descriptions retain unique stable IDs beyond readable-slug truncation',()=>{
 const shared='Synthetic ticketed-day benefit for a specific Special Research branch: '+'A'.repeat(67)+' ';
 assert.ok(shared.length>128&&shared.length<160);
 const first=benefit('ticket',shared+'special research bonus for path Steel-type',duck,{kind:'candy'});
 const second=benefit('ticket',shared+'special research bonus for path Dragon-type',duck,{kind:'candy'});
 const one=normalizeEventSourceFacets('wag',[mk('leekduck',duck,{benefits:[first,second]})]);
 const two=normalizeEventSourceFacets('wag',[mk('leekduck',duck,{benefits:[second,first]})]);
 assert.equal(one.benefits.length,2);
 assert.equal(new Set(one.benefits.map(b=>b.id)).size,2);
 assert.deepEqual(one.benefits.map(b=>b.id),two.benefits.map(b=>b.id));
});

test('conflicting ticket replacement claims remain one disputed record and cannot stack',()=>{
 const paid='Up to six free Raid Passes';
 const entries=[
   mk('leekduck',duck,{benefits:[
     benefit('free','Up to three free Raid Passes',duck,{replacesFreeLimit:false}),
     benefit('ticket',paid,duck),
     benefit('addon','Up to eighteen passes from Raid Lover',duck,{addonLabel:'Raid Lover',replacesFreeLimit:false})
   ]}),
   mk('official',official,{benefits:[
     benefit('ticket',paid,official,{
       replacesFreeLimit:false,
       replacementEvidence:'The ticketed Raid Pass limit is in addition to the free limit.'
     })
   ]})
 ];
 const first=normalizeEventSourceFacets('wag',entries);
 const reverse=normalizeEventSourceFacets('wag',entries.slice().reverse());
 assert.deepEqual(first,reverse);
 assert.equal(first.benefits.length,3);
 const ticket=first.benefits.find(v=>v.access==='ticket');
 assert.equal(ticket.status,'disputed');
 assert.equal(ticket.replacesFreeLimit,null);
 assert.equal(ticket.replacementEvidence,null);
 assert.equal(ticket.sourceRefs.length,2);
 assert.ok(first.warnings.some(w=>w.reason==='replacement-rule-disagreement'&&w.id===ticket.id));
 assert.equal(first.benefits.find(v=>v.access==='addon').addonLabel,'Raid Lover');
 assert.equal(first.benefits.find(v=>v.access==='free').access,'free');
});

test('a publisher boolean without an explicit source excerpt cannot grant replacement limits',()=>{
 const raw=benefit('ticket','Up to six free Raid Passes',duck,{replacementEvidence:null});
 const result=normalizeEventSourceFacets('wag',[mk('leekduck',duck,{benefits:[raw]})]);
 assert.equal(result.benefits[0].replacesFreeLimit,null);
 assert.equal(result.benefits[0].replacementEvidence,null);
 assert.ok(result.warnings.some(w=>w.reason==='replacement-evidence-missing'));
});

test('conflicting once-only research and mismatched stage titles fail closed regardless of source order',()=>{
 const program=(url,onceOnly,title)=>({
   kind:'special',access:'ticket',title:'Ticket Holder Special Research',onceOnly,
   paths:['Steel-type','Dragon-type'],
   steps:[{step:1,outOf:6,title}],
   source:source(url,'Special Research')
 });
 const records=[
   mk('leekduck',duck,{researchPrograms:[program(duck,true,'Claim six rewards')]}),
   mk('official',official,{researchPrograms:[program(official,false,'Catch five Pokémon')]})
 ];
 const a=normalizeEventSourceFacets('wag',records);
 const b=normalizeEventSourceFacets('wag',records.slice().reverse());
 assert.deepEqual(a,b);
 assert.equal(a.researchPrograms.length,1);
 assert.equal(a.researchPrograms[0].status,'disputed');
 assert.equal(a.researchPrograms[0].onceOnly,null);
 assert.equal(a.researchPrograms[0].steps[0].title,'');
 assert.equal(a.researchPrograms[0].steps[0].taskRewardEvidence,'disputed');
 assert.ok(a.warnings.some(w=>w.reason==='research-once-only-disagreement'));
 assert.ok(a.warnings.some(w=>w.reason==='research-stage-disagreement:1/6'));
});

test('source order, duplicate records and omitted optional fields do not affect stable output',()=>{
 const b=benefit('free','Increased catch XP',duck,{kind:'xp',replacesFreeLimit:false});
 const d=mk('leekduck',duck,{benefits:[b,b]});
 const o=mk('official',official,{benefits:[benefit('free','Increased catch XP',official,{kind:'xp',replacesFreeLimit:false})]});
 const forward=normalizeEventSourceFacets('wild-2026',[d,o]);
 const reverse=normalizeEventSourceFacets('wild-2026',[o,d]);
 assert.deepEqual(forward,reverse);
 assert.equal(forward.benefits.length,1);
 assert.equal(forward.benefits[0].sourceRefs.length,2);
 assert.deepEqual(normalizeEventSourceFacets('empty-event',[]).benefits,[]);
 assert.throws(()=>normalizeEventSourceFacets('',[]),/eventId/);
 assert.throws(()=>normalizeEventSourceFacets('event',{}),/array/);
});

test('ticket research preserves exact per-source medal effects, claim and completion evidence',()=>{
 const research=(url,medal)=>({
   kind:'special',title:'Special Research — Ticket Holders',
   storyTitle:'GO Wild Area: Mexico City – The Suspense Is Building',
   access:'ticket',onceOnly:true,paths:[],
   claimInstructionsText:'Claim Special Research during your ticketed session.',
   bonusActivationText:'Bonuses begin when you claim each medal and last through November 15, 2026.',
   completionRewardText:'Completing the event Special Research awards an avatar pose.',
   medalEffects:[{medalLabel:'Steel Scholar medal',effectText:medal}],
   steps:[{step:1,outOf:6,title:'Stage 1/6'}],
   source:source(url,'Special Research — Ticket Holders')
 });
 const input=[
   mk('leekduck',duck,{researchPrograms:[research(duck,'Earn 1 extra Candy XL for mighty Steel Pokémon.')]}),
   mk('official',official,{researchPrograms:[research(official,'Extra Candy XL from mighty Steel catches.')]})
 ];
 const forward=normalizeEventSourceFacets('wild-mexico',input);
 const reverse=normalizeEventSourceFacets('wild-mexico',input.slice().reverse());
 assert.deepEqual(forward,reverse);
 assert.equal(forward.researchPrograms.length,1);
 const program=forward.researchPrograms[0];
 assert.equal(program.storyTitle,'GO Wild Area: Mexico City – The Suspense Is Building');
 assert.equal(program.onceOnly,true);
 assert.equal(program.status,'corroborated');
 assert.equal(program.sourceResearchEvidence.length,2);
 assert.deepEqual(program.sourceResearchEvidence.map(x=>x.sourceId),['leekduck','official']);
 assert.deepEqual(program.sourceResearchEvidence.map(x=>x.medalEffects[0].effectText),[
   'Earn 1 extra Candy XL for mighty Steel Pokémon.',
   'Extra Candy XL from mighty Steel catches.'
 ]);
 assert.ok(program.sourceResearchEvidence.every(x=>x.claimInstructionsText.includes('ticketed session')));
 assert.ok(program.sourceResearchEvidence.every(x=>x.bonusActivationText.includes('claim each medal')));
 assert.ok(program.sourceResearchEvidence.every(x=>x.completionRewardText.includes('avatar pose')));
 assert.equal(program.steps[0].taskRewardEvidence,'not-extracted');
 assert.equal(forward.publication,'staging-only');
});

test('distinct Special Research story names do not silently merge their paid stages',()=>{
 const base={kind:'special',title:'Special Research — Ticket Holders',access:'ticket',
   paths:[],steps:[{step:1,outOf:6,title:'Stage 1/6'}],source:source(duck,'Special Research')};
 const result=normalizeEventSourceFacets('wild-2026',[
   mk('leekduck',duck,{researchPrograms:[
     {...base,storyTitle:'Global Dragon Research'},
     {...base,storyTitle:'Mexico City Dragon Research'}
   ]})
 ]);
 assert.equal(result.researchPrograms.length,2);
 assert.equal(new Set(result.researchPrograms.map(x=>x.id)).size,2);
 assert.ok(result.researchPrograms.every(x=>x.status==='source-claimed'));
});

test('research source excerpts remain sanitized and missing deadlines are not invented',()=>{
 const research={kind:'timed',title:'City Timed Research',access:'ticket',
   storyTitle:'<b>Ticket</b> day',paths:[],
   claimInstructionsText:'<script>bad()</script> Claim research on your selected day.\u0000',
   completionDeadlineText:null,
   medalEffects:[{medalLabel:'<span>Steel Scholar medal</span>',
       effectText:'Gain bonuses only <strong>after medal claim</strong>.'}],
   source:source(duck,'Timed Research')
 };
 const d=normalizeEventSourceFacets('wild-mexico',[mk('leekduck',duck,{researchPrograms:[research]})]);
 const item=d.researchPrograms[0].sourceResearchEvidence[0];
 assert.equal(item.storyTitle,'Ticket day');
 assert.equal(item.claimInstructionsText,'bad() Claim research on your selected day.');
 assert.equal(item.completionDeadlineText,null);
 assert.equal(item.medalEffects[0].medalLabel,'Steel Scholar medal');
 assert.equal(item.medalEffects[0].effectText,'Gain bonuses only after medal claim.');
 assert.equal(d.researchPrograms[0].onceOnly,null);
 assert.equal(d.publication,'staging-only');
});

test('featured attacks preserve explicit day, time and ticket-session scopes without inferring missing windows',()=>{
  const claim=(url,scope={})=>({
    pokemonLabel:'Synthetic Dragon',move:'Synthetic Beam',moveKind:'charged',
    access:'ticket',acquisitionMethods:['raid'],
    source:source(url,'Featured Attacks'),...scope
  });
  const records=[
    mk('leekduck',duck,{featuredMoves:[
      claim(duck,{dayScope:'ticketed-day',windowText:'Saturday 10:00–18:00',sessionLabel:'Saturday park session'}),
      claim(duck,{dayScope:'ticketed-day',windowText:'Sunday 10:00–18:00',sessionLabel:'Sunday park session'}),
      claim(duck)
    ]}),
    mk('official',official,{featuredMoves:[
      claim(official,{dayScope:'ticketed-day',windowText:'Saturday 10:00–18:00',sessionLabel:'Saturday park session'})
    ]})
  ];
  const forward=normalizeEventSourceFacets('synthetic-festival',records);
  const reverse=normalizeEventSourceFacets('synthetic-festival',records.slice().reverse());
  assert.deepEqual(forward,reverse);
  assert.equal(forward.featuredMoves.length,3);
  assert.equal(new Set(forward.featuredMoves.map(x=>x.id)).size,3);
  assert.equal(forward.featuredMoves.find(x=>x.sessionLabel==='Saturday park session').status,'corroborated');
  assert.equal(forward.featuredMoves.find(x=>x.sessionLabel==='Sunday park session').status,'source-claimed');
  const unspecified=forward.featuredMoves.find(x=>x.sessionLabel===null);
  assert.ok(unspecified);
  assert.equal(unspecified.windowText,null);
  assert.equal(unspecified.dayScope,null);
  assert.equal(forward.publication,'staging-only');
});

test('invalid featured move session scope cannot become a fabricated event day',()=>{
  const raw={pokemonLabel:'Synthetic Dragon',move:'Synthetic Beam',moveKind:'fast',
    access:'unknown',acquisitionMethods:['unknown'],
    dayScope:'every-weekend',windowText:'',sessionLabel:'',source:source(duck,'Featured Attacks')};
  const data=normalizeEventSourceFacets('synthetic-event',[mk('leekduck',duck,{featuredMoves:[raw]})]);
  assert.equal(data.featuredMoves.length,1);
  assert.equal(data.featuredMoves[0].dayScope,null);
  assert.equal(data.featuredMoves[0].windowText,null);
  assert.equal(data.featuredMoves[0].sessionLabel,null);
  assert.equal(data.featuredMoves[0].access,'unknown');
});
